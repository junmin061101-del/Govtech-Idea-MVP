import { describe, expect, it } from "vitest";
import { buildReport, type SnapshotFile } from "@/lib/report";
import { buildWorkbook } from "@/lib/reportExcel";
import { decodeView, encodeView, DEFAULT_VIEW, type ViewState } from "@/lib/viewState";
import { exportHistory, mergeImported, type DecisionRecord } from "@/lib/history";
import { compareSnapshots } from "@/lib/compare";
import { diagnoseAllDongs } from "@/lib/calculator";
import { rankDiagnoses } from "@/lib/ranking";
import { DEFAULT_UNIT_COSTS } from "@/lib/config/unitCosts";
import { loadAllFacilities, loadEmds, loadSigunguFile } from "@/test/seoulData";
import type { UnmetDemandFile } from "@/lib/constants/events";
import unmet from "@/data/seoul/unmet-demand/11590.json";
import snapIndex from "@/data/seoul/snapshots/index.json";
import { readFileSync } from "fs";
import { join } from "path";

const dongs = loadEmds().filter((d) => d.sigunguCode === "11590");
const facilities = loadSigunguFile("11590").filter((f) => f.emdCode);
const snapshots: SnapshotFile[] = snapIndex.months.map((m) =>
  JSON.parse(readFileSync(join(__dirname, "..", "data", "seoul", "snapshots", `${m}.json`), "utf-8")),
);

const view: ViewState = { ...DEFAULT_VIEW, sigunguCode: "11590", timeSlot: "night", dongId: null, alternatives: [] };
const base = {
  view, dongs, facilities, unmet: unmet as UnmetDemandFile, unitCosts: DEFAULT_UNIT_COSTS, snapshots,
  dataSources: [{ label: "테스트", value: "출처" }], dataDate: "2026-11-02", now: new Date("2026-11-03T00:00:00Z"),
};

describe("화면 상태 ↔ 주소", () => {
  it("저장한 상태를 그대로 되살린다", () => {
    const v: ViewState = { sigunguCode: "11590", timeSlot: "night", target: "infant", dongId: "1159053000", alternatives: ["add_staff", "extend_hours"], layer: "both", equityTransit: true };
    expect(decodeView(`?${encodeView(v)}`)).toEqual(v);
  });
  it("잘못된 값은 기본값으로 (없는 구, 쓸 수 없는 시간대, 다른 구 동, 모르는 대안)", () => {
    const v = decodeView("?sgg=99999&slot=vacation&target=lower_elementary&dong=1162053000&alts=foo,add_staff&layer=x");
    expect(v.sigunguCode).toBe(DEFAULT_VIEW.sigunguCode);
    expect(v.timeSlot).toBe("daytime");
    expect(v.target).toBe("infant");
    expect(v.dongId).toBeNull();
    expect(v.alternatives).toEqual(["add_staff"]);
    expect(v.layer).toBe("estimate");
  });
});

describe("판단 이력 가져오기", () => {
  const rec = (id: string, createdAt: string): DecisionRecord => ({
    id, createdAt, author: "a", memo: "", view,
    summary: { sigunguName: "동작구", dongName: "상도1동", slotLabel: "야간", targetLabel: "영유아", gapBefore: 10, gapAfter: 2, alternativeTitles: ["x"], dataDate: "2026-11-02" },
  });
  it("내보낸 파일을 합치면 같은 id는 가져온 쪽으로, 최신순 정렬", () => {
    const merged = mergeImported([rec("1", "2026-11-01T00:00:00Z")], JSON.stringify(exportHistory([rec("2", "2026-11-02T00:00:00Z"), { ...rec("1", "2026-11-01T00:00:00Z"), memo: "수정" }])));
    expect(merged.map((r) => r.id)).toEqual(["2", "1"]);
    expect(merged[1].memo).toBe("수정");
  });
  it("형식이 다른 파일은 거부한다", () => {
    expect(() => mergeImported([], JSON.stringify({ records: [] }))).toThrow();
    expect(() => mergeImported([], JSON.stringify({ format: "careos.decisions", records: [{ id: "x" }] }))).toThrow();
  });
});

