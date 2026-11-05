"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CustomOverlayMap,
  Map as KakaoMapView,
  MapMarker,
  MarkerClusterer,
  Polygon,
  useKakaoLoader,
} from "react-kakao-maps-sdk";
import type { Dong, DongDiagnosis, Facility, TimeSlotId } from "@/types";
import { GAP_CLASSES, gapClassOf, people } from "@/lib/mapScale";
import { timeSlotDef } from "@/lib/constants/timeSlots";
import { REASONS } from "@/lib/reasons";
import { rankDiagnoses } from "@/lib/ranking";
import { useBoundaries } from "@/components/map/useBoundaries";
import { INSUFFICIENT_COLOR, NO_RESULT_CLASSES, noResultColor, type UnmetSignal } from "@/lib/unmet";
import { percent } from "@/lib/mapScale";
import { TRANSIT } from "@/lib/config/assumptions";
import { UNAVAILABLE_TEXT } from "@/components/Notice";

export const VULNERABLE_TODO =
  "취약가구 비중: 행정동별 기초생활수급자 통계는 서울 열린데이터광장에서 Open API·파일로 제공되지 않아 확보 필요";

interface Station {
  name: string;
  routes: string[];
  lat: number;
  lng: number;
}
let stationCache: Promise<Station[]> | null = null;
/** 지하철역 (형평성 겹쳐 보기를 켰을 때만 불러온다). 이 구 범위(+여유) 안의 역만 */
function useSubwayStations(on: boolean, dongs: Dong[]): Station[] {
  const [all, setAll] = useState<Station[]>([]);
  useEffect(() => {
    if (!on) return;
    stationCache ??= fetch("/data/seoul-subway.json")
      .then((r) => r.json())
      .then((d: { stations: Station[] }) => d.stations);
    let alive = true;
    stationCache.then((s) => alive && setAll(s)).catch(() => (stationCache = null));
    return () => {
      alive = false;
    };
  }, [on]);
  return useMemo(() => {
    if (!on || dongs.length === 0) return [];
    const pad = 0.01;
    const x0 = Math.min(...dongs.map((d) => d.bbox[0])) - pad;
    const y0 = Math.min(...dongs.map((d) => d.bbox[1])) - pad;
    const x1 = Math.max(...dongs.map((d) => d.bbox[2])) + pad;
    const y1 = Math.max(...dongs.map((d) => d.bbox[3])) + pad;
    return all.filter((s) => s.lng >= x0 && s.lng <= x1 && s.lat >= y0 && s.lat <= y1);
  }, [on, all, dongs]);
}

/** 지도 층: 추정 수요(인구 기반) | 부모 검색 신호(시민 돌봄지도) | 둘 다 */
export type MapLayer = "estimate" | "signal" | "both";
export const MAP_LAYERS: { id: MapLayer; label: string }[] = [
  { id: "estimate", label: "추정 수요" },
  { id: "signal", label: "부모 검색 신호" },
  { id: "both", label: "둘 다" },
];

interface KakaoMapProps {
  sigunguCode: string;
  dongs: Dong[];
  diagnoses: DongDiagnosis[];
  facilities: Facility[];
  timeSlot: TimeSlotId;
  selectedDongId: string | null;
  onSelectDong: (dongId: string) => void;
  selectedFacility: Facility | null;
  onSelectFacility: (facility: Facility | null) => void;
  /** 범례에 표시할 데이터 기준 */
  dataNote: string;
  layer: MapLayer;
  onLayerChange: (layer: MapLayer) => void;
  /** 행정동별 부모 검색 신호 (집계가 없는 구면 null) */
  signals: Map<string, UnmetSignal> | null;
  signalSynthetic: boolean;
  /** 형평성 겹쳐 보기: 대중교통 접근성 */
  equityTransit: boolean;
  onEquityTransitChange: (on: boolean) => void;
  /** 볼 수 없는 층을 눌렀을 때 이유 안내 */
  onUnavailable: (text: string) => void;
}

/** 카카오맵 레벨: 숫자가 클수록 넓게 보인다. 이 레벨 이하에서 모든 동 라벨을 표시 */
const ALL_LABELS_MAX_LEVEL = 6;
/** 이 레벨까지는 부족 상위 동과 선택 동의 라벨만 표시. 그보다 넓으면 선택 동만 */
const TOP_LABELS_MAX_LEVEL = 8;
const TOP_LABEL_COUNT = 5;
/** 이 레벨 이상에서 시설 점을 묶어(클러스터) 표시 */
const CLUSTER_MIN_LEVEL = 6;

