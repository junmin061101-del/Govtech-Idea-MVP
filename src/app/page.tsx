"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import TopController from "@/components/TopController";
import SidePanel from "@/components/panel/SidePanel";
import PolicySimulator from "@/components/simulator/PolicySimulator";
import { diagnoseAllDongs } from "@/lib/calculator";
import type { Dong, Facility, TimeSlotId } from "@/types";
import { DEFAULT_SIGUNGU_CODE } from "@/lib/constants/regions";
import emdsData from "@/data/seoul/emds.json";
// TODO(S3): 구 선택 토글과 함께 구별 시설 파일을 동적으로 불러오도록 변경
import facilitiesData from "@/data/seoul/facilities/11590.json";

const KakaoMap = dynamic(() => import("@/components/map/KakaoMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-sm text-neutral-400">
      지도를 불러오는 중...
    </div>
  ),
});

const dongs = (emdsData as Dong[]).filter((d) => d.sigunguCode === DEFAULT_SIGUNGU_CODE);
// 좌표 오류로 행정동에 배정하지 못한 시설은 지도·동별 집계에서 뺀다 (meta.json의 locationIssues 참고)
const facilities = (facilitiesData as Facility[]).filter((f) => f.emdCode !== null);

export default function Home() {
  const [timeSlot, setTimeSlot] = useState<TimeSlotId>("daytime");
  const [selectedDongId, setSelectedDongId] = useState<string | null>(dongs[0]?.id ?? null);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);

  const diagnoses = useMemo(() => diagnoseAllDongs(dongs, facilities, timeSlot), [timeSlot]);

  const selectedDong = dongs.find((d) => d.id === selectedDongId) ?? null;
  const selectedDiagnosis = diagnoses.find((d) => d.dongId === selectedDongId) ?? null;

  return (
    <div className="flex h-screen flex-col bg-neutral-50">
      <TopController value={timeSlot} onChange={setTimeSlot} />

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[1fr_360px_360px]">
        <div className="min-h-[420px] overflow-hidden">
          <KakaoMap
            dongs={dongs}
            diagnoses={diagnoses}
            facilities={facilities}
            selectedDongId={selectedDongId}
            onSelectDong={setSelectedDongId}
            selectedFacility={selectedFacility}
            onSelectFacility={setSelectedFacility}
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <SidePanel dong={selectedDong} diagnosis={selectedDiagnosis} />
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <PolicySimulator dong={selectedDong} facilities={facilities} timeSlot={timeSlot} />
        </div>
      </div>
    </div>
  );
}
