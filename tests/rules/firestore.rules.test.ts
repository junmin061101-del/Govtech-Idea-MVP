import { readFileSync } from "fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, addDoc } from "firebase/firestore";

let env: RulesTestEnvironment;

const DONGJAK = "11590";
const GWANAK = "11620";

const users = {
  djAdmin: { uid: "dj-admin", claims: { role: "district_admin", sigungu_code: DONGJAK } },
  djViewer: { uid: "dj-viewer", claims: { role: "district_viewer", sigungu_code: DONGJAK } },
  gaAdmin: { uid: "ga-admin", claims: { role: "district_admin", sigungu_code: GWANAK } },
  careos: { uid: "careos", claims: { role: "careos_admin" } },
  noRole: { uid: "no-role", claims: {} },
};
const db = (u: keyof typeof users) => env.authenticatedContext(users[u].uid, users[u].claims).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const decision = (uid: string, sgg = DONGJAK) => ({
  sigunguCode: sgg,
  authorUid: uid,
  author: "테스트 주무관",
  memo: "야간 연장반 검토",
  createdAt: serverTimestamp(),
  view: { sigunguCode: sgg, timeSlot: "night", target: "infant", dongId: null, alternatives: ["add_staff"], layer: "estimate", equityTransit: false },
  summary: { dongName: "흑석동", gapBefore: 48, gapAfter: 0 },
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-careos",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  // 규칙을 거치지 않고 시드 데이터 넣기
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    await setDoc(doc(f, "decisions/dj1"), { ...decision("dj-admin"), createdAt: new Date() });
    await setDoc(doc(f, "decisions/ga1"), { ...decision("ga-admin", GWANAK), createdAt: new Date() });
    await setDoc(doc(f, "waitlists/11590_202611"), { sigunguCode: DONGJAK, month: "202611", byDong: {}, total: 0, uploadedBy: "dj-admin", uploadedAt: new Date() });
  });
});

describe("기본 거부", () => {
  it("로그인하지 않으면 아무것도 읽고 쓸 수 없다", async () => {
    await assertFails(getDoc(doc(anon(), "decisions/dj1")));
    await assertFails(setDoc(doc(anon(), "anything/x"), { a: 1 }));
  });
  it("역할이 없는 계정은 읽을 수 없다", async () => {
    await assertFails(getDoc(doc(db("noRole"), "decisions/dj1")));
  });
  it("정의하지 않은 컬렉션은 관리자도 거부", async () => {
    await assertFails(setDoc(doc(db("careos"), "users/x"), { a: 1 }));
    await assertFails(getDoc(doc(db("careos"), "users/x")));
  });
});

describe("판단 이력 — 구별 권한", () => {
  it("자기 구는 읽고, 다른 구는 못 읽는다", async () => {
    await assertSucceeds(getDoc(doc(db("djViewer"), "decisions/dj1")));
    await assertFails(getDoc(doc(db("djViewer"), "decisions/ga1")));
    await assertFails(getDoc(doc(db("gaAdmin"), "decisions/dj1")));
  });
  it("목록 조회는 자기 구 조건을 붙여야 한다", async () => {
    await assertSucceeds(getDocs(query(collection(db("djViewer"), "decisions"), where("sigunguCode", "==", DONGJAK))));
    await assertFails(getDocs(collection(db("djViewer"), "decisions")));
  });
  it("구 관리자는 자기 구에 저장, 조회자는 저장 불가", async () => {
    await assertSucceeds(addDoc(collection(db("djAdmin"), "decisions"), decision("dj-admin")));
    await assertFails(addDoc(collection(db("djViewer"), "decisions"), decision("dj-viewer")));
  });
  it("다른 구로 저장하거나, 작성자를 사칭하거나, 시각을 조작할 수 없다", async () => {
    await assertFails(addDoc(collection(db("djAdmin"), "decisions"), decision("dj-admin", GWANAK)));
    await assertFails(addDoc(collection(db("djAdmin"), "decisions"), decision("someone-else")));
    await assertFails(addDoc(collection(db("djAdmin"), "decisions"), { ...decision("dj-admin"), createdAt: new Date("2020-01-01") }));
    await assertFails(addDoc(collection(db("djAdmin"), "decisions"), { ...decision("dj-admin"), extra: "x" }));
  });
  it("저장한 판단은 수정할 수 없고, 구 관리자만 삭제할 수 있다", async () => {
    await assertFails(updateDoc(doc(db("djAdmin"), "decisions/dj1"), { memo: "바꿈" }));
    await assertFails(deleteDoc(doc(db("djViewer"), "decisions/dj1")));
    await assertSucceeds(deleteDoc(doc(db("djAdmin"), "decisions/dj1")));
  });
  it("CareOS 관리자는 모든 구를 읽는다", async () => {
    await assertSucceeds(getDoc(doc(db("careos"), "decisions/ga1")));
  });
});

