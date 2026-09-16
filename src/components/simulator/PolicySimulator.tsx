"use client";

import { useMemo, useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingDown, Wallet } from "lucide-react";
import type { Dong, Facility, TimeSlotId } from "@/types";
import { simulatePolicy } from "@/lib/calculator";

interface PolicySimulatorProps {
  dong: Dong | null;
  facilities: Facility[];
  timeSlot: TimeSlotId;
}

function formatWon(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억원`;
  if (value >= 10_000) return `${Math.round(value / 10_000).toLocaleString()}만원`;
  return `${Math.round(value).toLocaleString()}원`;
}

export default function PolicySimulator({ dong, facilities, timeSlot }: PolicySimulatorProps) {
  const [extendHours, setExtendHours] = useState(0);
  const [additionalStaff, setAdditionalStaff] = useState(0);

  const result = useMemo(() => {
    if (!dong) return null;
    return simulatePolicy(dong, facilities, timeSlot, { extendHours, additionalStaff });
  }, [dong, facilities, timeSlot, extendHours, additionalStaff]);

  if (!dong || !result) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-neutral-400">
        생활권을 선택하면 정책 개입 시뮬레이션을 실행할 수 있습니다.
      </div>
    );
  }

  const chartData = [
    { name: "개입 전", 유효수용력: Math.round(result.before.totalECC), 결손: Math.round(result.before.careGap) },
    { name: "개입 후", 유효수용력: Math.round(result.after.totalECC), 결손: Math.round(result.after.careGap) },
  ];

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div>
        <h3 className="text-sm font-semibold text-neutral-800">정책 시뮬레이터 · {dong.name}</h3>
        <p className="text-xs text-neutral-500">개입 강도를 조절해 예상 공백 해소율을 확인하세요.</p>
      </div>

      <div className="space-y-5">
        <SliderControl
          label="운영시간 연장 적용"
          unit="시간"
          value={extendHours}
          max={4}
          step={1}
          onChange={setExtendHours}
          hint="+2시간 연장 시 방과후/야간 시간대 병목 시설의 문을 연다고 가정합니다."
        />
        <SliderControl
          label="시간제 돌봄인력 재배치"
          unit="명"
          value={additionalStaff}
          max={10}
          step={1}
          onChange={setAdditionalStaff}
          hint="공백이 발생한 시설들에 균등 배분하여 인력 병목을 완화합니다."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
          <div className="flex items-center gap-1.5 text-emerald-700">
            <TrendingDown className="h-4 w-4" />
            <span className="text-xs font-semibold">예상 공백 해소율</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-emerald-700">+{result.resolutionRate}%</p>
          <p className="text-[11px] text-emerald-600">{Math.round(result.gapResolved).toLocaleString()}명 분 공백 해소</p>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
          <div className="flex items-center gap-1.5 text-blue-700">
            <Wallet className="h-4 w-4" />
            <span className="text-xs font-semibold">절감 추정 예산</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-blue-700">{formatWon(result.budgetSaved)}</p>
          <p className="text-[11px] text-blue-600">신규 시설 확충 대비 절감분(추정)</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-neutral-800">Before / After 비교</p>
        <div className="h-44 rounded-lg border border-neutral-200 bg-white p-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#a3a3a3" />
              <YAxis tick={{ fontSize: 11 }} stroke="#a3a3a3" />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="유효수용력" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="결손" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="text-[10px] leading-relaxed text-neutral-400">
        * 예산 효과는 신규 시설 확충 단가 대비 운영시간 연장/인력 재배치 비용을 비교한 개략 추정치이며, 실제 예산 편성 시
        지자체 단가 기준으로 재계산이 필요합니다.
      </p>
    </div>
  );
}

function SliderControl({
  label,
  unit,
  value,
  max,
  step,
  onChange,
  hint,
}: {
  label: string;
  unit: string;
  value: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  hint: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-sm font-medium text-neutral-700">{label}</label>
        <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-700">
          +{value}
          {unit}
        </span>
      </div>
      <Slider.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        value={[value]}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
      >
        <Slider.Track className="relative h-1.5 grow rounded-full bg-neutral-200">
          <Slider.Range className="absolute h-full rounded-full bg-neutral-900" />
        </Slider.Track>
        <Slider.Thumb className="block h-4 w-4 rounded-full border-2 border-neutral-900 bg-white shadow focus:outline-none" />
      </Slider.Root>
      <p className="mt-1 text-[11px] text-neutral-400">{hint}</p>
    </div>
  );
}
