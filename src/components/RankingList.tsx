"use client";

import { useState } from "react";
import { AlertCircle, Building2, ChevronDown, Clock3, Users } from "lucide-react";
import type { BottleneckAxis, Dong, DongDiagnosis } from "@/types";
import { gapClassOf, people, percent } from "@/lib/mapScale";
import { REASONS } from "@/lib/reasons";
import { rankDiagnoses } from "@/lib/ranking";
import { noResultColor, type UnmetSignal } from "@/lib/unmet";
import type { MapLayer } from "@/components/map/KakaoMap";

const REASON_ICON: Record<BottleneckAxis, typeof Building2> = { space: Building2, time: Clock3, staff: Users };

export interface UnassignedFacility {
  id: string;
  name: string;
  address: string;
}

interface RankingListProps {
  dongs: Dong[];
  diagnoses: DongDiagnosis[];
  selectedDongId: string | null;
  onSelect: (dongId: string) => void;
  /** 예: "영유아 · 평일 야간 19~22시" */
  contextLabel: string;
  unassigned: UnassignedFacility[];
  layer: MapLayer;
  signals: Map<string, UnmetSignal> | null;
}

export default function RankingList({ dongs, diagnoses, selectedDongId, onSelect, contextLabel, unassigned, layer, signals }: RankingListProps) {
  const [showUnassigned, setShowUnassigned] = useState(false);
  if (layer === "signal" && signals) {
    return <SignalRanking dongs={dongs} signals={signals} selectedDongId={selectedDongId} onSelect={onSelect} contextLabel={contextLabel} />;
  }
  const nameOf = new Map(dongs.map((d) => [d.id, d.name]));
  const ranked = rankDiagnoses(diagnoses);
  const shortCount = ranked.filter((d) => d.careGap > 0).length;
  const totalGap = ranked.reduce((a, d) => a + d.careGap, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-100 px-4 py-3">
        <p className="text-sm font-semibold text-neutral-800">부족 인원 순위</p>
        <p className="text-[11px] text-neutral-500">{contextLabel}</p>
        <p className="mt-1 text-xs text-neutral-700">
          {dongs.length}개 동 중 <b>{shortCount}개 동</b>에서 합계 <b>{people(totalGap)}</b> 부족
        </p>
      </div>

      <ol className="flex-1 overflow-y-auto" aria-label="행정동 부족 인원 순위">
        {ranked.map((d, i) => {
          const cls = gapClassOf(d.demand, d.totalECC);
          const Icon = d.careGap > 0 ? REASON_ICON[d.bottleneck.dominant] : null;
          const reason = d.careGap > 0 ? REASONS[d.bottleneck.dominant] : null;
          const surplus = d.totalECC - d.demand;
          const selected = d.dongId === selectedDongId;
          return (
            <li key={d.dongId}>
              <button
                onClick={() => onSelect(d.dongId)}
                aria-current={selected}
                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors ${
                  selected ? "bg-neutral-100" : "hover:bg-neutral-50"
                }`}
              >
                <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-neutral-400">{i + 1}</span>
                <span
                  className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-black/10"
                  style={{ backgroundColor: cls.color }}
                  title={cls.label}
                />
                <span className="min-w-0 flex-1 truncate font-medium text-neutral-800">{nameOf.get(d.dongId)}</span>
                {d.careGap > 0 ? (
                  <>
                    <span className="tabular-nums font-semibold text-neutral-900">{people(d.careGap)}</span>
                    <span className="w-9 text-right text-[11px] tabular-nums text-neutral-500">{percent(d.careGap / d.demand)}</span>
                    {Icon && reason && (
                      <span title={`주된 이유: ${reason.label}`} className="text-neutral-500">
                        <Icon className="h-3.5 w-3.5" aria-label={reason.label} />
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[11px] text-neutral-500">
                    {d.demand <= 0 ? "수요 없음" : surplus > 0 ? `여유 ${people(surplus)}` : "충족"}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="border-t border-neutral-100 px-4 py-2 text-[11px] text-neutral-500">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {(Object.keys(REASONS) as BottleneckAxis[]).map((axis) => {
            const Icon = REASON_ICON[axis];
            return (
              <span key={axis} className="flex items-center gap-1" title={REASONS[axis].description}>
                <Icon className="h-3 w-3" /> {REASONS[axis].label}
              </span>
            );
          })}
        </div>
        {unassigned.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowUnassigned((v) => !v)}
              className="flex items-center gap-1 font-medium text-neutral-700"
              aria-expanded={showUnassigned}
            >
              <AlertCircle className="h-3 w-3" />
              위치 확인 필요 시설 {unassigned.length}곳 (집계 제외)
              <ChevronDown className={`h-3 w-3 transition-transform ${showUnassigned ? "rotate-180" : ""}`} />
            </button>
            {showUnassigned && (
              <ul className="mt-1 space-y-0.5 pl-4">
                {unassigned.map((f) => (
                  <li key={f.id}>
                    {f.name} <span className="text-neutral-400">· {f.address}</span>
                  </li>
                ))}
                <li className="text-neutral-400">원자료 좌표가 구 경계 밖에 찍혀 있어 행정동을 정할 수 없습니다.</li>
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 부모 검색 신호 순위: 결과 없음 비율 큰 순, 표본 부족은 맨 뒤 */
function SignalRanking({
  dongs,
  signals,
  selectedDongId,
  onSelect,
  contextLabel,
}: {
  dongs: Dong[];
  signals: Map<string, UnmetSignal>;
  selectedDongId: string | null;
  onSelect: (id: string) => void;
  contextLabel: string;
}) {
  const rows = dongs
    .map((d) => ({ d, s: signals.get(d.id)! }))
    .sort((a, b) => (b.s.noResultRate ?? -1) - (a.s.noResultRate ?? -1) || b.s.searches - a.s.searches);
  const shown = rows.filter((r) => r.s.noResultRate != null).length;
  const flagged = rows.filter((r) => r.s.gapSignal).length;
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-100 px-4 py-3">
        <p className="text-sm font-semibold text-neutral-800">결과 없음 검색 비율 순위</p>
        <p className="text-[11px] text-neutral-500">{contextLabel} · 부모 검색 신호</p>
        <p className="mt-1 text-xs text-neutral-700">
          {dongs.length}개 동 중 <b>{shown}개 동</b> 표시(나머지 표본 부족){flagged > 0 && <> · 공백 신호 <b>{flagged}개 동</b></>}
        </p>
      </div>
      <ol className="flex-1 overflow-y-auto" aria-label="행정동 결과 없음 검색 비율 순위">
        {rows.map(({ d, s }, i) => (
          <li key={d.id}>
            <button
              onClick={() => onSelect(d.id)}
              aria-current={d.id === selectedDongId}
              className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${d.id === selectedDongId ? "bg-neutral-100" : "hover:bg-neutral-50"}`}
            >
              <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-neutral-400">{i + 1}</span>
              <span className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-black/10" style={{ backgroundColor: noResultColor(s.noResultRate) }} />
              <span className="min-w-0 flex-1 truncate font-medium text-neutral-800">
                {s.gapSignal && <span title="공백 신호">⚠ </span>}
                {d.name}
              </span>
              {s.noResultRate != null ? (
                <>
                  <span className="tabular-nums font-semibold text-neutral-900">
                    {percent(s.noResultRate)}
                    {s.reliability === "reference" && <span title="참고 수치 (표본 35~74건)">*</span>}
                  </span>
                  <span className="w-12 text-right text-[11px] tabular-nums text-neutral-500">{s.searches}건</span>
                </>
              ) : (
                <span className="text-[11px] text-neutral-400">표본 부족 ({s.searches}건)</span>
              )}
            </button>
          </li>
        ))}
      </ol>
      <p className="border-t border-neutral-100 px-4 py-2 text-[11px] text-neutral-500">* 참고 수치 (분기 검색 35~74건) · ⚠ 공백 신호</p>
    </div>
  );
}
