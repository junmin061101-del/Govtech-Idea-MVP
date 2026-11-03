import { describe, expect, it } from "vitest";
import { axisPolicyText, calculateECC, diagnoseAllDongs, diagnoseDong } from "@/lib/calculator";
import { TIME_SLOTS, type TimeSlotId } from "@/lib/constants/timeSlots";
import type { Dong, Facility, OperatingWindow } from "@/types";
import { loadAllFacilities, loadEmds } from "@/test/seoulData";
import baseline from "@/lib/__fixtures__/diagnosis-baseline.json";

const dongs = loadEmds();
const facilities = loadAllFacilities().filter((f) => f.emdCode !== null);

function dong(demand: Partial<Record<TimeSlotId, number>>): Dong {
  return {
    id: "d1", emdCode: "d1", sigunguCode: "00000", sidoCode: "00", name: "테스트동", lat: 0, lng: 0, bbox: [],
    totalPopulation: 0, population0to9: 0, populationByAge: [],
    estimatedDemand: { infant: demand, lower_elementary: { night: 999 } },
  };
}

function facility(id: string, capacity: number, night: Partial<OperatingWindow>): Facility {
  return {
    id, name: id, type: "민간어린이집", targets: ["infant"], sigunguCode: "00000", emdCode: "d1",
    dongId: "d1", address: "", lat: 0, lng: 0,
    capacity, currentEnrollment: 0, totalStaff: 0, dataSource: "test",
    operatingWindows: [{ timeSlot: "night", isOpen: true, staffOnDuty: 0, staffToChildRatio: 5, ...night }],
  };
}

describe("calculateECC (이용 가능한 자리)", () => {
  it("운영하지 않는 시간대는 정원·교사가 있어도 0", () => {
    expect(calculateECC(facility("f", 30, { isOpen: false, staffOnDuty: 10 }), "night").ecc).toBe(0);
  });
  it("정원과 교사 수용 인원 중 작은 값", () => {
    expect(calculateECC(facility("f", 30, { staffOnDuty: 2, staffToChildRatio: 5 }), "night").ecc).toBe(10);
    expect(calculateECC(facility("f", 8, { staffOnDuty: 2, staffToChildRatio: 5 }), "night").ecc).toBe(8);
  });
  it("자리는 정수로 내림한다 (교사 1명 × 1인당 3.33명 = 3명)", () => {
    expect(calculateECC(facility("f", 30, { staffOnDuty: 1, staffToChildRatio: 10 / 3 }), "night").ecc).toBe(3);
  });
  it("해당 시간대 운영 정보가 없으면 운영 안 함으로 본다", () => {
    expect(calculateECC(facility("f", 30, { staffOnDuty: 6 }), "weekend").ecc).toBe(0);
  });
});

describe("diagnoseDong (부족 인원과 이유 분해)", () => {
  it("정원 총량이 수요보다 적으면 그 차이는 '자리 부족'", () => {
    const d = diagnoseDong(dong({ night: 50 }), [facility("a", 20, { staffOnDuty: 4 })], "night");
    expect(d.careGap).toBe(30);
    expect(d.bottleneck).toMatchObject({ space: 30, time: 0, staff: 0, dominant: "space" });
  });
  it("정원은 충분한데 문을 닫으면 '문을 닫아서'", () => {
    const d = diagnoseDong(
      dong({ night: 30 }),
      [facility("open", 20, { staffOnDuty: 4 }), facility("closed", 20, { isOpen: false })],
      "night",
    );
    expect(d.careGap).toBe(10);
    expect(d.bottleneck).toMatchObject({ space: 0, time: 10, staff: 0, dominant: "time" });
  });
  it("정원은 충분한데 교사가 모자라면 '선생님이 없어서'", () => {
    const d = diagnoseDong(dong({ night: 30 }), [facility("a", 40, { staffOnDuty: 2 })], "night");
    expect(d.careGap).toBe(20);
    expect(d.bottleneck).toMatchObject({ space: 0, time: 0, staff: 20, dominant: "staff" });
  });
  it("자리가 수요보다 많으면 부족 0, 정상", () => {
    const d = diagnoseDong(dong({ night: 5 }), [facility("a", 20, { staffOnDuty: 4 })], "night");
    expect(d.careGap).toBe(0);
    expect(d.severity).toBe("normal");
  });
  it("대상이 다른 시설은 자리로 세지 않는다 (어린이집은 초등 저학년 공급 아님)", () => {
    const d = diagnoseDong(dong({}), [facility("a", 40, { staffOnDuty: 8 })], "night", "lower_elementary");
    expect(d.totalECC).toBe(0);
    expect(d.careGap).toBe(999);
  });
  it("수요 산정 근거가 없는 시간대는 수요 0으로 처리(토글에서 비활성)", () => {
    expect(diagnoseDong(dong({}), [], "vacation").demand).toBe(0);
  });

  it.each(TIME_SLOTS.filter((t) => t.dataAvailable).map((t) => t.id))(
    "서울 427개 행정동 실데이터 %s: 이유별 인원의 합 = 부족 인원",
    (slot) => {
      for (const d of diagnoseAllDongs(dongs, facilities, slot)) {
        const sum = d.bottleneck.space + d.bottleneck.time + d.bottleneck.staff;
        expect(sum).toBeCloseTo(d.careGap, 6);
        expect(Number.isInteger(d.careGap)).toBe(true);
      }
    },
  );

  it("동작구 계산 결과가 고정 기준값과 같다 (의도적으로 바꿀 때만 기준값 갱신)", () => {
    const dongjak = dongs.filter((d) => d.sigunguCode === "11590");
    for (const [slot, rows] of Object.entries(baseline)) {
      const got = diagnoseAllDongs(dongjak, facilities, slot as TimeSlotId);
      expect(got.map((d) => ({
        dongId: d.dongId, demand: d.demand, totalECC: d.totalECC, careGap: d.careGap,
        space: d.bottleneck.space, time: d.bottleneck.time, staff: d.bottleneck.staff,
      }))).toEqual(rows);
    }
  });
});

describe("처방 문구는 시간대와 맞아야 한다", () => {
  const forbidden: Record<TimeSlotId, RegExp> = {
    early_morning: /야간|저녁|주말|방학/,
    daytime: /야간|저녁|주말|방학/,
    after_school: /야간|저녁|주말|방학/,
    night: /주말|방학|아침/,
    weekend: /야간|저녁|방학|아침/,
    vacation: /야간|저녁|주말|아침/,
  };
  const required: Record<TimeSlotId, string> = {
    early_morning: "이른 아침", daytime: "주간", after_school: "방과후",
    night: "야간", weekend: "주말", vacation: "방학",
  };
  it.each(TIME_SLOTS.map((t) => t.id))("%s", (slot) => {
    const text = axisPolicyText("time", slot);
    expect(text).toContain(required[slot]);
    expect(text).not.toMatch(forbidden[slot]);
  });
  it("서울 전체 동·시간대의 진단 문구에 다른 시간대 표현이 섞이지 않는다", () => {
    for (const slot of TIME_SLOTS.filter((t) => t.dataAvailable).map((t) => t.id)) {
      for (const d of diagnoseAllDongs(dongs, facilities, slot)) {
        // 동 이름(예: 도봉구 "방학1동")과 시간대 제목은 빼고 처방 본문만 검사한다
        const name = dongs.find((x) => x.id === d.dongId)!.name;
        const body = d.recommendation.replace(name, "").replace(TIME_SLOTS.find((t) => t.id === slot)!.label, "");
        expect(body).not.toMatch(forbidden[slot]);
      }
    }
  });
});
