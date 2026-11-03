/**
 * 시간대 공통 상수 — 대시보드와 시민 돌봄지도 이벤트(time_slot)가 같은 코드를 쓴다.
 * 코드 문자열은 이벤트 로그·집계 키로 저장되므로 한번 정하면 바꾸지 않는다.
 */

export const TIME_SLOT_IDS = ["early_morning", "daytime", "after_school", "night", "weekend", "vacation"] as const;
export type TimeSlotId = (typeof TIME_SLOT_IDS)[number];

export interface TimeSlotDef {
  id: TimeSlotId;
  /** 화면 제목용 (예: "평일 19~22시") */
  label: string;
  /** 토글 버튼용 짧은 이름 */
  shortLabel: string;
  /** 평일 시간대만 시각 범위가 있다. 주말·방학은 하루 단위 구분 */
  hours?: { start: number; end: number };
  /**
   * 운영시간 연장 대안의 처방 문구에 쓰는 표현. 시간대와 맞지 않는 문구(예: 주말인데 "야간반")가
   * 나오지 않도록 처방 문구는 반드시 이 값으로 만든다.
   */
  extendAction: string;
  /**
   * 현재 데이터로 이 시간대의 수요·운영 여부를 산정할 수 있는지.
   * false인 시간대는 토글에서 비활성 + "데이터 준비 중"으로 표시한다.
   */
  dataAvailable: boolean;
}

export const TIME_SLOTS: TimeSlotDef[] = [
  {
    id: "early_morning",
    label: "평일 이른 아침 07~09시",
    shortLabel: "이른 아침",
    hours: { start: 7, end: 9 },
    extendAction: "이른 아침 조기 개원",
    // TODO(S2): 시설별 개원 시각 데이터 확보 전까지 산정 불가. 출처 확인 후 활성화.
    dataAvailable: false,
  },
  {
    id: "daytime",
    label: "평일 주간 09~17시",
    shortLabel: "주간",
    hours: { start: 9, end: 17 },
    extendAction: "주간 운영 확대",
    dataAvailable: true,
  },
  {
    id: "after_school",
    label: "평일 방과후 17~19시",
    shortLabel: "방과후",
    hours: { start: 17, end: 19 },
    extendAction: "방과후 연장 운영",
    dataAvailable: true,
  },
  {
    id: "night",
    label: "평일 야간 19~22시",
    shortLabel: "야간",
    hours: { start: 19, end: 22 },
    extendAction: "야간 연장 운영",
    dataAvailable: true,
  },
  {
    id: "weekend",
    label: "주말",
    shortLabel: "주말",
    extendAction: "주말 운영",
    dataAvailable: true,
  },
  {
    id: "vacation",
    label: "방학",
    shortLabel: "방학",
    extendAction: "방학 프로그램 운영",
    // TODO(S2): 방학 중 운영 데이터(초등 돌봄 시설 위주) 확보 전까지 산정 불가.
    dataAvailable: false,
  },
];

export function timeSlotDef(id: TimeSlotId): TimeSlotDef {
  const def = TIME_SLOTS.find((t) => t.id === id);
  if (!def) throw new Error(`Unknown time slot: ${id}`);
  return def;
}
