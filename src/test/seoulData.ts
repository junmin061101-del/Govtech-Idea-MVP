/** 테스트 전용: 빌드된 서울 데이터 로더 (구별 시설 파일을 모두 읽는다) */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import type { Dong, Facility } from "@/types";

const DATA = join(__dirname, "..", "data", "seoul");

export function loadEmds(): Dong[] {
  return JSON.parse(readFileSync(join(DATA, "emds.json"), "utf-8"));
}

export function loadAllFacilities(): Facility[] {
  return readdirSync(join(DATA, "facilities")).flatMap((f) =>
    JSON.parse(readFileSync(join(DATA, "facilities", f), "utf-8")),
  );
}

export function loadRawBoundaries(): { features: { properties: Record<string, string>; geometry: never }[] } {
  return JSON.parse(readFileSync(join(__dirname, "..", "..", "scripts", "cache", "seoul-boundaries.geojson"), "utf-8"));
}

export function loadPublicBoundaries(): { features: { properties: { code: string; sgg: string; name: string }; geometry: never }[] } {
  return JSON.parse(readFileSync(join(__dirname, "..", "..", "public", "data", "seoul-boundaries.geojson"), "utf-8"));
}
