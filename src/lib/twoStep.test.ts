import { describe, expect, it } from "vitest";
import { calculateECC, diagnoseAllDongs, diagnoseDong } from "@/lib/calculator";
import { CATCHMENT } from "@/lib/config/assumptions";
import { SIGUNGU } from "@/lib/constants/regions";
import { loadAllFacilities, loadEmds, loadSigunguFile } from "@/test/seoulData";
import type { Dong, Facility } from "@/types";

const emds = loadEmds();
const all = loadAllFacilities().filter((f) => f.emdCode);
const emdByCode = new Map(emds.map((e) => [e.emdCode, e]));

function dong(id: string, demand: number): Dong {
  return {
    id, emdCode: id, sigunguCode: "00000", sidoCode: "00", name: id, lat: 0, lng: 0, bbox: [], neighbors: [],
    totalPopulation: 0, population0to9: 0, populationByAge: [],
    estimatedDemand: { infant: { night: demand }, lower_elementary: {} },
  };
}

describe("2SFCA 배분", () => {
  it("두 동이 반씩 나눠 쓰는 시설(자리 40)은 각 동에 20명씩", () => {
    const f: Facility = {
      id: "f", name: "f", type: "민간어린이집", targets: ["infant"], sigunguCode: "00000", emdCode: "A", dongId: "A",
      address: "", lat: 0, lng: 0, capacity: 40, currentEnrollment: 0, totalStaff: 0, dataSource: "t",
      operatingWindows: [{ timeSlot: "night", isOpen: true, staffOnDuty: 8, staffToChildRatio: 5 }],
      serves: { infant: [["A", 0.5], ["B", 0.5]] },
    };
    expect(diagnoseDong(dong("A", 30), [f], "night").totalECC).toBe(20);
    expect(diagnoseDong(dong("B", 30), [f], "night").totalECC).toBe(20);
    expect(diagnoseDong(dong("C", 30), [f], "night").totalECC).toBe(0);
  });

  it("배분 비율은 시설마다 합이 1이고, 반경 안 동에만 배분된다", () => {
    for (const f of all) {
      const ws = f.serves!.infant!;
      expect(ws.reduce((a, [, w]) => a + w, 0)).toBeCloseTo(1, 3);
      for (const [emd, w] of ws) {
        expect(w).toBeGreaterThan(0);
        expect(emdByCode.has(emd)).toBe(true);
      }
    }
  });

  it("대부분(99% 이상)의 시설은 자기 동에도 자리를 배분한다", () => {
    const withOwn = all.filter((f) => f.serves!.infant!.some(([emd]) => emd === f.emdCode)).length;
    expect(withOwn / all.length).toBeGreaterThan(0.99);
  });

  it("배분받는 동은 시설에서 반경(+동 크기) 이내다 — 멀리 떨어진 동에 배분되지 않는다", () => {
    const LAT_M = 111320;
    const LNG_M = 111320 * Math.cos((37.55 * Math.PI) / 180);
    for (const f of all) {
      for (const [emd] of f.serves!.infant!) {
        const [x0, y0, x1, y1] = emdByCode.get(emd)!.bbox;
        // 시설에서 그 동 bbox까지의 최단 거리
        const dx = Math.max(x0 - f.lng, 0, f.lng - x1) * LNG_M;
        const dy = Math.max(y0 - f.lat, 0, f.lat - y1) * LAT_M;
        expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(CATCHMENT.radiusM + 1);
      }
    }
  });

  it.each(SIGUNGU.map((s) => [s.name, s.code]))("%s 파일에 이 구 행정동에 자리를 나눠 주는 시설이 모두 들어 있다", (_, code) => {
    const ids = new Set(loadSigunguFile(code).map((f) => f.id));
    for (const f of all) {
      if (f.serves!.infant!.some(([emd]) => emdByCode.get(emd)!.sigunguCode === code)) expect(ids.has(f.id), f.name).toBe(true);
    }
  });

  it("서울 전체: 동별 이용 가능한 자리의 합 = 시설별 이용 가능한 자리의 합 (반올림 오차 이내)", () => {
    for (const slot of ["daytime", "night"] as const) {
      const byDong = diagnoseAllDongs(emds, all, slot).reduce((a, d) => a + d.totalECC, 0);
      const byFacility = all.reduce((a, f) => a + calculateECC(f, slot).ecc, 0);
      expect(Math.abs(byDong - byFacility)).toBeLessThanOrEqual(emds.length * 0.5);
    }
  });

  it("구 경계를 넘는 이용이 반영된다 (다른 구 시설에서 자리를 받는 동작구 행정동이 있다)", () => {
    const dongjak = new Set(emds.filter((e) => e.sigunguCode === "11590").map((e) => e.emdCode));
    const external = all.filter((f) => f.sigunguCode !== "11590" && f.serves!.infant!.some(([emd]) => dongjak.has(emd)));
    expect(external.length).toBeGreaterThan(0);
  });
});
