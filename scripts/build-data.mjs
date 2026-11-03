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
 *   src/data/seoul/facilities/{sgg}.json     구별 어린이집 (경계 기준으로 행정동 배정) + 그 구 행정동에 자리를
 *                                            나눠 주는 다른 구 시설 (2SFCA 배분 비율 serves 포함)
 *   src/data/seoul/meta.json                 데이터 기준일·출처·위치 오류 집계
 *   public/data/seoul-boundaries.geojson     지도용 단순화 경계
 *
 * 실행: node scripts/build-data.mjs
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { bbox, labelPoint, pointInGeometry, simplifyGeometry } from "../src/lib/geo.ts";
import {
  CATCHMENT,
  TRANSIT,
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
// 2-1. 2SFCA 배분 비율 — 시설마다 반경 안 수요를 행정동별로 모아 비율로 나눈다 (구 경계 무시)
// ---------------------------------------------------------------------------
const LAT_M = 111320;
const LNG_M = 111320 * Math.cos((37.55 * Math.PI) / 180);
const R = CATCHMENT.radiusM;
const TARGET_AGES = { infant: [0, 6], lower_elementary: [6, 10] };
const emdByCode = new Map(emds.map((e) => [e.emdCode, e]));

// (1) 수요 지점: 행정동 안 격자점에 대상 연령 인구를 고르게 나눈다
const demandPoints = [];
for (const f of boundaries.features) {
  const e = emdByCode.get(f.properties.adm_cd2);
  const [x0, y0, x1, y1] = bbox(f.geometry);
  const dLat = CATCHMENT.demandPointSpacingM / LAT_M;
  const dLng = CATCHMENT.demandPointSpacingM / LNG_M;
  const pts = [];
  for (let y = y0 + dLat / 2; y < y1; y += dLat) {
    for (let x = x0 + dLng / 2; x < x1; x += dLng) if (pointInGeometry([x, y], f.geometry)) pts.push([x, y]);
  }
  if (pts.length === 0) pts.push([e.lng, e.lat]);
  const pop = Object.fromEntries(
    Object.entries(TARGET_AGES).map(([t, [a, b]]) => [t, sum(e.populationByAge.slice(a, b)) / pts.length]),
  );
  for (const [x, y] of pts) demandPoints.push({ emd: e.emdCode, x, y, pop });
}
const CELL_M = R;
const cellOf = (x, y) => `${Math.floor((x * LNG_M) / CELL_M)},${Math.floor((y * LAT_M) / CELL_M)}`;
const pointCells = new Map();
for (const p of demandPoints) {
  const k = cellOf(p.x, p.y);
  if (!pointCells.has(k)) pointCells.set(k, []);
  pointCells.get(k).push(p);
}

// (2) 시설별 배분 비율
let crossBorder = 0;
const allFacilities = [...facilitiesBySgg.values()].flat();
for (const f of allFacilities) {
  if (!f.emdCode) continue;
  const cx = Math.floor((f.lng * LNG_M) / CELL_M);
  const cy = Math.floor((f.lat * LAT_M) / CELL_M);
  f.serves = {};
  for (const target of f.targets) {
    const byEmd = new Map();
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const p of pointCells.get(`${cx + dx},${cy + dy}`) ?? []) {
        const d = Math.hypot((p.x - f.lng) * LNG_M, (p.y - f.lat) * LAT_M);
        if (d <= R) byEmd.set(p.emd, (byEmd.get(p.emd) ?? 0) + p.pop[target]);
      }
    }
    const total = [...byEmd.values()].reduce((a, b) => a + b, 0);
    let weights = total > 0 ? [...byEmd].map(([emd, v]) => [emd, v / total]) : [[f.emdCode, 1]];
    // 0.1% 미만은 버리고 합이 1이 되도록 다시 맞춘다
    weights = weights.filter(([, w]) => w >= 0.001);
    const wsum = weights.reduce((a, [, w]) => a + w, 0);
    weights = weights.map(([emd, w]) => [emd, +(w / wsum).toFixed(4)]).sort((a, b) => b[1] - a[1]);
    const drift = +(1 - weights.reduce((a, [, w]) => a + w, 0)).toFixed(4);
    weights[0][1] = +(weights[0][1] + drift).toFixed(4);
    f.serves[target] = weights;
    if (weights.some(([emd]) => emdByCode.get(emd).sigunguCode !== f.sigunguCode)) crossBorder++;
  }
}

