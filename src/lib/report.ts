/**
 * 리포트 모델 — PDF(인쇄 화면)와 엑셀이 같은 내용을 쓰도록 한 곳에서 만든다.
 *
 * 템플릿
 *  - monthly   월간 운영 조정: 선택한 시간대의 순위, 부족 상위 동의 이유, 선택한 대안
 *  - quarterly 분기 돌봄협의체: + 시간대별 부족 인원 표, 부모 검색 신호
 *  - annual    연간 예산 편성 전: + 구 전체 이유별 합계(정원 확충·운영시간·인력 예산 근거), 시점 비교
 */
import { calculateECC, diagnoseAllDongs } from "@/lib/calculator";
import { explainGap } from "@/lib/explain";
import { rankDiagnoses } from "@/lib/ranking";
import { buildAlternatives, combineAlternatives, type Alternative } from "@/lib/alternatives";
import { REASONS } from "@/lib/reasons";
import { signalOf } from "@/lib/unmet";
import { sigunguByCode } from "@/lib/constants/regions";
import { TIME_SLOTS, timeSlotDef, type TimeSlotId } from "@/lib/constants/timeSlots";
import { CARE_TARGETS } from "@/lib/constants/targets";
import type { UnitCost } from "@/lib/config/unitCosts";
import type { UnmetDemandFile } from "@/lib/constants/events";
import type { ViewState } from "@/lib/viewState";
import type { BottleneckAxis, Dong, Facility } from "@/types";

export type ReportTemplate = "monthly" | "quarterly" | "annual";

export const REPORT_TEMPLATES: Record<ReportTemplate, { title: string; purpose: string; topReasons: number }> = {
  monthly: { title: "월간 돌봄 공백 운영 조정 리포트", purpose: "운영 조정", topReasons: 5 },
  quarterly: { title: "분기 돌봄협의체 보고 자료", purpose: "돌봄협의체", topReasons: 10 },
  annual: { title: "연간 돌봄 공백 예산 편성 참고 자료", purpose: "예산 편성 전", topReasons: 99 },
};

export interface SnapshotFile {
  month: string;
  columns: string[];
  rows: [string, string, string, number, number, number][];
}

export interface ReportInput {
  template: ReportTemplate;
  view: ViewState;
  dongs: Dong[];
  facilities: Facility[];
  unmet: UnmetDemandFile | null;
  unitCosts: UnitCost[];
  dataSources: { label: string; value: string }[];
  /** 기준 데이터 날짜 (YYYY-MM-DD) */
  dataDate: string;
  snapshots?: SnapshotFile[];
  dongName?: (id: string) => string | undefined;
  now?: Date;
}

export interface RankingRow {
  rank: number;
  emdCode: string;
  name: string;
  demand: number;
  seats: number;
  gap: number;
  ratio: number;
  reason: string;
  /** 이유별 부족 인원 (자리가 없어서·문을 닫아서·선생님이 없어서) */
  space: number;
  time: number;
  staff: number;
}

export interface Recommendation {
  name: string;
  gap: number;
  best: { title: string; sentence: string; reduction: number; remaining: number; needs: string[] } | null;
  /** 쓸 수 있는 대안을 모두 합쳤을 때 남는 부족 인원 */
  allCombinedAfter: number;
}

export interface FacilityRow {
  name: string;
  type: string;
  dong: string;
  capacity: number;
  enrollment: number;
  teachers: number;
  /** 시간대별 이용 가능한 자리 (운영 안 하면 0) */
  seats: Record<string, number>;
  open: Record<string, boolean>;
  spec: string;
}

export interface ReportModel {
  template: ReportTemplate;
  title: string;
  purpose: string;
  sigunguName: string;
  periodLabel: string;
  contextLabel: string;
  generatedAt: string;
  dataDate: string;
  dataSources: { label: string; value: string }[];
  totals: { dongs: number; shortDongs: number; gap: number; demand: number; seats: number };
  /** 한눈에 보는 핵심 요약 문장 */
  keyFindings: string[];
  /** 선택한 시간대의 구 전체 이유별 합계 */
  reasonTotalsCurrent: { label: string; people: number; share: number }[];
  /** 부족 상위 동의 자동 권고 대안 (현장 확인 전 참고) */
  recommendations: Recommendation[];
  /** 그 구 시설 목록 (엑셀용) */
  facilityTable: FacilityRow[];
  methodology: string[];
  ranking: RankingRow[];
  reasonDetails: { name: string; gap: number; segments: { label: string; people: number; estimated: boolean }[]; facilities: string[] }[];
  slotMatrix?: { name: string; gaps: Record<string, number> }[];
  slotColumns?: { id: TimeSlotId; label: string }[];
  reasonTotals?: { axis: BottleneckAxis; label: string; people: number; budgetHint: string }[];
  unmet?: { synthetic: boolean; quarter: string; rows: { name: string; searches: number; noResultRate: number | null; reliability: string; gapSignal: boolean }[] };
  decision?: {
    dongName: string;
    alternatives: Pick<Alternative, "title" | "sentence" | "reduction" | "remaining" | "needs" | "residualNote" | "costs">[];
    combined: { before: number; after: number };
  };
  comparison?: { months: string[]; rows: { name: string; gaps: (number | null)[] }[] };
  notes: string[];
}

