"use client";

import { useEffect, useState } from "react";
import { Building2, ChevronDown, Info } from "lucide-react";
import type { BottleneckAxis, Dong, DongDiagnosis, Facility, TimeSlotId } from "@/types";
import { explainGap, type ReasonSegment } from "@/lib/explain";
import { REASONS } from "@/lib/reasons";
import { people } from "@/lib/mapScale";
import { timeSlotDef } from "@/lib/constants/timeSlots";
import { CARE_TARGETS } from "@/lib/constants/targets";
import { DEMAND_METHODOLOGY_NOTE } from "@/lib/calculator";
import { CATCHMENT, DEMAND_FACTORS, DEMAND_FACTORS_META, STAFFING_ASSUMPTIONS } from "@/lib/config/assumptions";

/**
 * 이유별 색 — 화면이 현란하지 않도록 회청색 한 계열의 명도 3단계만 쓴다.
 * 색만으로 구분하지 않도록 칸 안과 아래 목록에 이유 이름·인원을 항상 글자로 적는다.
 */
export const REASON_COLOR: Record<BottleneckAxis, string> = {
  space: "#1e293b",
  time: "#64748b",
  staff: "#b4bfcc",
};
const REASON_INK: Record<BottleneckAxis, string> = { space: "#ffffff", time: "#ffffff", staff: "#0f172a" };

const SEATS_FORMULA =
  "시설마다 정원과 (그 시간 근무 교사 수 × 교사 1명당 아동 수) 중 작은 값을 더한 것. 그 시간에 운영하지 않는 시설은 0. " +
  "교사 1명당 아동 수는 영유아보육법 시행규칙 배치기준(0세 1:3 ~ 4세 이상 1:20)을 재원 아동 연령 구성에 맞춰 적용. " +
  `시설 자리는 반경 ${CATCHMENT.radiusM / 1000}km 안의 수요가 나눠 쓴다고 보고(2SFCA), 이 동 수요 비율만큼만 이 동의 자리로 센다(구 경계 포함).`;

const VISIBLE_FACILITIES = 4;

interface GapReasonPanelProps {
  dongName?: (dongId: string) => string | undefined;
  dong: Dong | null;
  diagnosis: DongDiagnosis | null;
  facilities: Facility[];
  timeSlot: TimeSlotId;
  dataNote: string;
}

export default function GapReasonPanel({ dong, diagnosis, facilities, timeSlot, dataNote, dongName }: GapReasonPanelProps) {
  const [open, setOpen] = useState<BottleneckAxis | null>(null);
  // 동·시간대를 바꾸면 주된 이유를 펼친 상태로 시작
  useEffect(() => {
    setOpen(diagnosis && diagnosis.careGap > 0 ? diagnosis.bottleneck.dominant : null);
  }, [diagnosis?.dongId, diagnosis?.timeSlot, diagnosis?.target]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!dong || !diagnosis) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-neutral-400">
        <Building2 className="h-8 w-8 text-neutral-300" />
        지도나 순위 목록에서 행정동을 선택하세요.
      </div>
    );
  }

  const slot = timeSlotDef(timeSlot);
  const target = CARE_TARGETS.find((t) => t.id === diagnosis.target)!;
  const ex = explainGap(diagnosis, facilities, timeSlot, slot.shortLabel, dongName);
  const surplus = ex.availableSeats - ex.demand;
  const shown = ex.segments.filter((s) => s.people > 0);

  return (
    <div className="flex flex-col gap-4 break-keep p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-neutral-900">{dong.name}</h2>
        <span className="text-xs text-neutral-500">
          {target.id === "infant" ? "영유아" : "초등"} · {slot.label}
        </span>
      </div>

      {/* 핵심 숫자 3개 */}
      <dl className="grid grid-cols-3 overflow-hidden rounded-lg border border-neutral-200">
        <Stat label="추정 수요" value={people(ex.demand)} />
        <Stat label="이용 가능 자리" value={people(ex.availableSeats)} hint={SEATS_FORMULA} />
        {ex.gap > 0 ? (
          <Stat label="부족" value={people(ex.gap)} strong />
        ) : (
          <Stat label={surplus > 0 ? "여유" : "부족"} value={surplus > 0 ? people(surplus) : "0명"} />
        )}
      </dl>

      {ex.gap > 0 && (
        <section aria-labelledby="reason-title">
          <p id="reason-title" className="mb-2 text-sm font-bold text-neutral-900">
            부족한 이유
          </p>
          <div
            role="img"
            aria-label={`부족 ${ex.gap}명: ` + shown.map((s) => `${REASONS[s.axis].label} ${s.people}명`).join(", ")}
            className="flex h-6 w-full gap-[2px]"
          >
            {shown.map((s) => {
              const share = s.people / ex.gap;
              return (
                <button
                  key={s.axis}
                  onClick={() => setOpen(s.axis)}
                  title={`${REASONS[s.axis].label} ${s.people}명 (${Math.round(share * 100)}%)`}
                  className="flex h-full items-center rounded px-1.5 text-xs font-bold tabular-nums"
                  style={{ width: `${share * 100}%`, backgroundColor: REASON_COLOR[s.axis], color: REASON_INK[s.axis] }}
                >
                  {share >= 0.14 ? `${s.people}명` : ""}
                </button>
              );
            })}
          </div>

          <ul className="mt-2 divide-y divide-neutral-100">
            {ex.segments
              .filter((s) => s.people > 0)
              .map((s) => (
                <ReasonRow key={s.axis} segment={s} open={open === s.axis} onToggle={() => setOpen(open === s.axis ? null : s.axis)} />
              ))}
          </ul>
        </section>
      )}

      <details className="group text-[11px] leading-relaxed text-neutral-500">
        <summary className="flex cursor-pointer list-none items-center gap-1">
          <Info className="h-3 w-3 shrink-0" /> 계산 방법
          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-1 space-y-1 pl-4">
          <p>수요: {target.minAge}~{target.maxAge}세 인구 × 시간대 이용률(전국 평균 근사치, 추정). {DEMAND_METHODOLOGY_NOTE}</p>
          <p>
            이용률 계수: {Object.entries(DEMAND_FACTORS[target.id]).map(([k, v]) => `${timeSlotDef(k as TimeSlotId).shortLabel} ${v}`).join(" · ")}.{" "}
            {DEMAND_FACTORS_META.basis}.
          </p>
          <p>{SEATS_FORMULA}</p>
          <p>
            방과후·야간·주말 근무 교사 수는 가정값(방과후 = 주간의 {STAFFING_ASSUMPTIONS.afterSchoolStaffShare * 100}%, 야간·주말{" "}
            {STAFFING_ASSUMPTIONS.nightStaff}명)이라 “추정”으로 표시합니다.
          </p>
          <p>{dataNote}</p>
        </div>
      </details>
    </div>
  );
}

