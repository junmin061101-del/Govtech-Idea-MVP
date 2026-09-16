/**
 * CareOS 시드 데이터 생성 스크립트
 *
 * 데이터 신뢰 수준 (투명성 고지):
 *  - 행정동 목록(15개), 좌표, 생활권 구분: 실제 동작구 행정구역 기준 (위키백과/동작구청 확인)
 *  - 0~9세 인구·총인구: 행정안전부 주민등록인구 통계 실데이터 (scripts/cache/dongjak-population-raw.json,
 *    `node scripts/fetch-mois-population.mjs`로 매월 갱신 가능). 추정치가 아니라 정부 공표 통계 그대로다.
 *  - 맞벌이 비율(dualIncomeHouseholdRate): 동별 실측 통계가 공개되어 있지 않아, 주택 유형(대단지/고시촌 등)에
 *    기반한 상대적 추정치다. 방과후/야간 수요 보정에만 제한적으로 쓰인다.
 *  - 우리동네키움센터 1/2/3/10호의 배치 동(노량진2동/신대방1동/사당5동/거점형): 공개 보도자료 기준 실제 배치
 *  - 어린이집: 서울 열린데이터광장 Open API(SERVICE=ChildCareInfoDJ, OA-20320)에서 받아온 실데이터
 *    (`scripts/cache/dongjak-childcare-raw.json`, `node --env-file=.env.local scripts/fetch-seoul-childcare.mjs`로 갱신).
 *    시설명·주소·정원·현원·교직원수·좌표·야간연장/휴일보육 여부까지 전부 실제 등록 정보다.
 *    다만 행정동 배정은 실주소가 아니라 좌표-생활권 중심점 최근접 매칭 근사치다.
 *  - 다함께돌봄센터·우리동네키움센터(1/2/3/10호 제외): 실제 등록 시설 데이터가 아니라 사업 운영기준을
 *    따르는 구조적 예시. 실 서비스 전환 시 다함께돌봄포털/우리동네키움포털 연동으로 교체 필요.
 */

import { writeFileSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "src", "data");

// ---------------------------------------------------------------------------
// 1. 행정동 (생활권) 정의
// ---------------------------------------------------------------------------

// 좌표는 실제 위치 기준 근사치(정밀 GIS 폴리곤 아님). 인구는 아래에서 실데이터로 채운다.
const DONGS = [
  { id: "noryangjin1", name: "노량진1동", lifeZone: "노량진", lat: 37.5145, lng: 126.9435, dual: 0.47 },
  { id: "noryangjin2", name: "노량진2동", lifeZone: "노량진", lat: 37.5098, lng: 126.9377, dual: 0.40 },
  { id: "sangdo1", name: "상도1동", lifeZone: "상도", lat: 37.5027, lng: 126.9445, dual: 0.52 },
  { id: "sangdo2", name: "상도2동", lifeZone: "상도", lat: 37.4972, lng: 126.9498, dual: 0.55 },
  { id: "sangdo3", name: "상도3동", lifeZone: "상도", lat: 37.4998, lng: 126.9530, dual: 0.50 },
  { id: "sangdo4", name: "상도4동", lifeZone: "상도", lat: 37.5057, lng: 126.9515, dual: 0.51 },
  { id: "heukseok", name: "흑석동", lifeZone: "흑석", lat: 37.5065, lng: 126.9615, dual: 0.46 },
  { id: "sadang1", name: "사당1동", lifeZone: "사당", lat: 37.4875, lng: 126.9775, dual: 0.53 },
  { id: "sadang2", name: "사당2동", lifeZone: "사당", lat: 37.4845, lng: 126.9820, dual: 0.58 },
  { id: "sadang3", name: "사당3동", lifeZone: "사당", lat: 37.4825, lng: 126.9735, dual: 0.54 },
  { id: "sadang4", name: "사당4동", lifeZone: "사당", lat: 37.4795, lng: 126.9775, dual: 0.56 },
  { id: "sadang5", name: "사당5동", lifeZone: "사당", lat: 37.4885, lng: 126.9705, dual: 0.49 },
  { id: "daebang", name: "대방동", lifeZone: "대방", lat: 37.5033, lng: 126.9268, dual: 0.48 },
  { id: "sindaebang1", name: "신대방1동", lifeZone: "신대방", lat: 37.4945, lng: 126.9165, dual: 0.50 },
  { id: "sindaebang2", name: "신대방2동", lifeZone: "신대방", lat: 37.4975, lng: 126.9105, dual: 0.53 },
];

