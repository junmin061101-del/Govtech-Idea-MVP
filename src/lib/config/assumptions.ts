/**
 * 산정 기준값(가정값) — 화면 툴팁·README·데이터 빌드가 모두 이 파일을 근거로 삼는다.
 * 각 값에는 basis(근거)와 status를 단다.
 *   - "law"        : 법령·고시에 정해진 값
 *   - "assumption" : 기존 MVP에서 쓰던 근사치(검증 필요). 화면에 "추정"으로 표시
 *   - "todo"       : 근거 미확인. 담당 부서 확인 후 교체
 *
 * scripts/build-data.mjs가 Node 타입 제거 방식으로 직접 import하므로 다른 모듈을 import하지 않는다.
 */

export type AssumptionStatus = "law" | "assumption" | "todo";

/**
 * 보육교사 1인당 아동 수 (영유아보육법 시행규칙 별표 2, 보육교직원 배치기준)
 * CHILD_CNT_xx 필드(서울시 어린이집 정보)의 연령반 구분에 맞춘다.
 */
export const LEGAL_STAFF_RATIO: Record<string, { ratio: number; status: AssumptionStatus; basis: string }> = {
  "00": { ratio: 3, status: "law", basis: "만 0세 1:3" },
  "01": { ratio: 5, status: "law", basis: "만 1세 1:5" },
  "02": { ratio: 7, status: "law", basis: "만 2세 1:7" },
  "03": { ratio: 15, status: "law", basis: "만 3세 1:15" },
  "04": { ratio: 20, status: "law", basis: "만 4세 이상 1:20" },
  "05": { ratio: 20, status: "law", basis: "만 4세 이상 1:20" },
  // TODO: 혼합반 배치기준은 구성 연령에 따라 달라진다. 확인 전까지 아래 값을 쓴다.
  M2: { ratio: 5, status: "todo", basis: "영아 혼합반 — 1:5로 가정(확인 필요)" },
  M5: { ratio: 15, status: "todo", basis: "유아 혼합반 — 1:15로 가정(확인 필요)" },
  SP: { ratio: 3, status: "law", basis: "장애아 1:3" },
};

/** 재원 아동이 없어 연령 구성을 알 수 없는 시설의 기본 비율 */
export const FALLBACK_STAFF_RATIO = { ratio: 5, status: "todo" as AssumptionStatus, basis: "재원 아동 0명 — 1:5로 가정" };

/**
 * 시간대별 이용률 계수 = 해당 연령 인구 중 그 시간대에 실제 돌봄이 필요한 비율.
 * 기존 MVP의 0~9세 통합 계수(0.38/0.30/0.08/0.12)를 대상별로 나눈 것이다.
 *  - 영유아 주간 0.70: 기존 0.38 = "0~9세 중 미취학 비중 약 55% × 이용률 약 70%"에서 이용률 부분만 남긴 값
 *  - 방과후·야간·주말: 기존 계수를 각 연령대 인구에 그대로 적용(0~9세 인구 비례 배분과 같음)
 *  - 초등 저학년 주간: 학교 수업 시간이라 돌봄 수요로 보지 않음
 * 기존 맞벌이 비율 보정은 동작구에만 있던 추정치라 서울 전역 확장 시 제거했다.
 */
export const DEMAND_FACTORS: Record<"infant" | "lower_elementary", Partial<Record<string, number>>> = {
  infant: { daytime: 0.7, after_school: 0.3, night: 0.08, weekend: 0.12 },
  lower_elementary: { after_school: 0.3, night: 0.08, weekend: 0.12 },
};
export const DEMAND_FACTORS_META = {
  status: "assumption" as AssumptionStatus,
  basis: "전국 보육통계 평균 근사치(기존 MVP 계수). 자치구 자체 실측 이용률 아님",
};

