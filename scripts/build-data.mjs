/**
 * 정규화 데이터 빌드 — scripts/cache의 원자료 3종을 합쳐 화면이 읽는 데이터를 만든다.
 * (향후 Cloud Functions 스케줄 함수가 같은 로직으로 Firestore에 쓰도록 옮길 예정)
 *
 * 입력
 *   cache/seoul-boundaries.geojson   행정동 경계 (fetch-boundaries.mjs)
 *   cache/seoul-population-raw.json  행정동별 0~9세 1세 단위 인구 (fetch-mois-population.mjs)
 *   cache/seoul-childcare-raw.json   서울 어린이집 (fetch-seoul-childcare.mjs)
 * 출력
 *   src/data/seoul/emds.json                 서울 행정동 427개 (코드·이름·라벨 위치·인구·추정 수요)
 *   src/data/seoul/facilities/{sgg}.json     구별 어린이집 (경계 기준으로 행정동 배정)
 *   src/data/seoul/meta.json                 데이터 기준일·출처·위치 오류 집계
 *   public/data/seoul-boundaries.geojson     지도용 단순화 경계
 *
 * 실행: node scripts/build-data.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { bbox, labelPoint, pointInGeometry, simplifyGeometry } from "../src/lib/geo.ts";
import {
  DEMAND_FACTORS,
  FALLBACK_STAFF_RATIO,
  LEGAL_STAFF_RATIO,
  STAFFING_ASSUMPTIONS,
} from "../src/lib/config/assumptions.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, "scripts", "cache");
const OUT = join(ROOT, "src", "data", "seoul");
const PUBLIC_OUT = join(ROOT, "public", "data");

const read = (f) => JSON.parse(readFileSync(join(CACHE, f), "utf-8"));
const boundaries = read("seoul-boundaries.geojson");
const population = read("seoul-population-raw.json");
const childcare = read("seoul-childcare-raw.json");

// ---------------------------------------------------------------------------
// 1. 행정동
// ---------------------------------------------------------------------------
const popByCode = new Map(population.rows.map((r) => [r.code, r]));
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

const emds = boundaries.features.map((f) => {
  const p = f.properties;
  const pop = popByCode.get(p.adm_cd2);
  if (!pop) throw new Error(`인구 데이터에 ${p.adm_nm}(${p.adm_cd2})이 없습니다.`);
  const [lng, lat] = labelPoint(f.geometry);
  const pop0to5 = sum(pop.ages.slice(0, 6));
  const pop6to9 = sum(pop.ages.slice(6, 10));
  const demandFor = (factors, base) =>
    Object.fromEntries(Object.entries(factors).map(([slot, k]) => [slot, Math.round(base * k)]));
  return {
    id: p.adm_cd2,
    emdCode: p.adm_cd2,
    sigunguCode: p.sgg,
    sidoCode: p.sido,
    name: p.adm_nm.split(" ").pop(),
    lat: +lat.toFixed(6),
    lng: +lng.toFixed(6),
    bbox: bbox(f.geometry).map((v) => +v.toFixed(6)),
    totalPopulation: pop.totalPopulation,
    population0to9: sum(pop.ages),
    populationByAge: pop.ages,
    estimatedDemand: {
      infant: demandFor(DEMAND_FACTORS.infant, pop0to5),
      lower_elementary: demandFor(DEMAND_FACTORS.lower_elementary, pop6to9),
    },
  };
});

// ---------------------------------------------------------------------------
// 1-1. 인접 행정동 (경계가 맞닿은 동). 꼭짓점을 약 30m 격자에 넣어 같은 칸·이웃 칸을 공유하면 인접으로 본다.
//      구 경계를 넘는 이웃도 포함한다 (2SFCA·인근 연계용).
// ---------------------------------------------------------------------------
const CELL = 0.0003;
const cellCodes = new Map();
for (const f of boundaries.features) {
  const code = f.properties.adm_cd2;
  const geom = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of geom) for (const ring of poly) for (const [x, y] of ring) {
    const key = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
    if (!cellCodes.has(key)) cellCodes.set(key, new Set());
    cellCodes.get(key).add(code);
  }
}
const neighbors = new Map(boundaries.features.map((f) => [f.properties.adm_cd2, new Set()]));
for (const [key, codes] of cellCodes) {
  const [cx, cy] = key.split(",").map(Number);
  const around = new Set(codes);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    for (const c of cellCodes.get(`${cx + dx},${cy + dy}`) ?? []) around.add(c);
  }
  for (const a of codes) for (const b of around) if (a !== b) {
    neighbors.get(a).add(b);
    neighbors.get(b).add(a);
  }
}
for (const e of emds) e.neighbors = [...neighbors.get(e.emdCode)].sort();

// ---------------------------------------------------------------------------
// 2. 어린이집 → 행정동 배정 (경계 안에 들어가는지로 판정)
// ---------------------------------------------------------------------------
const TYPE_MAP = {
  국공립: "국공립어린이집",
  민간: "민간어린이집",
  가정: "가정어린이집",
  직장: "직장어린이집",
  협동: "협동어린이집",
  "법인·단체등": "법인단체등어린이집",
  사회복지법인: "법인단체등어린이집",
};

const polys = boundaries.features.map((f) => ({
  code: f.properties.adm_cd2,
  sgg: f.properties.sgg,
  geometry: f.geometry,
  bbox: bbox(f.geometry),
}));

function locate(lng, lat) {
  for (const p of polys) {
    const [x0, y0, x1, y1] = p.bbox;
    if (lng < x0 || lng > x1 || lat < y0 || lat > y1) continue;
    if (pointInGeometry([lng, lat], p.geometry)) return p;
  }
  return null;
}

const n = (v) => Number(v) || 0;

/** 재원 아동 연령 구성으로 가중한 법정 교사 1인당 아동 수 (조화평균) */
function weightedLegalRatio(row) {
  let children = 0;
  let teachersNeeded = 0;
  for (const [key, { ratio }] of Object.entries(LEGAL_STAFF_RATIO)) {
    const c = n(row[`CHILD_CNT_${key}`]);
    children += c;
    teachersNeeded += c / ratio;
  }
  if (children === 0) return { ratio: FALLBACK_STAFF_RATIO.ratio, estimated: true };
  return { ratio: +(children / teachersNeeded).toFixed(3), estimated: false };
}

