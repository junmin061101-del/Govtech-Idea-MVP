/**
 * 시민 돌봄지도 미충족 수요 이벤트 — 시민 앱과 대시보드가 같이 쓰는 코드 (초안).
 * TODO: 시민 돌봄지도 구현과 맞춰 확정. 코드 문자열은 로그·집계 키라 확정 후 바꾸지 않는다.
 *
 * 개인 단위 이벤트는 시민 앱 쪽 수집 저장소에만 남고, 대시보드는 아래 집계(UnmetDemandCell)만 읽는다.
 * 집계 규칙: 같은 기기의 같은 조건 반복 검색은 하루 1건으로 센다(중복 제거). 결과 없음은 건수가 아니라 비율로 본다.
 */
import type { TimeSlotId } from "@/lib/constants/timeSlots";
import type { CareTargetId } from "@/lib/constants/targets";

export const UNMET_EVENT_TYPES = {
  search: "조건 검색 (중복 제거한 검색 1건)",
  search_no_result: "결과 없음 — 조건에 맞는 시설 0곳 (신청 전 포기)",
  search_widened: "범위를 넓힌 재검색 (신청 전 포기 신호)",
  apply_exit: "신청 도우미에서 멈춤 (신청 중 이탈, 멈춘 단계 기록)",
  vacancy_register: "빈자리 알림 등록 (명시적 수요)",
  vacancy_resolved: "빈자리 알림 해소 (자리 연결됨)",
} as const;
export type UnmetEventType = keyof typeof UNMET_EVENT_TYPES;

/** 신청 도우미 6단계 (apply_exit의 step) — TODO: 시민 앱 시나리오와 맞춰 확정 */
export const APPLY_STEPS = [
  { id: "conditions", label: "조건 입력" },
  { id: "compare", label: "시설 비교" },
  { id: "eligibility", label: "입소 자격 확인" },
  { id: "documents", label: "서류 준비" },
  { id: "submit", label: "신청서 제출" },
  { id: "waitlist", label: "대기 순번 확인" },
] as const;
export type ApplyStepId = (typeof APPLY_STEPS)[number]["id"];

/** 대시보드가 읽는 집계 한 칸 = 행정동 × 시간대 × 대상 × 분기 */
export interface UnmetDemandCell {
  emdCode: string;
  sigunguCode: string;
  timeSlot: TimeSlotId;
  target: CareTargetId;
  /** "2026-Q3" */
  quarter: string;
  /** 분기 검색 수 (중복 제거) */
  searches: number;
  noResult: number;
  widened: number;
  /** 분기 말 기준 해소되지 않은 빈자리 알림 등록 수 */
  vacancyWaiting: number;
  /** 신청 도우미 단계별 이탈 수 */
  applyExits: Partial<Record<ApplyStepId, number>>;
  /** 월별 (공백 신호 판정용) */
  monthly: { month: string; searches: number; noResult: number }[];
}

export interface UnmetDemandFile {
  sigunguCode: string;
  quarter: string;
  /** 시연용 가상 데이터면 true — 화면에 반드시 표시 */
  synthetic: boolean;
  generatedAt: string;
  source: string;
  cells: UnmetDemandCell[];
}
