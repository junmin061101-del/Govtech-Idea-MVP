import { describe, expect, it } from "vitest";
import { hasGapSignal, reliabilityOf, signalOf, noResultColor, INSUFFICIENT_COLOR } from "@/lib/unmet";
import { minSampleForMargin, UNMET_THRESHOLDS } from "@/lib/config/assumptions";
import type { UnmetDemandCell, UnmetDemandFile } from "@/lib/constants/events";
import mock from "@/data/seoul/unmet-demand/11590.json";
import emds from "@/data/seoul/emds.json";

function cell(searches: number, noResult: number, monthly: [number, number][] = []): UnmetDemandCell {
  return {
    emdCode: "x", sigunguCode: "11590", timeSlot: "night", target: "infant", quarter: "2026-Q3",
    searches, noResult, widened: 0, vacancyWaiting: 7,
    applyExits: { compare: 9, documents: 4, eligibility: 6, submit: 1 },
    monthly: monthly.map(([s, n], i) => ({ month: `2026-0${7 + i}`, searches: s, noResult: n })),
  };
}

describe("표본 기준", () => {
  it("기준값은 오차 공식과 맞는다 (±10%p → 68건, ±15%p → 31건, 여유분 포함 75/35)", () => {
    expect(minSampleForMargin(0.1)).toBe(68);
    expect(minSampleForMargin(0.15)).toBe(31);
    expect(UNMET_THRESHOLDS.reliableMinSearches).toBeGreaterThanOrEqual(68);
    expect(UNMET_THRESHOLDS.referenceMinSearches).toBeGreaterThanOrEqual(31);
  });
  it.each([[74, "reference"], [75, "reliable"], [35, "reference"], [34, "insufficient"], [0, "insufficient"]])(
    "분기 검색 %d건 → %s", (n, r) => expect(reliabilityOf(n as number)).toBe(r),
  );
  it("표본 부족 칸은 수치를 하나도 내지 않는다", () => {
    const s = signalOf(cell(20, 15));
    expect(s.reliability).toBe("insufficient");
    expect([s.noResultRate, s.widenedRate, s.vacancyWaiting, s.topExitSteps]).toEqual([null, null, null, null]);
    expect(s.gapSignal).toBe(false);
    expect(noResultColor(s.noResultRate)).toBe(INSUFFICIENT_COLOR);
  });
  it("집계가 없는 칸도 표본 부족", () => {
    expect(signalOf(undefined).reliability).toBe("insufficient");
  });
});

describe("공백 신호 (결과 없음 30% 이상 2개월 연속)", () => {
  it("최근 2개월 모두 30% 이상이면 신호", () => {
    expect(hasGapSignal(cell(0, 0, [[30, 2], [30, 10], [30, 12]]).monthly)).toBe(true);
  });
  it("한 달이라도 30% 미만이면 신호 없음", () => {
    expect(hasGapSignal(cell(0, 0, [[30, 12], [30, 8], [30, 12]]).monthly)).toBe(false);
  });
  it("월 순서가 섞여 있어도 최근 달 기준", () => {
    const m = [{ month: "2026-09", searches: 30, noResult: 12 }, { month: "2026-07", searches: 30, noResult: 0 }, { month: "2026-08", searches: 30, noResult: 10 }];
    expect(hasGapSignal(m)).toBe(true);
  });
  it("표본이 '참고' 구간이면 비율이 높아도 공백 신호를 띄우지 않는다", () => {
    expect(signalOf(cell(50, 25, [[17, 9], [17, 9], [16, 8]])).gapSignal).toBe(false);
    expect(signalOf(cell(90, 45, [[30, 15], [30, 15], [30, 15]])).gapSignal).toBe(true);
  });
});

describe("신청 중 이탈 상위 3단계", () => {
  it("많은 순 3개", () => {
    expect(signalOf(cell(80, 10)).topExitSteps!.map((x) => x.label)).toEqual(["시설 비교", "입소 자격 확인", "서류 준비"]);
  });
});

describe("시연용 가상 데이터", () => {
  const file = mock as UnmetDemandFile;
  it("가상 데이터 표시가 켜져 있다", () => {
    expect(file.synthetic).toBe(true);
    expect(file.source).toContain("가상");
  });
  it("동작구 15개 동 × 4개 시간대 × 2개 대상 = 120칸", () => {
    expect(file.cells).toHaveLength(120);
    const dongjak = new Set(emds.filter((e) => e.sigunguCode === "11590").map((e) => e.emdCode));
    for (const c of file.cells) expect(dongjak.has(c.emdCode)).toBe(true);
  });
  it("월별 합 = 분기 합, 결과 없음 ≤ 검색", () => {
    for (const c of file.cells) {
      expect(c.monthly.reduce((a, m) => a + m.searches, 0)).toBe(c.searches);
      expect(c.monthly.reduce((a, m) => a + m.noResult, 0)).toBe(c.noResult);
      expect(c.noResult).toBeLessThanOrEqual(c.searches);
    }
  });
});
