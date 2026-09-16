"use client";

import { Clock } from "lucide-react";
import { TIME_SLOTS } from "@/lib/calculator";
import type { TimeSlotId } from "@/types";

interface TopControllerProps {
  value: TimeSlotId;
  onChange: (value: TimeSlotId) => void;
}

export default function TopController({ value, onChange }: TopControllerProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-neutral-200 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-lg font-bold text-neutral-900">CareOS · 동작구 돌봄 공백 대시보드</h1>
        <p className="text-xs text-neutral-500">B2G 공공 돌봄 의사결정 지원 시스템 · 서울특별시 동작구</p>
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-neutral-100 p-1">
        <Clock className="ml-2 h-4 w-4 text-neutral-400" />
        {TIME_SLOTS.map((slot) => (
          <button
            key={slot.id}
            onClick={() => onChange(slot.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              value === slot.id
                ? "bg-neutral-900 text-white shadow-sm"
                : "text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {slot.shortLabel}
          </button>
        ))}
      </div>
    </div>
  );
}
