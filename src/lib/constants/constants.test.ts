import { describe, expect, it } from "vitest";
import { SIGUNGU } from "@/lib/constants/regions";
import { TIME_SLOTS, TIME_SLOT_IDS } from "@/lib/constants/timeSlots";
import dongsData from "@/data/dongjak-demographics.json";
import facilitiesData from "@/data/dongjak-facilities.json";

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

describe("동작구 데이터", () => {
  it("15개 행정동이 모두 있다 (노량진2동·대방동·신대방1·2동 포함)", () => {
    const names = dongsData.map((d) => d.name);
    expect(names).toHaveLength(15);
    for (const n of ["노량진2동", "대방동", "신대방1동", "신대방2동"]) expect(names).toContain(n);
  });
  it("모든 시설이 존재하는 행정동에 배정되어 있다", () => {
    const ids = new Set(dongsData.map((d) => d.id));
    for (const f of facilitiesData) expect(ids.has(f.dongId)).toBe(true);
  });
});
