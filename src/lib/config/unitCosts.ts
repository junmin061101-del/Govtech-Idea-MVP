/**
 * 대안 비용 단가. 출처(source)가 있는 항목만 카드·리포트에 비용으로 계산한다.
 * 출처가 없는 항목은 계산하지 않고 화면에도 내지 않는다.
 * 단가를 바꿀 때는 이 파일의 값과 출처·기준연도를 함께 고친다 (담당자 입력 화면은 두지 않음).
 */

export type UnitCostId = "parttime_teacher_hourly" | "extension_class_annual" | "new_capacity_per_seat";

export interface UnitCost {
  id: UnitCostId;
  item: string;
  unit: string;
  amount: number | null;
  source: string | null;
  baseYear: number | null;
  /** 단가가 무엇을 뜻하는지, 어떻게 쓰는지 */
  note: string;
  /** 출처는 없지만 참고할 수 있는 값 (금액 표시에 쓰지 않음) */
  reference?: string;
}

export const DEFAULT_UNIT_COSTS: UnitCost[] = [
  {
    id: "parttime_teacher_hourly",
    item: "시간제 교사 시급 (하한)",
    unit: "원/시간",
    amount: 10320,
    source: "최저임금위원회 고시, 2026년 적용 최저임금",
    baseYear: 2026,
    note: "법정 최저임금이라 실제 보육교사 시급의 하한값이다. 실제 지급 기준(보육사업안내 등)을 입력하면 그 값으로 계산한다.",
  },
  {
    id: "extension_class_annual",
    item: "운영시간 연장(연장반 지정·운영) 시설 1곳당 연간 비용",
    unit: "원/년·시설",
    amount: null,
    source: null,
    baseYear: null,
    note: "운영시간 연장 대안에서 시설 수 × 단가로 계산한다.",
    reference: "사업계획서 참고값: 시설 2곳 야간 인력 보강+운영시간 연장 연 4,500만~6,600만 원 (출처 미기재)",
  },
  {
    id: "new_capacity_per_seat",
    item: "신규 정원 1명당 확충 비용",
    unit: "원/명",
    amount: null,
    source: null,
    baseYear: null,
    note: "인근 연계로 메우지 못한 부족 인원 × 단가로 계산한다.",
    reference: "사업계획서 참고값: 돌봄시설 신설 1곳 8억~15억 원 (출처 미기재, 정원당 단가 아님)",
  },
];

/** 금액을 표시해도 되는 단가인가 (금액과 출처가 모두 있어야 함) */
export function isUsable(c: UnitCost | undefined): c is UnitCost & { amount: number; source: string } {
  return Boolean(c && c.amount != null && c.amount > 0 && c.source && c.source.trim());
}

export function won(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(n % 1e8 === 0 ? 0 : 1)}억 원`;
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만 원`;
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}
