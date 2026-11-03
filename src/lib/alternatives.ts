/**
 * "대안 비교" — 선택한 동·시간대에 바로 쓸 수 있는 대안 3가지를 자동으로 만든다.
 *
 *  1) 운영시간 연장   : 그 시간에 문을 닫은 시설을 열고, 필요한 만큼만 교사를 둔다
 *  2) 시간제 교사 배치 : 문은 열었지만 교사가 모자란 시설에 교사를 더한다
 *  3) 인근 연계·정원 확충 : 같은 구의 맞닿은 동에서 남는 자리를 연계하고, 남는 "자리 부족"은 신규 정원으로 안내
 *
 * 효과는 모두 시설 정보를 실제로 바꾼 뒤 diagnoseDong으로 다시 계산한 값이다.
 * 2SFCA 때문에 한 시설에서 늘린 자리는 반경 안 여러 동이 나눠 쓴다. 이 동 효과는 배분 비율만큼이고,
 * 나머지는 "인근 동에도 함께 늘어나는 자리"(spillover)로 따로 보여 준다.
 * 여러 대안을 합친 효과도 같은 방식으로(변경을 함께 적용해) 계산하므로 단순 합산보다 작거나 같다.
 */
import { allocationWeight, calculateECC, diagnoseDong, servingFacilities } from "@/lib/calculator";
import { timeSlotDef } from "@/lib/constants/timeSlots";
import { isUsable, won, type UnitCost, type UnitCostId } from "@/lib/config/unitCosts";
import { CATCHMENT } from "@/lib/config/assumptions";
import type { CareTargetId, Dong, DongDiagnosis, Facility, OperatingWindow, TimeSlotId } from "@/types";

export type AlternativeKind = "extend_hours" | "add_staff" | "link_capacity";

export interface CostLine {
  label: string;
  /** 출처 있는 단가로 계산한 금액. 계산할 수 없으면 null */
  amount: number | null;
  /** 계산식 (펼쳐 보기) */
  formula: string;
  source: string | null;
  /** 금액을 못 낸 이유 (예: "단가 출처 입력 필요") */
  missing?: string;
  /** 출처 없는 참고값 */
  reference?: string;
}

export interface FacilityChange {
  /** facilityId → 해당 시간대 운영 정보 덮어쓰기 */
  windows: Record<string, Partial<OperatingWindow>>;
  /** 동에 더하는 연계 자리 (가상 시설) */
  addedSeats: number;
  /**
   * 연계로 옆 동에서 빠져나가는 자리. 같은 자리를 두 동이 함께 세지 않도록 옆 동 자리에서 뺀다.
   * (선택한 동의 부족 계산에는 영향이 없고, 구 전체를 다시 계산할 때 반영된다)
   */
  outflows?: { dongId: string; seats: number }[];
}

export interface Alternative {
  kind: AlternativeKind;
  title: string;
  /** 한 문장 요약 (시간대에 맞는 처방 표현) */
  sentence: string;
  /** 줄어드는 부족 인원 */
  reduction: number;
  /** 이 대안만 적용했을 때 남는 부족 인원 */
  remaining: number;
  /** 필요한 것 (대상 시설·교사 수·연계 지역) */
  needs: string[];
  /** 필요한 교사 수 (효과가 같을 때 적은 쪽을 앞에 둔다) */
  teachers: number;
  /** 늘린 자리 중 반경 안 다른 동에 배분되는 몫 (2SFCA) */
  spillover: number;
  /** 남는 공백 안내 (인근 연계 카드) */
  residualNote?: string;
  applicable: boolean;
  costs: CostLine[];
  change: FacilityChange;
}

export interface AlternativeContext {
  dong: Dong;
  /** 같은 구의 행정동 (인근 연계 후보) */
  dongs: Dong[];
  /** 같은 구의 시설 (행정동 배정된 것) */
  facilities: Facility[];
  /** 같은 구 전체 진단 (인근 동의 여유 자리 계산용) */
  diagnoses: DongDiagnosis[];
  timeSlot: TimeSlotId;
  target: CareTargetId;
  unitCosts: UnitCost[];
  /** 다른 구 포함 행정동 이름 조회 (다른 동 시설 표시용) */
  dongName?: (dongId: string) => string | undefined;
}

