/**
 * 리포트 엑셀(.xlsx) — buildReport 모델을 시트별로 옮긴다. 화면(PDF)과 같은 숫자.
 * exceljs는 용량이 커서 버튼을 누를 때만 불러온다(dynamic import).
 *
 * 시트: 요약 · 지역 순위 · 권고 대안 · 부족 원인 시설 · 시간대별 부족 · (이유별 합계) · (부모 검색 신호) ·
 *       (선택한 대안) · 시설 목록 · (시점 비교) · 산정 방법·출처
 */
import type { Workbook, Worksheet } from "exceljs";
import type { ReportModel } from "@/lib/report";
import { won } from "@/lib/config/unitCosts";

const HEADER_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF1E293B" } };
const SUBTLE_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF1F5F9" } };
const NUM = "#,##0";
const PCT = "0%";

interface Col {
  header: string;
  width: number;
  fmt?: string;
}

/** 머리글(진한 배경·흰 글자)·틀 고정·자동 필터가 있는 표 시트 */
function table(wb: Workbook, name: string, title: string, cols: Col[], rows: (string | number | null)[][]): Worksheet {
  const ws = wb.addWorksheet(name);
  ws.addRow([title]).font = { bold: true, size: 13 };
  ws.addRow([]);
  const head = ws.addRow(cols.map((c) => c.header));
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = HEADER_FILL;
    c.alignment = { vertical: "middle", wrapText: true };
  });
  head.height = 22;
  for (const r of rows) {
    const row = ws.addRow(r);
    row.alignment = { vertical: "top", wrapText: true };
  }
  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.width;
    if (c.fmt) col.numFmt = c.fmt;
  });
  ws.views = [{ state: "frozen", ySplit: 3 }];
  if (rows.length) ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + rows.length, column: cols.length } };
  return ws;
}

