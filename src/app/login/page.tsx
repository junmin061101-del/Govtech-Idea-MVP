"use client";

/**
 * 로그인 — 이메일 링크(비밀번호 없음). 구청 이메일로 받은 링크를 누르면 로그인된다.
 * 역할(구 관리자·구 조회)은 CareOS 관리자가 scripts/set-user-role.mjs로 부여한다.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LogOut, Mail } from "lucide-react";
import { isSignInWithEmailLink, sendSignInLinkToEmail, signInWithEmailLink } from "firebase/auth";
import { firebase } from "@/lib/firebase/client";
import { ROLE_LABEL, useAuth } from "@/lib/firebase/AuthProvider";
import { sigunguByCode } from "@/lib/constants/regions";

const EMAIL_KEY = "careos.loginEmail";
/** 로그인 링크는 한 번만 쓸 수 있으므로, 화면이 두 번 그려져도(개발 모드 StrictMode) 한 번만 처리한다 */
let linkHandled = false;

export default function LoginPage() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 메일의 링크로 돌아온 경우 로그인 마무리
  useEffect(() => {
    const fb = firebase();
    if (!fb || linkHandled || !isSignInWithEmailLink(fb.auth, window.location.href)) return;
    linkHandled = true;
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(EMAIL_KEY);
    } catch {
      /* 저장소를 못 쓰면 다시 묻는다 */
    }
    const addr = saved ?? window.prompt("로그인에 쓴 이메일을 다시 입력해 주세요.") ?? "";
    signInWithEmailLink(fb.auth, addr, window.location.href)
      .then(() => {
        try {
          window.localStorage.removeItem(EMAIL_KEY);
        } catch {
          /* 무시 */
        }
        window.history.replaceState(null, "", "/login/");
        setStatus("로그인했습니다.");
      })
      .catch(() => setStatus("링크가 만료됐거나 이미 사용됐습니다. 다시 받아 주세요."));
  }, []);

  const send = async () => {
    const fb = firebase();
    if (!fb) return;
    setBusy(true);
    setStatus(null);
    try {
      await sendSignInLinkToEmail(fb.auth, email.trim(), { url: `${window.location.origin}/login/`, handleCodeInApp: true });
      try {
        window.localStorage.setItem(EMAIL_KEY, email.trim());
      } catch {
        /* 무시 */
      }
      setStatus(`${email.trim()}로 로그인 링크를 보냈습니다. 메일의 링크를 이 브라우저에서 열어 주세요.`);
    } catch {
      setStatus("링크를 보내지 못했습니다. 이메일 주소를 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-md break-keep px-4 py-12">
        <Link href="/" className="mb-6 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800">
          <ArrowLeft className="h-4 w-4" /> 지도로 돌아가기
        </Link>
        <h1 className="text-xl font-bold text-neutral-900">구청 담당자 로그인</h1>

        {!auth.enabled ? (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
            Firebase가 아직 연결되지 않아 시연 모드로 동작 중입니다. 판단 이력은 이 브라우저에만 저장됩니다.
          </p>
        ) : auth.user ? (
          <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
            <p className="font-semibold text-neutral-900">{auth.user.email}</p>
            {auth.role ? (
              <p className="mt-1 text-neutral-600">
                {ROLE_LABEL[auth.role]}
                {auth.sigunguCode && ` · 서울 ${sigunguByCode(auth.sigunguCode)?.name ?? auth.sigunguCode}`}
              </p>
            ) : (
              <p className="mt-1 text-amber-700">아직 권한이 없습니다. CareOS 관리자에게 소속 구와 역할 부여를 요청하세요.</p>
            )}
            <div className="mt-3 flex gap-2">
              <Link href={auth.sigunguCode ? `/?sgg=${auth.sigunguCode}` : "/"} className="rounded-md bg-neutral-900 px-3 py-1.5 text-white">
                지도로
              </Link>
              <button onClick={auth.signOut} className="flex items-center gap-1 rounded-md border border-neutral-300 px-3 py-1.5">
                <LogOut className="h-4 w-4" /> 로그아웃
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-neutral-600">구청 이메일 주소를 입력하면 로그인 링크를 보내 드립니다. 비밀번호는 쓰지 않습니다.</p>
            <label className="block text-sm text-neutral-700">
              이메일
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@dongjak.go.kr"
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2"
              />
            </label>
            <button
              onClick={send}
              disabled={busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
              className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              <Mail className="h-4 w-4" /> 로그인 링크 받기
            </button>
          </div>
        )}
        {status && <p className="mt-3 text-sm text-neutral-700" role="status">{status}</p>}
        <p className="mt-8 text-xs leading-relaxed text-neutral-500">
          로그인하지 않아도 공개 데이터로 모든 구의 지도를 볼 수 있습니다(시연 모드). 로그인하면 자기 구의 판단 이력·입소 대기 집계를 구청 계정으로
          저장하고 함께 볼 수 있습니다.
        </p>
      </div>
    </div>
  );
}
