"use client";

import { useMemo } from "react";
import { Map as KakaoMapView, MapMarker, Circle, CustomOverlayMap, useKakaoLoader } from "react-kakao-maps-sdk";
import type { Dong, DongDiagnosis, Facility } from "@/types";
import { severityColor } from "@/lib/calculator";

// 동작구청 기준 기본 뷰
export const DONGJAK_CENTER = { lat: 37.5124, lng: 126.9393 };
export const DEFAULT_LEVEL = 6;

interface KakaoMapProps {
  dongs: Dong[];
  diagnoses: DongDiagnosis[];
  facilities: Facility[];
  selectedDongId: string | null;
  onSelectDong: (dongId: string) => void;
  selectedFacility: Facility | null;
  onSelectFacility: (facility: Facility | null) => void;
}

/**
 * PolicyMap(policymap.com/newmaps/e/childcaremap) 참고 포인트:
 *  - 생활권 단위 "히트 서클/코로플레스" 레이어로 공백 위험도를 먼저 보여주고,
 *    그 위에 개별 시설 포인트 마커를 얹어 "지역 리스크 + 개별 시설"을 한 화면에서 함께 읽게 한다.
 *  - 필터(시간대) 변경 시 동일한 지도 위에서 색상만 재계산되어, 지도를 다시 그리지 않고도
 *    비교가 가능하도록 한다.
 *  - 범례는 항상 지도와 함께 고정 노출한다 (심각/보통/정상 3단계 신호등 색상).
 * 아래 구현은 이 구조를 카카오맵 Circle + MapMarker 조합으로 재현한다.
 */
export default function KakaoMap({
  dongs,
  diagnoses,
  facilities,
  selectedDongId,
  onSelectDong,
  selectedFacility,
  onSelectFacility,
}: KakaoMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY ?? "";
  const isKeyConfigured = apiKey.length > 0 && !apiKey.includes("your_") && !apiKey.includes("_here");

  // SDK 기본값은 프로토콜 상대경로("//dapi.kakao.com/...")라서 페이지가 http로 열리면
  // 스크립트도 http로 요청되어 크로미움의 ORB(Opaque Response Blocking)에 막힌다.
  // 항상 https로 고정해 로컬(http://localhost)에서도 정상 로드되게 한다.
  const [loading, error] = useKakaoLoader({
    appkey: apiKey,
    libraries: ["services"],
    url: "https://dapi.kakao.com/v2/maps/sdk.js",
  });

  const diagnosisByDong = useMemo(() => {
    const map = new Map<string, DongDiagnosis>();
    diagnoses.forEach((d) => map.set(d.dongId, d));
    return map;
  }, [diagnoses]);

  if (!isKeyConfigured) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
        <p className="font-medium text-neutral-700">Kakao Maps API 키가 설정되지 않았습니다.</p>
        <p>.env.local 파일에 NEXT_PUBLIC_KAKAO_MAP_API_KEY 값을 설정한 뒤 다시 시작해주세요.</p>
      </div>
    );
  }

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

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-neutral-200">
      <KakaoMapView center={DONGJAK_CENTER} level={DEFAULT_LEVEL} className="h-full w-full">
        {dongs.map((dong) => {
          const diagnosis = diagnosisByDong.get(dong.id);
          const color = diagnosis ? severityColor(diagnosis.severity) : "#9ca3af";
          const isSelected = selectedDongId === dong.id;
          const intensity = diagnosis ? Math.min(0.55, 0.18 + diagnosis.gapRatio * 0.6) : 0.15;

          return (
            <div key={dong.id}>
              <Circle
                center={{ lat: dong.lat, lng: dong.lng }}
                radius={dong.approxRadiusM}
                fillColor={color}
                fillOpacity={intensity}
                strokeColor={color}
                strokeOpacity={isSelected ? 0.95 : 0.55}
                strokeWeight={isSelected ? 3 : 1.5}
                onClick={() => onSelectDong(dong.id)}
                zIndex={isSelected ? 10 : 1}
              />
              <CustomOverlayMap position={{ lat: dong.lat, lng: dong.lng }} yAnchor={1.9}>
                <button
                  onClick={() => onSelectDong(dong.id)}
                  className="pointer-events-auto rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-medium text-neutral-700 shadow-sm ring-1 ring-black/5"
                >
                  {dong.name}
                </button>
              </CustomOverlayMap>
            </div>
          );
        })}

        {facilities.map((facility) => (
          <MapMarker
            key={facility.id}
            position={{ lat: facility.lat, lng: facility.lng }}
            title={facility.name}
            onClick={() => onSelectFacility(facility)}
            image={{
              src: markerIcon(selectedFacility?.id === facility.id),
              size: { width: 22, height: 22 },
            }}
          />
        ))}

        {selectedFacility && (
          <CustomOverlayMap position={{ lat: selectedFacility.lat, lng: selectedFacility.lng }} yAnchor={1.15}>
            <FacilityDetailCard facility={selectedFacility} onClose={() => onSelectFacility(null)} />
          </CustomOverlayMap>
        )}
      </KakaoMapView>

      <MapLegend />
    </div>
  );
}

function MapLegend() {
  const items: { color: string; label: string }[] = [
    { color: "#ef4444", label: "심각 (공백 30% 초과)" },
    { color: "#f97316", label: "보통 (공백 발생)" },
    { color: "#22c55e", label: "정상 (수요 충족)" },
  ];
  return (
    <div className="absolute bottom-3 left-3 rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 text-[11px] shadow-md">
      <p className="mb-1 font-semibold text-neutral-700">돌봄 공백 위험도</p>
      <div className="flex flex-col gap-1">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-neutral-600">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 생활권 원(빨강/주황/초록)이 이미 위험도를 표현하므로, 개별 시설 마커는 유형별 색상 대신
// 단일 색상으로 통일해 시각적 잡음을 줄인다.
const FACILITY_MARKER_COLOR = "#1e293b"; // slate-800

function markerIcon(selected: boolean): string {
  const size = selected ? 24 : 18;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 22 22">
      <circle cx="11" cy="11" r="7" fill="${FACILITY_MARKER_COLOR}" stroke="white" stroke-width="${selected ? 3 : 2}" />
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function FacilityDetailCard({ facility, onClose }: { facility: Facility; onClose: () => void }) {
  const eveningWindow = facility.operatingWindows.find((w) => w.timeSlot === "evening");
  const weekendWindow = facility.operatingWindows.find((w) => w.timeSlot === "weekend");

  const rows: { label: string; value: string }[] = [
    { label: "유형", value: facility.type },
    { label: "주소", value: facility.address },
    ...(facility.phone ? [{ label: "전화번호", value: facility.phone }] : []),
    { label: "정원 / 현원", value: `${facility.capacity}명 / ${facility.currentEnrollment}명` },
    { label: "배치 교직원수", value: `${facility.totalStaff}명` },
    ...(facility.approvalDate ? [{ label: "인가일자", value: facility.approvalDate }] : []),
    { label: "야간연장 가능", value: eveningWindow?.isOpen ? "예" : "아니오" },
    { label: "휴일보육 가능", value: weekendWindow?.isOpen ? "예" : "아니오" },
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
