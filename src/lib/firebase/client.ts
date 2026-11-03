"use client";

/**
 * Firebase 클라이언트. NEXT_PUBLIC_FIREBASE_* 값이 없으면 꺼진 상태(null)로 두고, 화면은 브라우저 저장(시연 모드)으로 동작한다.
 * NEXT_PUBLIC_FIREBASE_EMULATORS=1 이면 로컬 에뮬레이터(Auth 9099, Firestore 8080)에 붙는다.
 * App Check는 이번 단계에서 적용하지 않는다(보류).
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const useEmulators = process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === "1";

export const firebaseEnabled = Boolean(config.apiKey && config.projectId && (config.appId || useEmulators));

let cached: { app: FirebaseApp; auth: Auth; db: Firestore } | null = null;

export function firebase(): { app: FirebaseApp; auth: Auth; db: Firestore } | null {
  if (!firebaseEnabled || typeof window === "undefined") return null;
  if (cached) return cached;
  const app = getApps().length ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (useEmulators) {
    const host = window.location.hostname;
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
  }
  cached = { app, auth, db };
  return cached;
}
