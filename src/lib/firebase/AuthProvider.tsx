"use client";

/**
 * 로그인 상태와 역할(Custom Claims). 역할·구는 scripts/set-user-role.mjs로 관리자가 부여한다.
 *   careos_admin    : 전체
 *   district_admin  : 자기 구 읽기·쓰기 (판단 저장, 입소 대기 저장)
 *   district_viewer : 자기 구 읽기
 */
import { createContext, useContext, useEffect, useState } from "react";
import { onIdTokenChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { firebase, firebaseEnabled } from "@/lib/firebase/client";

export type Role = "careos_admin" | "district_admin" | "district_viewer";

export interface AuthState {
  enabled: boolean;
  loading: boolean;
  user: User | null;
  role: Role | null;
  sigunguCode: string | null;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  enabled: false,
  loading: false,
  user: null,
  role: null,
  sigunguCode: null,
  signOut: async () => {},
});

const ROLES: Role[] = ["careos_admin", "district_admin", "district_viewer"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<AuthState, "signOut">>({
    enabled: firebaseEnabled,
    loading: firebaseEnabled,
    user: null,
    role: null,
    sigunguCode: null,
  });
  useEffect(() => {
    const fb = firebase();
    if (!fb) return;
    let refreshed = false;
    return onIdTokenChanged(fb.auth, async (user) => {
      if (!user) return setState((s) => ({ ...s, loading: false, user: null, role: null, sigunguCode: null }));
      // 관리자가 바꾼 역할이 바로 반영되도록, 페이지를 열 때 한 번 토큰을 새로 받는다
      const { claims } = await user.getIdTokenResult(!refreshed);
      refreshed = true;
      const role = ROLES.includes(claims.role as Role) ? (claims.role as Role) : null;
      const sgg = typeof claims.sigungu_code === "string" ? claims.sigungu_code : null;
      setState((s) => ({ ...s, loading: false, user, role, sigunguCode: sgg }));
    });
  }, []);
  const signOut = async () => {
    const fb = firebase();
    if (fb) await fbSignOut(fb.auth);
  };
  return <Ctx.Provider value={{ ...state, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  return useContext(Ctx);
}

/** 이 구 데이터를 읽을 수 있는가 */
export function canReadDistrict(a: AuthState, sgg: string): boolean {
  return a.role === "careos_admin" || (a.sigunguCode === sgg && (a.role === "district_admin" || a.role === "district_viewer"));
}
/** 이 구 데이터를 쓸 수 있는가 */
export function canWriteDistrict(a: AuthState, sgg: string): boolean {
  return a.role === "careos_admin" || (a.sigunguCode === sgg && a.role === "district_admin");
}
/** Firestore에 저장하는 모드인가 (아니면 브라우저 저장 = 시연 모드) */
export function usesServer(a: AuthState): boolean {
  return a.enabled && Boolean(a.user) && Boolean(a.role);
}

export const ROLE_LABEL: Record<Role, string> = {
  careos_admin: "운영자 · 전체 구",
  district_admin: "구 관리자",
  district_viewer: "구 조회",
};
