import { describe, expect, it } from "vitest";
import { buildAlternatives, combineAlternatives, josa, type AlternativeContext } from "@/lib/alternatives";
import { diagnoseAllDongs } from "@/lib/calculator";
import { DEFAULT_UNIT_COSTS, type UnitCost } from "@/lib/config/unitCosts";
import { TIME_SLOTS, type TimeSlotId } from "@/lib/constants/timeSlots";
import { SIGUNGU } from "@/lib/constants/regions";
import { loadAllFacilities, loadEmds } from "@/test/seoulData";
import type { Dong, Facility, OperatingWindow } from "@/types";

function dong(id: string, demand: number, slot: TimeSlotId, neighbors: string[] = []): Dong {
  return {
    id, emdCode: id, sigunguCode: "00000", sidoCode: "00", name: `${id}동`, lat: 0, lng: 0, bbox: [], neighbors,
    totalPopulation: 0, population0to9: 0, populationByAge: [],
    estimatedDemand: { infant: { [slot]: demand }, lower_elementary: {} },
  };
}
function fac(id: string, dongId: string, capacity: number, slot: TimeSlotId, w: Partial<OperatingWindow>): Facility {
  return {
    id, name: `가나${id}어린이집`, type: "민간어린이집", targets: ["infant"], sigunguCode: "00000", emdCode: dongId, dongId,
    address: "", lat: 0, lng: 0, capacity, currentEnrollment: 0, totalStaff: 0, dataSource: "test",
    operatingWindows: [{ timeSlot: slot, isOpen: true, staffOnDuty: 0, staffToChildRatio: 5, ...w }],
  };
}

/** 수요 60: 문 닫은 시설(정원 20) + 교사 부족 시설(정원 20, 5명만) + 정원 총량 부족 10, 인근 B동 여유 15 */
function scenario(slot: TimeSlotId, unitCosts: UnitCost[] = DEFAULT_UNIT_COSTS): AlternativeContext {
  const a = dong("A", 60, slot, ["B"]);
  const b = dong("B", 5, slot, ["A"]);
  const facilities = [
    fac("1", "A", 20, slot, { isOpen: false }),
    fac("2", "A", 20, slot, { staffOnDuty: 1 }),
    fac("3", "A", 10, slot, { staffOnDuty: 2 }),
    fac("4", "B", 20, slot, { staffOnDuty: 4 }),
  ];
  return {
    dong: a, dongs: [a, b], facilities, timeSlot: slot, target: "infant", unitCosts,
    diagnoses: diagnoseAllDongs([a, b], facilities, slot),
  };
}

describe("대안 카드", () => {
  const ctx = scenario("night");
  const alts = buildAlternatives(ctx);
  const by = (k: string) => alts.find((a) => a.kind === k)!;

  it("현재 부족 45명 (수요 60 − 자리 15)", () => {
    expect(combineAlternatives(ctx, []).before).toBe(45);
  });
  it("운영시간 연장: 문 닫은 시설 1곳을 열어 20명 감소, 필요 교사 4명", () => {
    expect(by("extend_hours").reduction).toBe(20);
    expect(by("extend_hours").needs.join(" ")).toContain("4명");
  });
  it("시간제 교사: 교사 3명 추가로 15명 감소", () => {
    expect(by("add_staff").reduction).toBe(15);
    expect(by("add_staff").sentence).toContain("3명");
  });
  it("인근 연계: B동 여유 15명 연계, 남는 자리 부족은 신규 정원 안내", () => {
    expect(by("link_capacity").reduction).toBe(15);
    expect(by("link_capacity").residualNote).toBeUndefined(); // 자리 부족 10명 ≤ 연계 15명
  });
  it("효과가 같으면 필요한 교사가 적은 대안이 앞에 온다", () => {
    for (let i = 1; i < alts.length; i++) {
      if (alts[i - 1].reduction === alts[i].reduction && alts[i - 1].applicable && alts[i].applicable) {
        expect(alts[i - 1].teachers).toBeLessThanOrEqual(alts[i].teachers);
      }
    }
  });
  it("줄어드는 인원 순으로 정렬", () => {
    for (let i = 1; i < alts.length; i++) expect(alts[i - 1].reduction).toBeGreaterThanOrEqual(alts[i].reduction);
  });
  it("세 대안을 합치면 부족 0명 (단순 합 50명보다 작거나 같음)", () => {
    expect(combineAlternatives(ctx, alts).after).toBe(0);
  });
  it("연장 + 교사만 합치면 자리 부족 10명이 남는다", () => {
    const r = combineAlternatives(ctx, [by("extend_hours"), by("add_staff")]);
    expect(r.after).toBe(10);
  });
  it("남는 부족 인원 = 현재 부족 − 줄어드는 인원", () => {
    for (const a of alts) expect(a.remaining).toBe(45 - a.reduction);
  });
});

