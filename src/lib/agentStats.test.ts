import { describe, expect, it } from "vitest";
import { ago, computeAgentStats, sameKstDay, type AgentInsight } from "./agentStats";

// 2026-11-09 10:00 KST
const NOW = new Date("2026-11-09T01:00:00Z");
const at = (iso: string) => new Date(iso);
let n = 0;
const row = (p: Partial<AgentInsight>): AgentInsight => ({
  id: `r${n++}`,
  sigunguCode: "11590",
  emdCode: "1159051000",
  timeSlots: [],
  target: "infant",
  topics: [],
  noResult: false,
  createdAt: NOW,
  ...p,
});

describe("computeAgentStats — 구 단위 실시간 집계", () => {
  const rows = [
    row({ emdCode: "1159051000", topics: ["vacancy", "facility_search"], timeSlots: ["night"], noResult: true, createdAt: at("2026-11-09T00:30:00Z") }),
    row({ emdCode: "1159051000", topics: ["vacancy"], timeSlots: ["night", "night"], createdAt: at("2026-11-08T14:59:00Z") }), // 11-08 23:59 KST
    row({ emdCode: "1159052000", topics: ["cost"], timeSlots: ["early_morning"], target: "lower_elementary", noResult: true, createdAt: at("2026-11-08T15:00:00Z") }), // 11-09 00:00 KST
    row({ sigunguCode: "11620", emdCode: null, topics: ["other"], target: null, createdAt: at("2026-11-05T00:00:00Z") }),
    row({ topics: ["vacancy"], createdAt: at("2026-10-01T00:00:00Z") }), // 기간 밖
    row({ topics: ["vacancy"], createdAt: null }), // 시각 없음 → 제외
  ];
  const s = computeAgentStats(rows, NOW, 7);

  it("기간 안 건수·오늘(한국 시간 자정 기준)·시설 못 찾음 비율", () => {
    expect(s.count).toBe(4);
    expect(s.today).toBe(2);
    expect(s.noResult).toBe(2);
    expect(s.noResultRate).toBe(0.5);
    expect(s.lastAt).toEqual(at("2026-11-09T00:30:00Z"));
  });

  it("주제는 많은 순, 한 상담에서 같은 주제·시간대는 한 번만 센다", () => {
    expect(s.topics.map((t) => [t.label, t.count])).toEqual([
      ["빈자리·대기", 2],
      ["기타", 1],
      ["비용·지원", 1],
      ["시설 찾기", 1],
    ]);
    expect(s.bySlot).toEqual({ night: 2, early_morning: 1 });
    expect(s.byTarget).toEqual({ infant: 2, lower_elementary: 1 });
  });

  it("동 순위는 상담 많은 순, 동을 모르는 기록은 구 합계에만 들어간다", () => {
    expect(s.dongs).toEqual([
      { emdCode: "1159051000", count: 2, noResult: 1, topTopic: "빈자리·대기" },
      { emdCode: "1159052000", count: 1, noResult: 1, topTopic: "비용·지원" },
    ]);
  });

  it("구별 합계 (서울 전체 보기)", () => {
    expect(s.sigungus).toEqual([
      { sigunguCode: "11590", count: 3, noResult: 2 },
      { sigunguCode: "11620", count: 1, noResult: 0 },
    ]);
  });

  it("한국 시간 시각별·날짜별 분포", () => {
    expect(s.byHour[9]).toBe(2); // 11-09 09:30 KST, 11-05 09:00 KST
    expect(s.byHour[23]).toBe(1);
    expect(s.byHour[0]).toBe(1);
    expect(s.byHour.reduce((a, b) => a + b, 0)).toBe(4);
    expect(s.byDay.map((d) => d.date)).toEqual(["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"]);
    expect(s.byDay.map((d) => d.count)).toEqual([0, 0, 1, 0, 0, 1, 2]);
    expect(s.byDay[6].noResult).toBe(2);
  });

  it("상담이 없으면 비율은 null", () => {
    const e = computeAgentStats([], NOW, 7);
    expect(e.count).toBe(0);
    expect(e.noResultRate).toBeNull();
    expect(e.lastAt).toBeNull();
  });
});

describe("시간 표시", () => {
  it("한국 시간 같은 날", () => {
    expect(sameKstDay(at("2026-11-08T15:00:00Z"), NOW)).toBe(true);
    expect(sameKstDay(at("2026-11-08T14:59:59Z"), NOW)).toBe(false);
  });
  it("방금·분·시간·어제·일", () => {
    expect(ago(at("2026-11-09T00:59:30Z"), NOW)).toBe("방금");
    expect(ago(at("2026-11-09T00:57:00Z"), NOW)).toBe("3분 전");
    expect(ago(at("2026-11-08T23:00:00Z"), NOW)).toBe("2시간 전");
    expect(ago(at("2026-11-08T00:00:00Z"), NOW)).toBe("어제");
    expect(ago(at("2026-11-05T00:00:00Z"), NOW)).toBe("4일 전");
    expect(ago(null, NOW)).toBe("");
  });
});