const locationIssues = [];
const facilitiesBySgg = new Map();
const skipped = { paused: 0 };
const unknownTypes = new Set();

for (const row of childcare.rows) {
  // 휴지 시설은 공급에서 뺀다 (그 시간에 문을 닫은 것이 아니라 시설 자체가 쉬는 중)
  if (row.CRSTATUSNAME === "휴지") {
    skipped.paused++;
    continue;
  }
  const sgg = row.STCODE.slice(0, 5);
  const lat = n(row.LA);
  const lng = n(row.LO);
  const hit = lat && lng ? locate(lng, lat) : null;

  let emdCode = null;
  let locationIssue;
  if (!hit) locationIssue = "outside_seoul";
  else if (hit.sgg !== sgg) locationIssue = "outside_sigungu";
  else emdCode = hit.code;
  if (locationIssue) {
    locationIssues.push({ id: row.STCODE, name: row.CRNAME, sigunguCode: sgg, issue: locationIssue, lat, lng, address: row.CRADDR });
  }

  if (!TYPE_MAP[row.CRTYPENAME]) unknownTypes.add(row.CRTYPENAME);
  const spec = (row.CRSPEC || "").split(",").map((s) => s.trim()).filter(Boolean);
  const is24h = spec.includes("24시간");
  const nightOpen = is24h || spec.includes("야간연장형");
  const weekendOpen = is24h || spec.includes("휴일보육");

  // 교사 = 보육교사(A2) + 특수교사(A3). 원장·조리원 등은 아동 배치 인원에서 제외한다.
  const teachersRaw = n(row.EM_CNT_A2) + n(row.EM_CNT_A3);
  const teachers = teachersRaw > 0 ? teachersRaw : Math.max(1, n(row.CHCRTESCNT));
  const { ratio, estimated: ratioEstimated } = weightedLegalRatio(row);
  const capacity = Math.max(0, n(row.CRCAPAT));

  const facility = {
    id: row.STCODE,
    name: row.CRNAME,
    type: TYPE_MAP[row.CRTYPENAME] ?? "민간어린이집",
    targets: ["infant"],
    sigunguCode: sgg,
    emdCode,
    dongId: emdCode ?? `${sgg}-unassigned`,
    address: row.CRADDR,
    lat,
    lng,
    capacity,
    currentEnrollment: n(row.CRCHCNT),
    totalStaff: teachers,
    spec,
    operatingWindows: [
      { timeSlot: "daytime", isOpen: true, staffOnDuty: teachers, staffToChildRatio: ratio },
      {
        timeSlot: "after_school",
        isOpen: true,
        staffOnDuty: Math.max(1, Math.round(teachers * STAFFING_ASSUMPTIONS.afterSchoolStaffShare)),
        staffToChildRatio: ratio,
        estimated: true,
      },
      { timeSlot: "night", isOpen: nightOpen, staffOnDuty: nightOpen ? STAFFING_ASSUMPTIONS.nightStaff : 0, staffToChildRatio: ratio, estimated: true },
      { timeSlot: "weekend", isOpen: weekendOpen, staffOnDuty: weekendOpen ? STAFFING_ASSUMPTIONS.weekendStaff : 0, staffToChildRatio: ratio, estimated: true },
    ],
    ...(ratioEstimated ? { ratioEstimated: true } : {}),
    ...(teachersRaw > 0 ? {} : { teachersEstimated: true }),
    ...(locationIssue ? { locationIssue } : {}),
    phone: row.CRTELNO || undefined,
    approvalDate: row.CRCNFMDT || undefined,
    homepageUrl: (row.CRHOME || "").trim() || `https://iseoul.seoul.go.kr/homepage/main.do?stCode=${row.STCODE}`,
    dataDate: row.DATASTDRDT,
    dataSource: `서울 열린데이터광장 서울시 어린이집 정보(ChildCareInfo), 기준일 ${row.DATASTDRDT}`,
  };
  if (!facilitiesBySgg.has(sgg)) facilitiesBySgg.set(sgg, []);
  facilitiesBySgg.get(sgg).push(facility);
}