const BUDGET_HINT: Record<BottleneckAxis, string> = {
  space: "신규 정원 확충·인근 연계 예산",
  time: "운영시간 연장(연장반 지정) 예산",
  staff: "시간제 교사 인건비 예산",
};

function periodLabel(template: ReportTemplate, dataDate: string): string {
  const [y, m] = dataDate.split("-").map(Number);
  if (template === "monthly") return `${y}년 ${m}월`;
  if (template === "quarterly") return `${y}년 ${Math.ceil(m / 3)}분기`;
  return `${y + 1}년 예산 편성용 (${y}년 ${m}월 데이터 기준)`;
}

export function buildReport(input: ReportInput): ReportModel {
  const { template, view, dongs, facilities } = input;
  const tpl = REPORT_TEMPLATES[template];
  const slot = timeSlotDef(view.timeSlot);
  const target = CARE_TARGETS.find((t) => t.id === view.target)!;
  const nameOf = new Map(dongs.map((d) => [d.id, d.name]));
  const diagnoses = diagnoseAllDongs(dongs, facilities, view.timeSlot, view.target);
  const ranked = rankDiagnoses(diagnoses);

  const exByDong = new Map(
    ranked.filter((d) => d.careGap > 0).map((d) => [d.dongId, explainGap(d, facilities, view.timeSlot, slot.shortLabel, input.dongName)]),
  );
  const seg = (id: string, axis: BottleneckAxis) => exByDong.get(id)?.segments.find((x) => x.axis === axis)?.people ?? 0;
  const ranking: RankingRow[] = ranked.map((d, i) => ({
    space: seg(d.dongId, "space"),
    time: seg(d.dongId, "time"),
    staff: seg(d.dongId, "staff"),
    rank: i + 1,
    emdCode: d.dongId,
    name: nameOf.get(d.dongId)!,
    demand: d.demand,
    seats: d.totalECC,
    gap: d.careGap,
    ratio: d.demand > 0 ? d.careGap / d.demand : 0,
    reason: d.careGap > 0 ? REASONS[d.bottleneck.dominant].label : d.totalECC > d.demand ? "여유 있음" : "충족",
  }));

  const reasonDetails = ranked
    .filter((d) => d.careGap > 0)
    .slice(0, tpl.topReasons)
    .map((d) => {
      const ex = exByDong.get(d.dongId)!;
      return {
        name: nameOf.get(d.dongId)!,
        gap: d.careGap,
        segments: ex.segments.map((s) => ({ label: REASONS[s.axis].label, people: s.people, estimated: s.estimated || s.unattributable })),
        facilities: ex.segments
          .filter((s) => s.facilities.length > 0 && s.people > 0)
          .flatMap((s) => s.facilities.slice(0, 3).map((f) => `[${REASONS[s.axis].short}] ${f.facility.name} · ${f.note} · ${f.lostSeats}명`)),
      };
    });

  const model: ReportModel = {
    template,
    title: tpl.title,
    purpose: tpl.purpose,
    sigunguName: sigunguByCode(view.sigunguCode)?.name ?? view.sigunguCode,
    periodLabel: periodLabel(template, input.dataDate),
    contextLabel: `${target.label} · ${slot.label}`,
    generatedAt: (input.now ?? new Date()).toISOString(),
    dataDate: input.dataDate,
    dataSources: input.dataSources,
    totals: {
      dongs: dongs.length,
      shortDongs: ranked.filter((d) => d.careGap > 0).length,
      gap: ranked.reduce((a, d) => a + d.careGap, 0),
      demand: ranked.reduce((a, d) => a + d.demand, 0),
      seats: ranked.reduce((a, d) => a + d.totalECC, 0),
    },
    ranking,
    reasonDetails,
    keyFindings: [],
    reasonTotalsCurrent: [],
    recommendations: [],
    facilityTable: [],
    methodology: [
      "이용 가능한 자리(시설) = min(인가 정원, 그 시간 근무 교사 수 × 교사 1인당 아동 수) × 운영 여부. 교사 1인당 아동 수는 영유아보육법 시행규칙 배치기준을 재원 아동 연령 구성에 맞춰 가중 적용.",
      "이용 가능한 자리(행정동) = Σ(시설 자리 × 배분 비율). 배분 비율은 시설 반경 1km 안 수요 중 그 동 수요의 비율(2SFCA, 구 경계 포함).",
      "부족 인원 = max(0, 추정 수요 − 이용 가능한 자리). 자리가 없어서 = 모든 시설이 정원만큼 받아도 남는 부족, 나머지는 운영 중단·교사 부족 손실 비율로 나눔.",
      "대안 효과는 시설 정보를 바꾼 뒤 같은 계산을 다시 돌린 값이며, 여러 대안을 함께 적용한 효과도 다시 계산한다.",
    ],
    notes: [
      "수요는 행정안전부 주민등록인구 × 시간대별 이용률 계수(전국 평균 근사치)로 산정한 추정치입니다.",
      "이용 가능한 자리는 반경 1km 안 수요가 나눠 쓴다고 보고(2SFCA) 동별로 배분한 값입니다.",
      "방과후·야간·주말 근무 교사 수는 공개 데이터가 없어 가정값을 씁니다(추정).",
      "실제 부지·인허가·채용 가능 여부는 현장 확인이 필요합니다.",
    ],
  };

  // 구 전체 이유별 합계 (선택한 시간대)
  {
    const tot: Record<BottleneckAxis, number> = { space: 0, time: 0, staff: 0 };
    for (const r of ranking) {
      tot.space += r.space;
      tot.time += r.time;
      tot.staff += r.staff;
    }
    const all = tot.space + tot.time + tot.staff;
    model.reasonTotalsCurrent = (Object.keys(tot) as BottleneckAxis[])
      .map((axis) => ({ label: REASONS[axis].label, people: tot[axis], share: all > 0 ? tot[axis] / all : 0 }))
      .sort((a, b) => b.people - a.people);
  }

  // 부족 상위 동 자동 권고 (각 동에서 효과가 가장 큰 대안 + 모두 합친 효과)
  const recCount = template === "monthly" ? 5 : template === "quarterly" ? 10 : 99;
  model.recommendations = ranked
    .filter((d) => d.careGap > 0)
    .slice(0, recCount)
    .map((d) => {
      const dong = dongs.find((x) => x.id === d.dongId)!;
      const ctx = { dong, dongs, facilities, diagnoses, timeSlot: view.timeSlot, target: view.target, unitCosts: input.unitCosts, dongName: input.dongName };
      const usable = buildAlternatives(ctx).filter((a) => a.applicable && a.reduction > 0);
      const b = usable[0];
      return {
        name: dong.name,
        gap: d.careGap,
        best: b ? { title: b.title, sentence: b.sentence, reduction: b.reduction, remaining: b.remaining, needs: b.needs } : null,
        allCombinedAfter: usable.length ? combineAlternatives(ctx, usable).after : d.careGap,
      };
    });

  // 시설 목록 (그 구 시설)
  const slotsAvail = TIME_SLOTS.filter((t) => t.dataAvailable);
  model.facilityTable = facilities
    .filter((f) => f.sigunguCode === view.sigunguCode && f.targets.includes(view.target))
    .map((f) => ({
      name: f.name,
      type: f.type,
      dong: nameOf.get(f.dongId) ?? "",
      capacity: f.capacity,
      enrollment: f.currentEnrollment,
      teachers: f.totalStaff,
      seats: Object.fromEntries(slotsAvail.map((t) => [t.id, calculateECC(f, t.id).ecc])),
      open: Object.fromEntries(slotsAvail.map((t) => [t.id, calculateECC(f, t.id).isOpen])),
      spec: (f.spec ?? []).join(", "),
    }))
    .sort((a, b) => a.dong.localeCompare(b.dong) || a.name.localeCompare(b.name));

  // 시간대별 표 (모든 템플릿)
  {
    const slots = TIME_SLOTS.filter((t) => t.dataAvailable);
    const bySlot = new Map(slots.map((s) => [s.id, new Map(diagnoseAllDongs(dongs, facilities, s.id, view.target).map((d) => [d.dongId, d]))]));
    model.slotColumns = slots.map((s) => ({ id: s.id, label: s.label }));
    model.slotMatrix = ranking.map((r) => ({
      name: r.name,
      gaps: Object.fromEntries(slots.map((s) => [s.id, bySlot.get(s.id)!.get(r.emdCode)!.careGap])),
    }));
    if (template === "annual") {
      const totals: Record<BottleneckAxis, number> = { space: 0, time: 0, staff: 0 };
      for (const s of slots) {
        for (const d of bySlot.get(s.id)!.values()) {
          if (d.careGap <= 0) continue;
          const ex = explainGap(d, facilities, s.id, s.shortLabel);
          for (const seg of ex.segments) totals[seg.axis] += seg.people;
        }
      }
      model.reasonTotals = (Object.keys(totals) as BottleneckAxis[]).map((axis) => ({
        axis,
        label: REASONS[axis].label,
        people: totals[axis],
        budgetHint: BUDGET_HINT[axis],
      }));
    }
  }

  // 부모 검색 신호 (분기·연)
  if (template !== "monthly" && input.unmet) {
    const cells = input.unmet.cells.filter((c) => c.timeSlot === view.timeSlot && c.target === view.target);
    model.unmet = {
      synthetic: input.unmet.synthetic,
      quarter: input.unmet.quarter,
      rows: ranking.map((r) => {
        const s = signalOf(cells.find((c) => c.emdCode === r.emdCode));
        return { name: r.name, searches: s.searches, noResultRate: s.noResultRate, reliability: s.reliability, gapSignal: s.gapSignal };
      }),
    };
  }

  // 선택한 대안
  const dong = dongs.find((d) => d.id === view.dongId);
  if (dong && view.alternatives.length > 0) {
    const ctx = { dong, dongs, facilities, diagnoses, timeSlot: view.timeSlot, target: view.target, unitCosts: input.unitCosts, dongName: input.dongName };
    const alts = buildAlternatives(ctx).filter((a) => view.alternatives.includes(a.kind) && a.applicable);
    if (alts.length) {
      model.decision = {
        dongName: dong.name,
        alternatives: alts.map(({ title, sentence, reduction, remaining, needs, residualNote, costs }) => ({ title, sentence, reduction, remaining, needs, residualNote, costs })),
        combined: combineAlternatives(ctx, alts),
      };
    }
  }

  // 시점 비교 (연)
  if (template === "annual" && input.snapshots?.length) {
    const months = input.snapshots.map((s) => s.month).sort();
    model.comparison = {
      months,
      rows: ranking.map((r) => ({
        name: r.name,
        gaps: months.map((m) => {
          const snap = input.snapshots!.find((s) => s.month === m)!;
          const row = snap.rows.find(([emd, slotId, tgt]) => emd === r.emdCode && slotId === view.timeSlot && tgt === view.target);
          return row ? row[5] : null;
        }),
      })),
    };
  }

  // 핵심 요약
  const top = ranking.filter((r) => r.gap > 0).slice(0, 3);
  const mainReason = model.reasonTotalsCurrent[0];
  const recTotal = model.recommendations.reduce((a, r) => a + (r.gap - r.allCombinedAfter), 0);
  const recGap = model.recommendations.reduce((a, r) => a + r.gap, 0);
  model.keyFindings = [
    `${model.contextLabel} 기준 ${model.totals.dongs}개 동 중 ${model.totals.shortDongs}개 동에서 합계 ${model.totals.gap.toLocaleString()}명이 부족합니다 (추정 수요 ${model.totals.demand.toLocaleString()}명, 이용 가능한 자리 ${model.totals.seats.toLocaleString()}명).`,
    ...(top.length ? [`부족이 큰 동: ${top.map((r) => `${r.name} ${r.gap}명(${Math.round(r.ratio * 100)}%)`).join(", ")}.`] : []),
    ...(mainReason && mainReason.people > 0
      ? [`구 전체 부족의 ${Math.round(mainReason.share * 100)}%는 '${mainReason.label}' 때문입니다 (${model.reasonTotalsCurrent.filter((x) => x.people > 0).map((x) => `${x.label} ${x.people}명`).join(", ")}).`]
      : []),
    ...(model.recommendations.length && recGap > 0
      ? [`부족 상위 ${model.recommendations.length}개 동에 쓸 수 있는 대안을 모두 적용하면 ${recGap.toLocaleString()}명 중 ${recTotal.toLocaleString()}명을 줄일 수 있습니다 (현장 확인 전 추정).`]
      : []),
    ...(model.unmet && model.unmet.rows.some((r) => r.gapSignal)
      ? [`부모 검색 공백 신호(결과 없음 30% 이상 2개월 연속): ${model.unmet.rows.filter((r) => r.gapSignal).map((r) => r.name).join(", ")}${model.unmet.synthetic ? " (시연용 가상 데이터)" : ""}.`]
      : []),
  ];

  return model;
}
