"use client";

/**
 * AI 상담 → 구청 대시보드 (시민 앱 Govtech-Consumer-Application-MVP 의 서버가 쓴다. 대시보드는 읽기만)
 *  - agentSummaries/{sigungu_code}: 최근 30일 익명 집계(동·시간대·대상·주제별)와 Gemini 요약. 매일 05시 갱신
 *  - agentLogs/{id}: 대화 내용 수집에 동의한 시민의 질문·답변 (개인정보 자동 가림, 90일 보관)
 * Firestore 규칙: 자기 구만 읽기 (careos_admin 은 전체)
 */
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where, type Timestamp } from "firebase/firestore";
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

export async function loadAgentSummary(sgg: string): Promise<AgentSummary | null> {
  const fb = firebase();
  if (!fb) return null;
  const snap = await getDoc(doc(fb.db, "agentSummaries", sgg));
  if (!snap.exists()) return null;
  const d = snap.data();
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

/** 최근 대화 (동을 고르면 그 동만). 시간대·대상은 화면에서 거른다 */
export async function loadAgentLogs(sgg: string, emdCode: string | null, max = 30): Promise<AgentLog[]> {
  const fb = firebase();
  if (!fb) return [];
  const col = collection(fb.db, "agentLogs");
  const q = emdCode
    ? query(col, where("sigunguCode", "==", sgg), where("emdCode", "==", emdCode), orderBy("createdAt", "desc"), limit(max))
    : query(col, where("sigunguCode", "==", sgg), orderBy("createdAt", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((s) => {
    const d = s.data();
    return {
      id: s.id,
      emdCode: d.emdCode ?? null,
      timeSlots: d.timeSlots ?? [],
      target: d.target ?? null,
      topics: d.topics ?? [],
      noResult: Boolean(d.outcome?.noResult),
      question: d.question ?? "",
      answer: d.answer ?? "",
      createdAt: toDate(d.createdAt),
    };
  });
}
