/**
 * 시민 AI 상담 실시간 집계 — agentInsights(모든 상담 턴의 익명 기록)를 구 단위로 센다.
 * 화면과 리포트가 같은 함수를 쓰도록 순수 함수로 둔다.
 *
 * 지표 정의
 *  - 시간 외 돌봄 문의: AI 시설 검색에 시민이 넣은 시간이 야간(19시 이후)·주말·방학이거나, 평일 낮 없이
 *    이른 아침·방과후만 요청한 상담. 시민 앱은 요청 시간이 걸치는 시간대를 모두 기록하므로(08~18시 → 이른 아침·주간·방과후)
 *    낮을 포함한 종일 보육 요청은 세지 않는다. 질문 낱말로 붙는 '운영 시간' 주제는 "몇 시간" 같은 말에도 붙어 쓰지 않는다.
 *  - 시설 검색 결과 없음: AI가 시설 검색을 실제로 실행한 상담(검색 결과 수가 기록된 상담)만 분모로 쓴다.
 *    검색과 무관한 상담(서류·비용 등)을 분모에 넣으면 비율이 0%로 눌려 의미가 없어진다.
 */
import type { CareTargetId, TimeSlotId } from "@/types";

/** 시민 앱 lib/server/agentLog.ts 의 TOPICS 와 같은 코드·이름 (시민 앱이 새로 쓰는 코드도 이름을 붙여 둔다) */
export const AGENT_TOPICS: Record<string, string> = {
  facility_search: "시설 찾기",
  vacancy: "빈자리·대기",
  apply_process: "신청 방법",
  documents: "필요 서류",
  priority: "입소 우선순위",
  hours: "운영 시간",
  cost: "비용·지원",
  alert: "빈자리 알림",
  reviews: "시설 후기",
  other: "기타",
};

/** 평일 주간(09~17시) 밖 시간대 */
export const OFF_HOUR_SLOTS: TimeSlotId[] = ["early_morning", "after_school", "night", "weekend", "vacation"];
/** 이 시간대를 요청했으면 낮을 함께 요청했더라도 시간 외 돌봄 */
const CLEAR_OFF: TimeSlotId[] = ["night", "weekend", "vacation"];

/** agentInsights 한 건 (대화 원문 없음) */
export interface AgentInsight {
  id: string;
  sigunguCode: string;
  emdCode: string | null;
  timeSlots: TimeSlotId[];
  target: CareTargetId | null;
  topics: string[];
  /** 시설 검색으로 찾은 시설 수. 검색을 하지 않은 상담은 null */
  facilityMatches: number | null;
  /** 시설 검색을 했는데 0곳 */
  noResult: boolean;
  createdAt: Date | null;
}

/** 시간 외 돌봄 문의인가 — 야간·주말·방학 요청, 또는 낮 없이 이른 아침·방과후만 요청 */
export function isOffHours(r: Pick<AgentInsight, "timeSlots">): boolean {
  const slots = r.timeSlots;
  if (slots.some((s) => CLEAR_OFF.includes(s))) return true;
  return slots.length > 0 && !slots.includes("daytime") && slots.some((s) => OFF_HOUR_SLOTS.includes(s));
}

/** 시간 외 돌봄 문의가 요청한 시간 외 시간대들 (낮과 함께 걸친 이른 아침·방과후는 빼고 셈) */
export function offHourSlotsOf(r: Pick<AgentInsight, "timeSlots">): TimeSlotId[] {
  if (!isOffHours(r)) return [];
  const slots = [...new Set(r.timeSlots)];
  return slots.includes("daytime") ? slots.filter((s) => CLEAR_OFF.includes(s)) : slots.filter((s) => OFF_HOUR_SLOTS.includes(s));
}

/** 장소(동·구)별 공통 집계 */
export interface PlaceCount {
  count: number;
  /** 시간 외 돌봄 문의 */
  offHours: number;
  /** 시설 검색을 실행한 상담 */
  searches: number;
  /** 그중 결과 0곳 */
  noResult: number;
}

export interface DongCount extends PlaceCount {
  emdCode: string;
  /** 그 동에서 가장 많이 물은 주제 이름 */
  topTopic: string | null;
}

export interface SigunguCount extends PlaceCount {
  sigunguCode: string;
}

