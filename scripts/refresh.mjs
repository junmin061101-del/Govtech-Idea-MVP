/**
 * 자동 갱신 오케스트레이터 — GitHub Actions(.github/workflows/data-refresh.yml)가 주기별로 실행한다.
 *
 *   node --env-file-if-exists=.env.local scripts/refresh.mjs --mode=<mode>
 *
 *   mode=hourly  : 시설 변경 감지. 어린이집 정보를 받아 내용이 바뀐 경우에만 데이터 빌드 (시설 변경 시 즉시 반영, 1시간 이내)
 *   mode=daily   : 시설 정보 매일. 어린이집 정보를 받아 항상 데이터 빌드 (데이터 기준일 갱신)
 *   mode=weekly  : 공백 지도 매주. 어린이집 + 행정동 인구 + 대중교통을 다시 받아 2SFCA 배분까지 전체 재계산
 *   mode=monthly : 월별 스냅샷 저장 (시점 비교용)
 *
 * 안전장치: 받아 온 데이터가 직전보다 지나치게 줄었거나(시설 −10% 초과 등) 형식이 이상하면
 * 직전 캐시로 되돌리고 실패로 끝낸다 → 워크플로는 배포하지 않는다.
 * 결과는 GITHUB_OUTPUT(changed=true|false)과 src/data/seoul/refresh-log.json에 남긴다.
 */
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { appendFileSync, copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, "scripts", "cache");
const LOG = join(ROOT, "src", "data", "seoul", "refresh-log.json");
const mode = (process.argv.find((a) => a.startsWith("--mode=")) ?? "--mode=hourly").slice(7);
const MODES = ["hourly", "daily", "weekly", "monthly"];
if (!MODES.includes(mode)) {
  console.error(`알 수 없는 mode: ${mode} (${MODES.join(" | ")})`);
  process.exit(2);
}

const node = (script, ...args) =>
  execFileSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--disable-warning=ExperimentalWarning", ...args, join(ROOT, "scripts", script)], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
const readJson = (f) => JSON.parse(readFileSync(join(CACHE, f), "utf-8"));

/** 내용 비교용 해시 — 매일 바뀌는 기준일(DATASTDRDT)·수집 시각은 빼고 시설 내용만 본다 */
function contentHash(file) {
  if (!existsSync(join(CACHE, file))) return null;
  const d = readJson(file);
  let body;
  if (file === "seoul-childcare-raw.json") {
    body = d.rows.map(({ DATASTDRDT, ...r }) => r).sort((a, b) => a.STCODE.localeCompare(b.STCODE));
  } else if (file === "seoul-population-raw.json") {
    body = d.rows;
  } else {
    body = { subway: d.subway, bus: d.bus };
  }
  return createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 16);
}

/** 받기 전 캐시를 보관했다가, 이상하면 되돌린다 */
function fetchWithGuard(file, script, validate) {
  const path = join(CACHE, file);
  const backup = `${path}.bak`;
  const had = existsSync(path);
  if (had) copyFileSync(path, backup);
  const before = had ? readJson(file) : null;
  try {
    node(script, ...(script.includes("mois") || script.includes("boundaries") ? [] : ["--env-file-if-exists=.env.local"]));
    const err = validate(readJson(file), before);
    if (err) throw new Error(err);
  } catch (e) {
    if (had) copyFileSync(backup, path);
    throw new Error(`${file}: ${String(e.message).split("\n")[0]} — 직전 데이터를 유지합니다`);
  } finally {
    rmSync(backup, { force: true });
  }
}

const shrink = (now, prev, ratio = 0.9) => prev && now < prev * ratio;
const VALIDATE = {
  childcare: (d, prev) =>
    d.rows.length < 1000
      ? `시설 수가 너무 적습니다 (${d.rows.length})`
      : shrink(d.rows.length, prev?.rows.length)
        ? `시설 수가 직전보다 10% 넘게 줄었습니다 (${prev.rows.length} → ${d.rows.length})`
        : null,
  population: (d) => (d.rows.length !== 427 ? `행정동 수가 427이 아닙니다 (${d.rows.length})` : null),
  transit: (d, prev) =>
    shrink(d.subway.length, prev?.subway.length) || shrink(d.bus.length, prev?.bus.length)
      ? `역·정류소 수가 직전보다 10% 넘게 줄었습니다`
      : null,
};

const log = existsSync(LOG) ? JSON.parse(readFileSync(LOG, "utf-8")) : { runs: [] };
const started = new Date().toISOString();
let changed = false;
const notes = [];

try {
  if (mode === "monthly") {
    const before = readFileSync(join(ROOT, "src", "data", "seoul", "snapshots", "index.json"), "utf-8");
    node("build-snapshot.mjs", "--import", "./scripts/lib/register-alias.mjs");
    changed = readFileSync(join(ROOT, "src", "data", "seoul", "snapshots", "index.json"), "utf-8") !== before;
    notes.push(changed ? "새 달 스냅샷 저장" : "이번 달 스냅샷은 이미 있음");
  } else {
    const targets = [["seoul-childcare-raw.json", "fetch-seoul-childcare.mjs", VALIDATE.childcare]];
    if (mode === "weekly") {
      targets.push(["seoul-population-raw.json", "fetch-mois-population.mjs", VALIDATE.population]);
      targets.push(["seoul-transit-raw.json", "fetch-transit.mjs", VALIDATE.transit]);
    }
    const contentChanged = [];
    for (const [file, script, validate] of targets) {
      const before = contentHash(file);
      fetchWithGuard(file, script, validate);
      if (contentHash(file) !== before) contentChanged.push(file);
    }
    notes.push(contentChanged.length ? `내용 변경: ${contentChanged.join(", ")}` : "내용 변경 없음");

    // hourly는 내용이 바뀐 경우만, daily·weekly는 항상 다시 만든다 (기준일·배분 비율 갱신)
    if (mode !== "hourly" || contentChanged.length) {
      node("build-data.mjs");
      node("build-mock-unmet.mjs");
      changed = true;
    }
  }
  log.runs = [{ mode, started, finished: new Date().toISOString(), ok: true, changed, notes }, ...log.runs].slice(0, 200);
  writeFileSync(LOG, JSON.stringify(log, null, 1));
  console.log(`갱신(${mode}) 완료 · ${notes.join(" · ")} · 배포 필요: ${changed}`);
} catch (e) {
  log.runs = [{ mode, started, finished: new Date().toISOString(), ok: false, changed: false, notes: [String(e.message)] }, ...log.runs].slice(0, 200);
  writeFileSync(LOG, JSON.stringify(log, null, 1));
  console.error(`갱신(${mode}) 실패: ${e.message}`);
  process.exitCode = 1;
}
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
