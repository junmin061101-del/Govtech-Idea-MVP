/**
 * 지도 색 구간 — 부족 비율(부족 인원 ÷ 추정 수요) 5단계 + 충족 + 여유 있음 + 수요 없음.
 * 부족(빨강 단일 색상 5단계)과 여유(파랑)를 서로 다른 색으로 나누고, 그 사이 "충족"은 회색이다.
 * (빨강 단계는 dataviz 검증 스크립트 --ordinal 통과: 명도 단조, 단계 간 차이, 밝은 끝 대비 2:1)
 */

export type GapClassId = "short5" | "short4" | "short3" | "short2" | "short1" | "balanced" | "surplus" | "no_demand";

export interface GapClass {
  id: GapClassId;
  label: string;
  color: string;
}

/** 자리가 수요보다 이 비율 이상 많으면 "여유 있음" */
export const SURPLUS_THRESHOLD = 0.1;

/** 부족 비율 구간 상한 (이하 포함). 마지막 구간은 상한 없음 */
const SHORT_BREAKS = [0.1, 0.2, 0.3, 0.5];

export const GAP_CLASSES: GapClass[] = [
  { id: "short5", label: "50% 초과 부족", color: "#8a1f1b" },
  { id: "short4", label: "30~50% 부족", color: "#bb3930" },
  { id: "short3", label: "20~30% 부족", color: "#da574a" },
  { id: "short2", label: "10~20% 부족", color: "#e7786b" },
  { id: "short1", label: "10% 이하 부족", color: "#ef9a8f" },
  { id: "balanced", label: "충족 (여유 10% 미만)", color: "#d9d7d0" },
  { id: "surplus", label: "여유 있음 (10% 이상 남음)", color: "#5598e7" },
  { id: "no_demand", label: "수요 산정 없음", color: "#ffffff" },
];

export function gapClassOf(demand: number, availableSeats: number): GapClass {
  const byId = (id: GapClassId) => GAP_CLASSES.find((c) => c.id === id)!;
  if (demand <= 0) return byId("no_demand");
  const gap = Math.max(0, demand - availableSeats);
  if (gap <= 0) return availableSeats - demand >= demand * SURPLUS_THRESHOLD - 1e-9 ? byId("surplus") : byId("balanced");
  const ratio = gap / demand;
  const idx = SHORT_BREAKS.findIndex((b) => ratio <= b);
  return byId((["short1", "short2", "short3", "short4", "short5"] as const)[idx === -1 ? 4 : idx]);
}

/** 화면 표시용 정수 반올림 — 부족 인원은 사람 수이므로 소수점을 보이지 않는다 */
export function people(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}명`;
}

export function percent(r: number): string {
  return `${Math.round(r * 100)}%`;
}
