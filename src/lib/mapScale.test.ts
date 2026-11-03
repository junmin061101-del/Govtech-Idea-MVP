import { describe, expect, it } from "vitest";
import { gapClassOf } from "@/lib/mapScale";

describe("지도 색 구간", () => {
  it.each([
    [100, 95, "short1"],   // 5% 부족
    [100, 90, "short1"],   // 10% 경계는 아래 구간
    [100, 85, "short2"],
    [100, 75, "short3"],
    [100, 60, "short4"],
    [100, 40, "short5"],
    [100, 0, "short5"],
    [100, 100, "balanced"],
    [100, 105, "balanced"],
    [100, 110, "surplus"],
    [0, 50, "no_demand"],
  ])("수요 %d, 자리 %d → %s", (demand, seats, id) => {
    expect(gapClassOf(demand, seats).id).toBe(id);
  });

  it("여유와 충족은 다른 색이다", () => {
    expect(gapClassOf(100, 200).color).not.toBe(gapClassOf(100, 100).color);
  });
});
