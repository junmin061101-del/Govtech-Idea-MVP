/**
 * 대중교통 위치 수집 — 서울 열린데이터광장
 *  - subwayStationMaster    : 서울시 역사 마스터 정보 (역명·호선·좌표)
 *  - busStopLocationXyInfo  : 서울시 버스정류소 위치정보 (정류소명·유형·좌표)
 * 실행: node --env-file=.env.local scripts/fetch-transit.mjs
 */
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "cache", "seoul-transit-raw.json");
const key = process.env.SEOUL_OPEN_DATA_API_KEY;
if (!key) {
  console.error("SEOUL_OPEN_DATA_API_KEY 환경변수가 없습니다.");
  process.exit(1);
}

async function all(service) {
  const rows = [];
  let total = Infinity;
  for (let start = 1; start <= total; start += 1000) {
    const res = await fetch(`http://openapi.seoul.go.kr:8088/${key}/json/${service}/${start}/${start + 999}/`);
    const body = (await res.json())[service];
    if (!body || body.RESULT?.CODE !== "INFO-000") throw new Error(`${service} 호출 실패 (${start})`);
    total = body.list_total_count;
    rows.push(...body.row);
  }
  if (rows.length !== total) throw new Error(`${service} 행 수 불일치 ${rows.length}/${total}`);
  return rows;
}

const subway = (await all("subwayStationMaster")).map((r) => ({ name: r.BLDN_NM, route: r.ROUTE, lat: +r.LAT, lng: +r.LOT }));
const bus = (await all("busStopLocationXyInfo")).map((r) => ({ id: r.STOPS_NO, name: r.STOPS_NM, type: r.STOPS_TYPE, lat: +r.YCRD, lng: +r.XCRD }));
writeFileSync(
  OUT,
  JSON.stringify({
    fetchedAt: new Date().toISOString(),
    source: "서울 열린데이터광장 subwayStationMaster(역사 마스터), busStopLocationXyInfo(버스정류소 위치)",
    subway,
    bus,
  }),
);
console.log(`지하철 ${subway.length}행, 버스정류소 ${bus.length}곳 -> ${OUT}`);
