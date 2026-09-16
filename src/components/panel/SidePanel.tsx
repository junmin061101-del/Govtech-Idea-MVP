"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Building2, Clock3, Sparkles, Users } from "lucide-react";
import type { Dong, DongDiagnosis } from "@/types";
import { TIME_SLOTS } from "@/lib/calculator";

interface SidePanelProps {
  dong: Dong | null;
  diagnosis: DongDiagnosis | null;
}

const SEVERITY_STYLE: Record<DongDiagnosis["severity"], { label: string; className: string }> = {
  critical: { label: "심각", className: "bg-red-50 text-red-600 border-red-200" },
  moderate: { label: "보통", className: "bg-orange-50 text-orange-600 border-orange-200" },
  normal: { label: "정상", className: "bg-green-50 text-green-600 border-green-200" },
};

export default function SidePanel({ dong, diagnosis }: SidePanelProps) {
  if (!dong || !diagnosis) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-neutral-400">
        <Building2 className="h-8 w-8 text-neutral-300" />
        지도에서 생활권(행정동)을 선택하면
        <br />
        돌봄 공백 진단 결과가 표시됩니다.
      </div>
    );
  }

  const severity = SEVERITY_STYLE[diagnosis.severity];
  const timeSlotLabel = TIME_SLOTS.find((t) => t.id === diagnosis.timeSlot)?.label;

  const bottleneckData = [
    { axis: "공간", value: Math.round(diagnosis.bottleneck.space), icon: Building2 },
    { axis: "시간", value: Math.round(diagnosis.bottleneck.time), icon: Clock3 },
    { axis: "인력", value: Math.round(diagnosis.bottleneck.staff), icon: Users },
  ];

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div>
        <p className="text-xs font-medium text-neutral-400">{dong.lifeZone} 생활권</p>
        <h2 className="text-xl font-bold text-neutral-900">{dong.name}</h2>
        <p className="mt-0.5 text-xs text-neutral-500">{timeSlotLabel} 기준</p>
      </div>

      {/* 돌봄 공백 스코어 카드 */}
      <div className={`rounded-xl border p-4 ${severity.className}`}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">돌봄 공백 스코어</span>
          <span className="rounded-full border bg-white/60 px-2 py-0.5 text-xs font-bold">{severity.label}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[11px] opacity-70">추정 수요</p>
            <p className="text-lg font-bold">{Math.round(diagnosis.demand).toLocaleString()}명</p>
          </div>
          <div>
            <p className="text-[11px] opacity-70">유효 수용력(ECC)</p>
            <p className="text-lg font-bold">{Math.round(diagnosis.totalECC).toLocaleString()}명</p>
          </div>
          <div>
            <p className="text-[11px] opacity-70">결손 인원</p>
            <p className="text-lg font-bold">{Math.round(diagnosis.careGap).toLocaleString()}명</p>
          </div>
        </div>
      </div>

      {/* 3축 병목 다이어그램 */}
      <div>
        <p className="mb-2 text-sm font-semibold text-neutral-800">3축 병목 분해 (손실 수용력 기준)</p>
        <div className="h-40 rounded-lg border border-neutral-200 bg-white p-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bottleneckData} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e5e5" />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="#a3a3a3" />
              <YAxis type="category" dataKey="axis" tick={{ fontSize: 12 }} width={36} stroke="#a3a3a3" />
              <Tooltip
                formatter={(value) => [`${Number(value).toLocaleString()}명`, "손실 수용력"]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="#f97316" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-neutral-500">
          {bottleneckData.map((b) => (
            <div key={b.axis} className="flex items-center gap-1">
              <b.icon className="h-3 w-3" />
              {b.axis}
            </div>
          ))}
        </div>
      </div>

      {/* AI 정책 처방 제언 */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
        <div className="mb-1.5 flex items-center gap-1.5 text-indigo-700">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-semibold">AI 정책 처방 제언</span>
        </div>
        <p className="text-sm leading-relaxed text-indigo-900">{diagnosis.recommendation}</p>
        {diagnosis.careGap > 0 && (
          <div className="mt-2 flex items-center gap-1 text-[11px] text-indigo-500">
            <AlertTriangle className="h-3 w-3" />
            정책 시뮬레이터에서 개입 효과를 직접 확인해보세요.
          </div>
        )}
      </div>
    </div>
  );
}