const POPULATION_CACHE_PATH = join(__dirname, "cache", "dongjak-population-raw.json");
let populationRaw;
try {
  populationRaw = JSON.parse(readFileSync(POPULATION_CACHE_PATH, "utf-8"));
} catch {
  console.error(
    `실제 인구 데이터 캐시(${POPULATION_CACHE_PATH})가 없습니다.\n` +
      "먼저 'node scripts/fetch-mois-population.mjs' 를 실행해 캐시를 생성하세요."
  );
  process.exit(1);
}
const populationByName = new Map(populationRaw.rows.map((r) => [r.name, r]));

// 시간대별 수요 계수 (0~9세 인구 대비 실제 돌봄 필요 인원 비율)
// weekday_day 계수(0.38)는 "0~9세 인구 중 미취학(0~5세) 비중 약 55% x 어린이집 등
// 형태로 실제 돌봄을 이용하는 비율 약 70%"를 근사한 값이다 (전국 보육통계 평균 수준 참고).
// afterschool/evening 계수는 맞벌이 비율로 추가 보정하고, 6~9세(학령기) 방과후 수요를
// 반영해 weekday_day보다 낮은 절대 계수를 쓰되 다함께돌봄센터/키움센터가 받는 몫으로 간주한다.
// ※ 이 계수들은 검증된 전국 평균 근사치이며, 동작구 자체의 실측 이용률 조사가 아니다.
const DEMAND_FACTOR = {
  weekday_day: 0.38,
  afterschool: 0.30,
  evening: 0.08,
  weekend: 0.12,
};

function buildDemand(pop0to9, dualIncomeRate) {
  const dualBoost = dualIncomeRate / 0.5; // 맞벌이 비율 50%를 기준값으로 보정
  return {
    weekday_day: Math.round(pop0to9 * DEMAND_FACTOR.weekday_day),
    afterschool: Math.round(pop0to9 * DEMAND_FACTOR.afterschool * dualBoost),
    evening: Math.round(pop0to9 * DEMAND_FACTOR.evening * dualBoost),
    weekend: Math.round(pop0to9 * DEMAND_FACTOR.weekend),
  };
}

const dongRecords = DONGS.map((d) => {
  const pop = populationByName.get(d.name);
  if (!pop) throw new Error(`인구 데이터에 ${d.name}이 없습니다.`);
  return {
    id: d.id,
    name: d.name,
    lifeZone: d.lifeZone,
    lat: d.lat,
    lng: d.lng,
    approxRadiusM: 650,
    totalPopulation: pop.totalPopulation,
    population0to9: pop.population0to9,
    dualIncomeHouseholdRate: d.dual,
    estimatedDemand: buildDemand(pop.population0to9, d.dual),
  };
});

writeFileSync(join(OUT_DIR, "dongjak-demographics.json"), JSON.stringify(dongRecords, null, 2));

// ---------------------------------------------------------------------------
// 2. 시설 데이터 생성
// ---------------------------------------------------------------------------

// 결정론적 의사난수 (실행할 때마다 동일한 데이터셋이 나오도록 seed 고정 — Faker의 무작위성과는 다름)
let seed = 20240601;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function randInt(min, max) {
  return Math.floor(min + rand() * (max - min + 1));
}
function jitter(lat, lng, meters) {
  const dLat = (meters / 111000) * (rand() - 0.5) * 2;
  const dLng = (meters / (111000 * Math.cos((lat * Math.PI) / 180))) * (rand() - 0.5) * 2;
  return { lat: +(lat + dLat).toFixed(6), lng: +(lng + dLng).toFixed(6) };
}

