/**
 * 대안 효과 감사(audit) — 카드가 말하는 효과가 실제로 맞는지, 카드를 만든 계산과 별개로 확인한다.
 * 카드의 변경을 "구 전체 시설 데이터"에 적용하고 구 전체 행정동을 처음부터 다시 계산해서:
 *  1) 선택한 동의 남는 부족 인원 = 카드의 "남는 부족 인원"
 *  2) 카드 문장의 "N명이 줄어듭니다" = 실제 감소
 *  3) 다른 동의 부족 인원은 늘어나지 않는다 (인근 연계는 옆 동 여유 자리에서만 가져온다)
 *  4) 여러 장을 합친 효과 = 함께 적용해 다시 계산한 값, 각 카드 단독보다 나쁘지 않다
 *  5) 인근 연계는 자리를 옮길 뿐이다 — 구 전체 자리 합은 그대로 (같은 자리를 두 동이 세지 않음)
 */
import { describe, expect, it } from "vitest";
import { applyChange, buildAlternatives, combineAlternatives, mergeChanges, type AlternativeContext } from "@/lib/alternatives";
import { diagnoseAllDongs } from "@/lib/calculator";
import { DEFAULT_UNIT_COSTS } from "@/lib/config/unitCosts";
import { SIGUNGU } from "@/lib/constants/regions";
import { TIME_SLOTS } from "@/lib/constants/timeSlots";
import { loadEmds, loadSigunguFile } from "@/test/seoulData";

const emds = loadEmds();
const SLOTS = TIME_SLOTS.filter((t) => t.dataAvailable).map((t) => t.id);
const stats = { dongs: 0, cards: 0, combos: 0 };

describe.each(SIGUNGU.map((s) => [s.name, s.code]))("%s", (_, code) => {
  const dongs = emds.filter((e) => e.sigunguCode === code);
  const facilities = loadSigunguFile(code).filter((f) => f.emdCode);

  it.each(SLOTS)("%s: 카드 효과 = 구 전체 재계산 결과, 다른 동은 나빠지지 않음", (slot) => {
    const before = diagnoseAllDongs(dongs, facilities, slot);
    const gapBefore = new Map(before.map((d) => [d.dongId, d.careGap]));
    for (const d of before.filter((x) => x.careGap > 0)) {
      const dong = dongs.find((x) => x.id === d.dongId)!;
      const ctx: AlternativeContext = { dong, dongs, facilities, diagnoses: before, timeSlot: slot, target: "infant", unitCosts: DEFAULT_UNIT_COSTS };
      const usable = buildAlternatives(ctx).filter((a) => a.applicable && a.reduction > 0);
      stats.dongs++;

      const seatsBefore = before.reduce((a, x) => a + x.totalECC, 0);
      const check = (changeSet: Parameters<typeof mergeChanges>[0], expectedRemaining: number, label: string) => {
        const changed = applyChange(facilities, mergeChanges(changeSet), dong, slot, "infant");
        const after = diagnoseAllDongs(dongs, changed, slot);
        if (label === "link_capacity") {
          expect(after.reduce((a, x) => a + x.totalECC, 0), `${dong.name} ${slot}: 연계 후 구 전체 자리 합`).toBe(seatsBefore);
        }
        for (const x of after) {
          if (x.dongId === dong.id) expect(x.careGap, `${dong.name} ${slot} ${label}: 남는 부족`).toBe(expectedRemaining);
          else expect(x.careGap, `${dong.name} ${slot} ${label}: 다른 동 ${x.dongId} 악화`).toBeLessThanOrEqual(gapBefore.get(x.dongId)!);
        }
      };

      for (const a of usable) {
        stats.cards++;
        expect(a.remaining).toBe(d.careGap - a.reduction);
        const m = a.sentence.match(/(\d+)명이 줄어듭니다/);
        expect(m, a.sentence).not.toBeNull();
        expect(Number(m![1])).toBe(a.reduction);
        check([a.change], a.remaining, a.kind);
      }
      if (usable.length >= 2) {
        stats.combos++;
        const combined = combineAlternatives(ctx, usable);
        expect(combined.after).toBeLessThanOrEqual(Math.min(...usable.map((a) => a.remaining)));
        check(usable.map((a) => a.change), combined.after, "합친 효과");
      }
    }
  }, 60_000);
});

describe("감사 범위", () => {
  it("충분한 수의 동·카드를 검사했다", () => {
    // describe.each가 먼저 돈 뒤 집계된다
    expect(stats.dongs).toBeGreaterThan(500);
    expect(stats.cards).toBeGreaterThan(500);
    console.log(`감사: 부족 동 ${stats.dongs}개 · 카드 ${stats.cards}장 · 조합 ${stats.combos}개`);
  });
});
