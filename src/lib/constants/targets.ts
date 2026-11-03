/** 돌봄 대상 구분 — 수요 산정 연령을 이 두 대상으로 나눈다. */

export const CARE_TARGET_IDS = ["infant", "lower_elementary"] as const;
export type CareTargetId = (typeof CARE_TARGET_IDS)[number];

export interface CareTargetDef {
  id: CareTargetId;
  label: string;
  minAge: number;
  maxAge: number;
}

export const CARE_TARGETS: CareTargetDef[] = [
  { id: "infant", label: "영유아(0~5세)", minAge: 0, maxAge: 5 },
  { id: "lower_elementary", label: "초등 저학년(6~9세)", minAge: 6, maxAge: 9 },
];