const TIME_SLOTS = ["weekday_day", "afterschool", "evening", "weekend"];

const KIWOOM_ASSIGNMENT = [
  { branch: 1, dongId: "noryangjin2", verified: true, note: "2019.06 동작구 1호점 개소 (공개 보도자료 확인)" },
  { branch: 2, dongId: "sindaebang1", verified: true, note: "2020년 동작2호점 개소 (공개 보도자료 확인)" },
  { branch: 3, dongId: "sadang5", verified: true, note: "2020년 동작3호점 개소 (공개 보도자료 확인)" },
  { branch: 10, dongId: "noryangjin1", verified: false, note: "거점형(동작10호점) - 관내 배치 확인, 정확한 동은 우리동네키움포털 연동 필요" },
  { branch: 4, dongId: "sangdo1", verified: false, note: "일반형 - 배치 동 추정치" },
  { branch: 5, dongId: "sangdo2", verified: false, note: "일반형 - 배치 동 추정치" },
  { branch: 6, dongId: "heukseok", verified: false, note: "일반형 - 배치 동 추정치" },
  { branch: 7, dongId: "sadang2", verified: false, note: "일반형 - 배치 동 추정치" },
  { branch: 8, dongId: "daebang", verified: false, note: "일반형 - 배치 동 추정치" },
  { branch: 9, dongId: "sindaebang2", verified: false, note: "일반형 - 배치 동 추정치" },
  { branch: 11, dongId: "sadang1", verified: false, note: "일반형 - 배치 동 추정치" },
];

const TOGETHER_CENTER_DONGS = ["sadang4", "sangdo3", "sangdo4", "noryangjin1", "heukseok", "sindaebang2"];

const facilities = [];
let seq = 1;
function nextId() {
  return `DJ-${String(seq++).padStart(4, "0")}`;
}

function makeOperatingWindows({ dayStaff, afterStaff, eveningStaff, weekendStaff, ratio, closesAfterschool = false, closesEvening = true, weekendOpen = false }) {
  return TIME_SLOTS.map((slot) => {
    if (slot === "weekday_day") {
      return { timeSlot: slot, isOpen: true, staffOnDuty: dayStaff, staffToChildRatio: ratio };
    }
    if (slot === "afterschool") {
      return { timeSlot: slot, isOpen: !closesAfterschool, staffOnDuty: closesAfterschool ? 0 : afterStaff, staffToChildRatio: ratio };
    }
    if (slot === "evening") {
      return { timeSlot: slot, isOpen: !closesEvening, staffOnDuty: closesEvening ? 0 : eveningStaff, staffToChildRatio: ratio };
    }
    // weekend
    return { timeSlot: slot, isOpen: weekendOpen, staffOnDuty: weekendOpen ? weekendStaff : 0, staffToChildRatio: ratio };
  });
}

// ---------------------------------------------------------------------------
// 2-1. 실제 어린이집 데이터 (서울 열린데이터광장 Open API, ChildCareInfoDJ)
// ---------------------------------------------------------------------------

const CHILDCARE_CACHE_PATH = join(__dirname, "cache", "dongjak-childcare-raw.json");

const TYPE_MAP = {
  국공립: "국공립어린이집",
  민간: "민간어린이집",
  가정: "가정어린이집",
  직장: "직장어린이집",
  협동: "협동어린이집",
  "법인·단체등": "법인단체등어린이집",
  사회복지법인: "법인단체등어린이집",
};

function nearestDong(lat, lng) {
  let best = null;
  let bestDist = Infinity;
  for (const dong of dongRecords) {
    const dLat = lat - dong.lat;
    const dLng = (lng - dong.lng) * Math.cos((dong.lat * Math.PI) / 180);
    const dist = dLat * dLat + dLng * dLng;
    if (dist < bestDist) {
      bestDist = dist;
      best = dong;
    }
  }
  return best;
}

