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

/** 이유별 색 (dataviz 검증: 3색 all-pairs 통과, 배경 대비 경고는 막대 아래 글자 표기로 보완) */
export const REASON_COLOR: Record<BottleneckAxis, string> = {
  space: "#6250d6",
  time: "#eda100",
  staff: "#1baf7a",
};

const NEAR_BLACK = "#1a1a19";

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** 색 칸 안의 글자: 흰색과 거의 검정 중 대비가 큰 쪽 */
function inkOn(hex: string): string {
  const l = luminance(hex);
  return (1.05 / (l + 0.05)) >= ((l + 0.05) / (luminance(NEAR_BLACK) + 0.05)) ? "#ffffff" : NEAR_BLACK;
}

const SEATS_FORMULA =
  "시설마다 정원과 (그 시간 근무 교사 수 × 교사 1명당 아동 수) 중 작은 값을 더한 것. 그 시간에 운영하지 않는 시설은 0. " +
  "교사 1명당 아동 수는 영유아보육법 시행규칙 배치기준(0세 1:3 ~ 4세 이상 1:20)을 재원 아동 연령 구성에 맞춰 적용. " +
  `시설 자리는 반경 ${CATCHMENT.radiusM / 1000}km 안의 수요가 나눠 쓴다고 보고(2SFCA), 이 동 수요 비율만큼만 이 동의 자리로 센다(구 경계 포함).`;

const VISIBLE_FACILITIES = 6;

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
      <div>
        <p className="text-xs font-medium text-neutral-400">행정동</p>
        <h2 className="text-xl font-bold text-neutral-900">{dong.name}</h2>
        <p className="mt-1 text-sm leading-relaxed text-neutral-700">
          <span className="font-medium">{slot.label}</span>: 추정 수요 {people(ex.demand)}, 이용 가능한 자리{" "}
          <span className="inline-flex items-center gap-0.5">
            {people(ex.availableSeats)}
            <span title={SEATS_FORMULA} className="cursor-help text-neutral-400">
              <Info className="h-3 w-3" aria-label={SEATS_FORMULA} />
            </span>
          </span>
          {ex.gap > 0 ? (
            <>
              , <b className="text-neutral-900">{people(ex.gap)} 부족</b>
            </>
          ) : (
            <>
              , <b className="text-neutral-900">{surplus > 0 ? `여유 ${people(surplus)}` : "부족 없음"}</b>
            </>
          )}
        </p>
      </div>

      {ex.gap > 0 && (
        <section aria-labelledby="reason-title">
          <p id="reason-title" className="mb-2 text-sm font-semibold text-neutral-800">
            부족한 이유
          </p>

          <div
            role="img"
            aria-label={`부족 ${ex.gap}명: ` + shown.map((s) => `${REASONS[s.axis].label} ${s.people}명`).join(", ")}
            className="flex h-7 w-full gap-[2px]"
          >
            {shown.map((s) => {
              const share = s.people / ex.gap;
              return (
                <button
                  key={s.axis}
                  onClick={() => setOpen(s.axis)}
                  title={`${REASONS[s.axis].label} ${s.people}명 (${Math.round(share * 100)}%)`}
                  className="flex h-full items-center rounded px-1.5 text-xs font-semibold tabular-nums"
                  style={{ width: `${share * 100}%`, backgroundColor: REASON_COLOR[s.axis], color: inkOn(REASON_COLOR[s.axis]) }}
                >
                  {share >= 0.14 ? `${s.people}명` : ""}
                </button>
              );
            })}
          </div>

          <ul className="mt-3 divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {ex.segments.map((s) => (
              <ReasonRow
                key={s.axis}
                segment={s}
                totalCapacity={ex.totalCapacity}
                demand={ex.demand}
                open={open === s.axis}
                onToggle={() => setOpen(open === s.axis ? null : s.axis)}
              />
            ))}
          </ul>
        </section>
      )}

      <details className="group text-[11px] leading-relaxed text-neutral-500">
        <summary className="flex cursor-pointer list-none items-center gap-1">
          <Info className="h-3 w-3 shrink-0" />
          수요는 추정치입니다: {target.minAge}~{target.maxAge}세 인구 × 시간대 이용률(전국 평균 근사치)
          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-1 space-y-1 pl-4">
          <p>{DEMAND_METHODOLOGY_NOTE}</p>
          <p>
            이용률 계수({target.label}): {Object.entries(DEMAND_FACTORS[target.id]).map(([k, v]) => `${timeSlotDef(k as TimeSlotId).shortLabel} ${v}`).join(" · ")}.{" "}
            {DEMAND_FACTORS_META.basis}.
          </p>
          <p>
            방과후·야간·주말 근무 교사 수는 공개 데이터가 없어 가정값을 씁니다(방과후 = 주간의 {STAFFING_ASSUMPTIONS.afterSchoolStaffShare * 100}%, 야간·주말 {STAFFING_ASSUMPTIONS.nightStaff}명).
          </p>
          <p>{dataNote}</p>
        </div>
      </details>
    </div>
  );
}

