/**
 * 판단 이력 — 대안 조합을 작성자·날짜·메모와 함께 남겨, 담당자가 바뀌어도 같은 화면을 다시 열 수 있게 한다.
 * 지금은 브라우저 저장 + JSON 내보내기/가져오기(인수인계용).
 * TODO(Firebase 이전): Firestore decisions/{id} (sigungu_code별 권한), 작성자는 로그인 계정으로.
 */
import type { ViewState } from "@/lib/viewState";

export interface DecisionRecord {
  id: string;
  createdAt: string;
  author: string;
  memo: string;
  view: ViewState;
  /** 저장 당시 숫자 (데이터가 갱신돼도 당시 판단 근거를 남긴다) */
  summary: {
    sigunguName: string;
    dongName: string;
    slotLabel: string;
    targetLabel: string;
    gapBefore: number;
    gapAfter: number;
    alternativeTitles: string[];
    dataDate: string;
  };
}

export interface HistoryExport {
  format: "careos.decisions";
  version: 1;
  exportedAt: string;
  records: DecisionRecord[];
}

const KEY = "careos.decisions.v1";

export function loadHistory(): DecisionRecord[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as DecisionRecord[]) : [];
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

function persist(list: DecisionRecord[]): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function newId(): string {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function saveDecision(record: DecisionRecord): boolean {
  return persist([record, ...loadHistory().filter((r) => r.id !== record.id)]);
}

export function deleteDecision(id: string): boolean {
  return persist(loadHistory().filter((r) => r.id !== id));
}

export function exportHistory(records: DecisionRecord[], now = new Date()): HistoryExport {
  return { format: "careos.decisions", version: 1, exportedAt: now.toISOString(), records };
}

/** 가져오기: 형식을 확인하고, 같은 id는 가져온 쪽으로 바꾼다. 잘못된 파일이면 오류 */
export function mergeImported(current: DecisionRecord[], text: string): DecisionRecord[] {
  const data = JSON.parse(text) as Partial<HistoryExport>;
  if (data.format !== "careos.decisions" || !Array.isArray(data.records)) throw new Error("판단 이력 파일 형식이 아닙니다.");
  for (const r of data.records) {
    if (!r.id || !r.createdAt || !r.view?.sigunguCode || !r.summary) throw new Error("손상된 기록이 있습니다.");
  }
  const byId = new Map(current.map((r) => [r.id, r]));
  for (const r of data.records) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function replaceHistory(list: DecisionRecord[]): boolean {
  return persist(list);
}
