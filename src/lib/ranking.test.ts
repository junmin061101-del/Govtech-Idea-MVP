import { describe, expect, it } from "vitest";
import { diagnoseAllDongs } from "@/lib/calculator";
import { rankDiagnoses } from "@/lib/ranking";
import { SIGUNGU } from "@/lib/constants/regions";
import { TIME_SLOTS } from "@/lib/constants/timeSlots";
import { loadAllFacilities, loadEmds } from "@/test/seoulData";
import type { DongDiagnosis } from "@/types";

const emds = loadEmds();
const facilities = loadAllFacilities().filter((f) => f.emdCode !== null);

describe("순위 목록", () => {
  it.each(SIGUNGU.map((s) => [s.name, s.code]))("%s: 모든 행정동이 목록에 빠짐없이 나온다", (_, code) => {
    const dongs = emds.filter((e) => e.sigunguCode === code);
    for (const slot of TIME_SLOTS.filter((t) => t.dataAvailable)) {
      const ranked = rankDiagnoses(diagnoseAllDongs(dongs, facilities, slot.id));
      expect(new Set(ranked.map((d) => d.dongId))).toEqual(new Set(dongs.map((d) => d.id)));
    }
  });

  it("동작구는 15개 동이 나오고 부족 인원 내림차순이다", () => {
    const dongs = emds.filter((e) => e.sigunguCode === "11590");
    const ranked = rankDiagnoses(diagnoseAllDongs(dongs, facilities, "night"));
    expect(ranked).toHaveLength(15);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].careGap).toBeGreaterThanOrEqual(ranked[i].careGap);
  });

  it("부족 없는 동은 여유가 큰 순으로 뒤에 온다", () => {
    const base: Omit<DongDiagnosis, "dongId" | "demand" | "totalECC" | "careGap"> = {
      timeSlot: "night", target: "infant", gapRatio: 0, severity: "normal", recommendation: "", facilityResults: [],
      bottleneck: { space: 0, time: 0, staff: 0, dominant: "space" },
    };
    const ranked = rankDiagnoses([
      { ...base, dongId: "a", demand: 10, totalECC: 12, careGap: 0 },
      { ...base, dongId: "b", demand: 10, totalECC: 30, careGap: 0 },
      { ...base, dongId: "c", demand: 10, totalECC: 4, careGap: 6 },
    ]);
    expect(ranked.map((d) => d.dongId)).toEqual(["c", "b", "a"]);
  });
});
