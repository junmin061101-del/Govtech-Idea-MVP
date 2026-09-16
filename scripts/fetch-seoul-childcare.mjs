/**
 * 서울 열린데이터광장 "서울시 동작구 어린이집 정보" 실시간 Open API에서
 * 실제 시설 데이터를 받아와 로컬 캐시 파일로 저장한다.
 *
 * 실행: node --env-file=.env.local scripts/fetch-seoul-childcare.mjs
 * (SEOUL_OPEN_DATA_API_KEY 환경변수 필요 - data.seoul.go.kr 일반 인증키)
 *
 * 서비스명: ChildCareInfoDJ (동작구 어린이집 정보, OA-20320)
 * 참고: https://data.seoul.go.kr/dataList/OA-20320/S/1/datasetView.do
 */

import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "cache", "dongjak-childcare-raw.json");

const apiKey = process.env.SEOUL_OPEN_DATA_API_KEY;
if (!apiKey) {
  console.error("SEOUL_OPEN_DATA_API_KEY 환경변수가 없습니다. .env.local에 설정 후 --env-file=.env.local 로 실행하세요.");
  process.exit(1);
}

const url = `http://openapi.seoul.go.kr:8088/${apiKey}/json/ChildCareInfoDJ/1/1000/`;

const res = await fetch(url);
const data = await res.json();

const body = data.ChildCareInfoDJ;
if (!body || body.RESULT?.CODE !== "INFO-000") {
  console.error("API 호출 실패:", JSON.stringify(data));
  process.exit(1);
}

writeFileSync(
  OUT_PATH,
  JSON.stringify(
    {
      fetchedAt: new Date().toISOString(),
      source: "https://data.seoul.go.kr/dataList/OA-20320/S/1/datasetView.do (SERVICE=ChildCareInfoDJ)",
      totalCount: body.list_total_count,
      rows: body.row,
    },
    null,
    2
  )
);

console.log(`Fetched ${body.row.length} / ${body.list_total_count} rows -> ${OUT_PATH}`);