describe("비용은 출처가 있는 단가로만 계산한다", () => {
  it("기본값: 연장 단가는 출처가 없어 '단가 출처 입력 필요', 교사 인건비는 최저임금 하한으로 계산", () => {
    const alts = buildAlternatives(scenario("night"));
    const ext = alts.find((a) => a.kind === "extend_hours")!.costs[0];
    expect(ext.amount).toBeNull();
    expect(ext.missing).toBe("단가 출처 입력 필요");
    const staff = alts.find((a) => a.kind === "add_staff")!.costs[0];
    expect(staff.amount).toBe(3 * 3 * 10320); // 교사 3명 × 19~22시 3시간 × 시급
    expect(staff.source).toContain("최저임금");
  });
  it("금액만 있고 출처가 없으면 표시하지 않는다", () => {
    const costs = DEFAULT_UNIT_COSTS.map((c) => (c.id === "extension_class_annual" ? { ...c, amount: 30_000_000, source: "" } : c));
    const ext = buildAlternatives(scenario("night", costs)).find((a) => a.kind === "extend_hours")!.costs[0];
    expect(ext.amount).toBeNull();
  });
  it("출처를 입력하면 시설 수 × 단가로 계산한다", () => {
    const costs = DEFAULT_UNIT_COSTS.map((c) => (c.id === "extension_class_annual" ? { ...c, amount: 30_000_000, source: "○○구 예산서", baseYear: 2026 } : c));
    const ext = buildAlternatives(scenario("night", costs)).find((a) => a.kind === "extend_hours")!.costs[0];
    expect(ext.amount).toBe(30_000_000);
    expect(ext.source).toContain("○○구 예산서");
  });
  it("주말은 근무 시간 기준이 없어 인건비를 계산하지 않는다", () => {
    const staff = buildAlternatives(scenario("weekend")).find((a) => a.kind === "add_staff")!.costs[0];
    expect(staff.amount).toBeNull();
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
    early_morning: "이른 아침", daytime: "주간", after_school: "방과후", night: "야간", weekend: "주말", vacation: "방학",
  };
  it.each(TIME_SLOTS.map((t) => t.id))("%s", (slot) => {
    const alts = buildAlternatives(scenario(slot));
    const ext = alts.find((a) => a.kind === "extend_hours")!;
    expect(ext.sentence).toContain(required[slot]);
    for (const a of alts) {
      const text = [a.title, a.sentence, a.residualNote ?? "", ...a.needs].join(" ");
      expect(text, a.kind).not.toMatch(forbidden[slot]);
    }
  });
  it("조사: 받침 유무", () => {
    expect(josa("야간 연장 운영", "을", "를")).toBe("을");
    expect(josa("주간 운영 확대", "을", "를")).toBe("를");
  });
});

describe("서울 실데이터", () => {
  const emds = loadEmds();
  const all = loadAllFacilities().filter((f) => f.emdCode);
  it.each(SIGUNGU.slice(0, 25).map((s) => [s.name, s.code]))("%s: 대안 효과가 0 이상, 현재 부족 이하, 합친 효과는 각 대안 이상", (_, code) => {
    const dongs = emds.filter((e) => e.sigunguCode === code);
    const facilities = all.filter((f) => f.sigunguCode === code);
    for (const slot of ["daytime", "night"] as const) {
      const diagnoses = diagnoseAllDongs(dongs, facilities, slot);
      for (const d of diagnoses.filter((x) => x.careGap > 0)) {
        const ctx: AlternativeContext = {
          dong: dongs.find((x) => x.id === d.dongId)!, dongs, facilities, diagnoses, timeSlot: slot, target: "infant",
          unitCosts: DEFAULT_UNIT_COSTS,
        };
        const alts = buildAlternatives(ctx);
        expect(alts).toHaveLength(3);
        for (const a of alts) {
          expect(a.reduction).toBeGreaterThanOrEqual(0);
          expect(a.reduction).toBeLessThanOrEqual(d.careGap);
          expect(Number.isInteger(a.reduction)).toBe(true);
        }
        const all3 = combineAlternatives(ctx, alts).after;
        expect(all3).toBeLessThanOrEqual(Math.min(...alts.map((a) => a.remaining)));
        expect(all3).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
