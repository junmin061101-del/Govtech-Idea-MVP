import type { DongDiagnosis } from "@/types";

/** 부족 인원 큰 순 → 부족 없는 곳은 여유 큰 순. 입력한 모든 동이 빠짐없이 들어간다 */
export function rankDiagnoses(diagnoses: DongDiagnosis[]): DongDiagnosis[] {
  return [...diagnoses].sort((a, b) => {
    if (b.careGap !== a.careGap) return b.careGap - a.careGap;
    return a.demand - a.totalECC - (b.demand - b.totalECC);
  });
}
