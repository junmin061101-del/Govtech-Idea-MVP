/**
 * 사용자 역할 부여 (Custom Claims) — CareOS 관리자만 실행한다.
 *
 *   node scripts/set-user-role.mjs <이메일> <역할> [구 코드]
 *     역할: district_admin | district_viewer | careos_admin | none(권한 회수)
 *     예)  node scripts/set-user-role.mjs jumin@dongjak.go.kr district_admin 11590
 *
 * 인증: 운영은 서비스 계정 키(GOOGLE_APPLICATION_CREDENTIALS)와 FIREBASE_PROJECT_ID,
 *       로컬 에뮬레이터는 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 (프로젝트 demo-careos)
 * 사용자는 먼저 /login에서 한 번 로그인해 계정이 만들어져 있어야 한다. 바뀐 권한은 다음 토큰 갱신(최대 1시간) 또는 재로그인 때 반영된다.
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const [email, role, sgg] = process.argv.slice(2);
const ROLES = ["district_admin", "district_viewer", "careos_admin", "none"];
if (!email || !ROLES.includes(role)) {
  console.error("사용법: node scripts/set-user-role.mjs <이메일> <district_admin|district_viewer|careos_admin|none> [구 코드]");
  process.exit(1);
}
if ((role === "district_admin" || role === "district_viewer") && !/^11\d{3}$/.test(sgg ?? "")) {
  console.error("구 역할에는 5자리 구 코드가 필요합니다 (예: 동작구 11590).");
  process.exit(1);
}

const emulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
const projectId = process.env.FIREBASE_PROJECT_ID ?? (emulator ? "demo-careos" : undefined);
if (!projectId) {
  console.error("FIREBASE_PROJECT_ID 환경변수가 필요합니다.");
  process.exit(1);
}
initializeApp(emulator ? { projectId } : { projectId, credential: applicationDefault() });

const user = await getAuth().getUserByEmail(email);
// 같은 프로젝트의 시민 앱이 쓰는 클레임(nickname, onboarded 등)은 그대로 두고 역할·구만 바꾼다
// (setCustomUserClaims 는 전체를 덮어쓰므로 기존 값과 합친다)
const { role: _r, sigungu_code: _s, ...keep } = user.customClaims ?? {};
const claims = role === "none" ? keep : role === "careos_admin" ? { ...keep, role } : { ...keep, role, sigungu_code: sgg };
await getAuth().setCustomUserClaims(user.uid, claims);
console.log(`${email} (${user.uid}) → ${JSON.stringify(claims)}${emulator ? " [에뮬레이터]" : ""}`);
