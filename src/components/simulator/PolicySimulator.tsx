"use client";

import { useMemo, useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, TrendingDown } from "lucide-react";
import type { Dong, Facility, TimeSlotId } from "@/types";
import { simulatePolicy } from "@/lib/calculator";

interface PolicySimulatorProps {
  dong: Dong | null;
  facilities: Facility[];
  timeSlot: TimeSlotId;
}

const AXIS_LEVER_HINT: Record<string, string> = {
  space: "이 생활권은 공간(정원) 병목이 주원인입니다 → 아래 \"정원 확충/연계\" 레버를 사용하세요.",
  time: "이 생활권은 시간(운영시간) 병목이 주원인입니다 → 아래 \"운영시간 연장\" 레버를 사용하세요.",
  staff: "이 생활권은 인력 병목이 주원인입니다 → 아래 \"인력 재배치\" 레버를 사용하세요.",
};

export default function PolicySimulator({ dong, facilities, timeSlot }: PolicySimulatorProps) {
  const [extendHours, setExtendHours] = useState(0);
  const [additionalStaff, setAdditionalStaff] = useState(0);
  const [addedCapacity, setAddedCapacity] = useState(0);

  const result = useMemo(() => {
    if (!dong) return null;
    return simulatePolicy(dong, facilities, timeSlot, { extendHours, additionalStaff, addedCapacity });
  }, [dong, facilities, timeSlot, extendHours, additionalStaff, addedCapacity]);

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

      <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-800">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {AXIS_LEVER_HINT[result.before.bottleneck.dominant]}
      </div>

      <div className="space-y-5">
        <SliderControl
          label="정원 확충 / 인접 생활권 연계"
          unit="명"
          value={addedCapacity}
          max={200}
          step={10}
          onChange={setAddedCapacity}
          hint="신규 시설 확충 또는 인접 생활권 여유 정원 연계로 확보되는 정원(명)을 가정합니다. 공간 병목 해소용 레버입니다."
        />
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
          hint="공백이 발생한 시설들에 균등 배분한다고 가정합니다. ※ 해당 인력이 실제로 확보 가능한지는 현장 확인이 필요합니다."
        />
      </div>

      <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
        <div className="flex items-center gap-1.5 text-emerald-700">
          <TrendingDown className="h-4 w-4" />
          <span className="text-xs font-semibold">예상 공백 해소율</span>
        </div>
        <p className="mt-1 text-2xl font-bold text-emerald-700">+{result.resolutionRate}%</p>
        <p className="text-[11px] text-emerald-600">{Math.round(result.gapResolved).toLocaleString()}명 분 공백 해소 (남은 결손 {Math.round(result.after.careGap).toLocaleString()}명)</p>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-neutral-800">Before / After 비교</p>
        <div className="h-48 rounded-lg border border-neutral-200 bg-white p-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#a3a3a3" />
              <YAxis tick={{ fontSize: 11 }} stroke="#a3a3a3" />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="유효수용력" name="유효 수용력(ECC)" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="결손" name="결손 인원" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="text-[10px] leading-relaxed text-neutral-400">
        * 이 시뮬레이터는 “어디에, 왜 공백이 있는지”를 진단하고 레버별 이론적 해소 효과를 보여주는 도구입니다.
        정원 확충 레버는 실제 부지·인허가 확보를, 인력 레버는 실제 채용 가능 여부를 전제로 하며, 두 조건 모두
        시뮬레이터가 아닌 현장에서 확인해야 합니다. 금전적 비용 추정은 신뢰할 수 있는 단가 출처가 확보되기 전까지
        제공하지 않습니다.
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
