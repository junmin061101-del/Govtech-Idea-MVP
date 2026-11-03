/**
 * 행정동 경계 수집 — vuski/admdongkor GeoJSON에서 서울특별시(sido=11) 행정동만 추려 캐시에 저장한다.
 *
 * 출처: 통계청 통계지리정보서비스(SGIS, https://sgis.kostat.go.kr) 행정동 경계(공공누리 제1유형)를
 *       vuski/admdongkor(https://github.com/vuski/admdongkor)가 가공·배포(CC BY 4.0).
 * 버전은 아래 VERSION으로 고정한다(행정동 개편 시 새 버전으로 올리고 테스트를 다시 돌린다).
 *
 * 실행: node scripts/fetch-boundaries.mjs
 */
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const VERSION = "ver20261001";
const SIDO_CODES = ["11"];
const URL_ = `https://raw.githubusercontent.com/vuski/admdongkor/master/${VERSION}/HangJeongDong_${VERSION}.geojson`;
const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), "cache", "seoul-boundaries.geojson");

const res = await fetch(URL_);
if (!res.ok) throw new Error(`경계 다운로드 실패: ${res.status} ${URL_}`);
const all = await res.json();
const features = all.features
  .filter((f) => SIDO_CODES.includes(f.properties.sido))
  .map((f) => ({ type: "Feature", properties: f.properties, geometry: f.geometry }));

writeFileSync(
  OUT_PATH,
  JSON.stringify({
    type: "FeatureCollection",
    source: URL_,
    version: VERSION,
    attribution:
      "통계청 SGIS 행정동 경계(공공누리 제1유형)를 vuski/admdongkor가 가공(CC BY 4.0)",
    fetchedAt: new Date().toISOString(),
    features,
  })
);
console.log(`Saved ${features.length} 행정동 경계 (${VERSION}) -> ${OUT_PATH}`);
