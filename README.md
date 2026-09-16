# CareOS · 동작구 돌봄 공백 대시보드 (Phase 1 MVP)

지방정부(동작구) 아동돌봄 정책 담당자를 위한 B2G 공공 돌봄 의사결정 지원 시스템입니다.
"시설 정원 부족"이 아니라 "수요·수용력의 시공간적 불일치"를 진단하고, 정책 개입(시설 확충 vs
운영시간 연장 vs 인력 재배치)의 효과를 시뮬레이션합니다.

## 1. 실행 방법

```bash
npm install
cp .env.local.example .env.local   # 아래 2번 참고: 카카오 JavaScript 키 입력
npm run dev
```

http://localhost:3000 에서 확인합니다.

## 2. Kakao Maps API 키 설정

1. [Kakao Developers](https://developers.kakao.com) 에서 애플리케이션을 생성합니다.
2. "JavaScript 키"를 발급받아 `.env.local`의 `NEXT_PUBLIC_KAKAO_MAP_API_KEY`에 입력합니다.
3. 앱 설정 > 플랫폼 > Web에 `http://localhost:3000` 을 등록합니다 (미등록 시 지도 로드 실패).

키가 없거나 예시값(`your_kakao_javascript_key_here`)일 경우, 지도 영역에 안내 문구가 표시되고
나머지 화면(진단 패널/시뮬레이터)은 정상 동작합니다.

## 3. 데이터 신뢰 수준 (투명성 고지)

`scripts/generate-data.mjs`가 `src/data/dongjak-*.json`을 생성합니다. Faker류의 완전 무작위
데이터가 아니라, 아래와 같이 실제 공개 정보를 앵커로 삼아 통계적으로 합리적인 범위 내에서
구조화한 시드 데이터입니다.

| 항목 | 신뢰 수준 |
|---|---|
| 행정동 15개 목록·생활권 구분 | 실제 동작구 행정구역 (2008년 본동→노량진1동 통합 반영) |
| 행정동 좌표 | 실제 위치 기준 근사치 (정밀 GIS 폴리곤 아님) |
| 상도1동(48,317명)·사당5동(13,207명) 인구 | 2020년 공개 통계 실측치 |
| 그 외 동 인구·0~9세 비율 | 위 두 값을 앵커로 한 보간 추정치 |
| **어린이집 148개소 전체(시설명·주소·좌표·정원·현원·교직원수·야간연장/휴일보육 여부)** | **서울 열린데이터광장 Open API 실시간 연동 (`SERVICE=ChildCareInfoDJ`, OA-20320). `scripts/cache/dongjak-childcare-raw.json`에 스냅샷 보관** |
| 어린이집의 행정동 소속 | 실주소 대신 좌표-생활권 중심점 최근접 매칭으로 배정한 근사치 |
| 어린이집의 시간대별 배치 인력 수 | 주간은 실제 교직원수(CHCRTESCNT) 그대로 사용. 방과후/야간/주말 배치 인력은 "등록은 되어 있으나 실제 전담 인력은 소수"라는 정책 현실을 반영한 추정치 |
| 우리동네키움센터 1/2/3호, 거점형(10호) 배치 | 공개 보도자료 기준 실제 배치 |
| 우리동네키움센터 4~9,11호 배치 동 | 관내 배치는 사실이나 정확한 동은 추정치 |
| 다함께돌봄센터 시설명·정원·현원·교사수 | 사업 운영기준을 준용한 구조적 예시. 실 서비스 전환 시 다함께돌봄포털 연동으로 교체 필요 |

### 실데이터 갱신 방법

```bash
node --env-file=.env.local scripts/fetch-seoul-childcare.mjs   # 최신 어린이집 데이터 재수집
node scripts/generate-data.mjs                                  # 시드 데이터 재생성
```

`SEOUL_OPEN_DATA_API_KEY`는 [data.seoul.go.kr](https://data.seoul.go.kr) 회원가입 후
이용안내 > Open API 소개 > 일반 인증키 신청으로 즉시 발급받을 수 있습니다.

다함께돌봄센터/우리동네키움센터(4~9,11호)도 각각 다함께돌봄포털, 우리동네키움포털
(icare.seoul.go.kr) Open API 연동으로 교체 가능합니다.

## 4. 핵심 로직

- `src/lib/calculator.ts`
  - `calculateECC()`: 유효 돌봄 수용력 = min(공간, 인력, 시간 수용력) × 접근성 가중치
  - `diagnoseDong()`: 생활권 단위 돌봄 공백(Care Gap) 및 3축(공간/시간/인력) 원인 분해(RCA)
  - `simulatePolicy()`: 운영시간 연장·인력 재배치 개입 시뮬레이션 (Before/After, 예상 절감 예산)

## 5. 지도 설계 참고

지도 레이어 구성은 [PolicyMap Child Care Supply & Demand Map](https://www.policymap.com/newmaps/e/childcaremap)의
구조(생활권 단위 리스크 코로플레스 + 개별 시설 포인트 마커를 한 화면에 중첩, 고정 범례)를 참고해
`src/components/map/KakaoMap.tsx`에서 카카오맵 `Circle`(생활권 위험도) + `MapMarker`(개별 시설)
조합으로 재현했습니다. 위험도는 신호등 색상(빨강=심각/주황=보통/초록=정상) 3단계로 표시됩니다.

## 6. 폴더 구조

```
src/
  app/                 # Next.js App Router 엔트리
  components/
    map/KakaoMap.tsx   # 카카오맵 + 위험도 레이어 + 시설 마커
    panel/SidePanel.tsx        # 생활권 진단 패널 (공백 스코어, 3축 병목, AI 정책 처방)
    simulator/PolicySimulator.tsx  # 정책 시뮬레이터 (슬라이더, Before/After)
    TopController.tsx  # 시간대 필터
  data/                # 시드 데이터 (dongjak-demographics.json, dongjak-facilities.json)
  lib/calculator.ts    # ECC/Care Gap/RCA/시뮬레이터 순수 함수
  types/               # 도메인 타입 정의
scripts/generate-data.mjs  # 시드 데이터 생성 스크립트
```
