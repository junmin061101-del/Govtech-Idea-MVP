import { describe, expect, it } from "vitest";
import { diagnoseAllDongs, diagnoseDong } from "@/lib/calculator";
import { allocateIntegers, explainGap } from "@/lib/explain";
import { TIME_SLOTS } from "@/lib/constants/timeSlots";
import { loadAllFacilities, loadEmds } from "@/test/seoulData";
import type { Dong, Facility, OperatingWindow } from "@/types";

const dong: Dong = {
  id: "d1", emdCode: "d1", sigunguCode: "00000", sidoCode: "00", name: "테스트동", lat: 0, lng: 0, bbox: [], neighbors: [],
  totalPopulation: 0, population0to9: 0, populationByAge: [],
  estimatedDemand: { infant: { night: 60 }, lower_elementary: {} },
};
function fac(id: string, capacity: number, w: Partial<OperatingWindow>): Facility {
  return {
    id, name: id, type: "민간어린이집", targets: ["infant"], sigunguCode: "00000", emdCode: "d1", dongId: "d1",
    address: "", lat: 0, lng: 0, capacity, currentEnrollment: 0, totalStaff: 0, dataSource: "test",
    operatingWindows: [{ timeSlot: "night", isOpen: true, staffOnDuty: 0, staffToChildRatio: 5, ...w }],
  };
}

describe("allocateIntegers", () => {
  it("합이 정확히 total이 된다", () => {
    expect(allocateIntegers([1.4, 1.3, 1.3], 4)).toEqual([2, 1, 1]);
    expect(allocateIntegers([0, 0, 0], 5)).toEqual([0, 0, 0]);
    expect(allocateIntegers([10, 0, 0], 7)).toEqual([7, 0, 0]);
  });
});

describe("explainGap", () => {
  const facilities = [
    fac("닫음", 20, { isOpen: false, estimated: true }),
    fac("교사부족", 20, { staffOnDuty: 1, estimated: true }), // 5명까지
    fac("정상", 10, { staffOnDuty: 2 }),
  ];
  const d = diagnoseDong(dong, facilities, "night");
  const e = explainGap(d, facilities, "night", "야간");

  it("제목 숫자: 수요 60, 자리 15, 부족 45", () => {
    expect([e.demand, e.availableSeats, e.gap]).toEqual([60, 15, 45]);
  });
  it("자리가 없어서 = 정원 합 50 < 수요 60 → 10명, 시설 특정 불가", () => {
    const space = e.segments.find((s) => s.axis === "space")!;
    expect(space.people).toBe(10);
    expect(space.unattributable).toBe(true);
    expect(space.facilities).toHaveLength(0);
  });
  it("문을 닫은 시설과 교사가 부족한 시설이 각 이유 목록에 들어간다", () => {
    const time = e.segments.find((s) => s.axis === "time")!;
    const staff = e.segments.find((s) => s.axis === "staff")!;
    expect(time.facilities.map((x) => [x.facility.id, x.lostSeats])).toEqual([["닫음", 20]]);
    expect(staff.facilities.map((x) => [x.facility.id, x.lostSeats])).toEqual([["교사부족", 15]]);
    expect(time.facilities[0].note).toContain("야간 운영 안 함");
    expect(time.estimated && staff.estimated).toBe(true);
    expect(time.people + staff.people).toBe(35);
  });

  const emds = loadEmds();
  const all = loadAllFacilities().filter((f) => f.emdCode);
  it.each(TIME_SLOTS.filter((t) => t.dataAvailable).map((t) => t.id))(
    "서울 전체 %s: 이유별 칸의 합 = 제목의 부족 인원",
    (slot) => {
      for (const diag of diagnoseAllDongs(emds, all, slot)) {
        const ex = explainGap(diag, all, slot, "");
        expect(ex.segments.reduce((a, s) => a + s.people, 0)).toBe(ex.gap);
        for (const s of ex.segments) expect(Number.isInteger(s.people)).toBe(true);
      }
    },
  );
});
