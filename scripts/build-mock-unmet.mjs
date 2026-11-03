/**
 * 시연용 가상 "부모 검색 신호" 집계 생성 — 시민 돌봄지도 출시 전 화면을 보여 주기 위한 데이터.
 * 실제 이용 데이터가 아니다. 출력 파일에 synthetic: true를 넣고, 화면에 "시연용 가상 데이터"를 표시한다.
 *
 * 생성 규칙 (결정적 난수, 실행할 때마다 같은 결과)
 *  - 분기 검색 수: 구 전체 분기 6,000건을 행정동 0~9세 인구 비중 × 시간대 비중 × 대상 비중으로 나누고,
 *    동마다 0.5~1.5배 "스마트폰 이용 편차"를 곱한다 (검색 신호가 특정 지역에 치우칠 수 있음을 보여 주기 위함)
 *  - 결과 없음 비율: 영유아는 그 시간 공급 부족 비율(2SFCA 배분 기준)에 비례 + 잡음, 초등 저학년은 25% 안팎
 *  - 월별 3개월 분할, 빈자리 알림 대기, 신청 도우미 단계별 이탈을 함께 만든다
 *
 * 실행: node scripts/build-mock-unmet.mjs [sigungu_code ...]   (기본: 11590 동작구)
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "src", "data", "seoul");
const OUT = join(DATA, "unmet-demand");
const QUARTER = "2026-Q3";
const MONTHS = ["2026-07", "2026-08", "2026-09"];
const QUARTER_SEARCHES = 6000;
const SLOT_SHARE = { daytime: 0.35, after_school: 0.3, night: 0.2, weekend: 0.15 };
const TARGET_SHARE = { infant: 0.7, lower_elementary: 0.3 };
const STEPS = ["conditions", "compare", "eligibility", "documents", "submit", "waitlist"];
const STEP_WEIGHT = [0.12, 0.26, 0.22, 0.16, 0.08, 0.16];

let seed = 20261103;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed / 0x7fffffff);
const noise = (sd) => (rand() + rand() + rand() - 1.5) * sd * 2; // 근사 정규
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const sigungus = process.argv.slice(2).length ? process.argv.slice(2) : ["11590"];
const emds = JSON.parse(readFileSync(join(DATA, "emds.json"), "utf-8"));
mkdirSync(OUT, { recursive: true });

for (const sgg of sigungus) {
  const dongs = emds.filter((e) => e.sigunguCode === sgg);
  // 이 구 행정동에 자리를 나눠 주는 다른 구 시설까지 포함 (2SFCA)
  const facilities = JSON.parse(readFileSync(join(DATA, "facilities", `${sgg}.json`), "utf-8")).filter((f) => f.emdCode);
  const popTotal = dongs.reduce((a, d) => a + d.population0to9, 0);
  const cells = [];
  for (const d of dongs) {
    const bias = 0.5 + rand(); // 스마트폰 이용 편차
    for (const [slot, slotShare] of Object.entries(SLOT_SHARE)) {
      // 공급 부족 비율 — 대시보드와 같은 2SFCA 배분 비율(serves)로 근사
      const seats = facilities.reduce((a, f) => {
        const share = (f.serves?.infant ?? []).find(([emd]) => emd === d.emdCode)?.[1] ?? 0;
        if (!share) return a;
        const w = f.operatingWindows.find((x) => x.timeSlot === slot);
        return a + share * (w?.isOpen ? Math.floor(Math.min(f.capacity, w.staffOnDuty * w.staffToChildRatio)) : 0);
      }, 0);
      const demand = d.estimatedDemand.infant[slot] ?? 0;
      const gapRatio = demand > 0 ? Math.max(0, 1 - seats / demand) : 0;

      for (const [target, targetShare] of Object.entries(TARGET_SHARE)) {
        const expected = QUARTER_SEARCHES * (d.population0to9 / popTotal) * slotShare * targetShare * bias;
        const searches = Math.max(0, Math.round(expected * (1 + noise(0.2))));
        const rate =
          target === "infant" ? clamp(0.06 + 0.55 * gapRatio + noise(0.05), 0.02, 0.85) : clamp(0.25 + noise(0.06), 0.05, 0.6);
        // 월별 분할
        const parts = [1 + noise(0.15), 1 + noise(0.15), 1 + noise(0.15)].map((x) => Math.max(0.2, x));
        const ps = parts.reduce((a, b) => a + b, 0);
        let left = searches;
        const monthly = MONTHS.map((month, i) => {
          const s = i === 2 ? left : Math.round((searches * parts[i]) / ps);
          left -= s;
          const r = clamp(rate + noise(0.04), 0, 1);
          return { month, searches: s, noResult: Math.round(s * r) };
        });
        const noResult = monthly.reduce((a, m) => a + m.noResult, 0);
        const exitTotal = Math.round((searches - noResult) * 0.12);
        const applyExits = Object.fromEntries(
          STEPS.map((s, i) => [s, Math.max(0, Math.round(exitTotal * STEP_WEIGHT[i] * (1 + noise(0.3))))]),
        );
        cells.push({
          emdCode: d.emdCode,
          sigunguCode: sgg,
          timeSlot: slot,
          target,
          quarter: QUARTER,
          searches,
          noResult,
          widened: Math.round(noResult * clamp(0.6 + noise(0.1), 0.2, 1)),
          vacancyWaiting: Math.round(noResult * clamp(0.3 + noise(0.08), 0.05, 0.6)),
          applyExits,
          monthly,
        });
      }
    }
  }
  writeFileSync(
    join(OUT, `${sgg}.json`),
    JSON.stringify(
      {
        sigunguCode: sgg,
        quarter: QUARTER,
        synthetic: true,
        generatedAt: new Date().toISOString(),
        source: "시연용 가상 데이터 (scripts/build-mock-unmet.mjs) — 시민 돌봄지도 출시 전, 실제 이용 데이터 아님",
        cells,
      },
      null,
      1,
    ),
  );
  console.log(`${sgg}: 가상 집계 ${cells.length}칸 (${QUARTER})`);
}