const OPEN_COLOR = "#1f2937";
const CLOSED_COLOR = "#9ca3af";

function dotIcon(open: boolean, selected: boolean): string {
  const r = selected ? 6 : 4;
  const size = r * 2 + 4;
  const svg = open
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${OPEN_COLOR}" stroke="white" stroke-width="2"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="white" stroke="${CLOSED_COLOR}" stroke-width="2"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const CLUSTER_STYLE = {
  background: "rgba(31, 41, 55, 0.78)",
  color: "#fff",
  borderRadius: "999px",
  border: "2px solid #fff",
  textAlign: "center",
  fontSize: "11px",
  fontWeight: "600",
};
const CLUSTER_STYLES = [24, 30, 36, 42].map((s) => ({ ...CLUSTER_STYLE, width: `${s}px`, height: `${s}px`, lineHeight: `${s - 4}px` }));

export default function KakaoMap(props: KakaoMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY ?? "";
  const isKeyConfigured = apiKey.length > 0 && !apiKey.includes("your_") && !apiKey.includes("_here");
  if (!isKeyConfigured) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
        <p className="font-medium text-neutral-700">Kakao Maps API 키가 설정되지 않았습니다.</p>
        <p>.env.local 파일에 NEXT_PUBLIC_KAKAO_MAP_API_KEY 값을 설정한 뒤 다시 시작해주세요.</p>
        <p className="text-xs">지도 없이도 오른쪽 순위 목록에서 모든 행정동을 볼 수 있습니다.</p>
      </div>
    );
  }
  return <LoadedMap {...props} apiKey={apiKey} />;
}