export interface AgentLiveStats extends PlaceCount {
  /** 집계 기간(일) */
  days: number;
  today: number;
  /** 시간 외 돌봄 문의 비율 (상담 0건이면 null) */
  offHoursRate: number | null;
  /** 시간 외 돌봄 문의를 시간대별로 (같은 상담이 여러 시간대를 요청할 수 있음) */
  offHoursBySlot: Partial<Record<TimeSlotId, number>>;
  /** 시설 검색 중 결과 없음 비율 (검색 0건이면 null) */
  noResultRate: number | null;
  /** 시설 검색 1건당 찾은 시설 수 평균 (검색 0건이면 null) */
  avgMatches: number | null;
  topics: { id: string; label: string; count: number }[];
  /** 상담이 많은 동 (많은 순) */
  dongs: DongCount[];
  /** 상담이 많은 구 (많은 순, 서울 전체 보기용) */
  sigungus: SigunguCount[];
  /** 한국 시간 0~23시별 상담 수 */
  byHour: number[];
  /** 날짜별 상담 수 (오래된 날 → 오늘, 길이 = days) */
  byDay: { date: string; count: number; offHours: number }[];
  bySlot: Partial<Record<TimeSlotId, number>>;
  byTarget: Partial<Record<CareTargetId, number>>;
  lastAt: Date | null;
}

const KST_OFFSET = 9 * 3600_000;
const kstDayIndex = (d: Date) => Math.floor((d.getTime() + KST_OFFSET) / 86_400_000);
const kstDate = (idx: number) => new Date(idx * 86_400_000).toISOString().slice(0, 10);
/** 한국 시간 기준 같은 날인가 */
export function sameKstDay(a: Date, b: Date): boolean {
  return kstDayIndex(a) === kstDayIndex(b);
}

const emptyPlace = (): PlaceCount => ({ count: 0, offHours: 0, searches: 0, noResult: 0 });
function addTo(p: PlaceCount, r: AgentInsight, off: boolean) {
  p.count++;
  if (off) p.offHours++;
  if (r.facilityMatches != null) {
    p.searches++;
    if (r.facilityMatches === 0) p.noResult++;
  }
}