const EMPTY_CHANGE: FacilityChange = { windows: {}, addedSeats: 0 };

// ---------------------------------------------------------------------------
// 변경 적용
// ---------------------------------------------------------------------------

export function mergeChanges(changes: FacilityChange[]): FacilityChange {
  const windows: FacilityChange["windows"] = {};
  for (const c of changes) {
    for (const [id, w] of Object.entries(c.windows)) {
      const prev = windows[id];
      // 같은 시설을 두 대안이 건드리면: 연다는 쪽을 따르고 교사 수는 큰 값
      windows[id] = prev
        ? { ...prev, ...w, isOpen: Boolean(prev.isOpen || w.isOpen), staffOnDuty: Math.max(prev.staffOnDuty ?? 0, w.staffOnDuty ?? 0) }
        : w;
    }
  }
  return {
    windows,
    addedSeats: changes.reduce((a, c) => a + c.addedSeats, 0),
    outflows: changes.flatMap((c) => c.outflows ?? []),
  };
}

export function applyChange(
  facilities: Facility[],
  change: FacilityChange,
  dong: Dong,
  timeSlot: TimeSlotId,
  target: CareTargetId,
): Facility[] {
  const out = facilities.map((f) => {
    const w = change.windows[f.id];
    if (!w) return f;
    const has = f.operatingWindows.some((x) => x.timeSlot === timeSlot);
    const base = f.operatingWindows.find((x) => x.timeSlot === timeSlot) ?? baseWindow(f, timeSlot);
    const merged = { ...base, ...w };
    return {
      ...f,
      operatingWindows: has
        ? f.operatingWindows.map((x) => (x.timeSlot === timeSlot ? merged : x))
        : [...f.operatingWindows, merged],
    };
  });
  if (change.addedSeats > 0) {
    out.push({
      id: `LINK-${dong.id}`,
      name: "(대안) 인근 연계 자리",
      type: "국공립어린이집",
      targets: [target],
      sigunguCode: dong.sigunguCode,
      emdCode: dong.emdCode,
      dongId: dong.id,
      address: "",
      lat: dong.lat,
      lng: dong.lng,
      capacity: change.addedSeats,
      currentEnrollment: 0,
      totalStaff: 0,
      dataSource: "대안 비교 가상 시설",
      operatingWindows: [{ timeSlot, isOpen: true, staffOnDuty: change.addedSeats, staffToChildRatio: 1 }],
    });
  }
  for (const o of change.outflows ?? []) {
    if (o.seats <= 0) continue;
    // 옆 동에서 연계해 준 자리만큼 빼는 가상 시설 (음수 자리)
    out.push({
      id: `LINK-OUT-${o.dongId}-${dong.id}`,
      name: "(대안) 인근 연계로 빠져나가는 자리",
      type: "국공립어린이집",
      targets: [target],
      sigunguCode: dong.sigunguCode,
      emdCode: o.dongId,
      dongId: o.dongId,
      address: "",
      lat: dong.lat,
      lng: dong.lng,
      capacity: -o.seats,
      currentEnrollment: 0,
      totalStaff: 0,
      dataSource: "대안 비교 가상 시설",
      operatingWindows: [{ timeSlot, isOpen: true, staffOnDuty: -o.seats, staffToChildRatio: 1 }],
    });
  }
  return out;
}

function baseWindow(f: Facility, timeSlot: TimeSlotId): OperatingWindow {
  const ratio = f.operatingWindows[0]?.staffToChildRatio ?? 5;
  return { timeSlot, isOpen: false, staffOnDuty: 0, staffToChildRatio: ratio };
}

function ratioOf(f: Facility, timeSlot: TimeSlotId): number {
  return (f.operatingWindows.find((w) => w.timeSlot === timeSlot) ?? baseWindow(f, timeSlot)).staffToChildRatio;
}

// ---------------------------------------------------------------------------
// 문구
// ---------------------------------------------------------------------------