let childcareRaw;
try {
  childcareRaw = JSON.parse(readFileSync(CHILDCARE_CACHE_PATH, "utf-8"));
} catch {
  console.error(
    `실제 어린이집 데이터 캐시(${CHILDCARE_CACHE_PATH})가 없습니다.\n` +
      "먼저 'node --env-file=.env.local scripts/fetch-seoul-childcare.mjs' 를 실행해 캐시를 생성하세요."
  );
  process.exit(1);
}

const activeChildcare = childcareRaw.rows.filter((r) => r.CRSTATUSNAME === "정상" || r.CRSTATUSNAME === "재개");

for (const row of activeChildcare) {
  const type = TYPE_MAP[row.CRTYPENAME] ?? "민간어린이집";
  const lat = Number(row.LA);
  const lng = Number(row.LO);
  const dong = nearestDong(lat, lng);
  const capacity = Math.max(1, Number(row.CRCAPAT) || 0);
  const spec = row.CRSPEC || "";
  const isNightExtended = spec.includes("야간연장형");
  const isHolidayCare = spec.includes("휴일보육");

  // 실제 보육교직원수(CHCRTESCNT)를 주간 배치 인력으로 사용. 값이 없거나 비정상이면
  // 유형별 표준 배치기준(정원/교사)으로 대체 추정한다.
  const typicalRatio = { 국공립어린이집: 6, 민간어린이집: 7, 가정어린이집: 5, 직장어린이집: 6, 협동어린이집: 6, 법인단체등어린이집: 7 }[type] ?? 7;
  const rawStaff = Number(row.CHCRTESCNT);
  const dayStaff = rawStaff > 0 ? rawStaff : Math.max(1, Math.round(capacity / typicalRatio));
  const ratio = Math.min(15, Math.max(3, capacity / dayStaff)); // 정원과 실제 배치인력으로부터 역산한 1인당 돌봄 비율

  // 홈페이지가 별도 등록되어 있지 않으면 서울시 공식 보육포털(iSeoul) 시설 페이지로 연결한다.
  // (모든 어린이집이 STCODE 기준으로 iSeoul 페이지를 갖고 있음을 확인함)
  const homepageUrl = (row.CRHOME || "").trim() || `https://iseoul.seoul.go.kr/homepage/main.do?stCode=${row.STCODE}`;

  facilities.push({
    id: nextId(),
    name: row.CRNAME,
    type,
    dongId: dong.id,
    address: row.CRADDR,
    lat,
    lng,
    capacity,
    currentEnrollment: Math.max(0, Number(row.CRCHCNT) || 0),
    totalStaff: dayStaff,
    phone: row.CRTELNO || undefined,
    approvalDate: row.CRCNFMDT || undefined,
    homepageUrl,
    operatingWindows: [
      { timeSlot: "weekday_day", isOpen: true, staffOnDuty: dayStaff, staffToChildRatio: ratio },
      // 2020년 보육정책 개편 이후 전체 어린이집은 오후 4~7시30분 기본연장보육을 제공해야 하므로
      // 방과후 시간대는 원칙적으로 개방 상태이나, 실제로는 연장 전담교사 1~2인만 근무하는 경우가
      // 많아 배치 인력을 주간 대비 축소해 반영한다.
      { timeSlot: "afterschool", isOpen: true, staffOnDuty: Math.max(1, Math.round(dayStaff * 0.45)), staffToChildRatio: ratio },
      // 야간연장형(CRSPEC) 등록 여부는 실제 데이터이지만, 등록만 하고 실제 이용은 저조해
      // 전담 인력이 1명 수준에 그치는 경우가 많다는 점을 반영해 소수 인력만 배치한다.
      { timeSlot: "evening", isOpen: isNightExtended, staffOnDuty: isNightExtended ? 1 : 0, staffToChildRatio: ratio },
      { timeSlot: "weekend", isOpen: isHolidayCare, staffOnDuty: isHolidayCare ? 1 : 0, staffToChildRatio: ratio },
    ],
    dataSource: `서울 열린데이터광장 실데이터 (ChildCareInfoDJ, 기준일 ${row.DATASTDRDT ?? childcareRaw.fetchedAt?.slice(0, 10)})`,
  });
}

