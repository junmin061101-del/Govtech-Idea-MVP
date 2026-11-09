"use client";

/**
 * AI 상담 → 구청 대시보드 (시민 앱 Govtech-Consumer-Application-MVP 의 서버가 쓴다. 대시보드는 읽기만)
 *  - agentSummaries/{sigungu_code}: 최근 30일 익명 집계(동·시간대·대상·주제별)와 Gemini 요약. 매일 05시 갱신
 *  - agentLogs/{id}: 대화 내용 수집에 동의한 시민의 질문·답변 (개인정보 자동 가림, 90일 보관)
 *  - agentInsights/{id}: 모든 상담 한 건마다 익명 기록 (행정동·시간대·대상·주제·결과, 원문 없음)
 * Firestore 규칙: 자기 구만 읽기 (careos_admin 은 전체)
 *
 * 실시간: subscribe* 는 onSnapshot 리스너라 시민 앱에서 상담이 끝나 기록이 쓰이면 몇 초 안에 화면에 들어온다.
 */
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";
import type { AgentInsight } from "@/lib/agentStats";
import { firebase } from "@/lib/firebase/client";
import type { CareTargetId, TimeSlotId } from "@/types";

export interface AgentStat {
  count: number;
  noResult: number;
  topics: Record<string, number>;
  bySlot: Partial<Record<TimeSlotId, number>>;
  byTarget: Partial<Record<CareTargetId, number>>;
}

export interface AgentSummary {
  sigunguCode: string;
  periodDays: number;
  generatedAt: Date | null;
  total: AgentStat;
  byDong: Record<string, AgentStat>;
  /** 구 전체 요약 (표본이 적으면 null) */
  summary: string | null;
  /** 표본이 충분한 동만 */
  dongSummaries: Record<string, string>;
  summaryMin: number;
  topicLabels: Record<string, string>;
}

export interface AgentLog {
  id: string;
  emdCode: string | null;
  timeSlots: TimeSlotId[];
  target: CareTargetId | null;
  topics: string[];
  noResult: boolean;
  question: string;
  answer: string;
  createdAt: Date | null;
}

const toDate = (v: unknown) => (v && typeof (v as Timestamp).toDate === "function" ? (v as Timestamp).toDate() : null);

function toSummary(d: DocumentData): AgentSummary {
  return {
    sigunguCode: d.sigunguCode,
    periodDays: d.periodDays ?? 30,
    generatedAt: toDate(d.generatedAt),
    total: d.total,
    byDong: d.byDong ?? {},
    summary: d.summary ?? null,
    dongSummaries: d.dongSummaries ?? {},
    summaryMin: d.summaryMin ?? 5,
    topicLabels: d.topicLabels ?? {},
  };
}

function toInsight(id: string, d: DocumentData): AgentInsight {
  return {
    id,
    emdCode: d.emdCode ?? null,
    timeSlots: d.timeSlots ?? [],
    target: d.target ?? null,
    topics: d.topics ?? [],
    noResult: Boolean(d.outcome?.noResult),
    createdAt: toDate(d.createdAt),
  };
}

function toLog(id: string, d: DocumentData): AgentLog {
  return { ...toInsight(id, d), question: d.question ?? "", answer: d.answer ?? "" };
}

type Unsub = () => void;
const noop: Unsub = () => {};

/** 구 요약 문서 실시간 (매일 05시 갱신되면 바로 바뀐다) */
export function subscribeAgentSummary(sgg: string, onData: (s: AgentSummary | null) => void, onError: (e: Error) => void): Unsub {
  const fb = firebase();
  if (!fb) return noop;
  return onSnapshot(doc(fb.db, "agentSummaries", sgg), (snap) => onData(snap.exists() ? toSummary(snap.data()) : null), onError);
}

/** 구 전체 최근 대화 실시간 (수집 동의분). addedIds: 첫 스냅샷 이후 새로 들어온 대화 */
export function subscribeAgentLogs(
  sgg: string,
  max: number,
  onData: (logs: AgentLog[], addedIds: string[]) => void,
  onError: (e: Error) => void,
): Unsub {
  const fb = firebase();
  if (!fb) return noop;
  const q = query(collection(fb.db, "agentLogs"), where("sigunguCode", "==", sgg), orderBy("createdAt", "desc"), limit(max));
  let first = true;
  return onSnapshot(
    q,
    (snap) => {
      const added = first ? [] : snap.docChanges().filter((c) => c.type === "added").map((c) => c.doc.id);
      first = false;
      onData(snap.docs.map((s) => toLog(s.id, s.data())), added);
    },
    onError,
  );
}

/** 구 전체 익명 상담 기록 실시간 (최근 sinceDays일, 최대 max건) — 숫자 집계용 */
export function subscribeAgentInsights(
  sgg: string,
  sinceDays: number,
  max: number,
  onData: (rows: AgentInsight[]) => void,
  onError: (e: Error) => void,
): Unsub {
  const fb = firebase();
  if (!fb) return noop;
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const q = query(
    collection(fb.db, "agentInsights"),
    where("sigunguCode", "==", sgg),
    where("createdAt", ">=", since),
    orderBy("createdAt", "desc"),
    limit(max),
  );
  return onSnapshot(q, (snap) => onData(snap.docs.map((s) => toInsight(s.id, s.data()))), onError);
}
