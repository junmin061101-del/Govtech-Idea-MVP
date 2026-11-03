/**
 * 리포트 엑셀(.xlsx) — buildReport 모델을 시트별로 옮긴다. 화면(PDF)과 같은 숫자.
 * exceljs는 용량이 커서 버튼을 누를 때만 불러온다(dynamic import).
 */
import type { Workbook } from "exceljs";
import type { ReportModel } from "@/lib/report";
import { won } from "@/lib/config/unitCosts";

const HEADER_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF0EFEC" } };

function sheet(wb: Workbook, name: string, header: string[], rows: (string | number | null)[][], widths?: number[]) {
  const ws = wb.addWorksheet(name);
  ws.addRow(header).eachCell((c) => {
    c.font = { bold: true };
    c.fill = HEADER_FILL;
  });
  for (const r of rows) ws.addRow(r);
  ws.columns.forEach((col, i) => (col.width = widths?.[i] ?? 14));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return ws;
}

export async function buildWorkbook(m: ReportModel): Promise<Workbook> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "우리 구 돌봄 공백 지도";
  wb.created = new Date(m.generatedAt);

  sheet(
    wb,
    "요약",
    ["항목", "내용"],
    [
      ["리포트", m.title],
      ["용도", m.purpose],
      ["자치구", `서울특별시 ${m.sigunguName}`],
      ["기간", m.periodLabel],
      ["기준", m.contextLabel],
      ["부족한 동", `${m.totals.dongs}개 동 중 ${m.totals.shortDongs}개 동`],
      ["부족 인원 합계", m.totals.gap],
      ["데이터 기준일", m.dataDate],
      ["작성 시각", m.generatedAt],
      ...m.notes.map((n, i) => [`유의 사항 ${i + 1}`, n]),
    ],
    [18, 90],
  );

  sheet(
    wb,
    "지역 순위",
    ["순위", "행정동", "행정동 코드", "추정 수요(명)", "이용 가능한 자리(명)", "부족 인원(명)", "부족 비율", "주된 이유"],
    m.ranking.map((r) => [r.rank, r.name, r.emdCode, r.demand, r.seats, r.gap, Math.round(r.ratio * 1000) / 1000, r.reason]),
    [6, 12, 14, 14, 18, 14, 10, 16],
  );

  sheet(
    wb,
    "부족한 이유",
    ["행정동", "부족 인원(명)", "자리가 없어서", "문을 닫아서", "선생님이 없어서", "추정 포함", "대표 시설"],
    m.reasonDetails.map((d) => [
      d.name,
      d.gap,
      ...["자리가 없어서", "문을 닫아서", "선생님이 없어서"].map((l) => d.segments.find((s) => s.label === l)?.people ?? 0),
      d.segments.some((s) => s.estimated && s.people > 0) ? "예" : "",
      d.facilities.join("\n"),
    ]),
    [12, 12, 14, 12, 14, 10, 80],
  );

  if (m.slotMatrix && m.slotColumns) {
    sheet(
      wb,
      "시간대별 부족",
      ["행정동", ...m.slotColumns.map((c) => c.label)],
      m.slotMatrix.map((r) => [r.name, ...m.slotColumns!.map((c) => r.gaps[c.id])]),
      [12, ...m.slotColumns.map(() => 18)],
    );
  }

  if (m.reasonTotals) {
    sheet(
      wb,
      "이유별 합계",
      ["이유", "부족 인원 합계(명, 시간대 합)", "관련 예산"],
      m.reasonTotals.map((r) => [r.label, r.people, r.budgetHint]),
      [16, 26, 32],
    );
  }

  if (m.unmet) {
    sheet(
      wb,
      "부모 검색 신호",
      ["행정동", "분기 검색 수", "결과 없음 비율", "표본", "공백 신호", "비고"],
      m.unmet.rows.map((r) => [
        r.name,
        r.searches,
        r.noResultRate == null ? null : Math.round(r.noResultRate * 1000) / 1000,
        r.reliability === "reliable" ? "충분" : r.reliability === "reference" ? "참고(±15%p)" : "표본 부족",
        r.gapSignal ? "예" : "",
        m.unmet!.synthetic ? "시연용 가상 데이터" : "",
      ]),
      [12, 12, 14, 12, 10, 20],
    );
  }

  if (m.decision) {
    sheet(
      wb,
      "선택한 대안",
      ["대안", "내용", "줄어드는 인원(명)", "남는 부족 인원(명)", "필요한 것", "예상 비용", "계산식·출처"],
      [
        ...m.decision.alternatives.map((a) => [
          a.title,
          [a.sentence, a.residualNote].filter(Boolean).join(" / "),
          a.reduction,
          a.remaining,
          a.needs.join("\n"),
          a.costs.map((c) => `${c.label}: ${c.amount != null ? won(c.amount) : c.missing}`).join("\n"),
          a.costs.map((c) => `${c.formula} (출처: ${c.source ?? "미입력"})`).join("\n"),
        ]),
        ["합친 효과", `${m.decision.dongName}: 현재 ${m.decision.combined.before}명 부족 → 적용 후 ${m.decision.combined.after}명 부족`, m.decision.combined.before - m.decision.combined.after, m.decision.combined.after, "", "", ""],
      ],
      [16, 60, 14, 14, 40, 30, 50],
    );
  }

  if (m.comparison) {
    sheet(wb, "시점 비교", ["행정동", ...m.comparison.months], m.comparison.rows.map((r) => [r.name, ...r.gaps]), [12, ...m.comparison.months.map(() => 12)]);
  }

  sheet(wb, "데이터 출처", ["항목", "출처·기준"], m.dataSources.map((s) => [s.label, s.value]), [18, 100]);
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
