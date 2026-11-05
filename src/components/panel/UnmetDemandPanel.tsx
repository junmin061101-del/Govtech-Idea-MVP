"use client";

import { AlertTriangle, ChevronDown, FlaskConical, Info, Search } from "lucide-react";
import type { Dong, DongDiagnosis, TimeSlotId } from "@/types";
import type { UnmetDemandFile } from "@/lib/constants/events";
import type { UnmetSignal } from "@/lib/unmet";
import { minSampleForMargin, UNMET_THRESHOLDS } from "@/lib/config/assumptions";
import { timeSlotDef } from "@/lib/constants/timeSlots";
import { percent } from "@/lib/mapScale";

interface UnmetDemandPanelProps {
  dong: Dong | null;
  diagnosis: DongDiagnosis | null;
  signal: UnmetSignal | null;
  file: UnmetDemandFile | null;
  timeSlot: TimeSlotId;
}

export function SyntheticBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">
      <FlaskConical className="h-3 w-3" /> 시연용 가상 데이터
    </span>
  );
}

export default function UnmetDemandPanel({ dong, diagnosis, signal, file, timeSlot }: UnmetDemandPanelProps) {
  if (!dong || !diagnosis) return null;
  const slot = timeSlotDef(timeSlot);
  const t = UNMET_THRESHOLDS;

  return (
    <div className="flex flex-col gap-3 break-keep p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-neutral-900">
          <Search className="h-4 w-4 text-neutral-400" /> 부모의 미충족 수요
        </p>
        {file?.synthetic && <SyntheticBadge />}
      </div>

      {!file ? (
        <p className="text-xs text-neutral-500">이 구는 시민 돌봄지도 집계가 아직 없습니다.</p>
      ) : !signal || signal.reliability === "insufficient" ? (
        <p className="text-sm text-neutral-700">
          <b>표본 부족</b> <span className="text-neutral-500">· 분기 검색 {signal?.searches ?? 0}건 ({t.referenceMinSearches}건부터 표시)</span>
        </p>
      ) : (
        <>
          {signal.gapSignal && (
            <p className="flex items-center gap-1.5 rounded-md border border-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-neutral-900">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              공백 신호 · 결과 없음 {percent(t.gapSignalRatio)} 이상 {t.gapSignalMonths}개월 연속
            </p>
          )}
          <dl className="grid grid-cols-3 overflow-hidden rounded-lg border border-neutral-200">
            <Stat label="결과 없음 검색" value={percent(signal.noResultRate!)} sub={`${signal.searches}건 중${signal.reliability === "reference" ? " · 참고" : ""}`} />
            <Stat label="빈자리 알림 대기" value={`${signal.vacancyWaiting}건`} />
            <Stat label="범위 넓힌 재검색" value={percent(signal.widenedRate!)} />
          </dl>
          {signal.topExitSteps && signal.topExitSteps.length > 0 && (
            <p className="text-xs text-neutral-600">
              <span className="font-semibold text-neutral-800">신청 중 이탈 많은 단계</span> ·{" "}
              {signal.topExitSteps.map((x) => `${x.label} ${x.count}건`).join(" · ")}
            </p>
          )}
        </>
      )}

      <details className="group text-[11px] leading-relaxed text-neutral-500">
        <summary className="flex cursor-pointer list-none items-center gap-1">
          <Info className="h-3 w-3 shrink-0" /> 읽는 법·표시 기준
          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
        </summary>
        <ul className="mt-1 space-y-0.5 pl-4">
          <li>검색 신호는 스마트폰 이용이 많은 지역에 치우칠 수 있어, 인구 기반 추정과 함께 봐야 합니다.</li>
          <li>
            분석 칸: 행정동 × 시간대({slot.shortLabel}) × 대상, 분기{file ? ` (${file.quarter})` : ""}. 같은 기기 반복 검색은 하루 1건.
          </li>
          <li>
            {t.reliableMinSearches}건 이상 수치(오차 ±{Math.round(t.reliableMargin * 100)}%p, 최소 {minSampleForMargin(t.reliableMargin)}건+여유) ·{" "}
            {t.referenceMinSearches}~{t.reliableMinSearches - 1}건 참고(±{Math.round(t.referenceMargin * 100)}%p) · 그 미만 숨김
          </li>
          <li>공백 신호는 {t.reliableMinSearches}건 이상인 칸에서만 띄웁니다.</li>
          {file && <li>출처: {file.source}</li>}
        </ul>
      </details>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white px-3 py-2 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-neutral-200">
      <dt className="text-[11px] text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-lg font-bold tabular-nums text-neutral-900">{value}</dd>
      {sub && <dd className="text-[10px] text-neutral-500">{sub}</dd>}
    </div>
  );
}
