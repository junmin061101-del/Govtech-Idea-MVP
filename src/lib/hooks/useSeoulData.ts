"use client";

/** 화면들이 함께 쓰는 데이터 불러오기 (구별 파일은 필요할 때만 불러온다) */
import { useEffect, useState } from "react";
import type { Dong, Facility } from "@/types";
import type { UnmetDemandFile } from "@/lib/constants/events";
import type { SnapshotFile } from "@/lib/report";
import emdsData from "@/data/seoul/emds.json";
import meta from "@/data/seoul/meta.json";
import snapshotIndex from "@/data/seoul/snapshots/index.json";

export const ALL_DONGS = emdsData as Dong[];
const dongNameById = new Map(ALL_DONGS.map((d) => [d.id, d.name]));
export const dongName = (id: string) => dongNameById.get(id);
export const META = meta;

export const DATA_DATE = meta.sources.childcare.dataDate as string;

export const DATA_SOURCES: { label: string; value: string }[] = [
  { label: "어린이집", value: `서울 열린데이터광장 서울시 어린이집 정보(ChildCareInfo), 기준일 ${meta.sources.childcare.dataDate}` },
  { label: "아동 인구", value: `행정안전부 주민등록인구 통계, ${meta.sources.population.baseMonth} 기준` },
  {
    label: "행정동 경계",
    value: `통계청 SGIS 행정동 경계(공공누리 제1유형), vuski/admdongkor ${meta.sources.boundaries.version} 가공(CC BY 4.0)`,
  },
  { label: "자리 나눠 쓰기", value: `2SFCA, 반경 ${meta.catchment.radiusM}m, 수요 지점 ${meta.catchment.demandPointSpacingM}m 격자` },
];

export const DATA_NOTE =
  `어린이집 ${meta.sources.childcare.dataDate} 기준(서울 열린데이터광장) · ` +
  `인구 ${meta.sources.population.baseMonth} 기준(행정안전부) · ` +
  `행정동 경계 ${meta.sources.boundaries.version.replace("ver", "")}(통계청 SGIS, vuski/admdongkor 가공)`;

function useImport<T>(key: string, load: () => Promise<{ default: unknown }>): { key: string; value: T | null } | null {
  const [state, setState] = useState<{ key: string; value: T | null } | null>(null);
  useEffect(() => {
    let alive = true;
    load()
      .then((m) => alive && setState({ key, value: m.default as T }))
      .catch(() => alive && setState({ key, value: null }));
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state?.key === key ? state : null;
}

/** 그 구 시설 + 그 구에 자리를 나눠 주는 다른 구 시설. 불러오는 중이면 null */
export function useFacilities(sigunguCode: string): Facility[] | null {
  return useImport<Facility[]>(sigunguCode, () => import(`@/data/seoul/facilities/${sigunguCode}.json`))?.value ?? null;
}

/** 시민 돌봄지도 집계. 없는 구면 null, 불러오는 중이면 undefined */
export function useUnmetDemand(sigunguCode: string): UnmetDemandFile | null | undefined {
  const s = useImport<UnmetDemandFile>(sigunguCode, () => import(`@/data/seoul/unmet-demand/${sigunguCode}.json`));
  return s === null ? undefined : s.value;
}

export const SNAPSHOT_MONTHS = snapshotIndex.months as string[];

export function useSnapshots(): SnapshotFile[] | null {
  const s = useImport<SnapshotFile[]>("all", () =>
    Promise.all(SNAPSHOT_MONTHS.map((m) => import(`@/data/seoul/snapshots/${m}.json`).then((x) => x.default as SnapshotFile))).then(
      (list) => ({ default: list }),
    ),
  );
  return s?.value ?? null;
}
