import { describe, expect, it } from "vitest";
import { SIGUNGU } from "@/lib/constants/regions";
import { TIME_SLOTS, TIME_SLOT_IDS } from "@/lib/constants/timeSlots";

describe("지역 코드", () => {
  it("서울 25개 구, 5자리 고유 코드", () => {
    expect(SIGUNGU).toHaveLength(25);
    expect(new Set(SIGUNGU.map((s) => s.code)).size).toBe(25);
    for (const s of SIGUNGU) expect(s.code).toMatch(/^11\d{3}$/);
  });
});

describe("시간대 코드", () => {
  it("6개 시간대가 순서대로 정의되어 있다", () => {
    expect(TIME_SLOTS.map((t) => t.id)).toEqual([...TIME_SLOT_IDS]);
  });
});
