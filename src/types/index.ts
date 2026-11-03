// CareOS 도메인 타입 정의

import type { TimeSlotId } from "@/lib/constants/timeSlots";
import type { CareTargetId } from "@/lib/constants/targets";

export type { TimeSlotId } from "@/lib/constants/timeSlots";
export type { TimeSlotDef as TimeSlot } from "@/lib/constants/timeSlots";
export type { CareTargetId } from "@/lib/constants/targets";

/** 서울시 열린데이터광장 보육시설 표준데이터(OA-20320) 스키마를 준용한 시설 유형 */
export type FacilityType =
  | "국공립어린이집"
  | "민간어린이집"
  | "가정어린이집"
  | "직장어린이집"
  | "협동어린이집"
  | "법인단체등어린이집"
  | "다함께돌봄센터"
  | "우리동네키움센터";

/** 시간대별 해당 시설의 실제 운영 여부 및 배치 인력 수 */
export interface OperatingWindow {
  timeSlot: TimeSlotId;
  isOpen: boolean;
  /** 해당 시간대에 실제 근무하는 보육교사/돌봄인력 수 */
  staffOnDuty: number;
  /** 교사 1인당 표준 돌봄 가능 인원 (법정 배치기준을 재원 연령 구성으로 가중) */
  staffToChildRatio: number;
  /** 운영 여부·근무 인원이 실측이 아니라 가정값이면 true (화면에 "추정" 표시) */
  estimated?: boolean;
}

/** 좌표가 소속 구 경계 밖이라 행정동에 배정하지 못한 경우 */
export type LocationIssue = "outside_sigungu" | "outside_seoul";

export interface Facility {
  id: string;
  name: string;
  type: FacilityType;
  /** 이 시설이 받는 돌봄 대상 */
  targets: CareTargetId[];
  sigunguCode: string;
  /** 행정동 코드. 좌표 오류로 배정 못 하면 null */
  emdCode: string | null;
  /** = emdCode (미배정이면 "{sigunguCode}-unassigned") */
  dongId: string;
  address: string;
  lat: number;
  lng: number;
  /** 인가 정원 (공간 수용력의 상한) */
  capacity: number;
  /** 현재 등록 인원 */
  currentEnrollment: number;
  /** 보육교사 + 특수교사 수 (주간 기준) */
  totalStaff: number;
  operatingWindows: OperatingWindow[];
  dataSource: string;
  /** 원자료 기준일 (YYYY-MM-DD) */
  dataDate?: string;
  /** 시설 특성 (야간연장형, 휴일보육, 24시간 등) */
  spec?: string[];
  locationIssue?: LocationIssue;
  /** 재원 아동이 없어 교사 1인당 아동 수를 기본값으로 둔 경우 */
  ratioEstimated?: boolean;
  /** 교사 수가 원자료에 없어 총 교직원 수로 대신한 경우 */
  teachersEstimated?: boolean;
  /** 전화번호 (실데이터 보유 시) */
  phone?: string;
  /** 인가일자 (실데이터 보유 시) */
  approvalDate?: string;
  /** 시설 홈페이지 또는 어린이집정보공개포털 상세 페이지 링크 */
  homepageUrl?: string;
}

/** 행정동 */
export interface Dong {
  /** = emdCode */
  id: string;
  /** 행정동 코드 10자리 (행정안전부 행정기관코드, admdongkor adm_cd2) */
  emdCode: string;
  sigunguCode: string;
  sidoCode: string;
  name: string;
  /** 라벨 위치 (항상 경계 안) */
  lat: number;
  lng: number;
  /** [minLng, minLat, maxLng, maxLat] */
  bbox: number[];
  /** 경계가 맞닿은 행정동 코드 (다른 구 포함) */
  neighbors: string[];
  /** 행정안전부 주민등록인구 통계 실측치 */
  totalPopulation: number;
  population0to9: number;
  /** 0세~9세 1세 단위 인구 */
  populationByAge: number[];
  /** 대상·시간대별 추정 돌봄 수요 인원. 산정 근거가 없는 시간대는 키가 없다 */
  estimatedDemand: Record<CareTargetId, Partial<Record<TimeSlotId, number>>>;
}

export type BottleneckAxis = "space" | "time" | "staff";

export interface FacilityECCResult {
  facilityId: string;
  spaceCapacity: number;
  staffCapacity: number;
  isOpen: boolean;
  ecc: number;
}

export interface DongDiagnosis {
  dongId: string;
  timeSlot: TimeSlotId;
  target: CareTargetId;
  demand: number;
  totalECC: number;
  careGap: number;
  gapRatio: number;
  severity: "critical" | "moderate" | "normal";
  bottleneck: {
    space: number;
    time: number;
    staff: number;
    dominant: BottleneckAxis;
  };
  recommendation: string;
  facilityResults: FacilityECCResult[];
}
