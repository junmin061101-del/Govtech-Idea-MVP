import { chromium } from "playwright";
import { execFileSync } from "child_process";
/**
 * 에뮬레이터 종단 검증 (npm run test:e2e)
 * 이메일 링크 로그인 → 역할 부여 → 판단 저장(Firestore) → 이력 → 다른 구 저장 막힘 → 비용 줄 확인 → 조회 권한 막힘
 * → AI 상담 실시간 반영(열린 화면에 새 상담이 새로고침 없이 들어오는지) → 역할 부여가 시민 앱 클레임을 지우지 않는지
 */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
const REPO = process.cwd();
const S = join(tmpdir(), "careos-e2e");
mkdirSync(S, { recursive: true });
const BASE = "http://localhost:3100";
const EMAIL = "jumin@dongjak.go.kr";
const ok = (s) => console.log("✓", s);
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
initializeApp({ projectId: "demo-careos" });
const adminDb = getFirestore();
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
await page.getByRole("button", { name: "이메일 링크" }).click();
await page.getByLabel("이메일").fill(EMAIL);
await page.getByRole("button", { name: "로그인 링크 받기" }).click();
await page.getByText("로그인 링크를 보냈습니다").waitFor();
const codes = await (await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-careos/oobCodes")).json();
const code = codes.oobCodes.filter((c) => c.email === EMAIL).at(-1).oobCode;
await page.goto(`${BASE}/login/?apiKey=demo-key&oobCode=${code}&mode=signIn&lang=ko`, { waitUntil: "load", timeout: 120000 });
await page.getByText("아직 권한이 없습니다").waitFor({ timeout: 20000 });
ok("이메일 링크 로그인 → 역할 없음 상태");

// 2) 구 관리자 권한 부여 → 다시 열면 반영 (시민 앱이 넣어 둔 클레임이 있는 계정)
const uid = (await getAuth().getUserByEmail(EMAIL)).uid;
await getAuth().setCustomUserClaims(uid, { nickname: "e2e닉네임", onboarded: true });
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

// 9) AI 상담 실시간 반영 — 시민 앱 서버가 쓰는 것과 같은 모양으로 기록하고, 열린 화면에 새로고침 없이 들어오는지
const turn = (emdCode, extra) => ({
  sigunguCode: "11590",
  emdCode,
  timeSlots: ["night"],
  target: "infant",
  topics: ["vacancy"],
  tools: ["search_facilities"],
  outcome: { facilityMatches: 2, noResult: false, knowledgeHits: 1, noGuide: false, staleDocs: 0 },
  createdAt: new Date(Date.now() - 3600_000),
  ...extra,
});
const logOf = (t, question) => ({ ...t, question, answer: "근처 어린이집 2곳을 찾았습니다.", pkey: "e2e", expiresAt: new Date(Date.now() + 90 * 86_400_000) });
const old = turn("1159053000", {});
await adminDb.collection("agentInsights").add(old);
await adminDb.collection("agentLogs").add(logOf(old, "상도1동 야간 연장 어린이집 있나요"));
await adminDb.collection("agentInsights").add({ ...turn("1162052500", {}), sigunguCode: "11620" }); // 다른 구는 안 보여야 함

// AI 상담 탭: 구 전체 실시간 집계·대화
await page.goto(`${BASE}/ai/?sgg=11590&slot=night&target=infant`, { waitUntil: "load", timeout: 120000 });
await page.getByTestId("agent-live").getByText(/^실시간/).waitFor({ timeout: 30000 });
await page.getByText("상도1동 야간 연장 어린이집 있나요").waitFor({ timeout: 20000 });
const kpi = () => page.getByTestId("agent-stats").innerText();
if (!/최근 7일 상담\s*1\s*건/.test(await kpi())) throw new Error(`첫 집계가 1건이 아님: ${await kpi()}`);
ok("AI 상담 탭: 구 전체 집계 1건 (다른 구 기록 제외) + 기존 대화");

const t0 = Date.now();
const live = turn("1159052000", { topics: ["vacancy", "facility_search"], outcome: { facilityMatches: 0, noResult: true }, createdAt: new Date() });
await adminDb.collection("agentInsights").add(live);
await adminDb.collection("agentLogs").add(logOf(live, "노량진2동인데 밤 10시까지 봐주는 곳 없어요?"));
await page.getByText("노량진2동인데 밤 10시까지 봐주는 곳 없어요?").waitFor({ timeout: 15000 });
await page.getByText("새 대화", { exact: true }).waitFor();
await page.waitForFunction(() => /최근 7일 상담\s*2\s*건/.test(document.querySelector("[data-testid=agent-stats]")?.textContent ?? ""), null, { timeout: 15000 });
await page.getByTestId("agent-stats").getByText("50%").waitFor();
ok(`새 상담 실시간 반영 ${Date.now() - t0}ms (새로고침 없음): '새 대화' 표시 · 집계 2건 · 시설 못 찾음 50%`);

await page.getByRole("button", { name: "시설 못 찾음", exact: true }).click();
if (await page.getByText("상도1동 야간 연장 어린이집 있나요").count()) throw new Error("'시설 못 찾음' 거르기가 동작하지 않음");
const mapLink = page.getByRole("link", { name: "노량진2동 지도에서 보기" });
if (!(await mapLink.getAttribute("href")).includes("dong=1159052000")) throw new Error("동별 표의 지도 링크가 그 동을 열지 않음");
ok("'시설 못 찾음' 거르기 · 동별 표 → 지도에서 그 동 열기 링크");
await page.screenshot({ path: `${S}/e2e-ai-tab.png`, fullPage: true });

// 10) 역할을 여러 번 바꿔도 시민 앱 클레임(nickname·onboarded)은 남는다
const claims = (await getAuth().getUser(uid)).customClaims;
if (claims.nickname !== "e2e닉네임" || claims.onboarded !== true || claims.role !== "district_viewer") throw new Error(`클레임 병합 실패: ${JSON.stringify(claims)}`);
ok(`역할 부여 후 클레임: ${JSON.stringify(claims)}`);

// 11) 운영자: 비밀번호 로그인 → 서울 전체 AI 상담 → 리포트 탭 엑셀
const OPS = "ops@careos.kr";
const opsUser = await getAuth().createUser({ email: OPS, password: "e2e-pass-1234", emailVerified: true });
await getAuth().setCustomUserClaims(opsUser.uid, { role: "careos_admin" });
const ctx2 = await browser.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
const p2 = await ctx2.newPage();
p2.on("pageerror", (e) => errs.push(`[pageerror] ${e.message}`));
await p2.goto(`${BASE}/login/`, { waitUntil: "networkidle", timeout: 120000 });
await p2.getByLabel("이메일").fill(OPS);
await p2.getByLabel("비밀번호").fill("틀린비밀번호");
await p2.getByRole("button", { name: "로그인", exact: true }).click();
await p2.getByText("이메일 또는 비밀번호가 맞지 않습니다").waitFor({ timeout: 15000 });
await p2.getByLabel("비밀번호").fill("e2e-pass-1234");
await p2.getByRole("button", { name: "로그인", exact: true }).click();
await p2.getByText("운영자 · 전체 구").first().waitFor({ timeout: 20000 });
ok("비밀번호 로그인 (틀린 비밀번호 안내 → 운영자 로그인)");

await p2.goto(`${BASE}/ai/?sgg=11590&scope=all`, { waitUntil: "load", timeout: 120000 });
await p2.getByText("구별 상담").waitFor({ timeout: 30000 });
await p2.getByRole("cell", { name: "관악구" }).waitFor({ timeout: 20000 });
await p2.getByRole("cell", { name: "동작구" }).waitFor();
ok("운영자 서울 전체 보기: 구별 상담 표에 동작구·관악구");

await p2.goto(`${BASE}/report/?sgg=11590&slot=night&target=infant`, { waitUntil: "load", timeout: 120000 });
await p2.getByText("부족 인원 상위 동").waitFor({ timeout: 30000 });
const [dl] = await Promise.all([p2.waitForEvent("download", { timeout: 60000 }), p2.getByRole("button", { name: /엑셀 내려받기 · \d+시트/ }).click()]);
ok(`리포트 탭: 대시보드 표시 · 엑셀 내려받기 ${dl.suggestedFilename()}`);
await p2.screenshot({ path: `${S}/e2e-report-tab.png`, fullPage: true });
await ctx2.close();

await page.screenshot({ path: `${S}/e2e-final.png` });
console.log(errs.join("\n") || "페이지 오류 없음");
await browser.close();
if (errs.length) process.exit(1);
