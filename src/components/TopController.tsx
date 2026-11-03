"use client";

import Link from "next/link";
import { BookOpen, ClipboardList, Clock, FileText, History, MapPin, Settings, Users } from "lucide-react";
import { SIGUNGU, sigunguByCode } from "@/lib/constants/regions";
import { TIME_SLOTS } from "@/lib/constants/timeSlots";
import { CARE_TARGETS } from "@/lib/constants/targets";
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

function Segmented<T extends string>({
  icon,
  items,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  items: { id: T; label: string; disabled?: boolean; title?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg bg-neutral-100 p-1">
      <span className="ml-1.5 mr-0.5 text-neutral-400">{icon}</span>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          disabled={item.disabled}
          title={item.title}
          aria-pressed={value === item.id}
          className={`whitespace-nowrap rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
            value === item.id
              ? "bg-neutral-900 text-white shadow-sm"
              : item.disabled
                ? "cursor-not-allowed text-neutral-300"
                : "text-neutral-600 hover:bg-neutral-200"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export default function TopController(props: TopControllerProps) {
  const sigungu = sigunguByCode(props.sigunguCode);
  return (
    <div className="flex flex-col gap-2 border-b border-neutral-200 bg-white px-6 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="whitespace-nowrap">
          <h1 className="text-lg font-bold text-neutral-900">우리 구 돌봄 공백 지도</h1>
          <p className="text-xs text-neutral-500">서울특별시 {sigungu?.name}</p>
        </div>
        <label className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2 py-1 text-sm">
          <MapPin className="h-4 w-4 text-neutral-400" />
          <span className="sr-only">자치구 선택</span>
          <select
            value={props.sigunguCode}
            onChange={(e) => props.onSigunguChange(e.target.value)}
            className="bg-transparent font-medium text-neutral-800 outline-none"
          >
            {SIGUNGU.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <nav className="ml-auto flex flex-wrap items-center gap-0.5 text-xs" aria-label="메뉴">
          {[
            { href: `/report?${props.query}`, label: "리포트", icon: FileText },
            { href: "/history", label: "판단 이력", icon: History },
            { href: `/compare?sgg=${props.sigunguCode}`, label: "시점 비교", icon: BookOpen },
            { href: `/waitlist?sgg=${props.sigunguCode}`, label: "입소 대기 대조", icon: ClipboardList },
            { href: "/settings", label: "단가 설정", icon: Settings },
          ].map(({ href, label, icon: Icon }) => (
            <Link key={label} href={href} className="flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-neutral-600 hover:bg-neutral-100">
              <Icon className="h-3.5 w-3.5" /> {label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          icon={<Users className="h-4 w-4" />}
          value={props.target}
          onChange={props.onTargetChange}
          items={CARE_TARGETS.map((t) => ({
            id: t.id,
            label: t.label,
            disabled: !t.dataAvailable,
            title: t.dataAvailable ? t.label : t.unavailableReason,
          }))}
        />
        <Segmented
          icon={<Clock className="h-4 w-4" />}
          value={props.timeSlot}
          onChange={props.onTimeSlotChange}
          items={TIME_SLOTS.map((t) => ({
            id: t.id,
            label: t.hours ? `${t.shortLabel} ${String(t.hours.start).padStart(2, "0")}~${t.hours.end}` : t.shortLabel,
            disabled: !t.dataAvailable,
            title: t.dataAvailable ? t.label : `${t.label} · 데이터 준비 중`,
          }))}
        />
      </div>
    </div>
  );
}