export function computeAgentStats(rows: AgentInsight[], now: Date, days: number): AgentLiveStats {
  const since = now.getTime() - days * 86_400_000;
  const inRange = rows.filter((r) => r.createdAt && r.createdAt.getTime() >= since && r.createdAt.getTime() <= now.getTime());
  const total = emptyPlace();
  const topics = new Map<string, number>();
  const dongs = new Map<string, DongCount & { topicCount: Map<string, number> }>();
  const sigungus = new Map<string, SigunguCount>();
  const byHour = Array.from({ length: 24 }, () => 0);
  const today = kstDayIndex(now);
  const byDay = Array.from({ length: days }, (_, i) => ({ date: kstDate(today - days + 1 + i), count: 0, offHours: 0 }));
  const bySlot: Partial<Record<TimeSlotId, number>> = {};
  const byTarget: Partial<Record<CareTargetId, number>> = {};
  const offHoursBySlot: Partial<Record<TimeSlotId, number>> = {};
  let matchSum = 0;
  let todayCount = 0;
  let lastAt: Date | null = null;
  for (const r of inRange) {
    const off = isOffHours(r);
    addTo(total, r, off);
    if (r.facilityMatches != null) matchSum += r.facilityMatches;
    const slots = new Set(r.timeSlots);
    for (const s of slots) bySlot[s] = (bySlot[s] ?? 0) + 1;
    for (const s of offHourSlotsOf(r)) offHoursBySlot[s] = (offHoursBySlot[s] ?? 0) + 1;

    const day = kstDayIndex(r.createdAt!);
    if (day === today) todayCount++;
    const d0 = byDay[day - (today - days + 1)];
    if (d0) {
      d0.count++;
      if (off) d0.offHours++;
    }
    byHour[new Date(r.createdAt!.getTime() + KST_OFFSET).getUTCHours()]++;
    if (!lastAt || r.createdAt! > lastAt) lastAt = r.createdAt;
    for (const t of new Set(r.topics)) topics.set(t, (topics.get(t) ?? 0) + 1);
    if (r.target) byTarget[r.target] = (byTarget[r.target] ?? 0) + 1;

    const g = sigungus.get(r.sigunguCode) ?? { sigunguCode: r.sigunguCode, ...emptyPlace() };
    addTo(g, r, off);
    sigungus.set(r.sigunguCode, g);
    if (r.emdCode) {
      const d = dongs.get(r.emdCode) ?? { emdCode: r.emdCode, ...emptyPlace(), topTopic: null, topicCount: new Map() };
      addTo(d, r, off);
      for (const t of new Set(r.topics)) d.topicCount.set(t, (d.topicCount.get(t) ?? 0) + 1);
      dongs.set(r.emdCode, d);
    }
  }
  const byCount = (a: PlaceCount, b: PlaceCount) => b.count - a.count || b.offHours - a.offHours;
  return {
    days,
    ...total,
    today: todayCount,
    offHoursRate: total.count ? total.offHours / total.count : null,
    offHoursBySlot,
    noResultRate: total.searches ? total.noResult / total.searches : null,
    avgMatches: total.searches ? matchSum / total.searches : null,
    topics: [...topics]
      .map(([id, count]) => ({ id, label: AGENT_TOPICS[id] ?? id, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    dongs: [...dongs.values()]
      .map(({ topicCount, ...d }) => {
        const top = [...topicCount].sort((a, b) => b[1] - a[1])[0];
        return { ...d, topTopic: top ? (AGENT_TOPICS[top[0]] ?? top[0]) : null };
      })
      .sort(byCount),
    sigungus: [...sigungus.values()].sort(byCount),
    byHour,
    byDay,
    bySlot,
    byTarget,
    lastAt,
  };
}

/** "방금", "3분 전", "2시간 전", "어제" … */
export function ago(d: Date | null, now: Date): string {
  if (!d) return "";
  const m = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const days = Math.floor(h / 24);
  return days === 1 ? "어제" : `${days}일 전`;
}


// --- 검은 칸: 지금 가장 많이 모인 어려움 ---
//
// 비율(%)로 고르면 "3건 중 3건 = 100%" 같은 작은 표본이 맨 위로 튄다. 그래서 건수로 고른다:
// "같은 동에서 같은 어려움이 몇 건 모였나". 화면에는 퍼센트 없이 건수와 쉬운 문장만 쓴다.

/** 같은 동(구)에서 같은 어려움이 이만큼 모여야 검은 칸에 띄운다 */
export const CONCERN_MIN = 2;

export type ConcernKind = "notFound" | "offHours";

export interface AgentConcern {
  kind: ConcernKind;
  /** 동(서울 전체 보기에서는 구) 코드와 이름 */
  placeId: string;
  placeName: string;
  isDong: boolean;
  /** 이 어려움을 겪은 상담 수 */
  count: number;
  /** 비교 대상 수: 시설 못 찾음이면 그 곳의 시설 검색 수, 시간 외 문의면 그 곳의 전체 상담 수 */
  of: number;
  /** 한 줄 제목: "흑석동 · 저녁·주말 돌봄 문의" */
  headline: string;
  /** 쉬운 설명 문장 */
  sentence: string;
}

const KIND_LABEL: Record<ConcernKind, string> = {
  notFound: "맞는 어린이집을 못 찾음",
  offHours: "저녁·주말 등 시간 외 돌봄 문의",
};

/**
 * 같은 동(구)에서 가장 많이 모인 어려움을 건수 순으로 돌려준다.
 * 같은 건수면 '맞는 어린이집을 못 찾음'(부모가 갈 곳이 없었던 경우)을 먼저, 그다음 상담이 많은 곳을 먼저.
 */
export function rankConcerns(
  s: AgentLiveStats,
  opts: { allSeoul: boolean; placeName: (id: string) => string; periodLabel: string },
): AgentConcern[] {
  const places: (PlaceCount & { id: string; isDong: boolean })[] = opts.allSeoul
    ? s.sigungus.map((g) => ({ ...g, id: g.sigunguCode, isDong: false }))
    : s.dongs.map((d) => ({ ...d, id: d.emdCode, isDong: true }));
  const out: AgentConcern[] = [];
  for (const p of places) {
    const name = opts.placeName(p.id);
    if (p.noResult >= CONCERN_MIN)
      out.push({
        kind: "notFound",
        placeId: p.id,
        placeName: name,
        isDong: p.isDong,
        count: p.noResult,
        of: p.searches,
        headline: `${name} · ${KIND_LABEL.notFound}`,
        sentence: `${opts.periodLabel} ${name}에서 AI가 어린이집을 찾아 준 상담 ${p.searches}건 중 ${p.noResult}건은 조건에 맞는 곳이 한 곳도 없었습니다.`,
      });
    if (p.offHours >= CONCERN_MIN)
      out.push({
        kind: "offHours",
        placeId: p.id,
        placeName: name,
        isDong: p.isDong,
        count: p.offHours,
        of: p.count,
        headline: `${name} · ${KIND_LABEL.offHours}`,
        sentence: `${opts.periodLabel} ${name} 상담 ${p.count}건 중 ${p.offHours}건이 평일 낮(9~17시)이 아닌 시간에 아이를 맡길 곳이나 운영 시간을 물었습니다.`,
      });
  }
  const kindOrder: Record<ConcernKind, number> = { notFound: 0, offHours: 1 };
  return out.sort((a, b) => b.count - a.count || kindOrder[a.kind] - kindOrder[b.kind] || b.of - a.of);
}
