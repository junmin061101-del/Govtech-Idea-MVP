/**
 * 시민 AI 상담 실시간 집계 — agentInsights(모든 상담 턴의 익명 기록)를 구 단위로 센다.
 * 화면과 리포트가 같은 함수를 쓰도록 순수 함수로 둔다.
 */
import type { CareTargetId, TimeSlotId } from "@/types";

/** 시민 앱 lib/server/agentLog.ts 의 TOPICS 와 같은 코드·이름 */
export const AGENT_TOPICS: Record<string, string> = {
  facility_search: "시설 찾기",
  vacancy: "빈자리·대기",
  apply_process: "신청 방법",
  documents: "필요 서류",
  priority: "입소 우선순위",
  hours: "운영 시간",
  cost: "비용·지원",
  alert: "빈자리 알림",
  other: "기타",
};

/** agentInsights 한 건 (대화 원문 없음) */
export interface AgentInsight {
  id: string;
  sigunguCode: string;
  emdCode: string | null;
  timeSlots: TimeSlotId[];
  target: CareTargetId | null;
  topics: string[];
  noResult: boolean;
  createdAt: Date | null;
}

export interface DongCount {
  emdCode: string;
  count: number;
  noResult: number;
  /** 그 동에서 가장 많이 물은 주제 이름 */
  topTopic: string | null;
}

export interface SigunguCount {
  sigunguCode: string;
  count: number;
  noResult: number;
}

export interface AgentLiveStats {
  /** 집계 기간(일) */
  days: number;
  count: number;
  today: number;
  noResult: number;
  /** 시설 못 찾음 비율 (상담 0건이면 null) */
  noResultRate: number | null;
  topics: { id: string; label: string; count: number }[];
  /** 상담이 많은 동 (많은 순) */
  dongs: DongCount[];
  /** 상담이 많은 구 (많은 순, 서울 전체 보기용) */
  sigungus: SigunguCount[];
  /** 한국 시간 0~23시별 상담 수 */
  byHour: number[];
  /** 날짜별 상담 수 (오래된 날 → 오늘, 길이 = days) */
  byDay: { date: string; count: number; noResult: number }[];
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

export function computeAgentStats(rows: AgentInsight[], now: Date, days: number): AgentLiveStats {
  const since = now.getTime() - days * 86_400_000;
  const inRange = rows.filter((r) => r.createdAt && r.createdAt.getTime() >= since && r.createdAt.getTime() <= now.getTime());
  const topics = new Map<string, number>();
  const dongs = new Map<string, DongCount & { topicCount: Map<string, number> }>();
  const sigungus = new Map<string, SigunguCount>();
  const byHour = Array.from({ length: 24 }, () => 0);
  const today = kstDayIndex(now);
  const byDay = Array.from({ length: days }, (_, i) => ({ date: kstDate(today - days + 1 + i), count: 0, noResult: 0 }));
  const bySlot: Partial<Record<TimeSlotId, number>> = {};
  const byTarget: Partial<Record<CareTargetId, number>> = {};
  let noResult = 0;
  let todayCount = 0;
  let lastAt: Date | null = null;
  for (const r of inRange) {
    if (r.noResult) noResult++;
    const day = kstDayIndex(r.createdAt!);
    if (day === today) todayCount++;
    const slot = byDay[day - (today - days + 1)];
    if (slot) {
      slot.count++;
      if (r.noResult) slot.noResult++;
    }
    byHour[new Date(r.createdAt!.getTime() + KST_OFFSET).getUTCHours()]++;
    const g = sigungus.get(r.sigunguCode) ?? { sigunguCode: r.sigunguCode, count: 0, noResult: 0 };
    g.count++;
    if (r.noResult) g.noResult++;
    sigungus.set(r.sigunguCode, g);
    if (!lastAt || r.createdAt! > lastAt) lastAt = r.createdAt;
    for (const t of new Set(r.topics)) topics.set(t, (topics.get(t) ?? 0) + 1);
    for (const s of new Set(r.timeSlots)) bySlot[s] = (bySlot[s] ?? 0) + 1;
    if (r.target) byTarget[r.target] = (byTarget[r.target] ?? 0) + 1;
    if (r.emdCode) {
      const d = dongs.get(r.emdCode) ?? { emdCode: r.emdCode, count: 0, noResult: 0, topTopic: null, topicCount: new Map() };
      d.count++;
      if (r.noResult) d.noResult++;
      for (const t of new Set(r.topics)) d.topicCount.set(t, (d.topicCount.get(t) ?? 0) + 1);
      dongs.set(r.emdCode, d);
    }
  }
  return {
    days,
    count: inRange.length,
    today: todayCount,
    noResult,
    noResultRate: inRange.length ? noResult / inRange.length : null,
    topics: [...topics]
      .map(([id, count]) => ({ id, label: AGENT_TOPICS[id] ?? id, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    dongs: [...dongs.values()]
      .map(({ topicCount, ...d }) => {
        const top = [...topicCount].sort((a, b) => b[1] - a[1])[0];
        return { ...d, topTopic: top ? (AGENT_TOPICS[top[0]] ?? top[0]) : null };
      })
      .sort((a, b) => b.count - a.count || b.noResult - a.noResult),
    sigungus: [...sigungus.values()].sort((a, b) => b.count - a.count || b.noResult - a.noResult),
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
