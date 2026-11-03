"use client";

/**
 * 판단 이력 저장소 — 로그인(역할 있음)이면 Firestore decisions, 아니면 이 브라우저(시연 모드).
 * Firestore 규칙: 자기 구만 읽기, 구 관리자만 저장·삭제, 저장 후 수정 불가 (firestore.rules)
 */
import { addDoc, collection, deleteDoc, doc, getDocs, limit, orderBy, query, serverTimestamp, where, type Timestamp } from "firebase/firestore";
import { firebase } from "@/lib/firebase/client";
import { canWriteDistrict, usesServer, type AuthState } from "@/lib/firebase/AuthProvider";
import { deleteDecision, loadHistory, mergeImported, replaceHistory, saveDecision, type DecisionRecord } from "@/lib/history";

export interface DecisionStore {
  mode: "server" | "local";
  list(): Promise<DecisionRecord[]>;
  save(r: DecisionRecord): Promise<void>;
  remove(id: string): Promise<void>;
  importJson(text: string): Promise<number>;
}

const local: DecisionStore = {
  mode: "local",
  list: async () => loadHistory(),
  save: async (r) => {
    if (!saveDecision(r)) throw new Error("이 브라우저에서는 저장할 수 없습니다.");
  },
  remove: async (id) => {
    deleteDecision(id);
  },
  importJson: async (text) => {
    const before = loadHistory();
    const merged = mergeImported(before, text);
    if (!replaceHistory(merged)) throw new Error("저장할 수 없습니다.");
    return merged.length - before.length;
  },
};

export function decisionStore(auth: AuthState): DecisionStore {
  const fb = firebase();
  if (!fb || !usesServer(auth)) return local;
  const col = collection(fb.db, "decisions");
  const write = async (r: DecisionRecord) => {
    if (!canWriteDistrict(auth, r.view.sigunguCode)) throw new Error("이 구에 판단을 저장할 권한이 없습니다 (구 관리자만 저장).");
    await addDoc(col, {
      sigunguCode: r.view.sigunguCode,
      authorUid: auth.user!.uid,
      author: r.author,
      memo: r.memo,
      createdAt: serverTimestamp(),
      view: r.view,
      summary: r.summary,
    });
  };
  return {
    mode: "server",
    async list() {
      const q =
        auth.role === "careos_admin"
          ? query(col, orderBy("createdAt", "desc"), limit(200))
          : query(col, where("sigunguCode", "==", auth.sigunguCode), orderBy("createdAt", "desc"), limit(200));
      const snap = await getDocs(q);
      return snap.docs.map((d) => {
        const x = d.data();
        return {
          id: d.id,
          createdAt: ((x.createdAt as Timestamp | null)?.toDate() ?? new Date()).toISOString(),
          author: x.author,
          memo: x.memo,
          view: x.view,
          summary: x.summary,
        } as DecisionRecord;
      });
    },
    save: write,
    async remove(id) {
      await deleteDoc(doc(col, id));
    },
    async importJson(text) {
      // 형식 검증은 브라우저 저장과 같은 규칙. 서버에는 새 기록으로 쓴다(저장 시각은 서버 시각, 원래 시각은 요약에 남김)
      const records = mergeImported([], text);
      for (const r of records) await write({ ...r, summary: { ...r.summary, importedCreatedAt: r.createdAt } as DecisionRecord["summary"] });
      return records.length;
    },
  };
}
