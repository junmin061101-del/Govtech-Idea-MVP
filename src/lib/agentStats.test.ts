import { describe, expect, it } from "vitest";
import { ago, computeAgentStats, isOffHours, sameKstDay, type AgentInsight } from "./agentStats";

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
  facilityMatches: null,
  noResult: false,
  createdAt: NOW,
  ...p,
});
const searched = (matches: number) => ({ facilityMatches: matches, noResult: matches === 0 });

describe("isOffHours — 시간 공백 문의", () => {
  it("주간 밖 시간대를 말했거나 운영 시간을 물으면 해당", () => {
    expect(isOffHours({ timeSlots: ["night"], topics: [] })).toBe(true);
    expect(isOffHours({ timeSlots: ["weekend"], topics: [] })).toBe(true);
    expect(isOffHours({ timeSlots: [], topics: ["hours"] })).toBe(true);
  });
  it("주간만 말했거나 시간 언급이 없으면 아님", () => {
    expect(isOffHours({ timeSlots: ["daytime"], topics: ["vacancy"] })).toBe(false);
    expect(isOffHours({ timeSlots: [], topics: ["documents"] })).toBe(false);
  });
});

describe("computeAgentStats — 구 단위 실시간 집계", () => {
  const rows = [
    // 오늘 09:30 KST, 야간 검색했지만 0곳
    row({ topics: ["vacancy", "facility_search"], timeSlots: ["night"], ...searched(0), createdAt: at("2026-11-09T00:30:00Z") }),
    // 11-08 23:59 KST, 야간 검색 3곳
    row({ topics: ["vacancy"], timeSlots: ["night", "night"], ...searched(3), createdAt: at("2026-11-08T14:59:00Z") }),
    // 11-09 00:00 KST, 다른 동, 운영 시간 질문(시간대 특정 없음), 검색 안 함
    row({ emdCode: "1159052000", topics: ["hours", "cost"], target: "lower_elementary", createdAt: at("2026-11-08T15:00:00Z") }),
    // 11-05 09:00 KST, 관악구, 주간 검색 6곳
    row({ sigunguCode: "11620", emdCode: null, topics: ["facility_search"], timeSlots: ["daytime"], target: null, ...searched(6), createdAt: at("2026-11-05T00:00:00Z") }),
    row({ topics: ["vacancy"], createdAt: at("2026-10-01T00:00:00Z") }), // 기간 밖
    row({ topics: ["vacancy"], createdAt: null }), // 시각 없음 → 제외
  ];
  const s = computeAgentStats(rows, NOW, 7);

  it("기간 안 건수·오늘(한국 시간 자정 기준)", () => {
    expect(s.count).toBe(4);
    expect(s.today).toBe(2);
    expect(s.lastAt).toEqual(at("2026-11-09T00:30:00Z"));
  });

  it("시간 공백 문의: 분모는 전체 상담, 시간대별 내역과 운영 시간 질문을 나눠 셈", () => {
    expect(s.offHours).toBe(3);
    expect(s.offHoursRate).toBe(0.75);
    expect(s.offHoursBySlot).toEqual({ night: 2 });
    expect(s.hoursQuestions).toBe(1);
  });

  it("시설 검색 결과 없음: 검색을 실행한 상담만 분모 (검색 안 한 상담은 빠짐)", () => {
    expect(s.searches).toBe(3);
    expect(s.noResult).toBe(1);
    expect(s.noResultRate).toBeCloseTo(1 / 3, 9);
    expect(s.avgMatches).toBe(3); // (0 + 3 + 6) / 3
  });

  it("검색이 한 번도 없으면 결과 없음 비율·평균은 null (0%로 보이지 않게)", () => {
    const e = computeAgentStats([row({ topics: ["documents"] })], NOW, 7);
    expect(e.count).toBe(1);
    expect(e.searches).toBe(0);
    expect(e.noResultRate).toBeNull();
    expect(e.avgMatches).toBeNull();
  });

  it("주제는 많은 순, 한 상담에서 같은 주제·시간대는 한 번만 센다", () => {
    expect(s.topics.map((t) => [t.label, t.count])).toEqual([
      ["빈자리·대기", 2],
      ["시설 찾기", 2],
      ["비용·지원", 1],
      ["운영 시간", 1],
    ]);
    expect(s.bySlot).toEqual({ night: 2, daytime: 1 });
    expect(s.byTarget).toEqual({ infant: 2, lower_elementary: 1 });
  });

  it("동 순위는 상담 많은 순, 동마다 시간 공백·검색·결과 없음", () => {
    expect(s.dongs).toEqual([
      { emdCode: "1159051000", count: 2, offHours: 2, searches: 2, noResult: 1, topTopic: "빈자리·대기" },
      { emdCode: "1159052000", count: 1, offHours: 1, searches: 0, noResult: 0, topTopic: "운영 시간" },
    ]);
  });

  it("구별 합계 (서울 전체 보기)", () => {
    expect(s.sigungus).toEqual([
      { sigunguCode: "11590", count: 3, offHours: 3, searches: 2, noResult: 1 },
      { sigunguCode: "11620", count: 1, offHours: 0, searches: 1, noResult: 0 },
    ]);
  });

  it("한국 시간 시각별·날짜별 분포", () => {
    expect(s.byHour[9]).toBe(2); // 11-09 09:30, 11-05 09:00
    expect(s.byHour[23]).toBe(1);
    expect(s.byHour[0]).toBe(1);
    expect(s.byDay.map((d) => d.date)).toEqual(["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"]);
    expect(s.byDay.map((d) => d.count)).toEqual([0, 0, 1, 0, 0, 1, 2]);
    expect(s.byDay.map((d) => d.offHours)).toEqual([0, 0, 0, 0, 0, 1, 2]);
  });

  it("상담이 없으면 비율은 null", () => {
    const e = computeAgentStats([], NOW, 7);
    expect(e.count).toBe(0);
    expect(e.offHoursRate).toBeNull();
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