describe("쓰지 않는 컬렉션", () => {
  it("단가(unitCosts)는 저장 경로를 닫았다 — 관리자도 쓸 수 없다", async () => {
    await assertFails(setDoc(doc(db("djAdmin"), "unitCosts/11590"), { items: {} }));
    await assertFails(setDoc(doc(db("careos"), "unitCosts/11590"), { items: {} }));
  });
});

describe("입소 대기 집계", () => {
  const agg = (uid: string, extra: Record<string, unknown> = {}) => ({
    sigunguCode: DONGJAK, month: "202611", byDong: { "1159060500": [1, 2, 3, 0, 0, 0] }, total: 6, uploadedBy: uid, uploadedAt: serverTimestamp(), ...extra,
  });
  it("구 관리자만 올리고, 문서 id는 {구코드}_{연월}이어야 한다", async () => {
    await assertSucceeds(setDoc(doc(db("djAdmin"), "waitlists/11590_202611"), agg("dj-admin")));
    await assertFails(setDoc(doc(db("djViewer"), "waitlists/11590_202611"), agg("dj-viewer")));
    await assertFails(setDoc(doc(db("djAdmin"), "waitlists/11620_202611"), agg("dj-admin")));
    await assertFails(setDoc(doc(db("djAdmin"), "waitlists/아무거나"), agg("dj-admin")));
  });
  it("집계 외 필드(예: 명단)는 받지 않는다", async () => {
    await assertFails(setDoc(doc(db("djAdmin"), "waitlists/11590_202611"), agg("dj-admin", { names: ["홍길동"] })));
  });
  it("다른 구는 읽을 수 없다", async () => {
    await assertSucceeds(getDoc(doc(db("djViewer"), "waitlists/11590_202611")));
    await assertFails(getDoc(doc(db("gaAdmin"), "waitlists/11590_202611")));
  });
});

describe("AI 상담 로그·요약 — 시민 앱 서버만 쓰고, 대시보드는 자기 구만 읽는다", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const f = ctx.firestore();
      await setDoc(doc(f, `agentSummaries/${DONGJAK}`), { sigunguCode: DONGJAK, total: { count: 1 } });
      await setDoc(doc(f, `agentSummaries/${GWANAK}`), { sigunguCode: GWANAK, total: { count: 1 } });
      await setDoc(doc(f, "agentLogs/dj1"), { sigunguCode: DONGJAK, emdCode: "1159051000", question: "q", answer: "a", createdAt: new Date() });
      await setDoc(doc(f, "agentLogs/ga1"), { sigunguCode: GWANAK, emdCode: "1162052500", question: "q", answer: "a", createdAt: new Date() });
    });
  });
  it("요약: 자기 구만 읽기, 관리자는 전체", async () => {
    await assertSucceeds(getDoc(doc(db("djViewer"), `agentSummaries/${DONGJAK}`)));
    await assertFails(getDoc(doc(db("djViewer"), `agentSummaries/${GWANAK}`)));
    await assertSucceeds(getDoc(doc(db("careos"), `agentSummaries/${GWANAK}`)));
    await assertFails(getDoc(doc(db("noRole"), `agentSummaries/${DONGJAK}`)));
    await assertFails(getDoc(doc(anon(), `agentSummaries/${DONGJAK}`)));
  });
  it("대화 로그: 자기 구 조건을 붙인 목록만, 다른 구는 거부", async () => {
    await assertSucceeds(getDocs(query(collection(db("djViewer"), "agentLogs"), where("sigunguCode", "==", DONGJAK))));
    await assertFails(getDocs(collection(db("djViewer"), "agentLogs")));
    await assertFails(getDoc(doc(db("gaAdmin"), "agentLogs/dj1")));
    await assertFails(getDoc(doc(db("noRole"), "agentLogs/dj1")));
  });
  it("대시보드에서는 아무도 쓸 수 없다 (구 관리자·전체 관리자 포함)", async () => {
    await assertFails(setDoc(doc(db("djAdmin"), `agentSummaries/${DONGJAK}`), { sigunguCode: DONGJAK }));
    await assertFails(updateDoc(doc(db("careos"), "agentLogs/dj1"), { answer: "x" }));
    await assertFails(deleteDoc(doc(db("djAdmin"), "agentLogs/dj1")));
  });
});
