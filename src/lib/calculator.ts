import type {
  BottleneckAxis,
  Dong,
  DongDiagnosis,
  Facility,
  FacilityECCResult,
  SimulatorAdjustment,
  TimeSlotId,
} from "@/types";

export const TIME_SLOTS: { id: TimeSlotId; label: string; shortLabel: string; startHour: number; endHour: number }[] = [
  { id: "weekday_day", label: "평일 주간 09~17시", shortLabel: "주간", startHour: 9, endHour: 17 },
  { id: "afterschool", label: "하원/방과후 17~19시", shortLabel: "방과후", startHour: 17, endHour: 19 },
  { id: "evening", label: "야간 연장 19~22시", shortLabel: "야간연장", startHour: 19, endHour: 22 },
  { id: "weekend", label: "주말/방학", shortLabel: "주말", startHour: 9, endHour: 18 },
];

/**
 * 유효 돌봄 수용력(ECC) 계산
 * ECC(f,t) = min[공간 수용력(f,t), 인력 수용력(f,t)] × 운영여부(f,t)
 *
 * - 공간 수용력: 시설 인가 정원 (물리적 상한)
 * - 인력 수용력: 해당 시간대 배치 인력 * 인력 1인당 표준 돌봄 인원
 * - 운영여부: 해당 시간대에 문을 여는지 (0 또는 1) — 닫혀 있으면 정원·인력이 있어도 ECC는 0
 */
export function calculateECC(facility: Facility, timeSlot: TimeSlotId): FacilityECCResult {
  const window = facility.operatingWindows.find((w) => w.timeSlot === timeSlot);

  const spaceCapacity = facility.capacity;
  const staffCapacity = window ? window.staffOnDuty * window.staffToChildRatio : 0;
  const isOpen = window?.isOpen ?? false;

  const ecc = isOpen ? Math.min(spaceCapacity, staffCapacity) : 0;

  return {
    facilityId: facility.id,
    spaceCapacity,
    staffCapacity,
    isOpen,
    ecc,
  };
}

function severityOf(gapRatio: number): DongDiagnosis["severity"] {
  if (gapRatio > 0.3) return "critical";
  if (gapRatio > 0) return "moderate";
  return "normal";
}

const AXIS_POLICY: Record<BottleneckAxis, string> = {
  space: "신규 시설 확충 또는 인근 생활권 거점 시설과의 연계 배치",
  time: "운영시간 연장 지원 및 저녁 돌봄(야간반) 개설",
  staff: "돌봄교사(시간제 포함) 추가 배치",
};

const AXIS_LABEL: Record<BottleneckAxis, string> = {
  space: "공간(정원)",
  time: "시간(운영시간)",
  staff: "인력(교사 배치)",
};

/**
 * 생활권(행정동) 단위 돌봄 공백 진단 + 원인 분해(RCA)
 *
 * 원인 분해는 두 단계로 이뤄진다.
 *  1) 공간 병목: 모든 시설이 "완전 개방 + 완전 인력배치" 상태(idealECC)라도 못 채우는 수요분.
 *     이는 생활권 전체의 정원 총량 자체가 부족한 경우다.
 *  2) 시간/인력 병목: idealECC로는 채워졌을 수요가, 실제로는 문을 닫거나(시간) 교사가 부족해서(인력)
 *     실제 ECC가 idealECC보다 낮아져 발생한 손실 중 "실제로 공백을 유발한 부분"만 계산한다.
 *     (총 정원이 수요보다 넉넉하면 개별 시설의 손실이 있어도 생활권 전체 공백에는 영향이 없을 수 있다.)
 */