// ---------------------------------------------------------------------------
// 2-2. 형평성 — 대중교통 도보권 비율 (캐시가 있을 때만)
// ---------------------------------------------------------------------------
const TRANSIT_CACHE = join(CACHE, "seoul-transit-raw.json");
let transitSource = null;
if (existsSync(TRANSIT_CACHE)) {
  const transit = JSON.parse(readFileSync(TRANSIT_CACHE, "utf-8"));
  transitSource = { url: transit.source, fetchedAt: transit.fetchedAt };
  const subway = transit.subway;
  const bus = transit.bus.filter((b) => !TRANSIT.excludeBusTypes.includes(b.type));
  const gridOf = (list, cellM) => {
    const g = new Map();
    for (const p of list) {
      const k = `${Math.floor((p.lng * LNG_M) / cellM)},${Math.floor((p.lat * LAT_M) / cellM)}`;
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(p);
    }
    return g;
  };
  const near = (grid, cellM, x, y, r) => {
    const cx = Math.floor((x * LNG_M) / cellM);
    const cy = Math.floor((y * LAT_M) / cellM);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const p of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
        if (Math.hypot((p.lng - x) * LNG_M, (p.lat - y) * LAT_M) <= r) return true;
      }
    }
    return false;
  };
  const subwayGrid = gridOf(subway, TRANSIT.subwayM);
  const busGrid = gridOf(bus, TRANSIT.busM);
  const pointsByEmd = new Map();
  for (const p of demandPoints) {
    if (!pointsByEmd.has(p.emd)) pointsByEmd.set(p.emd, []);
    pointsByEmd.get(p.emd).push(p);
  }
  const geomByCode = new Map(boundaries.features.map((f) => [f.properties.adm_cd2, f.geometry]));
  // 지도용 지하철역 (환승역은 호선을 합쳐 한 점으로)
  const stations = new Map();
  for (const st of subway) {
    const k = st.name;
    if (!stations.has(k)) stations.set(k, { name: st.name, routes: [], lat: +st.lat.toFixed(6), lng: +st.lng.toFixed(6) });
    if (!stations.get(k).routes.includes(st.route)) stations.get(k).routes.push(st.route);
  }
  mkdirSync(PUBLIC_OUT, { recursive: true });
  writeFileSync(join(PUBLIC_OUT, "seoul-subway.json"), JSON.stringify({ source: transit.source, fetchedAt: transit.fetchedAt, stations: [...stations.values()] }));
  const subwayNames = (list) => new Set(list.map((s) => s.name)).size; // 환승역은 호선별 행이 있어 역명 기준으로 센다
  for (const e of emds) {
    const pts = pointsByEmd.get(e.emdCode) ?? [];
    let any = 0;
    let sub = 0;
    for (const p of pts) {
      const s = near(subwayGrid, TRANSIT.subwayM, p.x, p.y, TRANSIT.subwayM);
      if (s) sub++;
      if (s || near(busGrid, TRANSIT.busM, p.x, p.y, TRANSIT.busM)) any++;
    }
    const g = geomByCode.get(e.emdCode);
    const [x0, y0, x1, y1] = e.bbox;
    const inside = (p) => p.lng >= x0 && p.lng <= x1 && p.lat >= y0 && p.lat <= y1 && pointInGeometry([p.lng, p.lat], g);
    e.transit = {
      coverage: pts.length ? +(any / pts.length).toFixed(3) : 0,
      subwayCoverage: pts.length ? +(sub / pts.length).toFixed(3) : 0,
      subwayStations: subwayNames(subway.filter(inside)),
      busStops: bus.filter(inside).length,
    };
  }
}

const facilityCount = allFacilities.length;
// (3) 구별 파일에 "그 구 행정동에 자리를 나눠 주는 다른 구 시설"도 함께 넣는다
for (const [sgg, list] of facilitiesBySgg) {
  const own = new Set(list.map((f) => f.id));
  for (const f of allFacilities) {
    if (own.has(f.id) || !f.serves) continue;
    if (Object.values(f.serves).some((ws) => ws.some(([emd]) => emdByCode.get(emd).sigunguCode === sgg))) list.push(f);
  }
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
        facilities: facilityCount,
        pausedExcluded: skipped.paused,
        locationIssues: locationIssues.length,
        crossBorderFacilities: crossBorder,
      },
      transit: transitSource && { ...transitSource, subwayM: TRANSIT.subwayM, busM: TRANSIT.busM },
      catchment: { method: "2SFCA", radiusM: CATCHMENT.radiusM, demandPointSpacingM: CATCHMENT.demandPointSpacingM, demandPoints: demandPoints.length },
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
  `행정동 ${emds.length}개, 어린이집 ${facilityCount}곳 ` +
    `(휴지 제외 ${skipped.paused}곳, 위치 확인 필요 ${locationIssues.length}곳), ` +
    `2SFCA 반경 ${R}m · 수요 지점 ${demandPoints.length}개 · 다른 구에도 자리를 나누는 시설 ${crossBorder}곳`
);
if (unknownTypes.size) console.warn("알 수 없는 시설 유형(민간으로 처리):", [...unknownTypes]);
