/**
 * 서울 열린데이터광장 "서울시 어린이집 정보" Open API(SERVICE=ChildCareInfo, 서울 25개 구 전체)에서
 * 어린이집 원자료를 받아 캐시에 저장한다. 1회 최대 1000건이라 페이지를 나눠 받는다.
 *
 * 실행: node --env-file=.env.local scripts/fetch-seoul-childcare.mjs
 * 필요: SEOUL_OPEN_DATA_API_KEY (data.seoul.go.kr 일반 인증키)
 */
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const SERVICE = "ChildCareInfo";
const PAGE = 1000;
const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), "cache", "seoul-childcare-raw.json");

const apiKey = process.env.SEOUL_OPEN_DATA_API_KEY;
if (!apiKey) {
  console.error("SEOUL_OPEN_DATA_API_KEY 환경변수가 없습니다. .env.local에 설정 후 --env-file=.env.local 로 실행하세요.");
  process.exit(1);
}

async function page(start, end) {
  const res = await fetch(`http://openapi.seoul.go.kr:8088/${apiKey}/json/${SERVICE}/${start}/${end}/`);
  const body = (await res.json())[SERVICE];
  if (!body || body.RESULT?.CODE !== "INFO-000") throw new Error(`API 호출 실패 (${start}-${end})`);
  return body;
}

const first = await page(1, PAGE);
const total = first.list_total_count;
const rows = [...first.row];
for (let start = PAGE + 1; start <= total; start += PAGE) {
  rows.push(...(await page(start, Math.min(total, start + PAGE - 1))).row);
}
if (rows.length !== total) throw new Error(`행 수 불일치: ${rows.length}/${total}`);

// 폐지 시설은 제외하고(정상·재개·휴지만 보관), 대시보드가 쓰는 필드만 남겨 캐시 크기를 줄인다.
const KEEP_STATUS = new Set(["정상", "재개", "휴지"]);
const FIELDS = [
  "SIGUNNAME", "STCODE", "CRNAME", "CRTYPENAME", "CRSTATUSNAME", "CRADDR", "CRTELNO", "CRHOME",
  "CHCRTESCNT", "CRCAPAT", "CRCHCNT", "LA", "LO", "CRCNFMDT", "CRSPEC", "DATASTDRDT",
  "CHILD_CNT_00", "CHILD_CNT_01", "CHILD_CNT_02", "CHILD_CNT_03", "CHILD_CNT_04", "CHILD_CNT_05",
  "CHILD_CNT_M2", "CHILD_CNT_M5", "CHILD_CNT_SP", "CHILD_CNT_TOT",
  "EM_CNT_A1", "EM_CNT_A2", "EM_CNT_A3", "EM_CNT_TOT",
];
const kept = rows
  .filter((r) => KEEP_STATUS.has(r.CRSTATUSNAME))
  .map((r) => Object.fromEntries(FIELDS.map((k) => [k, r[k]])));

writeFileSync(
  OUT_PATH,
  JSON.stringify({
    fetchedAt: new Date().toISOString(),
    source: `https://data.seoul.go.kr (SERVICE=${SERVICE}, 서울시 어린이집 정보)`,
    totalCount: total,
    keptStatuses: [...KEEP_STATUS],
    rows: kept,
  })
);
console.log(`Fetched ${rows.length} 어린이집, 운영 중 ${kept.length}곳 보관 -> ${OUT_PATH}`);
