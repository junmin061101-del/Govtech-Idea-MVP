/**
 * 행정안전부 주민등록인구 통계(jumin.mois.go.kr)에서 동작구 15개 행정동의
 * 실제 최신 0~9세/총 인구를 받아와 로컬 캐시 파일로 저장한다.
 *
 * 이 사이트는 별도 인증키가 필요 없는 공개 통계이지만, 폼 기반(JS 동적 select) UI라
 * 브라우저 없이 재현하려면 1) 세션 쿠키 획득 2) 다운로드 엔드포인트(downloadCsvAge.do)에
 * 동일 쿠키로 POST 요청하는 2단계가 필요하다.
 *
 * 실행: node scripts/fetch-mois-population.mjs
 */

import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "cache", "dongjak-population-raw.json");

const BASE = "https://jumin.mois.go.kr";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// 1) 세션 쿠키 획득
const pageRes = await fetch(`${BASE}/ageStatMonth.do`, { headers: { "User-Agent": UA } });
const setCookie = pageRes.headers.get("set-cookie") ?? "";
const cookie = setCookie.split(";")[0];

// 2) 조회 시점(가장 최근 공표월 = 이번 달 또는 지난 달) 결정
const now = new Date();
const year = String(now.getFullYear());
const month = String(now.getMonth() + 1).padStart(2, "0"); // 이번 달 데이터가 없으면 지난 달로 재시도

async function download(y, m) {
  const params = new URLSearchParams({
    sltOrgType: "2",
    sltOrgLvl1: "1100000000", // 서울특별시
    sltOrgLvl2: "1159000000", // 동작구
    gender: "gender",
    sum: "sum",
    sltUndefType: "",
    searchYearStart: y,
    searchMonthStart: m,
    searchYearEnd: y,
    searchMonthEnd: m,
    sltOrderType: "1",
    sltOrderValue: "ASC",
    sltArgTypes: "10",
    sltArgTypeA: "0",
    sltArgTypeB: "9",
    category: "month",
    state: "3", // 전체읍면동현황
  });

  const res = await fetch(`${BASE}/downloadCsvAge.do?searchYearMonth=month&xlsStats=3`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Cookie: cookie,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: params.toString(),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  // CSV는 EUC-KR(CP949) 인코딩으로 내려온다.
  const text = new TextDecoder("euc-kr").decode(buf);
  return text;
}

let csvText = await download(year, month);
if (!csvText.includes("동작구")) {
  // 이번 달 통계가 아직 공표되지 않았으면 지난 달로 재시도
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  csvText = await download(String(prevDate.getFullYear()), String(prevDate.getMonth() + 1).padStart(2, "0"));
}

const lines = csvText.split("\n").filter((l) => l.includes("동작구") && l.includes("("));
const DONG_NAME_MAP = {
  "노량진제1동": "노량진1동",
  "노량진제2동": "노량진2동",
  "상도제1동": "상도1동",
  "상도제2동": "상도2동",
  "상도제3동": "상도3동",
  "상도제4동": "상도4동",
  "흑석동": "흑석동",
  "사당제1동": "사당1동",
  "사당제2동": "사당2동",
  "사당제3동": "사당3동",
  "사당제4동": "사당4동",
  "사당제5동": "사당5동",
  "대방동": "대방동",
  "신대방제1동": "신대방1동",
  "신대방제2동": "신대방2동",
};

const rows = [];
for (const line of lines) {
  // CSV 필드가 전부 큰따옴표로 감싸져 있고 숫자 내부에 천단위 구분 콤마가 있어
  // 단순 split(",")로는 깨지므로 "..." 단위로 추출한다.
  const cols = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1].trim());
  const rawName = cols[0].replace(/서울특별시 동작구 /, "").replace(/\(\d+\)/, "").trim();
  const name = DONG_NAME_MAP[rawName];
  if (!name) continue; // 동작구 합계 행 등은 건너뜀
  const totalPopulation = Number(cols[1].replace(/,/g, ""));
  const population0to9 = Number(cols[3].replace(/,/g, ""));
  rows.push({ name, totalPopulation, population0to9 });
}

if (rows.length !== 15) {
  console.error(`예상과 다른 행 수(${rows.length}/15)가 파싱되었습니다. 사이트 구조가 바뀌었을 수 있습니다.`);
  process.exit(1);
}

writeFileSync(
  OUT_PATH,
  JSON.stringify(
    {
      fetchedAt: new Date().toISOString(),
      source: "https://jumin.mois.go.kr/ageStatMonth.do (행정안전부 주민등록인구, 행정동별 0~9세)",
      rows,
    },
    null,
    2
  )
);

console.log(`Fetched ${rows.length} dong population rows -> ${OUT_PATH}`);