export function diagnoseDong(dong: Dong, facilities: Facility[], timeSlot: TimeSlotId): DongDiagnosis {
  const dongFacilities = facilities.filter((f) => f.dongId === dong.id);
  const demand = dong.estimatedDemand[timeSlot];

  let totalECC = 0;
  let idealECC = 0; // 완전 개방 + 완전 인력배치 가정 시의 총 수용력
  let timeLoss = 0;
  let staffLoss = 0;
  const facilityResults: FacilityECCResult[] = [];

  for (const facility of dongFacilities) {
    const result = calculateECC(facility, timeSlot);
    facilityResults.push(result);
    totalECC += result.ecc;

    const potential = facility.capacity;
    idealECC += potential;
    const loss = Math.max(0, potential - result.ecc);
    if (loss <= 0) continue;

    // 손실을 유발한 병목 축 판정: 시간(운영 여부)이 우선 원인이고, 그 다음이 인력이다.
    if (!result.isOpen) {
      timeLoss += loss;
    } else {
      staffLoss += loss;
    }
  }

  const careGap = Math.max(0, demand - totalECC);
  const gapRatio = demand > 0 ? careGap / demand : 0;

  // 1) 공간 병목: 완전 가동 상태에서도 못 채우는 수요분
  const spaceGap = Math.max(0, demand - idealECC);
  // 2) 시간/인력 병목: 실제 공백(careGap) 중 공간 부족만으로는 설명 안 되는 나머지
  const staffTimeGap = Math.max(0, careGap - spaceGap);
  const staffTimeLossTotal = timeLoss + staffLoss;
  const timeGap = staffTimeLossTotal > 0 ? staffTimeGap * (timeLoss / staffTimeLossTotal) : 0;
  const staffGap = staffTimeLossTotal > 0 ? staffTimeGap * (staffLoss / staffTimeLossTotal) : 0;

  const totalLoss = spaceGap + timeGap + staffGap;
  const axisValue: Record<BottleneckAxis, number> = { space: spaceGap, time: timeGap, staff: staffGap };

  let dominant: BottleneckAxis = "space";
  if (totalLoss > 0) {
    dominant = (["space", "time", "staff"] as BottleneckAxis[]).reduce((a, b) => (axisValue[b] > axisValue[a] ? b : a), "space");
  }

  const dominantShare = totalLoss > 0 ? Math.round((axisValue[dominant] / totalLoss) * 100) : 0;

  const timeSlotLabel = TIME_SLOTS.find((t) => t.id === timeSlot)?.label ?? timeSlot;

  const recommendation = careGap > 0
    ? `${dong.name}은(는) ${timeSlotLabel} 기준 ${AXIS_LABEL[dominant]} 병목이 공백의 ${dominantShare}%를 차지하는 주원인입니다. [${AXIS_POLICY[dominant]}] 시행 시 공백의 상당 부분(약 ${dominantShare}%)이 해소될 것으로 추정됩니다.`
    : `${dong.name}은(는) ${timeSlotLabel} 기준 추정 수요 대비 유효 수용력이 충분합니다.`;

  return {
    dongId: dong.id,
    timeSlot,
    demand,
    totalECC,
    careGap,
    gapRatio,
    severity: severityOf(gapRatio),
    bottleneck: { space: spaceGap, time: timeGap, staff: staffGap, dominant },
    recommendation,
    facilityResults,
  };
}

export function diagnoseAllDongs(dongs: Dong[], facilities: Facility[], timeSlot: TimeSlotId): DongDiagnosis[] {
  return dongs.map((dong) => diagnoseDong(dong, facilities, timeSlot));
}

// ---------------------------------------------------------------------------
// 정책 시뮬레이터
// ---------------------------------------------------------------------------

// 개략 단가 (정책 비교용 추정치 — 실제 예산 편성 시 지자체 단가 기준으로 교체 필요)
const COST_PER_EXTRA_STAFF_YEAR = 32_000_000; // 시간제 돌봄인력 1인 연간 인건비 추정
const COST_PER_EXTENDED_HOUR_YEAR = 6_000_000; // 시설 1개소 운영시간 1시간 연장 시 연간 소요 비용 추정
const COST_PER_NEW_CAPACITY_SLOT = 22_000_000; // 신규 시설 확충 시 정원 1인당 환산 비용 추정

/**
 * 정책 시뮬레이터: 운영시간 연장 / 시간제 인력 추가 배치를 적용했을 때
 * 생활권의 공백 해소율과 절감 예산 효과(신규 시설 확충 대비)를 계산한다.
 */
export function simulatePolicy(
  dong: Dong,
  facilities: Facility[],
  timeSlot: TimeSlotId,
  adjustment: SimulatorAdjustment
) {
  const before = diagnoseDong(dong, facilities, timeSlot);
  const dongFacilities = facilities.filter((f) => f.dongId === dong.id);

  const bottleneckedFacilities = dongFacilities.filter((f) => {
    const r = calculateECC(f, timeSlot);
    return r.ecc < f.capacity;
  });
  const targetCount = Math.max(1, bottleneckedFacilities.length);

  const adjustedFacilities: Facility[] = facilities.map((f) => {
    if (f.dongId !== dong.id) return f;
    const isBottlenecked = bottleneckedFacilities.some((b) => b.id === f.id);
    if (!isBottlenecked) return f;

    const staffShare = adjustment.additionalStaff / targetCount;

    return {
      ...f,
      operatingWindows: f.operatingWindows.map((w) => {
        if (w.timeSlot !== timeSlot) return w;
        const extendedOpen = w.isOpen || adjustment.extendHours > 0;
        return {
          ...w,
          isOpen: extendedOpen,
          staffOnDuty: w.staffOnDuty + staffShare,
        };
      }),
    };
  });

  const after = diagnoseDong(dong, adjustedFacilities, timeSlot);

  const gapResolved = Math.max(0, before.careGap - after.careGap);
  const resolutionRate = before.careGap > 0 ? Math.min(100, Math.round((gapResolved / before.careGap) * 100)) : 100;

  const interventionCost =
    adjustment.additionalStaff * COST_PER_EXTRA_STAFF_YEAR +
    (adjustment.extendHours > 0 ? targetCount * COST_PER_EXTENDED_HOUR_YEAR : 0);
  const equivalentNewCapacityCost = gapResolved * COST_PER_NEW_CAPACITY_SLOT;
  const budgetSaved = Math.max(0, equivalentNewCapacityCost - interventionCost);

  return {
    before,
    after,
    gapResolved,
    resolutionRate,
    interventionCost,
    equivalentNewCapacityCost,
    budgetSaved,
  };
}

export function severityColor(severity: DongDiagnosis["severity"]): string {
  switch (severity) {
    case "critical":
      return "#ef4444"; // red-500
    case "moderate":
      return "#f97316"; // orange-500
    default:
      return "#22c55e"; // green-500
  }
}