/** 받침 유무에 따라 조사 선택: josa("야간 연장 운영", "을", "를") → "을" */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return withFinal;
  return code % 28 === 0 ? withoutFinal : withFinal;
}

function spillNote(n: number): string[] {
  return n > 0 ? [`반경 ${CATCHMENT.radiusM / 1000}km 안 인근 동에도 자리 ${n}명이 함께 늘어납니다`] : [];
}

function namesOf(list: string[], max = 2): string {
  return list.length <= max ? list.join(", ") : `${list.slice(0, max).join(", ")} 등 ${list.length}곳`;
}

// ---------------------------------------------------------------------------
// 대안 생성
// ---------------------------------------------------------------------------

export function buildAlternatives(ctx: AlternativeContext): Alternative[] {
  const { dong, timeSlot, target } = ctx;
  const servedList = servingFacilities(ctx.facilities, dong.id, target);
  const own = servedList.map((x) => x.f);
  const weightOf = (f: Facility) => allocationWeight(f, dong.id, target);
  const before = diagnoseDong(dong, own, timeSlot, target);
  if (before.careGap <= 0) return [];
  const label = (f: Facility) => {
    if (f.dongId === dong.id) return f.name;
    return `${f.name}(${ctx.dongName?.(f.dongId) ?? "인근 동"})`;
  };
  /** 바꾼 시설들이 늘린 자리 중 다른 동 몫 */
  const spilloverOf = (change: FacilityChange) => {
    const changed = applyChange(own, change, dong, timeSlot, target);
    let s = 0;
    own.forEach((f, i) => {
      if (!change.windows[f.id]) return;
      const delta = calculateECC(changed[i], timeSlot).ecc - calculateECC(f, timeSlot).ecc;
      s += delta * (1 - weightOf(f));
    });
    return Math.round(s);
  };
  const slot = timeSlotDef(timeSlot);
  const cost = (id: UnitCostId) => ctx.unitCosts.find((c) => c.id === id);
  const gapAfter = (fs: Facility[]) => diagnoseDong(dong, fs, timeSlot, target).careGap;
  // 문 열기·교사 추가로는 정원 총량 부족(자리가 없어서)을 줄일 수 없다
  const spaceFloor = Math.max(0, Math.round(before.bottleneck.space));

  // 1) 운영시간 연장 -------------------------------------------------------
  const extend = (() => {
    const closed = own
      .filter((f) => f.capacity > 0 && !calculateECC(f, timeSlot).isOpen)
      // 이 동에 돌아오는 자리(정원 × 배분 비율)가 큰 순
      .sort((a, b) => b.capacity * weightOf(b) - a.capacity * weightOf(a));
    const change: FacilityChange = { windows: {}, addedSeats: 0 };
    let current = before.careGap;
    let teachers = 0;
    const chosen: string[] = [];
    for (const f of closed) {
      const need = current - spaceFloor;
      if (need <= 0) break;
      // 이 동에는 배분 비율만큼만 돌아오므로, 필요한 자리 ÷ 비율만큼 연다 (정원 한도)
      const seats = Math.min(f.capacity, Math.ceil(need / weightOf(f)));
      const staff = Math.ceil(seats / ratioOf(f, timeSlot));
      const trial = { ...change.windows, [f.id]: { isOpen: true, staffOnDuty: staff } };
      const g = gapAfter(applyChange(own, { windows: trial, addedSeats: 0 }, dong, timeSlot, target));
      if (g >= current) continue;
      change.windows = trial;
      current = g;
      teachers += staff;
      chosen.push(label(f));
    }
    const reduction = before.careGap - current;
    const ext = cost("extension_class_annual");
    const costs: CostLine[] = [
      isUsable(ext)
        ? {
            label: "운영시간 연장 비용(연)",
            amount: ext.amount * chosen.length,
            formula: `시설 ${chosen.length}곳 × ${won(ext.amount)}`,
            source: `${ext.source}${ext.baseYear ? ` (${ext.baseYear}년 기준)` : ""}`,
          }
        : {
            label: "운영시간 연장 비용(연)",
            amount: null,
            formula: `시설 ${chosen.length}곳 × 시설당 연간 단가`,
            source: null,
            missing: "단가 출처 입력 필요",
            reference: ext?.reference,
          },
    ];
    return {
      kind: "extend_hours" as const,
      title: "운영시간 연장",
      applicable: chosen.length > 0,
      sentence:
        chosen.length > 0
          ? `${slot.shortLabel}에 문을 닫는 시설 ${chosen.length}곳이 ${slot.extendAction}${josa(slot.extendAction, "을", "를")} 하면 ${reduction}명이 줄어듭니다`
          : `${slot.shortLabel}에 문을 닫는 시설이 없어 해당하지 않습니다`,
      reduction,
      remaining: current,
      needs: chosen.length > 0 ? [`대상 시설: ${namesOf(chosen, 3)}`, `필요 교사: ${teachers}명`, ...spillNote(spilloverOf(change))] : [],
      teachers,
      spillover: chosen.length > 0 ? spilloverOf(change) : 0,
      costs: chosen.length > 0 ? costs : [],
      change: chosen.length > 0 ? change : EMPTY_CHANGE,
    };
  })();

  // 2) 시간제 교사 배치 -------------------------------------------------------
  const staff = (() => {
    const limited = own
      .map((f) => ({ f, r: calculateECC(f, timeSlot) }))
      .filter(({ f, r }) => r.isOpen && r.ecc < f.capacity)
      // 교사 1명이 이 동에 돌려주는 자리(1인당 아동 수 × 배분 비율)가 큰 순
      .sort((a, b) => ratioOf(b.f, timeSlot) * weightOf(b.f) - ratioOf(a.f, timeSlot) * weightOf(a.f));
    const change: FacilityChange = { windows: {}, addedSeats: 0 };
    let current = before.careGap;
    let teachers = 0;
    const placed: string[] = [];
    for (const { f, r } of limited) {
      const need = current - spaceFloor;
      if (need <= 0) break;
      const ratio = ratioOf(f, timeSlot);
      const seats = Math.min(f.capacity - r.ecc, Math.ceil(need / weightOf(f)));
      const add = Math.ceil(seats / ratio);
      const w = f.operatingWindows.find((x) => x.timeSlot === timeSlot)!;
      const trial = { ...change.windows, [f.id]: { isOpen: true, staffOnDuty: w.staffOnDuty + add } };
      const g = gapAfter(applyChange(own, { windows: trial, addedSeats: 0 }, dong, timeSlot, target));
      if (g >= current) continue;
      change.windows = trial;
      current = g;
      teachers += add;
      placed.push(`${label(f)} ${add}명`);
    }
    const reduction = before.careGap - current;
    const wage = cost("parttime_teacher_hourly");
    const hours = slot.hours ? slot.hours.end - slot.hours.start : null;
    const costs: CostLine[] = [
      isUsable(wage) && hours
        ? {
            label: "교사 인건비 하한(하루)",
            amount: teachers * hours * wage.amount,
            formula: `교사 ${teachers}명 × ${hours}시간 × 시급 ${wage.amount.toLocaleString("ko-KR")}원`,
            source: `${wage.source}${wage.baseYear ? ` (${wage.baseYear}년)` : ""}`,
          }
        : {
            label: "교사 인건비(하루)",
            amount: null,
            formula: `교사 ${teachers}명 × 근무 시간 × 시급`,
            source: null,
            missing: hours ? "단가 출처 입력 필요" : `${slot.shortLabel} 근무 시간 기준 없음`,
          },
    ];
    return {
      kind: "add_staff" as const,
      title: "시간제 교사 배치",
      applicable: teachers > 0,
      sentence:
        teachers > 0
          ? `${slot.label} 시간제 교사 ${teachers}명을 배치하면 ${reduction}명이 줄어듭니다`
          : `교사가 모자란 시설이 없어 해당하지 않습니다`,
      reduction,
      remaining: current,
      needs: teachers > 0 ? [`배치 시설: ${namesOf(placed, 3)}`, `필요 교사: ${teachers}명`, ...spillNote(spilloverOf(change))] : [],
      teachers,
      spillover: teachers > 0 ? spilloverOf(change) : 0,
      costs: teachers > 0 ? costs : [],
      change: teachers > 0 ? change : EMPTY_CHANGE,
    };
  })();

  // 3) 인근 연계·정원 확충 ------------------------------------------------------
  const link = (() => {
    const byId = new Map(ctx.dongs.map((d) => [d.id, d]));
    const surplus = ctx.diagnoses
      .filter((d) => dong.neighbors.includes(d.dongId) && byId.has(d.dongId))
      .map((d) => ({ dongId: d.dongId, name: byId.get(d.dongId)!.name, seats: Math.max(0, d.totalECC - d.demand) }))
      .filter((x) => x.seats > 0)
      .sort((a, b) => b.seats - a.seats);
    let need = before.careGap;
    const used: { dongId: string; name: string; seats: number }[] = [];
    for (const s of surplus) {
      if (need <= 0) break;
      const take = Math.min(s.seats, need);
      used.push({ dongId: s.dongId, name: s.name, seats: take });
      need -= take;
    }
    const linked = used.reduce((a, x) => a + x.seats, 0);
    const change: FacilityChange = { windows: {}, addedSeats: linked, outflows: used.map((u) => ({ dongId: u.dongId, seats: u.seats })) };
    const current = linked > 0 ? gapAfter(applyChange(own, change, dong, timeSlot, target)) : before.careGap;
    const reduction = before.careGap - current;
    const newSeats = Math.max(0, Math.round(before.bottleneck.space) - linked);
    const per = cost("new_capacity_per_seat");
    const costs: CostLine[] =
      newSeats > 0
        ? [
            isUsable(per)
              ? {
                  label: "신규 정원 확충 비용",
                  amount: newSeats * per.amount,
                  formula: `신규 정원 ${newSeats}명 × ${won(per.amount)}`,
                  source: `${per.source}${per.baseYear ? ` (${per.baseYear}년 기준)` : ""}`,
                }
              : {
                  label: "신규 정원 확충 비용",
                  amount: null,
                  formula: `신규 정원 ${newSeats}명 × 정원 1명당 단가`,
                  source: null,
                  missing: "단가 출처 입력 필요",
                  reference: per?.reference,
                },
          ]
        : [];
    const names = used.map((u) => `${u.name} ${u.seats}명`);
    return {
      kind: "link_capacity" as const,
      title: "인근 연계·정원 확충",
      applicable: linked > 0 || newSeats > 0,
      sentence:
        linked > 0
          ? `인근 ${namesOf(used.map((u) => u.name))}의 ${slot.shortLabel} 여유 자리 ${linked}명을 연계하면 ${reduction}명이 줄어듭니다`
          : `맞닿은 행정동에 ${slot.shortLabel} 여유 자리가 없습니다`,
      reduction,
      remaining: current,
      needs: linked > 0 ? [`연계 지역: ${names.join(", ")}`] : [],
      teachers: 0,
      spillover: 0,
      residualNote: newSeats > 0 ? `남는 '자리가 없어서' 부족 ${newSeats}명은 신규 정원이 필요합니다` : undefined,
      costs,
      change,
    };
  })();

  // 줄어드는 인원 큰 순 → 같으면 필요한 교사가 적은 순
  return [extend, staff, link].sort(
    (a, b) => b.reduction - a.reduction || Number(b.applicable) - Number(a.applicable) || a.teachers - b.teachers,
  );
}

/** 선택한 대안들을 함께 적용한 결과 */
export function combineAlternatives(ctx: AlternativeContext, selected: Alternative[]): { before: number; after: number } {
  const own = servingFacilities(ctx.facilities, ctx.dong.id, ctx.target).map((x) => x.f);
  const before = diagnoseDong(ctx.dong, own, ctx.timeSlot, ctx.target).careGap;
  if (selected.length === 0) return { before, after: before };
  const merged = mergeChanges(selected.map((a) => a.change));
  const after = diagnoseDong(ctx.dong, applyChange(own, merged, ctx.dong, ctx.timeSlot, ctx.target), ctx.timeSlot, ctx.target).careGap;
  return { before, after };
}
