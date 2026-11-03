import { describe, expect, it } from "vitest";
import { labelPoint, pointInGeometry, pointInRing, simplifyRing, type Ring } from "@/lib/geo";

const square: Ring = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
const hole: Ring = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];

describe("geo", () => {
  it("pointInRing", () => {
    expect(pointInRing([5, 5], square)).toBe(true);
    expect(pointInRing([15, 5], square)).toBe(false);
  });
  it("구멍 안의 점은 바깥으로 본다", () => {
    const g = { type: "Polygon" as const, coordinates: [square, hole] };
    expect(pointInGeometry([5, 5], g)).toBe(false);
    expect(pointInGeometry([2, 2], g)).toBe(true);
  });
  it("MultiPolygon의 두 번째 조각도 판정한다", () => {
    const far: Ring = [[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]];
    expect(pointInGeometry([25, 25], { type: "MultiPolygon", coordinates: [[square], [far]] })).toBe(true);
  });
  it("오목한(ㄷ자) 모양도 라벨이 경계 안에 놓인다", () => {
    const u: Ring = [[0, 0], [10, 0], [10, 10], [8, 10], [8, 2], [2, 2], [2, 10], [0, 10], [0, 0]];
    const g = { type: "Polygon" as const, coordinates: [u] };
    expect(pointInGeometry(labelPoint(g), g)).toBe(true);
  });
  it("단순화는 직선 위의 점을 지우고 시작·끝점을 유지한다", () => {
    const r: Ring = [[0, 0], [5, 0.000001], [10, 0], [10, 10], [0, 10], [0, 0]];
    const s = simplifyRing(r, 0.001);
    expect(s).not.toContainEqual([5, 0.000001]);
    expect(s[0]).toEqual([0, 0]);
    expect(s.at(-1)).toEqual([0, 0]);
  });
});
