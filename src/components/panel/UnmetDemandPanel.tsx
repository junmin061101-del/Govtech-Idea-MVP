"use client";

import { AlertTriangle, ChevronDown, FlaskConical, Info, Search } from "lucide-react";
import type { Dong, DongDiagnosis, TimeSlotId } from "@/types";
import type { UnmetDemandFile } from "@/lib/constants/events";
import type { UnmetSignal } from "@/lib/unmet";
import { minSampleForMargin, UNMET_THRESHOLDS } from "@/lib/config/assumptions";
import { timeSlotDef } from "@/lib/constants/timeSlots";
import { people, percent } from "@/lib/mapScale";

interface UnmetDemandPanelProps {
  dong: Dong | null;
  diagnosis: DongDiagnosis | null;
  signal: UnmetSignal | null;
  file: UnmetDemandFile | null;
  timeSlot: TimeSlotId;
}

export function SyntheticBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-fuchsia-50 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-700 ring-1 ring-fuchsia-200">
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
        <p className="flex items-center gap-1.5 text-sm font-semibold text-neutral-800">
          <Search className="h-4 w-4 text-neutral-400" /> 부모들이 찾다 못 찾은 수요
        </p>
        {file?.synthetic && <SyntheticBadge />}
      </div>

      {!file ? (
        <p className="text-xs leading-relaxed text-neutral-500">
          이 구에는 아직 시민 돌봄지도 집계가 없습니다. 시민 돌봄지도를 운영하는 구부터 부모 검색 신호가 표시됩니다.
        </p>
      ) : !signal || signal.reliability === "insufficient" ? (
        <p className="rounded-lg bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-600">
          <b>표본 부족</b> — {dong.name} {slot.label} 분기 검색 {signal?.searches ?? 0}건.{" "}
          {t.referenceMinSearches}건 이상부터 수치를 보여 줍니다.
        </p>
      ) : (
        <>
          {signal.gapSignal && (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-800 ring-1 ring-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <b>공백 신호</b> — 결과 없음 검색 비율이 {t.gapSignalMonths}개월 연속 {percent(t.gapSignalRatio)} 이상입니다. 일시적
                변동이 아니라 구조적 공백일 가능성이 큽니다.
              </span>
            </p>
          )}

          <dl className="grid grid-cols-3 gap-2 text-center">
            <Stat label="결과 없음 검색 비율" value={percent(signal.noResultRate!)} sub={`${signal.searches}건 중`} />
            <Stat label="빈자리 알림 대기" value={`${signal.vacancyWaiting}건`} sub="분기 말 미해소" />
            <Stat label="범위 넓힌 재검색" value={percent(signal.widenedRate!)} sub="검색 대비" />
          </dl>
          {signal.reliability === "reference" && (
            <p className="text-[11px] text-neutral-500">
              참고 수치입니다 (표본 {signal.searches}건, 오차 ±{Math.round(t.referenceMargin * 100)}%p). {t.reliableMinSearches}건 이상이면
              오차 ±{Math.round(t.reliableMargin * 100)}%p로 좁아집니다.
            </p>
          )}

          {signal.topExitSteps && signal.topExitSteps.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-neutral-700">신청 중 이탈이 많은 단계</p>
              <ol className="space-y-0.5 text-xs text-neutral-600">
                {signal.topExitSteps.map((s, i) => (
                  <li key={s.step} className="flex justify-between">
                    <span>
                      {i + 1}. {s.label}
                    </span>
                    <span className="tabular-nums">{s.count}건</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="rounded-lg border border-neutral-200 p-2.5 text-xs">
            <p className="mb-1 font-medium text-neutral-700">추정 수요와 나란히 보기</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-neutral-500">인구 기반 추정</p>
                <p className="text-neutral-800">
                  {diagnosis.careGap > 0 ? `${people(diagnosis.careGap)} 부족 (${percent(diagnosis.careGap / diagnosis.demand)})` : "부족 없음"}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-500">부모 검색 신호</p>
                <p className="text-neutral-800">결과 없음 {percent(signal.noResultRate!)}</p>
              </div>
            </div>
          </div>
        </>
      )}

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-neutral-500">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        검색 신호는 스마트폰 이용이 많은 지역(예: 대단지 아파트)에 치우칠 수 있습니다. 검색이 적다고 수요가 적은 것은 아니므로
        인구 기반 추정 수요와 함께 판단하세요.
      </p>

      <details className="group text-[11px] text-neutral-500">
        <summary className="flex cursor-pointer list-none items-center gap-1">
          표시 기준 <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
        </summary>
        <ul className="mt-1 space-y-0.5 pl-4">
          <li>
            분석 칸: 행정동 × 시간대 × 대상, 분기 단위{file ? ` (${file.quarter})` : ""}. 같은 기기의 반복 검색은 하루 1건으로 셉니다.
          </li>
          <li>
            분기 검색 {t.reliableMinSearches}건 이상: 수치 표시 (결과 없음 비율 오차 ±{Math.round(t.reliableMargin * 100)}%p, 신뢰수준 90%, 최소{" "}
            {minSampleForMargin(t.reliableMargin)}건에 여유분)
          </li>
          <li>
            {t.referenceMinSearches}~{t.reliableMinSearches - 1}건: 참고 수치 (오차 ±{Math.round(t.referenceMargin * 100)}%p, 최소{" "}
            {minSampleForMargin(t.referenceMargin)}건에 여유분)
          </li>
          <li>{t.referenceMinSearches}건 미만: 표본 부족으로 숨김</li>
          <li>
            공백 신호: {t.reliableMinSearches}건 이상인 칸에서 결과 없음 비율 {percent(t.gapSignalRatio)} 이상이 {t.gapSignalMonths}개월 연속
          </li>
          {file && <li>출처: {file.source}</li>}
        </ul>
      </details>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded bg-neutral-100 px-1 py-1.5">
      <dt className="text-[10px] leading-tight text-neutral-500">{label}</dt>
      <dd className="text-base font-bold tabular-nums text-neutral-900">{value}</dd>
      <dd className="text-[10px] text-neutral-500">{sub}</dd>
    </div>
  );
}
