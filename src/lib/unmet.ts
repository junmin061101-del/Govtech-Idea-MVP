/**
 * 미충족 수요(부모 검색 신호) 판정 — 표본이 적은 칸은 수치를 내지 않는다.
 */
import { UNMET_THRESHOLDS } from "@/lib/config/assumptions";
import { APPLY_STEPS, type ApplyStepId, type UnmetDemandCell } from "@/lib/constants/events";

export type Reliability = "reliable" | "reference" | "insufficient";

export interface UnmetSignal {
  reliability: Reliability;
  searches: number;
  /** 표본 부족이면 null (화면에 수치를 내지 않음) */
  noResultRate: number | null;
  widenedRate: number | null;
  vacancyWaiting: number | null;
  /** 이탈이 많은 단계 상위 3개 */
  topExitSteps: { step: ApplyStepId; label: string; count: number }[] | null;
  /** 결과 없음 비율이 기준 이상인 달이 연속 N개월 (표본 충분한 칸만) */
  gapSignal: boolean;
  /** 오차 범위 (±) */
  margin: number | null;
}

export function reliabilityOf(searches: number, t = UNMET_THRESHOLDS): Reliability {
  if (searches >= t.reliableMinSearches) return "reliable";
  if (searches >= t.referenceMinSearches) return "reference";
  return "insufficient";
}

/** 최근 N개월 연속으로 결과 없음 비율이 기준 이상인가 */
export function hasGapSignal(monthly: UnmetDemandCell["monthly"], t = UNMET_THRESHOLDS): boolean {
  const recent = [...monthly].sort((a, b) => a.month.localeCompare(b.month)).slice(-t.gapSignalMonths);
  if (recent.length < t.gapSignalMonths) return false;
  return recent.every((m) => m.searches > 0 && m.noResult / m.searches >= t.gapSignalRatio);
}

export function signalOf(cell: UnmetDemandCell | undefined, t = UNMET_THRESHOLDS): UnmetSignal {
  if (!cell) {
    return { reliability: "insufficient", searches: 0, noResultRate: null, widenedRate: null, vacancyWaiting: null, topExitSteps: null, gapSignal: false, margin: null };
  }
  const reliability = reliabilityOf(cell.searches, t);
  if (reliability === "insufficient") {
    return { reliability, searches: cell.searches, noResultRate: null, widenedRate: null, vacancyWaiting: null, topExitSteps: null, gapSignal: false, margin: null };
  }
  const topExitSteps = APPLY_STEPS.map((s) => ({ step: s.id, label: s.label, count: cell.applyExits[s.id] ?? 0 }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  return {
    reliability,
    searches: cell.searches,
    noResultRate: cell.noResult / cell.searches,
    widenedRate: cell.widened / cell.searches,
    vacancyWaiting: cell.vacancyWaiting,
    topExitSteps,
    gapSignal: reliability === "reliable" && hasGapSignal(cell.monthly, t),
    margin: reliability === "reliable" ? t.reliableMargin : t.referenceMargin,
  };
}

/** 결과 없음 비율 지도 색 (주황 단일 색상 5단계, dataviz --ordinal 통과) */
export const NO_RESULT_CLASSES = [
  { max: 0.1, label: "10% 이하", color: "#f0a465" },
  { max: 0.2, label: "10~20%", color: "#e7883f" },
  { max: 0.3, label: "20~30%", color: "#d26b22" },
  { max: 0.4, label: "30~40%", color: "#a9521a" },
  { max: Infinity, label: "40% 초과", color: "#743710" },
];
export const INSUFFICIENT_COLOR = "#e5e5e5";

export function noResultColor(rate: number | null): string {
  if (rate == null) return INSUFFICIENT_COLOR;
  return NO_RESULT_CLASSES.find((c) => rate <= c.max)!.color;
}
