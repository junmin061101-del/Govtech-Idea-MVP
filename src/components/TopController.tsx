"use client";

import Link from "next/link";
import { BookOpen, ChevronDown, ClipboardList, FileText, History, LogIn, Settings, UserRound } from "lucide-react";
import { ROLE_LABEL, useAuth } from "@/lib/firebase/AuthProvider";
import { SIGUNGU } from "@/lib/constants/regions";
import { TIME_SLOTS } from "@/lib/constants/timeSlots";
import { CARE_TARGETS } from "@/lib/constants/targets";
import { DATA_DATE } from "@/lib/hooks/useSeoulData";
import type { CareTargetId, TimeSlotId } from "@/types";

interface TopControllerProps {
  sigunguCode: string;
  onSigunguChange: (code: string) => void;
  target: CareTargetId;
  onTargetChange: (target: CareTargetId) => void;
  timeSlot: TimeSlotId;
  onTimeSlotChange: (slot: TimeSlotId) => void;
  /** 현재 화면 상태 쿼리 (리포트로 넘긴다) */
  query: string;
}

/** 이름표 + 버튼 묶음. 모든 버튼은 같은 높이(28px)·같은 글자 크기(13px) */
function Segmented<T extends string>({
  label,
  items,
  value,
  onChange,
  hideSubBelow1500 = false,
}: {
  label: string;
  /** 좁은 화면(1500px 미만)에서는 보조 글자(시각)를 숨기고 툴팁으로만 보여 준다 */
  hideSubBelow1500?: boolean;
  items: { id: T; label: string; sub?: string; disabled?: boolean; title?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2" role="group" aria-label={label}>
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      <div className="flex items-center gap-0.5 rounded-lg bg-neutral-100 p-0.5">
        {items.map((item) => {
          const active = value === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              disabled={item.disabled}
              title={item.title}
              aria-pressed={active}
              className={`flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition-colors ${
                active
                  ? "bg-white text-neutral-900 shadow-sm ring-1 ring-black/5"
                  : item.disabled
                    ? "cursor-not-allowed text-neutral-300"
                    : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              {item.label}
              {item.sub && (
                <span
                  className={`text-[11px] tabular-nums ${active ? "text-neutral-500" : "text-neutral-400"} ${hideSubBelow1500 ? "hidden min-[1500px]:inline" : ""}`}
                >
                  {item.sub}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const two = (n: number) => String(n).padStart(2, "0");

export default function TopController(props: TopControllerProps) {
  const menu = [
    { href: `/report?${props.query}`, label: "리포트", icon: FileText },
    { href: "/history", label: "판단 이력", icon: History },
    { href: `/compare?sgg=${props.sigunguCode}`, label: "시점 비교", icon: BookOpen },
    { href: `/waitlist?sgg=${props.sigunguCode}`, label: "입소 대기", icon: ClipboardList },
    { href: "/settings", label: "단가 설정", icon: Settings },
  ];

  return (
    <header className="flex h-14 shrink-0 items-center gap-5 overflow-x-auto border-b border-neutral-200 bg-white px-5">
      {/* 제목 + 자치구 */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="leading-tight">
          <h1 className="whitespace-nowrap text-[15px] font-bold text-neutral-900">우리 구 돌봄 공백 지도</h1>
          <p className="whitespace-nowrap text-[11px] text-neutral-500">데이터 기준 {DATA_DATE}</p>
        </div>
        <label className="relative flex h-8 items-center">
          <span className="sr-only">자치구 선택</span>
          <select
            value={props.sigunguCode}
            onChange={(e) => props.onSigunguChange(e.target.value)}
            className="h-8 appearance-none rounded-lg border border-neutral-300 bg-white pl-3 pr-7 text-[13px] font-semibold text-neutral-900 hover:border-neutral-400"
          >
            {SIGUNGU.map((s) => (
              <option key={s.code} value={s.code}>
                서울 {s.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-neutral-500" />
        </label>
      </div>

      <span className="h-6 w-px shrink-0 bg-neutral-200" />

      <Segmented
        label="대상"
        value={props.target}
        onChange={props.onTargetChange}
        items={CARE_TARGETS.map((t) => ({
          id: t.id,
          label: t.id === "infant" ? "영유아" : "초등 저학년",
          sub: `${t.minAge}~${t.maxAge}세`,
          disabled: !t.dataAvailable,
          title: t.dataAvailable ? t.label : t.unavailableReason,
        }))}
      />

      <Segmented
        label="시간대"
        hideSubBelow1500
        value={props.timeSlot}
        onChange={props.onTimeSlotChange}
        items={TIME_SLOTS.map((t) => ({
          id: t.id,
          label: t.shortLabel,
          sub: t.hours ? `${two(t.hours.start)}–${two(t.hours.end)}` : undefined,
          disabled: !t.dataAvailable,
          title: t.dataAvailable ? t.label : `${t.label} · 데이터 준비 중`,
        }))}
      />

      {/* 메뉴: 1700px 이상은 아이콘 + 글자, 그보다 좁으면 아이콘만 (이름은 툴팁·화면낭독기) */}
      <nav className="ml-auto flex shrink-0 items-center gap-0.5" aria-label="메뉴">
        {menu.map(({ href, label, icon: Icon }) => (
          <Link
            key={label}
            href={href}
            title={label}
            className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[13px] text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <Icon className="h-4 w-4" />
            <span className="hidden min-[1700px]:inline">{label}</span>
            <span className="sr-only min-[1700px]:hidden">{label}</span>
          </Link>
        ))}
      </nav>
      <AccountChip />
    </header>
  );
}

/** 로그인 상태: 시연 모드 / 로그인 / 계정(역할·구) */
function AccountChip() {
  const auth = useAuth();
  const base = "flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[12px]";
  if (!auth.enabled) {
    return (
      <span className={`${base} border-amber-200 bg-amber-50 text-amber-800`} title="Firebase 미연결 — 판단 이력·단가는 이 브라우저에만 저장됩니다">
        시연 모드
      </span>
    );
  }
  if (auth.loading) return <span className={`${base} border-neutral-200 text-neutral-400`}>확인 중</span>;
  if (!auth.user) {
    return (
      <Link href="/login" className={`${base} border-neutral-300 font-medium text-neutral-800 hover:bg-neutral-50`}>
        <LogIn className="h-3.5 w-3.5" /> 로그인
      </Link>
    );
  }
  const sgg = auth.sigunguCode ? SIGUNGU.find((s) => s.code === auth.sigunguCode)?.name : null;
  return (
    <Link href="/login" className={`${base} border-neutral-300 text-neutral-800 hover:bg-neutral-50`} title={auth.user.email ?? undefined}>
      <UserRound className="h-3.5 w-3.5" />
      {auth.role ? `${sgg ?? ""} ${ROLE_LABEL[auth.role]}`.trim() : "권한 없음"}
    </Link>
  );
}
