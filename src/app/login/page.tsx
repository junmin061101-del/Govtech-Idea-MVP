"use client";

/**
 * 로그인 — CareOS 계정(시민 앱과 같은 Firebase 계정)
 *  - 비밀번호: 이메일 + 비밀번호. 허용 도메인 설정과 무관하게 바로 동작한다.
 *  - 이메일 링크: 비밀번호 없이 메일의 링크로. 이 사이트 주소가 Firebase 인증 '승인된 도메인'에 있어야 한다.
 * 역할(운영자·구 관리자·구 조회)은 운영자가 scripts/set-user-role.mjs로 부여한다.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LogOut } from "lucide-react";
import {
  isSignInWithEmailLink,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
} from "firebase/auth";
import { firebase } from "@/lib/firebase/client";
import { ROLE_LABEL, useAuth } from "@/lib/firebase/AuthProvider";
import { sigunguByCode } from "@/lib/constants/regions";

const EMAIL_KEY = "careos.loginEmail";
/** 로그인 링크는 한 번만 쓸 수 있으므로, 화면이 두 번 그려져도(개발 모드 StrictMode) 한 번만 처리한다 */
let linkHandled = false;

type Method = "password" | "link";

/** Firebase 오류 코드 → 안내 문구 */
function message(e: unknown, method: Method): string {
  const code = (e as { code?: string })?.code ?? "";
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(code)) return "이메일 또는 비밀번호가 맞지 않습니다.";
  if (code.includes("too-many-requests")) return "시도가 너무 많습니다. 잠시 뒤 다시 시도하거나 비밀번호를 재설정해 주세요.";
  if (code.includes("user-disabled")) return "사용이 중지된 계정입니다. 운영자에게 문의해 주세요.";
  if (code.includes("invalid-email")) return "이메일 주소 형식을 확인해 주세요.";
  if (code.includes("network")) return "네트워크에 연결할 수 없습니다.";
  if (/unauthorized-(continue-uri|domain)|UNAUTHORIZED_DOMAIN/i.test(code + String((e as Error)?.message)))
    return "이 주소에서는 아직 이메일 링크 로그인을 쓸 수 없습니다(인증 허용 도메인 미등록). 비밀번호로 로그인해 주세요.";
  if (code.includes("operation-not-allowed"))
    return method === "password" ? "비밀번호 로그인이 꺼져 있습니다. 이메일 링크로 로그인해 주세요." : "이메일 링크 로그인이 꺼져 있습니다. 비밀번호로 로그인해 주세요.";
  return `로그인하지 못했습니다${code ? ` (${code})` : ""}.`;
}

