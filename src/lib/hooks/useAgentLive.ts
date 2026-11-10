"use client";

/**
 * AI 상담 실시간 구독 — 익명 기록(집계), 수집 동의 대화(피드), 매일 AI 요약을 한 번에 구독한다.
 * sgg = null 이면 서울 전체 (운영자 전용, 규칙이 다른 역할은 거부한다).
 */
import { useEffect, useMemo, useState } from "react";
import type { AgentInsight } from "@/lib/agentStats";
import { subscribeAgentInsights, subscribeAgentLogs, subscribeAgentSummary, type AgentLog, type AgentSummary } from "@/lib/store/agentLogs";

/** 실시간 집계 기간·최대 건수 */
export const INSIGHT_DAYS = 7;
export const INSIGHT_MAX = 5000;
/** 실시간 대화 최대 건수 */
export const LOG_MAX = 200;

type Stream<T> = { key: string; data: T; error: string | null } | null;

const errText = (e: Error) => (/permission|insufficient/i.test(e.message) ? "열람 권한이 없거나 규칙이 아직 배포되지 않았습니다" : e.message);

export interface AgentLive {
  insights: { data: AgentInsight[]; error: string | null } | null;
  logs: { data: AgentLog[]; error: string | null } | null;
  summary: AgentSummary | null;
  /** 화면을 연 뒤 새로 들어온 대화 */
  fresh: Set<string>;
  markSeen: (id: string) => void;
  live: boolean;
  lastAt: Date | null;
}

export function useAgentLive(enabled: boolean, sgg: string | null): AgentLive {
  const key = sgg ?? "all";
  const [insights, setInsights] = useState<Stream<AgentInsight[]>>(null);
  const [logs, setLogs] = useState<Stream<AgentLog[]>>(null);
  const [summary, setSummary] = useState<Stream<AgentSummary | null>>(null);
  const [fresh, setFresh] = useState<{ key: string; ids: Set<string> }>({ key: "", ids: new Set() });

  useEffect(() => {
    if (!enabled) return;
    const offs = [
      subscribeAgentInsights(
        sgg,
        INSIGHT_DAYS,
        INSIGHT_MAX,
        (rows) => setInsights({ key, data: rows, error: null }),
        (e) => setInsights({ key, data: [], error: errText(e) }),
      ),
      subscribeAgentLogs(
        sgg,
        LOG_MAX,
        (rows, added) => {
          setLogs({ key, data: rows, error: null });
          if (added.length) setFresh((f) => ({ key, ids: new Set([...(f.key === key ? f.ids : []), ...added]) }));
        },
        (e) => setLogs({ key, data: [], error: errText(e) }),
      ),
    ];
    // 구별 요약 문서만 있다 (서울 전체 요약은 없음)
    if (sgg) offs.push(subscribeAgentSummary(sgg, (s) => setSummary({ key, data: s, error: null }), (e) => setSummary({ key, data: null, error: errText(e) })));
    return () => offs.forEach((off) => off());
  }, [enabled, sgg, key]);

  const ins = insights?.key === key ? insights : null;
  const lg = logs?.key === key ? logs : null;
  const freshIds = useMemo(() => (fresh.key === key ? fresh.ids : new Set<string>()), [fresh, key]);
  const lastAt = useMemo(() => {
    const a = ins?.data[0]?.createdAt ?? null;
    const b = lg?.data[0]?.createdAt ?? null;
    return a && b ? (a > b ? a : b) : (a ?? b);
  }, [ins, lg]);

  return {
    insights: ins,
    logs: lg,
    summary: summary?.key === key ? summary.data : null,
    fresh: freshIds,
    markSeen: (id) => setFresh((f) => ({ key: f.key, ids: new Set([...f.ids].filter((x) => x !== id)) })),
    live: Boolean(ins && !ins.error) || Boolean(lg && !lg.error),
    lastAt,
  };
}