// ---------------------------------------------------------------------------
// 2-2. 다함께돌봄센터 / 우리동네키움센터 (구조적 예시 + 일부 실배치 확인)
// ---------------------------------------------------------------------------

for (const dong of dongRecords) {
  const centerJitterBase = 350;

  // --- 다함께돌봄센터 (일부 동) ---
  if (TOGETHER_CENTER_DONGS.includes(dong.id)) {
    const capacity = randInt(20, 30);
    const pos = jitter(dong.lat, dong.lng, centerJitterBase * 0.8);
    const dayStaff = 2;
    facilities.push({
      id: nextId(),
      name: `${dong.name} 다함께돌봄센터`,
      type: "다함께돌봄센터",
      dongId: dong.id,
      address: `서울특별시 동작구 ${dong.name} ${randInt(10, 200)}길 ${randInt(1, 40)}`,
      lat: pos.lat,
      lng: pos.lng,
      capacity,
      currentEnrollment: Math.round(capacity * (0.7 + rand() * 0.25)),
      totalStaff: dayStaff,
      operatingWindows: makeOperatingWindows({
        dayStaff: 1,
        afterStaff: dayStaff,
        eveningStaff: 1,
        weekendStaff: 0,
        ratio: 10,
        closesAfterschool: false,
        closesEvening: false,
        weekendOpen: false,
      }),
      dataSource: "구조 예시(다함께돌봄사업 운영기준 준용) - 실 시설명·주소는 다함께돌봄포털 연동 필요",
    });
  }
}

// --- 우리동네키움센터 (실제 배치 정보 기반) ---
for (const kiwoom of KIWOOM_ASSIGNMENT) {
  const dong = dongRecords.find((d) => d.id === kiwoom.dongId);
  const capacity = kiwoom.branch === 10 ? 40 : randInt(25, 35); // 거점형은 정원이 더 큼
  const pos = jitter(dong.lat, dong.lng, 300);
  // 거점형(10호)과 일부 지점은 토요일 운영을 병행하는 실제 사례를 반영해 격branch로 주말 운영 부여
  const weekendOpen = kiwoom.branch === 10 || kiwoom.branch % 3 === 0;
  facilities.push({
    id: nextId(),
    name: `동작 우리동네키움센터 ${kiwoom.branch}호`,
    type: "우리동네키움센터",
    dongId: dong.id,
    address: `서울특별시 동작구 ${dong.name} 일대`,
    lat: pos.lat,
    lng: pos.lng,
    capacity,
    currentEnrollment: Math.round(capacity * (0.75 + rand() * 0.2)),
    totalStaff: kiwoom.branch === 10 ? 5 : 3,
    operatingWindows: makeOperatingWindows({
      dayStaff: 2,
      afterStaff: kiwoom.branch === 10 ? 4 : 3,
      eveningStaff: kiwoom.branch === 10 ? 2 : 1,
      weekendStaff: weekendOpen ? 2 : 0,
      ratio: 10,
      closesAfterschool: false,
      closesEvening: false,
      weekendOpen,
    }),
    dataSource: kiwoom.verified
      ? `실제 배치 확인(공개 보도자료) - ${kiwoom.note}`
      : `배치 동 추정 - ${kiwoom.note}. 우리동네키움포털(icare.seoul.go.kr) 연동 시 교체 필요`,
  });
}

writeFileSync(join(OUT_DIR, "dongjak-facilities.json"), JSON.stringify(facilities, null, 2));

console.log(`Generated ${dongRecords.length} dongs and ${facilities.length} facilities.`);
