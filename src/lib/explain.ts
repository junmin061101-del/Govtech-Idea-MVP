/**
 * "부족한 이유" — diagnoseDong의 분해 결과를 사람이 읽는 형태(정수 인원 + 이유별 시설 목록)로 바꾼다.
 *
 * 분해 규칙은 calculator.diagnoseDong과 같다.
 *  - 자리가 없어서: 모든 시설이 정원만큼 받아도 남는 부족분. 특정 시설 탓이 아니므로 시설 목록 없음
 *  - 문을 닫아서 / 선생님이 없어서: 나머지 부족분을 두 이유의 "못 받는 자리" 비율로 나눈 몫.
 *    각 시설의 "못 받는 자리"(정원 − 그 시간 이용 가능한 자리) 중 이 동에 배분되는 몫(2SFCA)을 목록으로 보여 준다.
 */
import { calculateECC, servingFacilities } from "@/lib/calculator";
import type { BottleneckAxis, DongDiagnosis, Facility, TimeSlotId } from "@/types";

export const AXIS_ORDER: BottleneckAxis[] = ["space", "time", "staff"];

export interface ReasonFacility {
  facility: Facility;
  /** (정원 − 그 시간 이용 가능한 자리) × 이 동 배분 비율, 정수 반올림 */
  lostSeats: number;
  /** 이 동에 배분되는 비율 (2SFCA) */
  weight: number;
  /** 예: "야간 운영 안 함", "교사 1명 근무 → 3명까지" */
  note: string;
  /** 운영 여부·근무 인원이 가정값이면 true */
  estimated: boolean;
}

export interface ReasonSegment {
  axis: BottleneckAxis;
  /** 부족 인원 중 이 이유의 몫 (정수, 세 이유 합 = 부족 인원) */
  people: number;
  /** 시설별 못 받는 자리 (큰 순). space는 빈 배열 */
  facilities: ReasonFacility[];
  /** 몫이 가정값(운영 여부·근무 인원 추정)에 기대면 true */
  estimated: boolean;
  /** 시설을 특정할 수 없는 몫이면 true (자리가 없어서) */
  unattributable: boolean;
}

export interface GapExplanation {
  demand: number;
  availableSeats: number;
  gap: number;
  /** 이 동에 배분되는 정원 합 (2SFCA) */
  totalCapacity: number;
  /** 이 동에 자리를 나눠 주는 시설 수 */
  servingCount: number;
  segments: ReasonSegment[];
}

/**
 * 합이 total(정수)이 되도록 실수 몫을 정수로 나눈다 (최대 나머지 방식).
 * 화면의 칸별 인원을 더하면 제목의 부족 인원과 정확히 같아야 한다.
 */
export function allocateIntegers(values: number[], total: number): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return values.map(() => 0);
  const scaled = values.map((v) => (v / sum) * total);
  const floors = scaled.map(Math.floor);
  let rest = total - floors.reduce((a, b) => a + b, 0);
  const order = scaled.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    floors[i]++;
    rest--;
  }
  return floors;
}

export function explainGap(
  diagnosis: DongDiagnosis,
  facilities: Facility[],
  timeSlot: TimeSlotId,
  slotShortLabel: string,
  /** 다른 동 시설이면 이름 옆에 동 이름을 붙인다 */
  dongName?: (dongId: string) => string | undefined,
): GapExplanation {
  const served = servingFacilities(facilities, diagnosis.dongId, diagnosis.target);
  const time: ReasonFacility[] = [];
  const staff: ReasonFacility[] = [];
  const where = (f: Facility) => {
    if (f.dongId === diagnosis.dongId) return "";
    const n = dongName?.(f.dongId);
    return n ? `${n} · ` : "인근 동 · ";
  };

  for (const { f, w: weight } of served) {
    const r = calculateECC(f, timeSlot);
    const lost = Math.round((f.capacity - r.ecc) * weight);
    if (lost <= 0) continue;
    const w = f.operatingWindows.find((x) => x.timeSlot === timeSlot);
    const estimated = Boolean(w?.estimated);
    const share = weight < 1 ? ` · 이 동 몫 ${Math.round(weight * 100)}%` : "";
    if (!r.isOpen) {
      time.push({ facility: f, lostSeats: lost, weight, note: `${where(f)}${slotShortLabel} 운영 안 함${share}`, estimated });
    } else {
      const staffOnDuty = Math.round((w?.staffOnDuty ?? 0) * 10) / 10;
      staff.push({
        facility: f,
        lostSeats: lost,
        weight,
        note: `${where(f)}교사 ${staffOnDuty}명 근무 → ${r.ecc}명까지 · 정원 ${f.capacity}명${share}`,
        estimated,
      });
    }
  }
  time.sort((a, b) => b.lostSeats - a.lostSeats);
  staff.sort((a, b) => b.lostSeats - a.lostSeats);

  const gap = diagnosis.careGap;
  const people = allocateIntegers(
    AXIS_ORDER.map((a) => diagnosis.bottleneck[a]),
    gap,
  );
  const list = { space: [] as ReasonFacility[], time, staff };

  return {
    demand: diagnosis.demand,
    availableSeats: diagnosis.totalECC,
    gap,
    totalCapacity: Math.round(served.reduce((a, { f, w }) => a + w * f.capacity, 0)),
    servingCount: served.length,
    segments: AXIS_ORDER.map((axis, i) => ({
      axis,
      people: people[i],
      facilities: list[axis],
      estimated: list[axis].some((x) => x.estimated),
      unattributable: axis === "space",
    })),
  };
}
