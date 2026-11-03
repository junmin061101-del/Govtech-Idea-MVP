/**
 * 행정안전부 주민등록인구 통계(jumin.mois.go.kr)에서 서울 전 행정동의 0~9세 1세 단위 인구와 총인구를 받아
 * 캐시에 저장한다. 행마다 10자리 행정기관코드가 붙어 있어 경계 데이터(adm_cd2)와 코드로 연결한다.
 *
 * 인증키가 필요 없는 공개 통계이지만 폼 기반 UI라 1) 세션 쿠키 획득 2) downloadCsvAge.do에 같은 쿠키로
 * POST 하는 2단계가 필요하다. 이번 달 통계가 아직 없으면 지난 달로 재시도한다.
 *
 * 실행: node scripts/fetch-mois-population.mjs
 */
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), "cache", "seoul-population-raw.json");
const BASE = "https://jumin.mois.go.kr";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const SIDO_ORG = "1100000000"; // 서울특별시

const pageRes = await fetch(`${BASE}/ageStatMonth.do`, { headers: { "User-Agent": UA } });
const cookie = (pageRes.headers.get("set-cookie") ?? "").split(";")[0];

async function download(y, m) {
  const params = new URLSearchParams({
    sltOrgType: "2", sltOrgLvl1: SIDO_ORG, sltOrgLvl2: "A", // A = 시도 내 전체 시군구
    gender: "gender", sum: "sum", sltUndefType: "",
    searchYearStart: y, searchMonthStart: m, searchYearEnd: y, searchMonthEnd: m,
    sltOrderType: "1", sltOrderValue: "ASC",
    sltArgTypes: "1", sltArgTypeA: "0", sltArgTypeB: "9", // 1세 단위, 0~9세
    category: "month", state: "3", // 전체 읍면동 현황
  });
  const res = await fetch(`${BASE}/downloadCsvAge.do?searchYearMonth=month&xlsStats=3`, {
    method: "POST",
    headers: { "User-Agent": UA, Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: params.toString(),
  });
  return new TextDecoder("euc-kr").decode(Buffer.from(await res.arrayBuffer())); // CSV는 CP949
}

const now = new Date();
let ym = [now.getFullYear(), now.getMonth() + 1];
let csv = await download(String(ym[0]), String(ym[1]).padStart(2, "0"));
if (!csv.includes("(11")) {
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  ym = [prev.getFullYear(), prev.getMonth() + 1];
  csv = await download(String(ym[0]), String(ym[1]).padStart(2, "0"));
}
const baseMonth = `${ym[0]}-${String(ym[1]).padStart(2, "0")}`;
if (!csv.includes(`${ym[0]}년${String(ym[1]).padStart(2, "0")}월_계_0세`)) throw new Error("CSV 헤더가 예상과 다릅니다(1세 단위 0~9세).");

const num = (s) => Number(s.replace(/,/g, ""));
const rows = [];
for (const line of csv.split("\n")) {
  // 모든 필드가 큰따옴표로 감싸져 있고 숫자에 천단위 콤마가 있어 "..." 단위로 추출한다.
  const cols = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1].trim());
  const m = cols[0]?.match(/^(.*)\((\d{10})\)$/);
  if (!m) continue;
  const code = m[2];
  if (!code.startsWith(SIDO_ORG.slice(0, 2))) continue; // sltOrgLvl2=A는 전국을 돌려준다
  if (code.endsWith("00000")) continue; // 시도·시군구 합계 행
  rows.push({
    code,
    name: m[1].trim().split(/\s+/).pop(),
    totalPopulation: num(cols[1]),
    ages: cols.slice(3, 13).map(num), // 0세 ~ 9세
  });
}
if (rows.length < 400) throw new Error(`행정동 행 수가 너무 적습니다(${rows.length}). 사이트 구조가 바뀌었을 수 있습니다.`);

writeFileSync(
  OUT_PATH,
  JSON.stringify(
    {
      fetchedAt: new Date().toISOString(),
      baseMonth,
      source: "https://jumin.mois.go.kr/ageStatMonth.do (행정안전부 주민등록인구, 행정동별 0~9세 1세 단위)",
      rows,
    },
    null,
    1
  )
);
console.log(`Fetched ${rows.length} 행정동 인구 (${baseMonth}) -> ${OUT_PATH}`);