function LoadedMap({
  apiKey,
  sigunguCode,
  dongs,
  diagnoses,
  facilities,
  timeSlot,
  selectedDongId,
  onSelectDong,
  selectedFacility,
  onSelectFacility,
  dataNote,
  layer,
  onLayerChange,
  signals,
  signalSynthetic,
  equityTransit,
  onUnavailable,
}: KakaoMapProps & { apiKey: string }) {
  const stations = useSubwayStations(equityTransit, dongs);
  // SDK 기본 URL은 프로토콜 상대경로라 http 페이지에서 ORB에 막힌다. https로 고정한다.
  const [loading, error] = useKakaoLoader({
    appkey: apiKey,
    libraries: ["services", "clusterer"],
    url: "https://dapi.kakao.com/v2/maps/sdk.js",
  });
  const boundaries = useBoundaries();
  const [map, setMap] = useState<kakao.maps.Map | null>(null);
  const [level, setLevel] = useState(7);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const diagnosisByDong = useMemo(() => new Map(diagnoses.map((d) => [d.dongId, d])), [diagnoses]);
  const topIds = useMemo(
    () => new Set(rankDiagnoses(diagnoses).filter((d) => d.careGap > 0).slice(0, TOP_LABEL_COUNT).map((d) => d.dongId)),
    [diagnoses],
  );

  // 구를 바꾸면 그 구의 모든 행정동이 보이도록 범위를 맞춘다 (화면 밖으로 잘리는 동이 없게).
  // 레이아웃이 자리 잡기 전에 맞추면 작은 크기 기준으로 너무 넓게 잡히므로, 컨테이너 크기가 바뀔 때도 다시 맞춘다.
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!map || dongs.length === 0) return;
    const fit = () => {
      map.relayout();
      const bounds = new kakao.maps.LatLngBounds();
      for (const d of dongs) {
        bounds.extend(new kakao.maps.LatLng(d.bbox[1], d.bbox[0]));
        bounds.extend(new kakao.maps.LatLng(d.bbox[3], d.bbox[2]));
      }
      map.setBounds(bounds, 16, 16, 16, 16);
      setLevel(map.getLevel());
    };
    fit();
    const el = containerRef.current;
    if (!el) return;
    let last = `${el.clientWidth}x${el.clientHeight}`;
    const ro = new ResizeObserver(() => {
      const now = `${el.clientWidth}x${el.clientHeight}`;
      if (now !== last) {
        last = now;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [map, sigunguCode, dongs]);

  // 목록에서 고른 동이 화면 밖이면 그쪽으로 이동
  useEffect(() => {
    if (!map || !selectedDongId) return;
    const d = dongs.find((x) => x.id === selectedDongId);
    if (!d) return;
    const pos = new kakao.maps.LatLng(d.lat, d.lng);
    if (!map.getBounds().contain(pos)) map.panTo(pos);
  }, [map, selectedDongId, dongs]);

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-red-200 bg-red-50 p-8 text-sm text-red-600">
        카카오맵 로드에 실패했습니다. API 키 및 등록된 도메인을 확인해주세요.
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-sm text-neutral-400">
        지도를 불러오는 중...
      </div>
    );
  }

  const hovered = hoveredId ? diagnosisByDong.get(hoveredId) : null;
  const hoveredDong = hoveredId ? dongs.find((d) => d.id === hoveredId) : null;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden rounded-xl border border-neutral-200">
      <KakaoMapView
        center={{ lat: 37.5665, lng: 126.978 }}
        level={7}
        className="h-full w-full"
        onCreate={setMap}
        onZoomChanged={(m) => setLevel(m.getLevel())}
      >
        {dongs.map((dong) => {
          const parts = boundaries?.get(dong.id);
          if (!parts) return null;
          const diagnosis = diagnosisByDong.get(dong.id);
          const cls = diagnosis ? gapClassOf(diagnosis.demand, diagnosis.totalECC) : GAP_CLASSES.at(-1)!;
          const fill = layer === "signal" ? noResultColor(signals?.get(dong.id)?.noResultRate ?? null) : cls.color;
          const emphasized = selectedDongId === dong.id || hoveredId === dong.id;
          // 형평성 겹쳐 보기: 대중교통 도보권이 낮은 동은 점선 테두리
          const lowTransit = equityTransit && (dong.transit?.coverage ?? 1) < TRANSIT.lowCoverage;
          return parts.map((path, i) => (
            <Polygon
              key={`${dong.id}-${i}`}
              path={path}
              fillColor={fill}
              // 가까이 볼수록 배경 지도(도로·건물)가 보이도록 옅게
              fillOpacity={level <= 4 ? 0.35 : level <= 5 ? 0.48 : 0.62}
              strokeColor={emphasized || lowTransit ? "#111827" : "#ffffff"}
              strokeOpacity={1}
              strokeWeight={emphasized ? 3 : lowTransit ? 2.5 : 1.5}
              strokeStyle={lowTransit && !emphasized ? "shortdash" : "solid"}
              zIndex={emphasized ? 5 : 1}
              onClick={() => onSelectDong(dong.id)}
              onMouseover={() => setHoveredId(dong.id)}
              onMouseout={() => setHoveredId((h) => (h === dong.id ? null : h))}
            />
          ));
        })}

        {dongs.map((dong) => {
          const diagnosis = diagnosisByDong.get(dong.id);
          if (!diagnosis) return null;
          const selected = selectedDongId === dong.id;
          const visible =
            selected ||
            level <= ALL_LABELS_MAX_LEVEL ||
            (level <= TOP_LABELS_MAX_LEVEL && topIds.has(dong.id));
          if (!visible) return null;
          const sig = signals?.get(dong.id);
          const estimateText =
            diagnosis.careGap > 0
              ? `${people(diagnosis.careGap)} 부족`
              : diagnosis.demand > 0 && diagnosis.totalECC > diagnosis.demand
                ? "여유"
                : null;
          const signalText = signals
            ? sig && sig.noResultRate != null
              ? `결과 없음 ${percent(sig.noResultRate)}${sig.reliability === "reference" ? "*" : ""}`
              : "표본 부족"
            : null;
          const lines = layer === "estimate" ? [estimateText] : layer === "signal" ? [signalText] : [estimateText, signalText];
          if (equityTransit && dong.transit) lines.push(`도보권 ${percent(dong.transit.coverage)}`);
          const flag = layer !== "estimate" && sig?.gapSignal;
          return (
            <CustomOverlayMap key={`label-${dong.id}`} position={{ lat: dong.lat, lng: dong.lng }} zIndex={selected ? 6 : 3}>
              <button
                onClick={() => onSelectDong(dong.id)}
                className={`pointer-events-auto whitespace-nowrap rounded-md px-1.5 py-0.5 text-center text-[11px] leading-tight shadow-sm ring-1 ${
                  selected ? "bg-neutral-900 text-white ring-neutral-900" : "bg-white/95 text-neutral-800 ring-black/10"
                }`}
              >
                <span className="font-semibold">
                  {flag && <span aria-label="공백 신호">⚠ </span>}
                  {dong.name}
                </span>
                {lines.filter(Boolean).map((l) => (
                  <span key={l} className="block tabular-nums">
                    {l}
                  </span>
                ))}
              </button>
            </CustomOverlayMap>
          );
        })}

        {equityTransit &&
          stations.map((st) => (
            <CustomOverlayMap key={`st-${st.name}`} position={{ lat: st.lat, lng: st.lng }} zIndex={2}>
              <span
                title={`${st.name}역 (${st.routes.join(", ")})`}
                className="pointer-events-auto block h-2.5 w-2.5 rounded-[2px] border-2 border-white bg-neutral-800 shadow"
              />
            </CustomOverlayMap>
          ))}

        <MarkerClusterer averageCenter minLevel={CLUSTER_MIN_LEVEL} styles={CLUSTER_STYLES} calculator={[10, 30, 60]}>
          {facilities.map((f) => {
            const open = f.operatingWindows.find((w) => w.timeSlot === timeSlot)?.isOpen ?? false;
            const selected = selectedFacility?.id === f.id;
            return (
              <MapMarker
                key={f.id}
                position={{ lat: f.lat, lng: f.lng }}
                title={`${f.name} · ${open ? "운영 중" : "운영 안 함"}`}
                onClick={() => onSelectFacility(f)}
                image={{ src: dotIcon(open, selected), size: { width: selected ? 16 : 12, height: selected ? 16 : 12 } }}
              />
            );
          })}
        </MarkerClusterer>
      </KakaoMapView>

      {hovered && hoveredDong && (
        <div className="pointer-events-none absolute left-3 top-14 z-20 rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 text-xs shadow-md">
          <p className="font-semibold text-neutral-800">{hoveredDong.name}</p>
          <p className="text-neutral-600">
            수요 {people(hovered.demand)} · 이용 가능한 자리 {people(hovered.totalECC)}
          </p>
          <p className="font-medium text-neutral-900">
            {hovered.careGap > 0
              ? `${people(hovered.careGap)} 부족 · 주된 이유: ${REASONS[hovered.bottleneck.dominant].label}`
              : hovered.totalECC > hovered.demand
                ? `여유 ${people(hovered.totalECC - hovered.demand)}`
                : "충족"}
          </p>
          {signals && (
            <p className="text-neutral-600">
              부모 검색: {(() => {
                const s = signals.get(hoveredDong.id);
                return s && s.noResultRate != null ? `결과 없음 ${percent(s.noResultRate)} (${s.searches}건)` : "표본 부족";
              })()}
            </p>
          )}
          {equityTransit && hoveredDong.transit && (
            <p className="text-neutral-600">
              대중교통 도보권 {percent(hoveredDong.transit.coverage)} (지하철 {percent(hoveredDong.transit.subwayCoverage)})
            </p>
          )}
        </div>
      )}

      <div className="absolute left-3 top-3 z-20 flex items-center gap-1 rounded-lg bg-white/95 p-1 text-xs shadow-md ring-1 ring-black/5" role="group" aria-label="지도 층">
        {MAP_LAYERS.map((l) => {
          const disabled = l.id !== "estimate" && !signals;
          return (
            <button
              key={l.id}
              onClick={() => (disabled ? onUnavailable(UNAVAILABLE_TEXT.signal) : onLayerChange(l.id))}
              aria-description={disabled ? "정보 없음 — 누르면 이유를 알려 줍니다" : undefined}
              aria-pressed={layer === l.id}
              title={disabled ? UNAVAILABLE_TEXT.signal : undefined}
              className={`rounded-md px-2 py-1 font-medium ${
                layer === l.id ? "bg-neutral-900 text-white" : disabled ? "text-neutral-400 hover:text-neutral-500" : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {l.label}
            </button>
          );
        })}
        {signals && signalSynthetic && layer !== "estimate" && (
          <span className="ml-1 rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">
            시연용 가상 데이터
          </span>
        )}

      </div>

      {selectedFacility && (
        <div className="absolute right-3 top-3 z-20">
          <FacilityDetailCard facility={selectedFacility} timeSlot={timeSlot} onClose={() => onSelectFacility(null)} />
        </div>
      )}

      <MapLegend timeSlot={timeSlot} dataNote={dataNote} layer={layer} equityTransit={equityTransit} />
    </div>
  );
}

function MapLegend({ timeSlot, dataNote, layer, equityTransit }: { timeSlot: TimeSlotId; dataNote: string; layer: MapLayer; equityTransit: boolean }) {
  const signalItems = [...NO_RESULT_CLASSES.map((c) => ({ color: c.color, label: c.label })).reverse(), { color: INSUFFICIENT_COLOR, label: "표본 부족" }];
  return (
    <div className="absolute bottom-3 right-3 z-20 max-w-[240px] rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 text-[11px] shadow-md">
      {layer === "signal" ? (
        <>
          <p className="mb-1 font-semibold text-neutral-700">결과 없음 검색 비율 (부모 검색 신호)</p>
          <ul className="space-y-0.5">
            {signalItems.map((c) => (
              <li key={c.label} className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-3.5 rounded-sm ring-1 ring-black/10" style={{ backgroundColor: c.color }} />
                <span className="text-neutral-600">{c.label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-neutral-500">* 참고 수치(표본 35~74건) · ⚠ 공백 신호</p>
        </>
      ) : (
        <>
          <p className="mb-1 font-semibold text-neutral-700">부족 비율 (부족 인원 ÷ 추정 수요)</p>
          <ul className="space-y-0.5">
            {GAP_CLASSES.filter((c) => c.id !== "no_demand").map((c) => (
              <li key={c.id} className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-3.5 rounded-sm ring-1 ring-black/10" style={{ backgroundColor: c.color }} />
                <span className="text-neutral-600">{c.label}</span>
              </li>
            ))}
          </ul>
          {layer === "both" && <p className="mt-1 text-[10px] text-neutral-500">라벨 둘째 줄: 부모 검색 결과 없음 비율 · ⚠ 공백 신호</p>}
        </>
      )}
      {equityTransit && (
        <div className="mt-1.5 space-y-0.5 border-t border-neutral-100 pt-1.5">
          <p className="flex items-center gap-1.5 text-neutral-600">
            <span className="inline-block h-0 w-4 border-t-2 border-dashed border-neutral-900" />
            대중교통 도보권 {percent(TRANSIT.lowCoverage)} 미만
          </p>
          <p className="flex items-center gap-1.5 text-neutral-600">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px] border-2 border-white bg-neutral-800 shadow" />
            지하철역
          </p>
          <p className="text-[10px] text-neutral-400">
            도보권: 지하철 {TRANSIT.subwayM}m·버스 {TRANSIT.busM}m 안 (가정값)
          </p>
        </div>
      )}
      <div className="mt-1.5 space-y-0.5 border-t border-neutral-100 pt-1.5">
        <p className="flex items-center gap-1.5 text-neutral-600">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: OPEN_COLOR }} />
          {timeSlotDef(timeSlot).shortLabel}에 운영 중인 시설
        </p>
        <p className="flex items-center gap-1.5 text-neutral-600">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 bg-white" style={{ borderColor: CLOSED_COLOR }} />
          운영 안 함
        </p>
      </div>
      <p className="mt-1.5 border-t border-neutral-100 pt-1.5 text-[10px] leading-snug text-neutral-400">{dataNote}</p>
    </div>
  );
}

function FacilityDetailCard({ facility, timeSlot, onClose }: { facility: Facility; timeSlot: TimeSlotId; onClose: () => void }) {
  const window = facility.operatingWindows.find((w) => w.timeSlot === timeSlot);
  const rows: { label: string; value: string }[] = [
    { label: "유형", value: facility.type },
    { label: "주소", value: facility.address },
    ...(facility.phone ? [{ label: "전화번호", value: facility.phone }] : []),
    { label: "정원 / 현원", value: `${facility.capacity}명 / ${facility.currentEnrollment}명` },
    { label: "교사 수", value: `${facility.totalStaff}명${facility.teachersEstimated ? " (추정)" : ""}` },
    {
      label: `${timeSlotDef(timeSlot).shortLabel} 운영`,
      value: `${window?.isOpen ? "운영" : "운영 안 함"}${window?.estimated ? " (추정)" : ""}`,
    },
    ...(facility.spec?.length ? [{ label: "시설 특성", value: facility.spec.join(", ") }] : []),
  ];
  return (
    <div className="w-72 rounded-lg border border-neutral-200 bg-white p-3 text-xs shadow-lg">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-neutral-800">{facility.name}</p>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600" aria-label="닫기">
          ×
        </button>
      </div>
      <dl className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex gap-2">
            <dt className="w-20 shrink-0 text-neutral-400">{row.label}</dt>
            <dd className="text-neutral-700">{row.value}</dd>
          </div>
        ))}
      </dl>
      {facility.homepageUrl && (
        <a
          href={facility.homepageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block rounded-md bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-neutral-700"
        >
          홈페이지 방문 →
        </a>
      )}
      <p className="mt-2 text-[10px] leading-snug text-neutral-400">{facility.dataSource}</p>
    </div>
  );
}
