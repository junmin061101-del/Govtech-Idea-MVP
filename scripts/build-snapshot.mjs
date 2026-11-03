/**
 * 월별 스냅샷 — 그 달 데이터 기준 서울 전 행정동의 시간대별 부족 인원을 저장한다 (정책 시행 전후 비교용).
 * 화면과 같은 계산 코드(src/lib/calculator.ts)를 쓴다. 이미 있는 달은 덮어쓰지 않는다(--force로 덮어쓰기).
 *
 * 실행: npm run data:snapshot
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { diagnoseAllDongs } from "@/lib/calculator";
import { TIME_SLOTS } from "@/lib/constants/timeSlots";
import { CARE_TARGETS } from "@/lib/constants/targets";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "src", "data", "seoul");
const OUT = join(DATA, "snapshots");
const force = process.argv.includes("--force");

const meta = JSON.parse(readFileSync(join(DATA, "meta.json"), "utf-8"));
const month = meta.sources.childcare.dataDate.slice(0, 7);
const emds = JSON.parse(readFileSync(join(DATA, "emds.json"), "utf-8"));
const byId = new Map();
for (const f of readdirSync(join(DATA, "facilities"))) {
  for (const x of JSON.parse(readFileSync(join(DATA, "facilities", f), "utf-8"))) byId.set(x.id, x);
}
const facilities = [...byId.values()].filter((f) => f.emdCode);

mkdirSync(OUT, { recursive: true });
const file = join(OUT, `${month}.json`);
if (existsSync(file) && !force) {
  console.log(`${month} 스냅샷이 이미 있습니다 (덮어쓰려면 --force).`);
} else {
  const rows = [];
  for (const target of CARE_TARGETS.filter((t) => t.dataAvailable)) {
    for (const slot of TIME_SLOTS.filter((t) => t.dataAvailable)) {
      for (const d of diagnoseAllDongs(emds, facilities, slot.id, target.id)) {
        rows.push([d.dongId, slot.id, target.id, d.demand, d.totalECC, d.careGap]);
      }
    }
  }
  writeFileSync(
    file,
    JSON.stringify({
      month,
      createdAt: new Date().toISOString(),
      sources: meta.sources,
      columns: ["emdCode", "timeSlot", "target", "demand", "availableSeats", "gap"],
      rows,
    }),
  );
  console.log(`${month} 스냅샷 저장: ${rows.length}행`);
}
const months = readdirSync(OUT).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 7)).sort();
writeFileSync(join(OUT, "index.json"), JSON.stringify({ months }, null, 1));
console.log(`스냅샷 목록: ${months.join(", ")}`);