function Stat({ label, value, hint, strong = false }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className={`px-3 py-2.5 ${strong ? "bg-neutral-900 text-white" : "bg-white"} [&:not(:first-child)]:border-l [&:not(:first-child)]:border-neutral-200`}>
      <dt className={`flex items-center gap-1 whitespace-nowrap text-[11px] ${strong ? "text-neutral-300" : "text-neutral-500"}`}>
        {label}
        {hint && (
          <span title={hint} className="cursor-help">
            <Info className="h-3 w-3" aria-label={hint} />
          </span>
        )}
      </dt>
      <dd className="mt-0.5 text-xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function EstimateChip() {
  return <span className="rounded bg-neutral-100 px-1 py-px text-[10px] font-medium text-neutral-500">추정</span>;
}

function ReasonRow({ segment, open, onToggle }: { segment: ReasonSegment; open: boolean; onToggle: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const reason = REASONS[segment.axis];
  const list = showAll ? segment.facilities : segment.facilities.slice(0, VISIBLE_FACILITIES);
  const expandable = segment.facilities.length > 0 || segment.unattributable;

  return (
    <li>
      <button onClick={onToggle} disabled={!expandable} aria-expanded={open} className="flex w-full items-center gap-2 py-2 text-left text-sm">
        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: REASON_COLOR[segment.axis] }} />
        <span className="flex-1 font-medium text-neutral-800">{reason.label}</span>
        {(segment.estimated || segment.unattributable) && <EstimateChip />}
        <span className="text-base font-bold tabular-nums text-neutral-900">{people(segment.people)}</span>
        {expandable && <ChevronDown className={`h-3.5 w-3.5 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>

      {open && (
        <div className="pb-3 pl-5 text-xs text-neutral-600">
          {segment.unattributable ? (
            <p>정원 총량이 모자랍니다. 특정 시설 문제가 아니라 신규 정원·인근 연계가 필요합니다.</p>
          ) : (
            <>
              <ul className="space-y-1">
                {list.map((f) => (
                  <li key={f.facility.id} className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate" title={`${f.facility.name} · ${f.note}`}>
                      <span className="font-semibold text-neutral-900">{f.facility.name}</span>
                      <span className="text-neutral-500"> · {f.note}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-neutral-800">{people(f.lostSeats)}</span>
                  </li>
                ))}
              </ul>
              {segment.facilities.length > VISIBLE_FACILITIES && (
                <button onClick={() => setShowAll((v) => !v)} className="mt-1.5 text-[11px] font-medium text-neutral-500 underline">
                  {showAll ? "접기" : `${segment.facilities.length - VISIBLE_FACILITIES}곳 더 보기`}
                </button>
              )}
              <p className="mt-1.5 text-[11px] text-neutral-400">숫자는 각 시설이 이 시간 못 받는 자리 중 이 동 몫</p>
            </>
          )}
        </div>
      )}
    </li>
  );
}
