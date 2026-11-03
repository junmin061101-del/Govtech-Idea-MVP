"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import TopController from "@/components/TopController";
import RankingList from "@/components/RankingList";
import { rankDiagnoses } from "@/lib/ranking";
import GapReasonPanel from "@/components/panel/GapReasonPanel";
import AlternativesPanel from "@/components/alternatives/AlternativesPanel";
import UnmetDemandPanel from "@/components/panel/UnmetDemandPanel";
import type { MapLayer } from "@/components/map/KakaoMap";
import type { UnmetDemandFile } from "@/lib/constants/events";
import { signalOf, type UnmetSignal } from "@/lib/unmet";
import { diagnoseAllDongs } from "@/lib/calculator";
import { DEFAULT_SIGUNGU_CODE } from "@/lib/constants/regions";
import { timeSlotDef } from "@/lib/constants/timeSlots";
import { CARE_TARGETS } from "@/lib/constants/targets";
import type { CareTargetId, Dong, Facility, TimeSlotId } from "@/types";
import emdsData from "@/data/seoul/emds.json";
import meta from "@/data/seoul/meta.json";

const KakaoMap = dynamic(() => import("@/components/map/KakaoMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-sm text-neutral-400">
      지도를 불러오는 중...
    </div>
  ),
});

const allDongs = emdsData as Dong[];
const dongNameById = new Map(allDongs.map((d) => [d.id, d.name]));
const dongName = (id: string) => dongNameById.get(id);

const DATA_NOTE =
  `어린이집 ${meta.sources.childcare.dataDate} 기준(서울 열린데이터광장) · ` +
  `인구 ${meta.sources.population.baseMonth} 기준(행정안전부) · ` +
  `행정동 경계 ${meta.sources.boundaries.version.replace("ver", "")}(통계청 SGIS, vuski/admdongkor 가공)`;

/** 구별 시설 파일을 필요할 때만 불러온다 (25개 구 전체를 한 번에 싣지 않음) */
function useFacilities(sigunguCode: string): Facility[] | null {
  const [state, setState] = useState<{ code: string; list: Facility[] } | null>(null);
  useEffect(() => {
    let alive = true;
    import(`@/data/seoul/facilities/${sigunguCode}.json`).then((m) => {
      if (alive) setState({ code: sigunguCode, list: m.default as Facility[] });
    });
    return () => {
      alive = false;
    };
  }, [sigunguCode]);
  return state?.code === sigunguCode ? state.list : null;
}

/** 시민 돌봄지도 집계(부모 검색 신호). 파일이 없는 구는 null */
function useUnmetDemand(sigunguCode: string): UnmetDemandFile | null {
  const [state, setState] = useState<{ code: string; file: UnmetDemandFile | null } | null>(null);
  useEffect(() => {
    let alive = true;
    import(`@/data/seoul/unmet-demand/${sigunguCode}.json`)
      .then((m) => alive && setState({ code: sigunguCode, file: m.default as UnmetDemandFile }))
      .catch(() => alive && setState({ code: sigunguCode, file: null }));
    return () => {
      alive = false;
    };
  }, [sigunguCode]);
  return state?.code === sigunguCode ? state.file : null;
}

