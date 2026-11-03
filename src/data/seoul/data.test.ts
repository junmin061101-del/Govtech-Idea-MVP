import { describe, expect, it } from "vitest";
import { SIGUNGU } from "@/lib/constants/regions";
import { pointInGeometry } from "@/lib/geo";
import { loadAllFacilities, loadEmds, loadPublicBoundaries, loadRawBoundaries } from "@/test/seoulData";
import meta from "@/data/seoul/meta.json";

const emds = loadEmds();
const facilities = loadAllFacilities();
const raw = loadRawBoundaries();
const rawByCode = new Map(raw.features.map((f) => [f.properties.adm_cd2, f.geometry]));

describe("행정동", () => {
  it("서울 427개 행정동, 코드 중복 없음", () => {
    expect(emds).toHaveLength(427);
    expect(new Set(emds.map((e) => e.emdCode)).size).toBe(427);
  });

  it("25개 구 모두 행정동이 있고, 코드가 regions.ts와 일치한다", () => {
    const codes = new Set(SIGUNGU.map((s) => s.code));
    for (const e of emds) expect(codes.has(e.sigunguCode)).toBe(true);
    for (const s of SIGUNGU) expect(emds.some((e) => e.sigunguCode === s.code)).toBe(true);
  });

  it("동작구 15개 행정동이 모두 있다 (누락됐던 노량진2동·대방동·신대방1·2동 포함)", () => {
    const names = emds.filter((e) => e.sigunguCode === "11590").map((e) => e.name).sort();
    expect(names).toEqual(
      ["노량진1동", "노량진2동", "대방동", "사당1동", "사당2동", "사당3동", "사당4동", "사당5동",
       "상도1동", "상도2동", "상도3동", "상도4동", "신대방1동", "신대방2동", "흑석동"].sort(),
    );
  });

  it("모든 행정동에 지도용 경계가 있다 (경계·인구 코드 1:1)", () => {
    const pub = loadPublicBoundaries();
    expect(new Set(pub.features.map((f) => f.properties.code))).toEqual(new Set(emds.map((e) => e.emdCode)));
  });

  it("라벨 위치는 항상 자기 행정동 경계 안에 있다", () => {
    for (const e of emds) expect(pointInGeometry([e.lng, e.lat], rawByCode.get(e.emdCode)!), e.name).toBe(true);
  });

  it("인구는 0~9세 1세 단위이고 합이 맞다", () => {
    for (const e of emds) {
      expect(e.populationByAge).toHaveLength(10);
      expect(e.populationByAge.reduce((a, b) => a + b, 0)).toBe(e.population0to9);
    }
  });
});

describe("시설 → 행정동 배정", () => {
  it("배정된 시설은 좌표가 그 행정동 경계 안에 있고, 같은 구 소속이다", () => {
    const emdByCode = new Map(emds.map((e) => [e.emdCode, e]));
    for (const f of facilities.filter((x) => x.emdCode)) {
      expect(pointInGeometry([f.lng, f.lat], rawByCode.get(f.emdCode!)!), f.name).toBe(true);
      expect(emdByCode.get(f.emdCode!)!.sigunguCode).toBe(f.sigunguCode);
    }
  });

  it("배정 못 한 시설은 사유가 있고 meta.json 목록에 모두 있다", () => {
    const unassigned = facilities.filter((x) => !x.emdCode);
    for (const f of unassigned) expect(f.locationIssue).toBeDefined();
    expect(new Set(meta.locationIssues.map((x) => x.id))).toEqual(new Set(unassigned.map((f) => f.id)));
  });

  it("동작구 15개 행정동 모두 어린이집이 1곳 이상 배정된다", () => {
    for (const e of emds.filter((x) => x.sigunguCode === "11590")) {
      expect(facilities.some((f) => f.emdCode === e.emdCode), e.name).toBe(true);
    }
  });
});