describe("리포트", () => {
  it("순위는 지도 화면 순위와 같다", () => {
    const m = buildReport({ ...base, template: "monthly" });
    const ranked = rankDiagnoses(diagnoseAllDongs(dongs, facilities, "night"));
    expect(m.ranking.map((r) => r.emdCode)).toEqual(ranked.map((d) => d.dongId));
    expect(m.totals.gap).toBe(ranked.reduce((a, d) => a + d.careGap, 0));
    expect(m.ranking).toHaveLength(15);
  });
  it("이유별 칸의 합 = 동 부족 인원", () => {
    const m = buildReport({ ...base, template: "annual" });
    for (const d of m.reasonDetails) expect(d.segments.reduce((a, s) => a + s.people, 0)).toBe(d.gap);
  });
  it("템플릿별 포함 항목: 월은 순위·이유, 분기는 + 시간대·검색 신호, 연은 + 이유별 합계·시점 비교", () => {
    const mo = buildReport({ ...base, template: "monthly" });
    const q = buildReport({ ...base, template: "quarterly" });
    const y = buildReport({ ...base, template: "annual" });
    expect([mo.slotMatrix, mo.unmet, mo.reasonTotals, mo.comparison]).toEqual([undefined, undefined, undefined, undefined]);
    expect(q.slotMatrix).toHaveLength(15);
    expect(q.unmet?.synthetic).toBe(true);
    expect(q.reasonTotals).toBeUndefined();
    expect(y.reasonTotals).toHaveLength(3);
    expect(y.comparison?.months).toEqual(snapIndex.months);
    expect(mo.reasonDetails.length).toBeLessThanOrEqual(5);
  });
  it("선택한 대안과 합친 효과가 들어간다", () => {
    const top = buildReport({ ...base, template: "monthly" }).ranking[0];
    const m = buildReport({ ...base, template: "monthly", view: { ...view, dongId: top.emdCode, alternatives: ["add_staff", "extend_hours"] } });
    expect(m.decision?.dongName).toBe(top.name);
    expect(m.decision!.combined.before).toBe(top.gap);
    expect(m.decision!.combined.after).toBeLessThanOrEqual(top.gap);
  });
  it("데이터 기준일·출처와 유의 사항이 있다", () => {
    const m = buildReport({ ...base, template: "monthly" });
    expect(m.dataDate).toBe("2026-11-02");
    expect(m.dataSources.length).toBeGreaterThan(0);
    expect(m.notes.join(" ")).toContain("현장 확인");
  });
  it("엑셀: 템플릿에 맞는 시트와 같은 숫자", async () => {
    const top = buildReport({ ...base, template: "annual" }).ranking[0];
    const m = buildReport({ ...base, template: "annual", view: { ...view, dongId: top.emdCode, alternatives: ["add_staff"] } });
    const wb = await buildWorkbook(m);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "요약", "지역 순위", "부족한 이유", "시간대별 부족", "이유별 합계", "부모 검색 신호", "선택한 대안", "시점 비교", "데이터 출처",
    ]);
    const ranking = wb.getWorksheet("지역 순위")!;
    expect(ranking.rowCount).toBe(16);
    expect(ranking.getRow(2).getCell(2).value).toBe(m.ranking[0].name);
    expect(ranking.getRow(2).getCell(6).value).toBe(m.ranking[0].gap);
  });
});

describe("스냅샷·시점 비교", () => {
  it("스냅샷은 같은 데이터의 현재 계산과 같다", () => {
    const all = loadAllFacilities().filter((f) => f.emdCode);
    const latest = snapshots.at(-1)!;
    const now = new Map(diagnoseAllDongs(loadEmds(), all, "night").map((d) => [d.dongId, d.careGap]));
    for (const [emd, slot, , , , gap] of latest.rows) if (slot === "night") expect(gap).toBe(now.get(emd));
  });
  it("변화는 처음과 최근 달의 차이 (한 달뿐이면 없음)", () => {
    const fake: SnapshotFile[] = [
      { month: "2026-12", columns: [], rows: [["A", "night", "infant", 0, 0, 30]] },
      { month: "2026-11", columns: [], rows: [["A", "night", "infant", 0, 0, 50]] },
    ];
    const d = [{ ...dongs[0], id: "A", name: "A동" }];
    expect(compareSnapshots(fake, d, "night", "infant").rows[0]).toMatchObject({ gaps: [50, 30], change: -20 });
    expect(compareSnapshots([fake[0]], d, "night", "infant").rows[0].change).toBeNull();
  });
});
