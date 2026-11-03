"use client";

import { useEffect, useState } from "react";
import { toMultiPolygon, type Geometry } from "@/lib/geo";

/** 행정동 코드 → 조각별 [외곽, 구멍...] 경로 (카카오 Polygon path 형식) */
export type BoundaryPaths = Map<string, { lat: number; lng: number }[][][]>;

let cache: Promise<BoundaryPaths> | null = null;

function load(): Promise<BoundaryPaths> {
  cache ??= fetch("/data/seoul-boundaries.geojson")
    .then((r) => {
      if (!r.ok) throw new Error(`경계 데이터 로드 실패: ${r.status}`);
      return r.json();
    })
    .then((fc: { features: { properties: { code: string }; geometry: Geometry }[] }) => {
      const out: BoundaryPaths = new Map();
      for (const f of fc.features) {
        out.set(
          f.properties.code,
          toMultiPolygon(f.geometry).map((poly) => poly.map((ring) => ring.map(([lng, lat]) => ({ lat, lng })))),
        );
      }
      return out;
    })
    .catch((e) => {
      cache = null; // 다음 렌더에서 재시도
      throw e;
    });
  return cache;
}

/** 서울 행정동 경계 (한 번만 내려받아 공유) */
export function useBoundaries(): BoundaryPaths | null {
  const [data, setData] = useState<BoundaryPaths | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((d) => alive && setData(d)).catch(console.error);
    return () => {
      alive = false;
    };
  }, []);
  return data;
}
