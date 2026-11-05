import { chromium } from "playwright";
import { execFileSync } from "child_process";
/**
 * 에뮬레이터 종단 검증 (npm run test:e2e)
 * 이메일 링크 로그인 → 역할 부여 → 판단 저장(Firestore) → 이력 → 다른 구 저장 막힘 → 비용 줄 확인 → 조회 권한 막힘
 */
import { mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
const REPO = process.cwd();
const S = join(tmpdir(), "careos-e2e");
mkdirSync(S, { recursive: true });
const BASE = "http://localhost:3100";
const EMAIL = "jumin@dongjak.go.kr";
const ok = (s) => console.log("✓", s);
const role = (r, sgg) =>
  console.log("  ", execFileSync("node", [`${REPO}/scripts/set-user-role.mjs`, EMAIL, r, ...(sgg ? [sgg] : [])], {
    env: { ...process.env, FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" }, cwd: REPO,
  }).toString().trim());

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errs = [];
page.on("pageerror", (e) => errs.push(`[pageerror] ${e.message}`));
page.on("console", (m) => m.type() === "error" && !m.text().includes("PERMISSION") && errs.push(`[console] ${m.text().slice(0, 120)} @ ${(m.location().url || "").slice(0, 160)}`));
page.on("response", (r) => r.status() >= 400 && errs.push(`[http ${r.status()}] ${r.url().slice(0, 160)}`));

// 1) 이메일 링크 로그인
await page.goto(`${BASE}/login/`, { waitUntil: "networkidle", timeout: 120000 });
await page.getByLabel("이메일").fill(EMAIL);
await page.getByRole("button", { name: "로그인 링크 받기" }).click();
await page.getByText("로그인 링크를 보냈습니다").waitFor();
const codes = await (await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-careos/oobCodes")).json();
const code = codes.oobCodes.filter((c) => c.email === EMAIL).at(-1).oobCode;
await page.goto(`${BASE}/login/?apiKey=demo-key&oobCode=${code}&mode=signIn&lang=ko`, { waitUntil: "load", timeout: 120000 });
await page.getByText("아직 권한이 없습니다").waitFor({ timeout: 20000 });
ok("이메일 링크 로그인 → 역할 없음 상태");

// 2) 구 관리자 권한 부여 → 다시 열면 반영
role("district_admin", "11590");
await page.reload({ waitUntil: "load", timeout: 120000 });
await page.getByText("구 관리자 · 서울 동작구").waitFor({ timeout: 20000 });
ok("권한 부여 후 반영: 동작구 구 관리자");

// 3) 동작구 지도: 대안 선택 → 구청 계정에 저장
await page.goto(`${BASE}/?sgg=11590&slot=night&target=infant`, { waitUntil: "load", timeout: 120000 });
await page.waitForTimeout(3000);
const chip = await page.locator("header a[href^='/login']").innerText();
ok(`상단 계정 표시: ${chip}`);
await page.getByRole("checkbox", { name: /시간제 교사/ }).click();
await page.getByRole("button", { name: "이 판단 저장" }).click();
await page.getByLabel("메모").fill("에뮬레이터 저장 검증");
await page.getByRole("button", { name: "저장", exact: true }).click();
await page.getByText("구청 계정의 판단 이력에 저장했습니다").waitFor();
ok("판단 저장 (Firestore)");

// 4) 이력: 서버 기록으로 보임
await page.goto(`${BASE}/history/`, { waitUntil: "load", timeout: 120000 });
await page.getByText("에뮬레이터 저장 검증").waitFor({ timeout: 20000 });
await page.getByText("구청 계정에 저장된 기록입니다").waitFor();
ok("판단 이력: 구청 계정 기록 표시");

// 5) 다른 구(관악)는 저장 불가
await page.goto(`${BASE}/?sgg=11620&slot=night&target=infant`, { waitUntil: "load", timeout: 120000 });
await page.waitForTimeout(3000);
const firstUsable = page.locator("[role=checkbox]:not([disabled])").first();
await firstUsable.click();
await page.getByText("다른 구는 시연 모드입니다").waitFor();
ok("다른 구: 저장 막힘 안내");

// 6) 대안 카드의 비용 줄은 출처 있는 단가(최저임금)로 계산된 것만
await page.goto(`${BASE}/?sgg=11590&slot=night&target=infant`, { waitUntil: "load", timeout: 120000 });
await page.waitForTimeout(3500);
if (await page.getByText("단가 출처 입력 필요").count()) throw new Error("계산할 수 없는 비용 안내가 남아 있음");
ok("비용 줄: 계산 가능한 것만 표시");

// 7) 조회 권한으로 바꾸면 저장 불가
role("district_viewer", "11590");
await page.reload({ waitUntil: "load", timeout: 120000 });
await page.waitForTimeout(3500);
await page.locator("[role=checkbox]:not([disabled])").first().click();
await page.getByText("조회 권한입니다").waitFor();
ok("조회 권한: 저장 막힘 안내");

// 8) Firestore에 실제로 저장된 문서
const docs = await (await fetch("http://127.0.0.1:8080/v1/projects/demo-careos/databases/(default)/documents/decisions", { headers: { Authorization: "Bearer owner" } })).json();
ok(`Firestore decisions 문서 ${docs.documents?.length ?? 0}건, sigunguCode=${docs.documents?.[0]?.fields?.sigunguCode?.stringValue}`);
await page.screenshot({ path: `${S}/e2e-final.png` });
console.log(errs.join("\n") || "페이지 오류 없음");
await browser.close();
if (errs.length) process.exit(1);
