import type { BottleneckAxis } from "@/types";

/** "부족한 이유" 표시 문구 — 화면 어디서나 같은 말을 쓴다 */
export const REASONS: Record<BottleneckAxis, { label: string; short: string; description: string }> = {
  space: { label: "자리가 없어서", short: "자리 부족", description: "모든 시설이 정원만큼 받아도 수요보다 자리가 적음 (정원 부족)" },
  time: { label: "문을 닫아서", short: "운영 안 함", description: "정원은 있지만 그 시간에 운영하지 않는 시설이 있음" },
  staff: { label: "선생님이 없어서", short: "교사 부족", description: "문은 열었지만 그 시간 근무 교사가 적어 정원만큼 받지 못함" },
};
