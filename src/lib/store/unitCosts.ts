"use client";

/** 단가 저장소 — 로그인이면 Firestore unitCosts/{구 코드}, 아니면 이 브라우저 */
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebase } from "@/lib/firebase/client";
import { canReadDistrict, canWriteDistrict, usesServer, type AuthState } from "@/lib/firebase/AuthProvider";
import { DEFAULT_UNIT_COSTS, loadUnitCosts, saveUnitCosts, type UnitCost } from "@/lib/config/unitCosts";

export async function loadCosts(auth: AuthState, sgg: string): Promise<UnitCost[]> {
  const fb = firebase();
  if (!fb || !usesServer(auth) || !canReadDistrict(auth, sgg)) return loadUnitCosts();
  const snap = await getDoc(doc(fb.db, "unitCosts", sgg));
  const items = (snap.exists() ? snap.data().items : {}) as Record<string, Partial<UnitCost>>;
  return DEFAULT_UNIT_COSTS.map((c) => ({ ...c, ...(items[c.id] ?? {}) }));
}

export async function saveCosts(auth: AuthState, sgg: string, costs: UnitCost[]): Promise<"server" | "local"> {
  const fb = firebase();
  if (!fb || !usesServer(auth)) {
    if (!saveUnitCosts(costs)) throw new Error("이 브라우저에서는 저장할 수 없습니다.");
    return "local";
  }
  if (!canWriteDistrict(auth, sgg)) throw new Error("이 구의 단가를 바꿀 권한이 없습니다 (구 관리자만).");
  await setDoc(doc(fb.db, "unitCosts", sgg), {
    items: Object.fromEntries(costs.map((c) => [c.id, { amount: c.amount, source: c.source, baseYear: c.baseYear }])),
    updatedBy: auth.user!.uid,
    updatedAt: serverTimestamp(),
  });
  return "server";
}