/**
 * 시간대별 교사 배치 가정 (시설별 시간대 근무 인원 공개 데이터 없음)
 *  - 방과후(17~19): 2020년 보육지원체계 개편으로 모든 어린이집이 연장보육을 제공하므로 운영 중으로 보되,
 *    연장 전담교사 위주라 주간 교사의 45%만 근무한다고 가정
 *  - 야간(19~22): CRSPEC에 "야간연장형" 또는 "24시간"이 있는 시설만 운영, 교사 1명 가정
 *  - 주말: CRSPEC에 "휴일보육" 또는 "24시간"이 있는 시설만 운영, 교사 1명 가정
 */
export const STAFFING_ASSUMPTIONS = {
  afterSchoolStaffShare: 0.45,
  nightStaff: 1,
  weekendStaff: 1,
  status: "assumption" as AssumptionStatus,
  basis: "시간대별 실제 근무 인원 공개 데이터 없음 — 기존 MVP 가정치",
};

/**
 * 2SFCA(2단계 유동 집수 구역) 배분 설정 — 시설의 자리를 반경 안 수요가 나눠 쓴다(구 경계 무시).
 *  1단계: 시설 j의 반경 안 수요 합 P_j. 시설 자리를 각 행정동의 "반경 안 수요 비율"만큼 배분
 *  2단계: 행정동 i의 이용 가능한 자리 = Σ_j (배분 비율 w_ij × 시설 j의 이용 가능한 자리)
 * 배분 비율 w_ij는 대상 연령 인구 분포로만 정해지므로(시간대 이용률 계수는 약분됨) 데이터 빌드 때 미리 계산한다.
 * 행정동 안 인구는 고르게 퍼져 있다고 보고, 약 200m 간격 격자점에 나눠 놓는다(집계구 인구 확보 시 교체).
 */
export const CATCHMENT = {
  radiusM: 1000,
  demandPointSpacingM: 200,
  status: "assumption" as AssumptionStatus,
  basis: "직선 1km(도보 약 15분). 설정값 — 바꾸면 npm run data:build로 다시 계산",
};

/**
 * 미충족 수요(부모 검색 신호) 표시 기준. 분석 칸 = 행정동 × 시간대 × 대상 × 분기.
 * 칸별 "결과 없음 비율"을 오차 ±e(신뢰수준 90%)로 추정하는 최소 표본 n = z²·p(1−p)/e² (p = 0.5, z = 1.645)
 *  - ±10%p → 68건 → 여유분 포함 75건 (사업계획서 기준)
 *  - ±15%p → 31건 → 여유분 포함 35건 (행정동 단위로 칸이 늘어 추가한 "참고" 구간)
 * 공백 신호는 표본이 충분한 칸에서만 띄운다 (적은 표본에서 잘못된 경보 방지).
 */
export const UNMET_THRESHOLDS = {
  reliableMinSearches: 75,
  referenceMinSearches: 35,
  reliableMargin: 0.1,
  referenceMargin: 0.15,
  confidenceZ: 1.645,
  gapSignalRatio: 0.3,
  gapSignalMonths: 2,
  status: "assumption" as AssumptionStatus,
  basis: "사업계획서 ⑦-3 표본 기준(±10%p, 90%) + 행정동 단위 참고 구간(±15%p)",
};

/** 결과 없음 비율을 오차 e로 추정하는 최소 표본 (p = 0.5 최악 가정) */
export function minSampleForMargin(margin: number, z = UNMET_THRESHOLDS.confidenceZ): number {
  return Math.ceil((z * z * 0.25) / (margin * margin));
}

/**
 * 형평성 층 — 대중교통 접근성. 행정동 안 수요 지점(2SFCA와 같은 200m 격자) 중
 * 지하철역 반경 subwayM 또는 버스정류소 반경 busM 안에 있는 비율("대중교통 도보권 비율").
 * TODO: 반경 기준은 근거 확인 필요 (국토교통부 대중교통 서비스 평가 기준 등과 맞출 것).
 */
export const TRANSIT = {
  subwayM: 500,
  busM: 300,
  excludeBusTypes: ["한강선착장"],
  /** 지도에서 점선 테두리로 표시하는 기준 (도보권 비율이 이보다 낮은 동) */
  lowCoverage: 0.9,
  status: "todo" as AssumptionStatus,
  basis: "지하철 500m·버스 300m 도보권 (가정, 기준 확인 필요)",
};
