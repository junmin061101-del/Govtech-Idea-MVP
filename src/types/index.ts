// CareOS 도메인 타입 정의

/** 대시보드에서 다루는 4가지 시간대 프리셋 */
export type TimeSlotId =
  | "weekday_day" // 평일 주간 09~17
  | "afterschool" // 하원/방과후 17~19
  | "evening" // 야간 연장 19~22
  | "weekend"; // 주말/방학

export interface TimeSlot {
  id: TimeSlotId;
  label: string;
  shortLabel: string;
  startHour: number;
  endHour: number;
}

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
  /** 교사 1인당 표준 돌봄 가능 인원 (연령/유형별 상이) */
  staffToChildRatio: number;
}

export interface Facility {
  id: string;
  name: string;
  type: FacilityType;
  dongId: string;
  address: string;
  lat: number;
  lng: number;
  /** 인가 정원 (공간 수용력의 상한) */
  capacity: number;
  /** 현재 등록 인원 */
  currentEnrollment: number;
  /** 전체 배치 교사 수 (주간 기준) */
  totalStaff: number;
  operatingWindows: OperatingWindow[];
  dataSource: string;
  /** 전화번호 (실데이터 보유 시) */
  phone?: string;
  /** 인가일자 (실데이터 보유 시) */
  approvalDate?: string;
  /** 시설 홈페이지 또는 어린이집정보공개포털 상세 페이지 링크 */
  homepageUrl?: string;
}

/** 생활권 단위 (행정동 기준) */
export interface Dong {
  id: string;
  name: string;
  /** 상위 생활권 (도보 생활권 그룹) */
  lifeZone: string;
  lat: number;
  lng: number;
  /** 폴리곤 근사를 위한 반경(m). 실제 행정경계 폴리곤 데이터 확보 전 임시 근사치 */
  approxRadiusM: number;
  population0to9: number;
  dualIncomeHouseholdRate: number;
  /** 시간대별 추정 돌봄 수요 인원 */
  estimatedDemand: Record<TimeSlotId, number>;
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

export interface SimulatorAdjustment {
  extendHours: number; // 운영시간 연장 (시간)
  additionalStaff: number; // 시간제 돌봄인력 추가 배치 인원
}