export async function buildWorkbook(m: ReportModel): Promise<Workbook> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "우리 구 돌봄 공백 지도";
  wb.created = new Date(m.generatedAt);

  // 1) 요약 ---------------------------------------------------------------
  const s = wb.addWorksheet("요약");
  s.getColumn(1).width = 22;
  s.getColumn(2).width = 100;
  s.addRow([m.title]).font = { bold: true, size: 16 };
  s.addRow([`서울특별시 ${m.sigunguName} · ${m.purpose} · ${m.periodLabel}`]).font = { color: { argb: "FF475569" } };
  s.addRow([`기준: ${m.contextLabel} · 데이터 기준일 ${m.dataDate} · 작성 ${new Date(m.generatedAt).toLocaleString("ko-KR")}`]).font = {
    color: { argb: "FF64748B" },
    size: 9,
  };
  s.addRow([]);
  const kpi = [
    ["추정 수요", m.totals.demand],
    ["이용 가능한 자리", m.totals.seats],
    ["부족 인원", m.totals.gap],
    ["부족한 동", `${m.totals.shortDongs} / ${m.totals.dongs}개 동`],
  ] as const;
  s.addRow(["핵심 숫자"]).font = { bold: true, size: 12 };
  for (const [k, v] of kpi) {
    const r = s.addRow([k, v]);
    r.getCell(1).fill = SUBTLE_FILL;
    r.getCell(2).font = { bold: true, size: 12 };
    if (typeof v === "number") r.getCell(2).numFmt = '#,##0"명"';
    r.getCell(2).alignment = { horizontal: "left" };
  }
  s.addRow([]);
  s.addRow(["핵심 요약"]).font = { bold: true, size: 12 };
  m.keyFindings.forEach((f, i) => (s.addRow([`${i + 1}`, f]).getCell(2).alignment = { wrapText: true }));
  s.addRow([]);
  s.addRow(["부족한 이유 (구 전체)"]).font = { bold: true, size: 12 };
  for (const r of m.reasonTotalsCurrent) {
    const row = s.addRow([r.label, `${r.people.toLocaleString()}명 (${Math.round(r.share * 100)}%)`]);
    row.getCell(1).fill = SUBTLE_FILL;
  }
  s.addRow([]);
  s.addRow(["유의 사항"]).font = { bold: true, size: 12 };
  m.notes.forEach((n) => (s.addRow(["", n]).getCell(2).alignment = { wrapText: true }));

  // 2) 지역 순위 ------------------------------------------------------------
  table(
    wb,
    "지역 순위",
    `지역 순위 — ${m.contextLabel}`,
    [
      { header: "순위", width: 6 },
      { header: "행정동", width: 12 },
      { header: "추정 수요(명)", width: 12, fmt: NUM },
      { header: "이용 가능한 자리(명)", width: 14, fmt: NUM },
      { header: "부족 인원(명)", width: 12, fmt: NUM },
      { header: "부족 비율", width: 10, fmt: PCT },
      { header: "자리가 없어서(명)", width: 14, fmt: NUM },
      { header: "문을 닫아서(명)", width: 13, fmt: NUM },
      { header: "선생님이 없어서(명)", width: 15, fmt: NUM },
      { header: "주된 이유", width: 15 },
      { header: "행정동 코드", width: 13 },
    ],
    m.ranking.map((r) => [r.rank, r.name, r.demand, r.seats, r.gap, r.gap > 0 ? r.ratio : null, r.space, r.time, r.staff, r.reason, r.emdCode]),
  );

  // 3) 권고 대안 -----------------------------------------------------------
  table(
    wb,
    "권고 대안",
    "부족 상위 동 권고 대안 (자동 산출, 현장 확인 전 참고)",
    [
      { header: "행정동", width: 12 },
      { header: "현재 부족(명)", width: 12, fmt: NUM },
      { header: "효과가 가장 큰 대안", width: 18 },
      { header: "내용", width: 60 },
      { header: "줄어드는 인원(명)", width: 14, fmt: NUM },
      { header: "남는 부족(명)", width: 12, fmt: NUM },
      { header: "필요한 것", width: 50 },
      { header: "모든 대안 적용 시 남는 부족(명)", width: 18, fmt: NUM },
    ],
    m.recommendations.map((r) => [
      r.name,
      r.gap,
      r.best?.title ?? "해당 대안 없음",
      r.best?.sentence ?? "",
      r.best?.reduction ?? 0,
      r.best?.remaining ?? r.gap,
      r.best?.needs.join("\n") ?? "",
      r.allCombinedAfter,
    ]),
  );

  // 4) 부족 원인 시설 ---------------------------------------------------------
  table(
    wb,
    "부족 원인 시설",
    "동별 부족한 이유와 해당 시설",
    [
      { header: "행정동", width: 12 },
      { header: "부족 인원(명)", width: 12, fmt: NUM },
      { header: "이유별 인원", width: 40 },
      { header: "해당 시설 (이유 · 사유 · 이 동 몫)", width: 90 },
    ],
    m.reasonDetails.map((d) => [
      d.name,
      d.gap,
      d.segments
        .filter((x) => x.people > 0)
        .map((x) => `${x.label} ${x.people}명${x.estimated ? "(추정)" : ""}`)
        .join("\n"),
      d.facilities.join("\n"),
    ]),
  );

  // 5) 시간대별 부족 ---------------------------------------------------------
  if (m.slotMatrix && m.slotColumns) {
    table(
      wb,
      "시간대별 부족",
      "시간대별 부족 인원(명)",
      [{ header: "행정동", width: 12 }, ...m.slotColumns.map((c) => ({ header: c.label, width: 18, fmt: NUM }))],
      m.slotMatrix.map((r) => [r.name, ...m.slotColumns!.map((c) => r.gaps[c.id])]),
    );
  }

  if (m.reasonTotals) {
    table(
      wb,
      "이유별 합계",
      "이유별 부족 합계 (시간대 합, 예산 항목 근거)",
      [
        { header: "이유", width: 16 },
        { header: "부족 인원 합계(명)", width: 18, fmt: NUM },
        { header: "관련 예산", width: 34 },
      ],
      m.reasonTotals.map((r) => [r.label, r.people, r.budgetHint]),
    );
  }

  if (m.unmet) {
    table(
      wb,
      "부모 검색 신호",
      `부모 검색 신호 (${m.unmet.quarter})${m.unmet.synthetic ? " — 시연용 가상 데이터" : ""}`,
      [
        { header: "행정동", width: 12 },
        { header: "분기 검색 수", width: 12, fmt: NUM },
        { header: "결과 없음 비율", width: 14, fmt: PCT },
        { header: "표본", width: 14 },
        { header: "공백 신호", width: 10 },
      ],
      m.unmet.rows.map((r) => [
        r.name,
        r.searches,
        r.noResultRate,
        r.reliability === "reliable" ? "충분" : r.reliability === "reference" ? "참고(±15%p)" : "표본 부족",
        r.gapSignal ? "있음" : "",
      ]),
    );
  }

  if (m.decision) {
    table(
      wb,
      "선택한 대안",
      `선택한 대안 — ${m.decision.dongName}: 현재 ${m.decision.combined.before}명 부족 → 적용 후 ${m.decision.combined.after}명 부족`,
      [
        { header: "대안", width: 16 },
        { header: "내용", width: 60 },
        { header: "줄어드는 인원(명)", width: 14, fmt: NUM },
        { header: "남는 부족(명)", width: 12, fmt: NUM },
        { header: "필요한 것", width: 44 },
        { header: "예상 비용", width: 28 },
        { header: "계산식·출처", width: 50 },
      ],
      m.decision.alternatives.map((a) => [
        a.title,
        [a.sentence, a.residualNote].filter(Boolean).join("\n"),
        a.reduction,
        a.remaining,
        a.needs.join("\n"),
        a.costs.map((c) => `${c.label}: ${c.amount != null ? won(c.amount) : c.missing}`).join("\n"),
        a.costs.map((c) => `${c.formula} (출처: ${c.source ?? "미입력"})`).join("\n"),
      ]),
    );
  }

  // 시설 목록 -------------------------------------------------------------
  const slotIds = m.slotColumns?.map((c) => c.id) ?? [];
  table(
    wb,
    "시설 목록",
    `시설 목록 — 서울특별시 ${m.sigunguName} (시간대별 이용 가능한 자리)`,
    [
      { header: "행정동", width: 12 },
      { header: "시설명", width: 26 },
      { header: "유형", width: 14 },
      { header: "정원", width: 8, fmt: NUM },
      { header: "현원", width: 8, fmt: NUM },
      { header: "교사", width: 8, fmt: NUM },
      ...(m.slotColumns ?? []).map((c) => ({ header: `${c.label} 자리`, width: 14, fmt: NUM })),
      { header: "시설 특성", width: 28 },
    ],
    m.facilityTable.map((f) => [f.dong, f.name, f.type, f.capacity, f.enrollment, f.teachers, ...slotIds.map((id) => f.seats[id]), f.spec]),
  );

  if (m.comparison) {
    table(
      wb,
      "시점 비교",
      "월별 부족 인원(명)",
      [{ header: "행정동", width: 12 }, ...m.comparison.months.map((mo) => ({ header: mo, width: 12, fmt: NUM }))],
      m.comparison.rows.map((r) => [r.name, ...r.gaps]),
    );
  }

  // 산정 방법·출처 -----------------------------------------------------------
  const src = wb.addWorksheet("산정 방법·출처");
  src.getColumn(1).width = 18;
  src.getColumn(2).width = 110;
  src.addRow(["산정 방법"]).font = { bold: true, size: 12 };
  m.methodology.forEach((t) => (src.addRow(["", t]).getCell(2).alignment = { wrapText: true }));
  src.addRow([]);
  src.addRow(["데이터 출처"]).font = { bold: true, size: 12 };
  m.dataSources.forEach((d) => {
    const r = src.addRow([d.label, d.value]);
    r.getCell(1).fill = SUBTLE_FILL;
    r.getCell(2).alignment = { wrapText: true };
  });
  return wb;
}

export async function downloadWorkbook(m: ReportModel, filename: string): Promise<void> {
  const wb = await buildWorkbook(m);
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