export default function LoginPage() {
  const auth = useAuth();
  const [method, setMethod] = useState<Method>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
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
        setStatus({ text: "로그인했습니다.", error: false });
      })
      .catch(() => setStatus({ text: "링크가 만료됐거나 이미 사용됐습니다. 다시 받아 주세요.", error: true }));
  }, []);

  const addr = email.trim();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr);

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setStatus(null);
    try {
      const ok = await fn();
      if (ok) setStatus({ text: ok, error: false });
    } catch (e) {
      setStatus({ text: message(e, method), error: true });
    } finally {
      setBusy(false);
    }
  };

  const signInPassword = () =>
    run(async () => {
      const fb = firebase();
      if (!fb) return null;
      await signInWithEmailAndPassword(fb.auth, addr, password);
      return null;
    });

  const sendLink = () =>
    run(async () => {
      const fb = firebase();
      if (!fb) return null;
      await sendSignInLinkToEmail(fb.auth, addr, { url: `${window.location.origin}/login/`, handleCodeInApp: true });
      try {
        window.localStorage.setItem(EMAIL_KEY, addr);
      } catch {
        /* 무시 */
      }
      return `${addr}로 로그인 링크를 보냈습니다. 메일의 링크를 이 브라우저에서 열어 주세요.`;
    });

  const reset = () =>
    run(async () => {
      const fb = firebase();
      if (!fb) return null;
      await sendPasswordResetEmail(fb.auth, addr);
      return `${addr}로 비밀번호 재설정 메일을 보냈습니다.`;
    });

  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-[400px] break-keep px-5 pb-16 pt-10">
        <Link href="/" className="inline-flex items-center gap-1 text-[13px] text-neutral-500 hover:text-neutral-900">
          <ArrowLeft className="h-4 w-4" /> 지도로 돌아가기
        </Link>

        <div className="mt-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[14px] bg-neutral-900 text-[18px] font-bold text-white">C</div>
          <h1 className="mt-5 text-[26px] font-semibold tracking-tight text-neutral-900">CareOS 로그인</h1>
          <p className="mt-1.5 text-[14px] text-neutral-500">구청 담당자·운영자 계정</p>
        </div>

        {!auth.enabled ? (
          <p className="card mt-8 p-4 text-[13px] text-neutral-600">
            Firebase가 아직 연결되지 않아 시연 모드로 동작 중입니다. 판단 이력은 이 브라우저에만 저장됩니다.
          </p>
        ) : auth.user ? (
          <div className="card mt-8 flex flex-col gap-4 p-6">
            <div>
              <p className="text-[15px] font-semibold text-neutral-900">{auth.user.email}</p>
              {auth.role ? (
                <p className="mt-1 text-[13px] text-neutral-500">
                  {ROLE_LABEL[auth.role]}
                  {auth.sigunguCode && ` · 서울 ${sigunguByCode(auth.sigunguCode)?.name ?? auth.sigunguCode}`}
                </p>
              ) : (
                <p className="mt-1 text-[13px] text-neutral-600">아직 권한이 없습니다. 운영자에게 소속 구와 역할 부여를 요청하세요.</p>
              )}
            </div>
            <div className="flex gap-2">
              <Link href={auth.sigunguCode ? `/?sgg=${auth.sigunguCode}` : "/"} className="btn-primary flex-1">
                대시보드로
              </Link>
              <button type="button" onClick={auth.signOut} className="btn-secondary">
                <LogOut className="h-4 w-4" /> 로그아웃
              </button>
            </div>
          </div>
        ) : (
          <form
            className="mt-8 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (method === "password") signInPassword();
              else sendLink();
            }}
          >
            <div className="seg mb-2 self-center" role="group" aria-label="로그인 방법">
              {(
                [
                  ["password", "비밀번호"],
                  ["link", "이메일 링크"],
                ] as [Method, string][]
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={method === m}
                  onClick={() => {
                    setMethod(m);
                    setStatus(null);
                  }}
                  className="seg-item px-5"
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="sr-only" htmlFor="login-email">
              이메일
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일"
              className="field"
            />
            {method === "password" && (
              <>
                <label className="sr-only" htmlFor="login-password">
                  비밀번호
                </label>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호"
                  className="field"
                />
              </>
            )}
            <button
              type="submit"
              disabled={busy || !validEmail || (method === "password" && !password)}
              className="btn-primary mt-2 h-11 text-[15px]"
            >
              {busy ? "확인 중..." : method === "password" ? "로그인" : "로그인 링크 받기"}
            </button>
            <p className="text-center text-[12px] text-neutral-500">
              {method === "password" ? (
                <>
                  시민 앱(CareOS)과 같은 계정입니다.{" "}
                  <button type="button" onClick={reset} disabled={!validEmail || busy} className="font-medium text-neutral-900 underline-offset-2 hover:underline disabled:text-neutral-400">
                    비밀번호 재설정
                  </button>
                </>
              ) : (
                "비밀번호 없이 메일로 받은 링크를 눌러 로그인합니다."
              )}
            </p>
          </form>
        )}

        {status && (
          <p className={`mt-4 text-center text-[13px] ${status.error ? "font-medium text-neutral-900" : "text-neutral-600"}`} role="status">
            {status.text}
          </p>
        )}

        <p className="mt-12 text-center text-[12px] leading-relaxed text-neutral-400">
          로그인하지 않아도 공개 데이터로 모든 구의 지도를 볼 수 있습니다(시연 모드). 로그인하면 판단 이력·입소 대기·AI 상담 기록을 구청 계정으로 함께 봅니다.
        </p>
      </div>
    </div>
  );
}
