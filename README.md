# 우리 구 돌봄 공백 지도 (CareOS MVP)

서울 자치구 보육 담당 주무관·팀장이 "어디가, 몇 시에, 몇 명 부족하고, 왜 그런지"를 바로 읽을 수 있게 하는 지도입니다.
"시설 정원 부족"이 아니라 "수요·수용력의 시공간적 불일치"를 진단하고, 정책 개입(시설 확충 vs
운영시간 연장 vs 인력 재배치)의 효과를 시뮬레이션합니다.

## 1. 실행 방법

```bash
npm install
cp .env.local.example .env.local   # 아래 2번 참고: 카카오 JavaScript 키 입력
npm run dev
npm test                           # 계산 로직 단위 테스트 (vitest)
npm run test:rules                 # Firestore 보안 규칙 테스트 (에뮬레이터, Java 필요)
npm run test:e2e                   # 로그인·권한·저장 종단 검증 (에뮬레이터)
```

http://localhost:3000 에서 확인합니다.

## 2. Kakao Maps API 키 설정

1. [Kakao Developers](https://developers.kakao.com) 에서 애플리케이션을 생성합니다.
2. "JavaScript 키"를 발급받아 `.env.local`의 `NEXT_PUBLIC_KAKAO_MAP_API_KEY`에 입력합니다.
3. 앱 설정 > 플랫폼 > Web에 `http://localhost:3000` 을 등록합니다 (미등록 시 지도 로드 실패).

키가 없거나 예시값(`your_kakao_javascript_key_here`)일 경우, 지도 영역에 안내 문구가 표시되고
나머지 화면(진단 패널/시뮬레이터)은 정상 동작합니다.

## 2-1. Firebase (로그인·구별 권한·저장)

모든 화면은 서버 없이 동작하는 정적 파일(`next build` → `out/`)이라 **Firebase Hosting**에 올린다.
공개 데이터(시설·인구·경계·계산 결과)는 정적 파일로, 구청 데이터(판단 이력·입소 대기 집계)만 Firestore에 둔다.
Firebase 설정값이 없으면 **시연 모드**(구청 데이터는 이 브라우저에만 저장)로 동작한다. App Check는 이번 단계에서 적용하지 않았다.

| 역할 (Custom Claims) | 권한 |
|---|---|
| `district_admin` + `sigungu_code` | 자기 구 읽기·쓰기 (판단 저장·삭제, 입소 대기 집계 저장) |
| `district_viewer` + `sigungu_code` | 자기 구 읽기 |
| `careos_admin` | 전체 |
| (없음 / 로그인 안 함) | 공개 데이터만 (시연 모드, `/demo`) |

보안 규칙은 [firestore.rules](firestore.rules) (기본 거부, 판단 이력 수정 불가, 입소 대기는 집계 필드만, 작성자·시각 조작 불가).

### 처음 한 번 설정

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트 2개를 만든다: 개발용, 운영용 (예: `careos-dev`, `careos-prod`).
2. 각 프로젝트에서
   - **Firestore 데이터베이스 만들기** → 위치 `asia-northeast3 (서울)`, 프로덕션 모드
   - **Authentication → 로그인 방법 → 이메일/비밀번호 → 이메일 링크(비밀번호 없는 로그인)** 사용 설정
   - **Authentication → 설정 → 승인된 도메인**에 배포 도메인 추가 (`<프로젝트>.web.app`, 사용자 지정 도메인)
   - **프로젝트 설정 → 내 앱 → 웹 앱 추가** → 나오는 `apiKey`, `authDomain`, `projectId`, `appId`를 `.env.local`의 `NEXT_PUBLIC_FIREBASE_*`에 넣는다
3. [.firebaserc](.firebaserc)의 `TODO-careos-dev`, `TODO-careos-prod`를 실제 프로젝트 ID로 바꾼다.
4. 카카오 개발자 콘솔 → 앱 → 플랫폼 → Web에 배포 도메인을 등록한다.
5. 규칙·인덱스 배포: `npx firebase login` 후 `npx firebase deploy --only firestore:rules,firestore:indexes --project dev`

### 담당자 권한 부여

담당자가 `/login`에서 한 번 로그인하면 계정이 생긴다. 그다음 CareOS 관리자가 서비스 계정 키로 역할을 준다.

```bash
export GOOGLE_APPLICATION_CREDENTIALS=~/careos-prod-sa.json FIREBASE_PROJECT_ID=careos-prod
node scripts/set-user-role.mjs jumin@dongjak.go.kr district_admin 11590
node scripts/set-user-role.mjs viewer@dongjak.go.kr district_viewer 11590
node scripts/set-user-role.mjs someone@dongjak.go.kr none          # 권한 회수
```

### 배포

- 수동: `npm run build && npx firebase deploy --only hosting --project prod`
- 자동: [.github/workflows/firebase-deploy.yml](.github/workflows/firebase-deploy.yml) — PR은 개발 프로젝트 미리보기 채널, `main` push는 운영 배포 + 규칙·인덱스 배포.
  GitHub Secrets: `FIREBASE_SERVICE_ACCOUNT_DEV`, `FIREBASE_SERVICE_ACCOUNT_PROD`, `NEXT_PUBLIC_KAKAO_MAP_API_KEY`,
  `FIREBASE_WEB_CONFIG_DEV`, `FIREBASE_WEB_CONFIG_PROD`(각각 `NEXT_PUBLIC_FIREBASE_*=값` 네 줄)
- Vercel은 Firebase 운영 배포를 확인한 뒤 새 주소로 리디렉션하고 내린다.

### 로컬 검증 (Firebase 프로젝트 없이)

```bash
npm run test:rules      # Firestore 보안 규칙 테스트 (에뮬레이터)
npm run test:e2e        # 에뮬레이터 종단 검증: 이메일 링크 로그인 → 역할 부여 → 판단 저장 → 다른 구·조회 권한 막힘
npm run dev:emulators   # 에뮬레이터에 붙은 개발 서버 (로그인 링크는 에뮬레이터가 출력)
```

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
| 지하철역·버스정류소 위치 | 서울 열린데이터광장 `subwayStationMaster`(역사 마스터), `busStopLocationXyInfo`(버스정류소 위치) | 수집일 | 형평성 층(대중교통 도보권). 한강선착장 제외 |

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
npm run data:build   # 정규화 데이터 재생성 (경계·인구·시설, 2SFCA 배분 비율)
npm run data:snapshot  # 그 달 스냅샷 저장 (시점 비교용, 이미 있는 달은 덮어쓰지 않음)
npm test             # 15개 동·경계·배정 검증 포함
```

`SEOUL_OPEN_DATA_API_KEY`는 [data.seoul.go.kr](https://data.seoul.go.kr) 회원가입 후
이용안내 > Open API 소개 > 인증키 신청(일반 인증키)으로 즉시 발급된다.

## 4. 핵심 로직

| 화면 | 코드 | 내용 |
|---|---|---|
| 이용 가능한 자리 | `calculator.calculateECC` | 시설별 `min(정원, 그 시간 근무 교사 × 교사 1명당 아동 수) × 운영 여부`, 정수로 내림 |
| 인근 지역과 자리 나눠 쓰기 (2SFCA) | `scripts/build-data.mjs`, `calculator.allocationWeight` | 시설마다 반경 1km(`config/assumptions.ts`의 `CATCHMENT`) 안 수요를 행정동별로 모아, 그 비율만큼 자리를 나눠 준다. **구 경계를 넘는 이용 포함.** 행정동 안 인구는 약 200m 격자점에 고르게 나눠 놓는다(집계구 인구 확보 시 교체). 비율은 대상 연령 인구 분포로만 정해져 빌드 때 미리 계산해 시설의 `serves`에 저장 |
| 부족 인원 | `calculator.diagnoseDong` | `max(0, 추정 수요 − Σ(배분 비율 × 시설별 이용 가능한 자리))`, 동 합계는 정수로 반올림 |
| 부족한 이유 | `calculator.diagnoseDong`, `explain.explainGap` | 자리가 없어서 = 모든 시설이 정원만큼 받아도 남는 부족. 나머지를 문을 닫아서 / 선생님이 없어서로 "못 받는 자리" 비율만큼 나눔. 칸별 인원은 합이 부족 인원과 같도록 정수화 |
| 대안 비교 | `alternatives.buildAlternatives` | 운영시간 연장(닫은 시설 열기), 시간제 교사 배치, 인근 연계·정원 확충. 효과는 시설 정보를 바꾼 뒤 다시 계산한 값이고, 여러 대안을 합친 효과도 함께 적용해 다시 계산한다 |
| 대안 비용 | `config/unitCosts.ts` | **출처가 있는 단가로 계산되는 비용만** 표시. 지금은 시간제 교사 인건비 하한(2026 최저임금)만 해당. 연장반·신규 정원 단가는 출처가 없어 계산·표시하지 않으며, 출처를 확보하면 이 파일에 값·출처·기준연도를 넣는다 |

처방 문구는 시간대마다 `timeSlots.extendAction`(주말 → 주말 운영, 방학 → 방학 프로그램 운영, 야간 → 야간 연장 운영)으로
만들고, 6개 시간대 모두에서 다른 시간대 표현이 섞이지 않는지 테스트한다.

2SFCA 때문에 한 시설에서 늘린 자리는 반경 안 여러 동이 나눠 쓴다. 대안 카드의 "줄어드는 인원"은 선택한 동 몫이고,
다른 동 몫은 "인근 동에도 자리 N명이 함께 늘어납니다"로 따로 보여 준다.
인근 연계 카드는 경계가 맞닿은 같은 구 행정동의 여유 자리(이용 가능한 자리 − 추정 수요)를 쓴다.

구별 시설 파일(`src/data/seoul/facilities/{sigungu_code}.json`)에는 그 구 시설과 함께, 그 구 행정동에 자리를
나눠 주는 다른 구 시설도 들어 있다(집계에만 쓰고 지도에는 그 구 시설만 표시).

### 미충족 수요 층 (부모 검색 신호)

시민 돌봄지도의 **집계 결과만** 읽는다(개인 단위 이벤트는 대시보드로 오지 않음). 이벤트 코드와 집계 스키마는
[src/lib/constants/events.ts](src/lib/constants/events.ts) (시민 앱과 공유할 초안, 확정 필요).

| 이벤트 | 뜻 |
|---|---|
| `search` / `search_no_result` / `search_widened` | 검색(같은 기기 반복은 하루 1건) / 결과 없음(신청 전 포기) / 범위 넓힌 재검색 |
| `apply_exit` | 신청 도우미 6단계 중 멈춘 단계 (신청 중 이탈) |
| `vacancy_register` / `vacancy_resolved` | 빈자리 알림 등록 / 해소 (명시적 수요) |

분석 칸은 **행정동 × 시간대 × 대상 × 분기**. 행정동 단위로 칸이 늘어나(동작구 120칸) 표시 기준을 2단계로 둔다
([config/assumptions.ts](src/lib/config/assumptions.ts) `UNMET_THRESHOLDS`, 최소 표본 n = z²·p(1−p)/e², p = 0.5, 신뢰수준 90%).

| 분기 검색 수 | 표시 |
|---|---|
| 75건 이상 | 수치 표시 (결과 없음 비율 오차 ±10%p, 최소 68건 + 여유분 — 사업계획서 기준) |
| 35~74건 | 참고 수치 `*` (오차 ±15%p, 최소 31건 + 여유분) |
| 35건 미만 | 표본 부족 (숨김) |

공백 신호(⚠): 75건 이상인 칸에서 결과 없음 비율 30% 이상이 2개월 연속.

**지금 데이터는 시연용 가상 데이터다** (`src/data/seoul/unmet-demand/11590.json`, `npm run data:mock-unmet`로 생성,
`synthetic: true`). 화면에 "시연용 가상 데이터"를 항상 표시한다. 시민 돌봄지도 출시 후 실제 집계로 교체한다.

### 리포트·판단 이력·시점 비교

| 화면 | 내용 |
|---|---|
| `/report` | 월(운영 조정)·분기(돌봄협의체)·연(예산 편성 전) 템플릿. **PDF는 "PDF로 저장(인쇄)" 버튼 → 브라우저 인쇄 대화상자에서 "PDF로 저장"**, 엑셀은 .xlsx 내려받기(exceljs). 지역 순위, 지역별 부족 인원과 이유, 선택한 대안과 효과, 데이터 기준일·출처를 담고, 분기는 시간대별 표·부모 검색 신호, 연은 이유별 합계(예산 항목 근거)·시점 비교를 더한다. 내용은 [src/lib/report.ts](src/lib/report.ts) 한 곳에서 만들어 PDF와 엑셀 숫자가 같다 |
| 대안 비교 → "이 판단 저장" | 작성자·메모와 함께 대안 조합을 저장. 저장 당시 숫자와 데이터 기준일도 함께 남긴다 |
| `/history` | 저장한 판단 목록, "다시 열기"(같은 동·시간대·대안 선택 상태로 지도 화면 복원), 리포트, 삭제, **JSON 내보내기·가져오기(인수인계용)**. 지금은 브라우저 저장 — Firebase 이전 후 구별 권한이 있는 서버 저장으로 바꾼다 |
| `/compare` | 월별 스냅샷(`src/data/seoul/snapshots/`)으로 같은 동의 부족 인원 추이 비교. 과거 달 수치는 만들어 넣지 않으므로 다음 달 갱신부터 전후 비교가 가능하다 |

화면 상태(구·시간대·대상·동·선택한 대안·지도 층)는 주소 쿼리에 담겨(`src/lib/viewState.ts`) 링크로 같은 화면을 공유할 수 있다.

### 형평성 층·입소 대기 대조

- **대중교통 접근성 (실데이터)**: 행정동 안 수요 지점(200m 격자) 중 지하철역 500m 또는 버스정류소 300m 안에 드는 비율.
  반경은 **가정값(TODO: 기준 확인)** — [config/assumptions.ts](src/lib/config/assumptions.ts) `TRANSIT`.
  지도 왼쪽 위 "형평성 · 대중교통"을 켜면 도보권 90% 미만 동에 점선 테두리, 지하철역 표시, 라벨에 도보권 비율이 붙는다.
  인구를 동 안에 고르게 놓고 계산해 산지·공원이 넓은 동은 낮게 나올 수 있다.
- **취약가구 비중 (TODO)**: 서울 열린데이터광장의 "국민기초 생활보장 수급자(동별)" 통계는 동 단위이지만 Open API·내려받기 파일이
  제공되지 않는다. 구청 자료로 확보한 뒤 연결한다(지도 버튼은 비활성).
- **입소 대기 대조 (`/waitlist`)**: 보육통합정보시스템의 행정동 × 연령별 대기 인원 **집계** CSV를 올리면 주간(09~17) 영유아 기준
  추정 수요·추정 부족·결과 없음 검색과 나란히 보여 준다. 형식은 `행정동코드,행정동명,연령,대기인원`(긴 형식) 또는
  `행정동명,0세,…,5세`(넓은 형식), 화면에서 견본 CSV를 받을 수 있다. **개인 식별 정보로 보이는 열(이름·생년월일·연락처·주소 등)이나 값
  (주민등록번호·휴대전화·이메일 형식)이 있으면 파일 전체를 거부**하고, 같은 동·연령이 여러 행이면 개인 단위 명단일 수 있어 거부한다.
  파일은 브라우저 안에서만 읽고 서버로 보내지 않는다. 구청 관리자 전용 제한은 로그인 연동 후 적용(TODO).

## 5. 지도 설계

- **단계구분도**: 행정동 경계(`public/data/seoul-boundaries.geojson`)를 카카오맵 `Polygon`으로 칠한다.
  색은 부족 비율(부족 인원 ÷ 추정 수요) 5단계(빨강, 10/20/30/50% 구간) + 충족(회색, 여유 10% 미만) +
  여유 있음(파랑, 자리가 수요보다 10% 이상 많음). 구간 정의는 [src/lib/mapScale.ts](src/lib/mapScale.ts).
- **라벨**: 동 이름 + 부족 인원. 줌 레벨 6 이하 전체, 7~8은 부족 상위 5개 동과 선택한 동, 그보다 넓으면 선택한 동만.
- **시설 점**: 선택한 시간대에 운영 중(진한 점) / 운영 안 함(빈 점). 줌 레벨 6 이상에서 묶어(클러스터) 표시.
- **지도 층 전환**: 추정 수요 | 부모 검색 신호(결과 없음 비율, 주황 5단계 + 표본 부족 회색) | 둘 다(라벨 둘째 줄에 검색 신호).
  시민 돌봄지도 집계가 없는 구는 추정 수요만 선택 가능.
- **순위 목록**: 지도 옆에 그 구의 모든 행정동을 부족 인원 순으로 나열(부족 비율, 주된 이유 아이콘).
  지도에서 안 보이는 동도 목록에서 반드시 찾을 수 있다(25개 구 전체 테스트).
- 구를 바꾸면 그 구의 모든 행정동이 화면에 들어오도록 범위를 맞춘다.

## 6. 폴더 구조

```
src/
  app/                    # Next.js App Router: / (지도), /report, /history, /compare, /waitlist, /login, /demo
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
