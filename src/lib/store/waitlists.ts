"use client";

/** 입소 대기 집계 저장소 — 구 관리자만, 집계(행정동 × 0~5세 인원)만 Firestore waitlists/{구}_{연월}에 저장 */
import { collection, doc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { firebase } from "@/lib/firebase/client";
import { canReadDistrict, canWriteDistrict, usesServer, type AuthState } from "@/lib/firebase/AuthProvider";

export interface SavedWaitlist {
  month: string;
  byDong: Map<string, number[]>;
  total: number;
}

export async function saveWaitlist(auth: AuthState, sgg: string, month: string, byDong: Map<string, number[]>, total: number) {
  const fb = firebase();
  if (!fb || !usesServer(auth) || !canWriteDistrict(auth, sgg)) throw new Error("입소 대기 집계는 그 구 관리자만 저장할 수 있습니다.");
  await setDoc(doc(fb.db, "waitlists", `${sgg}_${month}`), {
    sigunguCode: sgg,
    month,
    byDong: Object.fromEntries(byDong),
    total,
    uploadedBy: auth.user!.uid,
    uploadedAt: serverTimestamp(),
  });
}

export async function loadLatestWaitlist(auth: AuthState, sgg: string): Promise<SavedWaitlist | null> {
  const fb = firebase();
  if (!fb || !usesServer(auth) || !canReadDistrict(auth, sgg)) return null;
  const snap = await getDocs(query(collection(fb.db, "waitlists"), where("sigunguCode", "==", sgg), orderBy("month", "desc"), limit(1)));
  if (snap.empty) return null;
  const x = snap.docs[0].data();
  return { month: x.month, byDong: new Map(Object.entries(x.byDong as Record<string, number[]>)), total: x.total };
}
