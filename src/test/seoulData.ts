/** 테스트 전용: 빌드된 서울 데이터 로더 (구별 시설 파일을 모두 읽는다) */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import type { Dong, Facility } from "@/types";

const DATA = join(__dirname, "..", "data", "seoul");

export function loadEmds(): Dong[] {
  return JSON.parse(readFileSync(join(DATA, "emds.json"), "utf-8"));
}

/** 서울 전체 시설 (구별 파일에 다른 구 시설이 겹쳐 들어 있어 id로 중복 제거) */
export function loadAllFacilities(): Facility[] {
  const byId = new Map<string, Facility>();
  for (const f of readdirSync(join(DATA, "facilities"))) {
    for (const x of JSON.parse(readFileSync(join(DATA, "facilities", f), "utf-8")) as Facility[]) byId.set(x.id, x);
  }
  return Array.from(byId.values());
}

/** 구별 파일 하나 (그 구 시설 + 그 구에 자리를 나눠 주는 다른 구 시설) */
export function loadSigunguFile(sgg: string): Facility[] {
  return JSON.parse(readFileSync(join(DATA, "facilities", `${sgg}.json`), "utf-8"));
}

export function loadRawBoundaries(): { features: { properties: Record<string, string>; geometry: never }[] } {
  return JSON.parse(readFileSync(join(__dirname, "..", "..", "scripts", "cache", "seoul-boundaries.geojson"), "utf-8"));
}

export function loadPublicBoundaries(): { features: { properties: { code: string; sgg: string; name: string }; geometry: never }[] } {
  return JSON.parse(readFileSync(join(__dirname, "..", "..", "public", "data", "seoul-boundaries.geojson"), "utf-8"));
}