// ---------------------------------------------------------------------------
// 3. 출력
// ---------------------------------------------------------------------------
rmSync(join(OUT, "facilities"), { recursive: true, force: true });
mkdirSync(join(OUT, "facilities"), { recursive: true });
mkdirSync(PUBLIC_OUT, { recursive: true });

writeFileSync(join(OUT, "emds.json"), JSON.stringify(emds));
for (const [sgg, list] of facilitiesBySgg) {
  list.sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(join(OUT, "facilities", `${sgg}.json`), JSON.stringify(list));
}

const dataDates = [...new Set(childcare.rows.map((r) => r.DATASTDRDT))].sort();
writeFileSync(
  join(OUT, "meta.json"),
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      sources: {
        boundaries: { version: boundaries.version, url: boundaries.source, attribution: boundaries.attribution },
        population: { baseMonth: population.baseMonth, url: population.source },
        childcare: { dataDate: dataDates.at(-1), url: childcare.source, fetchedAt: childcare.fetchedAt },
      },
      counts: {
        emds: emds.length,
        facilities: [...facilitiesBySgg.values()].reduce((a, l) => a + l.length, 0),
        pausedExcluded: skipped.paused,
        locationIssues: locationIssues.length,
      },
      locationIssues,
    },
    null,
    1
  )
);

writeFileSync(
  join(PUBLIC_OUT, "seoul-boundaries.geojson"),
  JSON.stringify({
    type: "FeatureCollection",
    attribution: boundaries.attribution,
    features: boundaries.features.map((f) => ({
      type: "Feature",
      properties: { code: f.properties.adm_cd2, name: f.properties.adm_nm.split(" ").pop(), sgg: f.properties.sgg },
      geometry: simplifyGeometry(f.geometry, 0.00003),
    })),
  })
);

console.log(
  `행정동 ${emds.length}개, 어린이집 ${[...facilitiesBySgg.values()].reduce((a, l) => a + l.length, 0)}곳 ` +
    `(휴지 제외 ${skipped.paused}곳, 위치 확인 필요 ${locationIssues.length}곳)`
);
if (unknownTypes.size) console.warn("알 수 없는 시설 유형(민간으로 처리):", [...unknownTypes]);