export default function Home() {
  const [sigunguCode, setSigunguCode] = useState(DEFAULT_SIGUNGU_CODE);
  const [target, setTarget] = useState<CareTargetId>("infant");
  const [timeSlot, setTimeSlot] = useState<TimeSlotId>("daytime");
  const [selectedDongId, setSelectedDongId] = useState<string | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [layer, setLayer] = useState<MapLayer>("estimate");

  const dongs = useMemo(() => allDongs.filter((d) => d.sigunguCode === sigunguCode), [sigunguCode]);
  const rawFacilities = useFacilities(sigunguCode);
  // 좌표 오류로 행정동에 배정하지 못한 시설은 지도·동별 집계에서 뺀다.
  // 구별 파일에는 이 구 행정동에 자리를 나눠 주는 다른 구 시설(2SFCA)도 들어 있다 — 집계에는 쓰고 지도에는 이 구 시설만 표시
  const facilities = useMemo(() => (rawFacilities ?? []).filter((f) => f.emdCode !== null), [rawFacilities]);
  const mapFacilities = useMemo(() => facilities.filter((f) => f.sigunguCode === sigunguCode), [facilities, sigunguCode]);
  const unassigned = useMemo(
    () => meta.locationIssues.filter((x) => x.sigunguCode === sigunguCode),
    [sigunguCode],
  );

  const unmetFile = useUnmetDemand(sigunguCode);
  const signals = useMemo(() => {
    if (!unmetFile) return null;
    const m = new Map<string, UnmetSignal>();
    for (const d of dongs) {
      const cell = unmetFile.cells.find((c) => c.emdCode === d.id && c.timeSlot === timeSlot && c.target === target);
      m.set(d.id, signalOf(cell));
    }
    return m;
  }, [unmetFile, dongs, timeSlot, target]);
  // 집계가 없는 구로 바꾸면 추정 수요 층으로 돌아간다
  const effectiveLayer: MapLayer = signals ? layer : "estimate";

  const diagnoses = useMemo(
    () => (rawFacilities ? diagnoseAllDongs(dongs, facilities, timeSlot, target) : []),
    [rawFacilities, dongs, facilities, timeSlot, target],
  );

  // 선택이 없거나 다른 구의 동이면 부족 인원 1위 동을 보여 준다
  const effectiveDongId =
    selectedDongId && dongs.some((d) => d.id === selectedDongId)
      ? selectedDongId
      : (rankDiagnoses(diagnoses)[0]?.dongId ?? null);
  const selectedDong = dongs.find((d) => d.id === effectiveDongId) ?? null;
  const selectedDiagnosis = diagnoses.find((d) => d.dongId === effectiveDongId) ?? null;

  const contextLabel = `${CARE_TARGETS.find((t) => t.id === target)!.label} · ${timeSlotDef(timeSlot).label}`;

  return (
    <div className="flex h-screen flex-col bg-neutral-50">
      <TopController
        sigunguCode={sigunguCode}
        onSigunguChange={(code) => {
          setSigunguCode(code);
          setSelectedDongId(null);
          setSelectedFacility(null);
        }}
        target={target}
        onTargetChange={setTarget}
        timeSlot={timeSlot}
        onTimeSlotChange={setTimeSlot}
      />

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[1fr_300px_380px]">
        <div className="min-h-[420px] overflow-hidden">
          <KakaoMap
            sigunguCode={sigunguCode}
            dongs={dongs}
            diagnoses={diagnoses}
            facilities={mapFacilities}
            timeSlot={timeSlot}
            selectedDongId={effectiveDongId}
            onSelectDong={setSelectedDongId}
            selectedFacility={selectedFacility}
            onSelectFacility={setSelectedFacility}
            dataNote={DATA_NOTE}
            layer={effectiveLayer}
            onLayerChange={setLayer}
            signals={signals}
            signalSynthetic={Boolean(unmetFile?.synthetic)}
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {rawFacilities ? (
            <RankingList
              dongs={dongs}
              diagnoses={diagnoses}
              selectedDongId={effectiveDongId}
              onSelect={setSelectedDongId}
              contextLabel={contextLabel}
              unassigned={unassigned}
              layer={effectiveLayer}
              signals={signals}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-neutral-400">시설 데이터를 불러오는 중...</div>
          )}
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto">
          <div className="rounded-xl border border-neutral-200 bg-white">
            <GapReasonPanel
              dong={selectedDong}
              diagnosis={selectedDiagnosis}
              facilities={facilities}
              timeSlot={timeSlot}
              dataNote={DATA_NOTE}
              dongName={dongName}
            />
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white">
            <UnmetDemandPanel
              dong={selectedDong}
              diagnosis={selectedDiagnosis}
              signal={effectiveDongId ? (signals?.get(effectiveDongId) ?? null) : null}
              file={unmetFile}
              timeSlot={timeSlot}
            />
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white">
            <AlternativesPanel
              dong={selectedDong}
              dongs={dongs}
              facilities={facilities}
              diagnoses={diagnoses}
              timeSlot={timeSlot}
              target={target}
              dongName={dongName}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
