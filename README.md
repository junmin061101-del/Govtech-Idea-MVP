# CareOS · 동작구 돌봄 공백 대시보드 (Phase 1 MVP)

지방정부(동작구) 아동돌봄 정책 담당자를 위한 B2G 공공 돌봄 의사결정 지원 시스템입니다.
"시설 정원 부족"이 아니라 "수요·수용력의 시공간적 불일치"를 진단하고, 정책 개입(시설 확충 vs
운영시간 연장 vs 인력 재배치)의 효과를 시뮬레이션합니다.

## 1. 실행 방법

```bash
npm install
cp .env.local.example .env.local   # 아래 2번 참고: 카카오 JavaScript 키 입력
npm run dev
npm test                           # 계산 로직 단위 테스트 (vitest)
```

http://localhost:3000 에서 확인합니다.

## 2. Kakao Maps API 키 설정

1. [Kakao Developers](https://developers.kakao.com) 에서 애플리케이션을 생성합니다.
2. "JavaScript 키"를 발급받아 `.env.local`의 `NEXT_PUBLIC_KAKAO_MAP_API_KEY`에 입력합니다.
3. 앱 설정 > 플랫폼 > Web에 `http://localhost:3000` 을 등록합니다 (미등록 시 지도 로드 실패).

키가 없거나 예시값(`your_kakao_javascript_key_here`)일 경우, 지도 영역에 안내 문구가 표시되고
나머지 화면(진단 패널/시뮬레이터)은 정상 동작합니다.

## 3. 데이터 출처와 신뢰 수준 (투명성 고지)

서울 25개 구 · 427개 행정동 · 운영 중 어린이집 3,919곳을 다룬다. 원자료는 `scripts/cache/`에 스냅샷으로
보관하고, `scripts/build-data.mjs`가 정규화해 `src/data/seoul/`과 `public/data/`에 쓴다.
기준일·건수·위치 오류 목록은 빌드 결과 `src/data/seoul/meta.json`에 함께 기록된다.

### 원자료

| 데이터 | 출처 | 기준 | 비고 |
|---|---|---|---|
| 행정동 경계·코드 | [vuski/admdongkor](https://github.com/vuski/admdongkor) `ver20261001` | 2026-10-01 | 원자료: 통계청 SGIS 행정동 경계 |
| 행정동별 0~9세 1세 단위 인구 | [행정안전부 주민등록인구 통계](https://jumin.mois.go.kr/ageStatMonth.do) | 2026-10 | 인증키 불필요 |
| 어린이집 | [서울 열린데이터광장](https://data.seoul.go.kr) `SERVICE=ChildCareInfo` (서울시 어린이집 정보, 25개 구 전체) | 원자료 `DATASTDRDT` | 일반 인증키 필요 |

행정동은 10자리 행정기관코드(`adm_cd2` = 주민등록인구 CSV의 괄호 안 코드)로 경계·인구를 연결한다.
두 출처의 서울 행정동 427개 코드가 1:1로 일치한다(테스트로 확인).

**경계 데이터 출처 표기(필수)**: 본 데이터는 통계청 통계지리정보서비스(SGIS, https://sgis.kostat.go.kr)에서
공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며(가공: vuski/admdongkor,
https://github.com/vuski/admdongkor), CC BY 4.0으로 배포됩니다.

### 실측과 추정의 구분

| 항목 | 상태 |
|---|---|
| 행정동 경계, 인구, 시설명·주소·좌표·정원·현원·교사 수·시설 특성(야간연장형·휴일보육·24시간) | 실측(공표 자료 그대로) |
| 시설의 행정동 소속 | 좌표가 행정동 경계 안에 있는지로 판정. 좌표가 소속 구 밖이면 배정하지 않고 `meta.json`의 `locationIssues`에 남긴다(현재 24곳, 대부분 시청 좌표로 찍힌 지오코딩 오류) |
| 교사 1인당 아동 수 | 영유아보육법 시행규칙 배치기준(0세 1:3, 1세 1:5, 2세 1:7, 3세 1:15, 4세 이상 1:20, 장애아 1:3)을 재원 아동 연령 구성으로 가중. 혼합반은 **확인 필요(TODO)** |
| 시간대별 이용률 계수 | **추정** — 전국 보육통계 평균 근사치(영유아 주간 0.70, 방과후 0.30, 야간 0.08, 주말 0.12) |
| 방과후·야간·주말의 근무 교사 수 | **추정** — 시간대별 근무 인원 공개 데이터 없음(방과후 = 주간의 45%, 야간·주말 1명) |

모든 기준값과 근거는 [src/lib/config/assumptions.ts](src/lib/config/assumptions.ts) 한 곳에 있다.

### 아직 없는 데이터 (TODO)

- **초등 저학년(6~9세) 돌봄 시설**: 우리동네키움센터·다함께돌봄센터·지역아동센터의 서울 전역 Open API를
  확인하지 못했다(키움센터는 OA-20965 목록만 있고 파일 없음). 확보 전까지 초등 저학년 대상은 비활성.
  기존 MVP의 동작구 키움·다함께 예시 시설(구조 예시 데이터)은 실제 시설이 아니라서 제거했다.
- **이른 아침(07~09)·방학**: 시설별 개원 시각·방학 운영 데이터가 없어 비활성.
- 휴지 시설(69곳)은 공급에서 제외한다.

### 데이터 갱신

```bash
npm run data:fetch   # 원자료 3종 재수집 (.env.local의 SEOUL_OPEN_DATA_API_KEY 필요)
npm run data:build   # 정규화 데이터 재생성
npm test             # 15개 동·경계·배정 검증 포함
```

`SEOUL_OPEN_DATA_API_KEY`는 [data.seoul.go.kr](https://data.seoul.go.kr) 회원가입 후
이용안내 > Open API 소개 > 인증키 신청(일반 인증키)으로 즉시 발급된다.

## 4. 핵심 로직

- `src/lib/calculator.ts` (테스트: `npm test`)
  - `calculateECC()`: `ECC(f,t) = min[공간 수용력(f,t), 인력 수용력(f,t)] × 운영여부(f,t)`
  - `diagnoseDong()`: 생활권 단위 돌봄 공백(Care Gap) 및 3축(공간/시간/인력) 원인 분해(RCA).
    공간 병목은 "완전 가동해도 못 채우는 수요분", 시간/인력 병목은 그 나머지 공백 중 실제
    운영 중단/인력 부족으로 인한 손실분으로 나눠 계산한다.
  - `simulatePolicy()`: 3축 진단과 1:1로 대응하는 3개 레버(정원 확충/연계, 운영시간 연장,
    인력 재배치)를 적용했을 때의 Before/After 비교. 금전적 절감액은 산출하지 않는다.

### 진단-처방 레버 매핑

| RCA 축 | 화면 표시 | 시뮬레이터 레버 |
|---|---|---|
| 공간(정원) | 🏢 공간 | 정원 확충 / 인접 생활권 연계 |
| 시간(운영시간) | 🕐 시간 | 운영시간 연장 적용 |
| 인력(교사 배치) | 👥 인력 | 시간제 돌봄인력 재배치 (확보 가능성은 현장 확인 필요) |

## 5. 지도 설계 참고

지도 레이어 구성은 [PolicyMap Child Care Supply & Demand Map](https://www.policymap.com/newmaps/e/childcaremap)의
구조(생활권 단위 리스크 코로플레스 + 개별 시설 포인트 마커를 한 화면에 중첩, 고정 범례)를 참고해
`src/components/map/KakaoMap.tsx`에서 카카오맵 `Circle`(생활권 위험도) + `MapMarker`(개별 시설)
조합으로 재현했습니다. 위험도는 신호등 색상(빨강=심각/주황=보통/초록=정상) 3단계로 표시됩니다.

## 6. 폴더 구조

```
src/
  app/                    # Next.js App Router 엔트리
  components/             # 지도, 진단 패널, 시뮬레이터
  data/seoul/             # 빌드 결과: emds.json, facilities/{sigungu_code}.json, meta.json
  lib/
    constants/            # 지역 코드(regions), 시간대(timeSlots, 시민 돌봄지도와 공유), 대상(targets)
    config/assumptions.ts # 산정 기준값과 근거
    calculator.ts         # 이용 가능한 자리 / 부족 인원 / 부족한 이유 / 시뮬레이터 순수 함수
    geo.ts                # 경계 안 판정, 라벨 위치, 단순화 (화면·빌드 공용)
  types/
public/data/              # 지도용 단순화 경계 (seoul-boundaries.geojson)
scripts/
  fetch-boundaries.mjs        # 행정동 경계
  fetch-mois-population.mjs   # 행정동별 0~9세 인구
  fetch-seoul-childcare.mjs   # 서울 어린이집
  build-data.mjs              # 정규화
  cache/                      # 원자료 스냅샷 (재현성/오프라인 빌드용)
```