function EstimateChip() {
  return <span className="rounded bg-neutral-100 px-1 py-px text-[10px] font-medium text-neutral-500">추정</span>;
}

function ReasonRow({
  segment,
  totalCapacity,
  demand,
  open,
  onToggle,
}: {
  segment: ReasonSegment;
  totalCapacity: number;
  demand: number;
  open: boolean;
  onToggle: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const reason = REASONS[segment.axis];
  const lostTotal = segment.facilities.reduce((a, f) => a + f.lostSeats, 0);
  const list = showAll ? segment.facilities : segment.facilities.slice(0, VISIBLE_FACILITIES);
  const empty = segment.people === 0;

  return (
    <li>
      <button
        onClick={onToggle}
        disabled={empty}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:cursor-default"
      >
        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: REASON_COLOR[segment.axis], opacity: empty ? 0.3 : 1 }} />
        <span className={`flex-1 ${empty ? "text-neutral-400" : "text-neutral-800"}`}>{reason.label}</span>
        {(segment.estimated || segment.unattributable) && !empty && <EstimateChip />}
        <span className={`tabular-nums ${empty ? "text-neutral-400" : "font-semibold text-neutral-900"}`}>{people(segment.people)}</span>
        {!empty && <ChevronDown className={`h-3.5 w-3.5 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>

      {open && !empty && (
        <div className="px-3 pb-3 text-xs text-neutral-600">
          {segment.unattributable ? (
            <p className="leading-relaxed">
              반경 1km 안 시설들의 정원 중 이 동에 배분되는 몫이 {people(totalCapacity)}으로 추정 수요 {people(demand)}보다
              적습니다. 특정 시설의 문제가 아니라 정원 총량이 모자란 몫이라 시설을 특정할 수 없습니다.
            </p>
          ) : (
            <>
              <p className="mb-1.5 leading-relaxed text-neutral-500">
                아래 {segment.facilities.length}곳이 이 시간에 못 받는 자리 중 이 동 몫은 합계 {people(lostTotal)}이고, 그중 실제
                부족에 해당하는 몫이 {people(segment.people)}입니다.
              </p>
              <ul className="space-y-1">
                {list.map((f) => (
                  <li key={f.facility.id} className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-neutral-800">{f.facility.name}</span>{" "}
                      <span className="text-neutral-500">· {f.note}</span>
                    </span>
                    {f.estimated && <EstimateChip />}
                    <span className="shrink-0 tabular-nums text-neutral-700">{people(f.lostSeats)}</span>
                  </li>
                ))}
              </ul>
              {segment.facilities.length > VISIBLE_FACILITIES && (
                <button onClick={() => setShowAll((v) => !v)} className="mt-1.5 text-[11px] font-medium text-neutral-500 underline">
                  {showAll ? "접기" : `${segment.facilities.length - VISIBLE_FACILITIES}곳 더 보기`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}
