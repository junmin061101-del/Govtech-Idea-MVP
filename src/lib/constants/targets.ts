/** 돌봄 대상 구분 — 수요 산정 연령을 이 두 대상으로 나눈다. */

export const CARE_TARGET_IDS = ["infant", "lower_elementary"] as const;
export type CareTargetId = (typeof CARE_TARGET_IDS)[number];

export interface CareTargetDef {
  id: CareTargetId;
  label: string;
  minAge: number;
  maxAge: number;
  /** 공급(시설) 데이터가 있어 산정 가능한지. false면 토글 비활성 */
  dataAvailable: boolean;
  unavailableReason?: string;
}

export const CARE_TARGETS: CareTargetDef[] = [
  { id: "infant", label: "영유아(0~5세)", minAge: 0, maxAge: 5, dataAvailable: true },
  {
    id: "lower_elementary",
    label: "초등 저학년(6~9세)",
    minAge: 6,
    maxAge: 9,
    // TODO: 키움센터·다함께돌봄센터·지역아동센터 서울 전역 데이터 확보 후 활성화
    dataAvailable: false,
    unavailableReason: "초등 돌봄시설(키움센터·다함께돌봄·지역아동센터) 데이터 준비 중",
  },
];
