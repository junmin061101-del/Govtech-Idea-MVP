"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import TopController from "@/components/TopController";
import Notice from "@/components/Notice";
import { BarList } from "@/components/charts/Bars";
import { buildReport, REPORT_TEMPLATES, type ReportModel, type ReportTemplate } from "@/lib/report";
import { decodeView, encodeView, DEFAULT_VIEW, type ViewState } from "@/lib/viewState";
import { won, DEFAULT_UNIT_COSTS } from "@/lib/config/unitCosts";
import { ALL_DONGS, DATA_DATE, DATA_SOURCES, dongName, useFacilities, useSnapshots, useUnmetDemand } from "@/lib/hooks/useSeoulData";
import { people, percent } from "@/lib/mapScale";

const TEMPLATES = Object.keys(REPORT_TEMPLATES) as ReportTemplate[];
const TEMPLATE_LABEL: Record<ReportTemplate, string> = { monthly: "월간", quarterly: "분기", annual: "연간" };

export default function ReportPage() {
  const [view, setView] = useState<ViewState | null>(null);
  const [template, setTemplate] = useState<ReportTemplate>("monthly");
  const unitCosts = DEFAULT_UNIT_COSTS;
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null);
  const closeNotice = useCallback(() => setNotice(null), []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setView(decodeView(window.location.search));
    const t = q.get("template");
    if (TEMPLATES.includes(t as ReportTemplate)) setTemplate(t as ReportTemplate);
  }, []);

  const sgg = view?.sigunguCode ?? "11590";
  const facilitiesRaw = useFacilities(sgg);
  const unmet = useUnmetDemand(sgg);
  const snapshots = useSnapshots();

  const model: ReportModel | null = useMemo(() => {
    if (!view || !facilitiesRaw || unmet === undefined || !snapshots) return null;
    return buildReport({
      template,
      view,
      dongs: ALL_DONGS.filter((d) => d.sigunguCode === sgg),
      facilities: facilitiesRaw.filter((f) => f.emdCode),
      unmet,
      unitCosts,
      dataSources: DATA_SOURCES,
      dataDate: DATA_DATE,
      snapshots,
      dongName,
    });
  }, [view, template, facilitiesRaw, unmet, snapshots, unitCosts, sgg]);

  useEffect(() => {
    if (view) window.history.replaceState(null, "", `?${encodeView(view)}&template=${template}`);
  }, [view, template]);

  const download = async () => {
    if (!model) return;
    setBusy(true);
    try {
      const { downloadWorkbook } = await import("@/lib/reportExcel");
      await downloadWorkbook(model, `돌봄공백_${model.sigunguName}_${TEMPLATE_LABEL[template].split(" ")[0]}_${model.dataDate}.xlsx`);
    } finally {
      setBusy(false);
    }
  };

  const v = view ?? DEFAULT_VIEW;
  const sheets = model ? excelSheets(model) : [];

  return (
    <div className="min-h-screen pb-16 print:bg-white print:pb-0">
      <div className="print:hidden">
        <TopController
          tab="report"
          sigunguCode={v.sigunguCode}
          onSigunguChange={(code) => setView({ ...v, sigunguCode: code, dongId: null, alternatives: [] })}
          target={v.target}
          onTargetChange={(target) => setView({ ...v, target })}
          timeSlot={v.timeSlot}
          onTimeSlotChange={(timeSlot) => setView({ ...v, timeSlot })}
          query={encodeView(v)}
          onUnavailable={(text) => setNotice({ text, id: Date.now() })}
        />
        <Notice message={notice} onClose={closeNotice} />
      </div>

      <main className="mx-auto flex max-w-[1440px] flex-col gap-5 break-keep px-6 pt-8 print:hidden">
        {/* 제목 + 내보내기 */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-neutral-500">
              서울 {model?.sigunguName ?? ""} · {model?.contextLabel ?? ""}
            </p>
            <h2 className="text-[28px] font-semibold tracking-tight text-neutral-900">리포트</h2>
            <p className="mt-1 text-[13px] text-neutral-500">
              {model ? `${model.title} · ${model.periodLabel} · 데이터 기준일 ${model.dataDate}` : "리포트를 만드는 중..."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="seg" role="group" aria-label="리포트 종류">
              {TEMPLATES.map((t) => (
                <button key={t} type="button" onClick={() => setTemplate(t)} aria-pressed={template === t} className="seg-item">
                  {TEMPLATE_LABEL[t]}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => window.print()} disabled={!model} className="btn-primary">
              <Printer className="h-4 w-4" /> PDF로 저장
            </button>
            <button type="button" onClick={download} disabled={!model || busy} className="btn-secondary">
              <FileSpreadsheet className="h-4 w-4" /> {busy ? "만드는 중..." : `엑셀 내려받기 · ${sheets.length}시트`}
            </button>
          </div>
        </div>

        {!model ? (
          <p className="card p-10 text-center text-[13px] text-neutral-400">리포트를 만드는 중...</p>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi label="추정 수요" value={model.totals.demand.toLocaleString()} unit="명" />
              <Kpi label="이용 가능한 자리" value={model.totals.seats.toLocaleString()} unit="명" />
              <Kpi label="부족 인원" value={model.totals.gap.toLocaleString()} unit="명" dark />
              <Kpi label="부족한 동" value={`${model.totals.shortDongs}`} unit={`/ ${model.totals.dongs}개`} />
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
              <Card title="핵심 요약" sub="리포트 첫 장에 그대로 들어갑니다">
                <ol className="flex flex-col gap-2.5">
                  {model.keyFindings.map((f, i) => (
                    <li key={f} className="flex gap-3 text-[14px] leading-relaxed text-neutral-800">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">{i + 1}</span>
                      {f}
                    </li>
                  ))}
                </ol>
              </Card>
              <Card title="부족한 이유" sub={`${model.contextLabel} · 구 전체`}>
                {model.reasonTotalsCurrent.some((r) => r.people > 0) ? (
                  <BarList
                    data={model.reasonTotalsCurrent.map((r) => ({ key: r.label, label: r.label, value: r.people, sub: percent(r.share) }))}
                    labelWidth="w-28"
                  />
                ) : (
                  <p className="py-6 text-center text-[13px] text-neutral-400">부족한 동이 없습니다.</p>
                )}
              </Card>
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="부족 인원 상위 동" sub="부족 인원 순 · 막대 = 부족 인원">
                <RankingTable rows={model.ranking.filter((r) => r.gap > 0).slice(0, 10)} />
              </Card>
              <Card title="권고 대안" sub="자동 산출 · 현장 확인 전 참고">
                {model.recommendations.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-neutral-400">부족한 동이 없습니다.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-black/[0.06]">
                    {model.recommendations.map((r) => (
                      <li key={r.name} className="flex items-start gap-4 py-3">
                        <div className="w-24 shrink-0">
                          <p className="text-[14px] font-semibold text-neutral-900">{r.name}</p>
                          <p className="text-[12px] text-neutral-500">부족 {r.gap}명</p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-neutral-900">{r.best ? r.best.title : "해당 대안 없음 (신규 정원 검토)"}</p>
                          {r.best && <p className="mt-0.5 text-[12px] text-neutral-500">{r.best.needs.join(" · ")}</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[15px] font-semibold tabular-nums text-neutral-900">{r.best ? `−${r.best.reduction}` : "–"}</p>
                          <p className="text-[11px] text-neutral-500">모두 적용 시 {r.allCombinedAfter}명</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="PDF에 들어가는 내용" sub="A4 · 인쇄 창에서 ‘PDF로 저장’을 고르세요">
                <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] text-neutral-700">
                  {pdfSections(model).map((t) => (
                    <li key={t} className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-neutral-400" />
                      {t}
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => setPreview((p) => !p)} className="btn-secondary self-start">
                  {preview ? "미리보기 닫기" : "PDF 미리보기"}
                </button>
              </Card>
              <Card title="엑셀에 들어가는 시트" sub={`${sheets.length}개 시트 · 머리글 고정·필터 포함`}>
                <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] text-neutral-700">
                  {sheets.map((t, i) => (
                    <li key={t} className="flex items-center gap-2">
                      <span className="w-4 text-right text-[11px] tabular-nums text-neutral-400">{i + 1}</span>
                      {t}
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={download} disabled={busy} className="btn-secondary self-start">
                  <FileSpreadsheet className="h-4 w-4" /> 엑셀 내려받기
                </button>
              </Card>
            </section>
          </>
        )}
      </main>

      {/* 인쇄(PDF)용 문서 — 화면에서는 미리보기를 열 때만, 인쇄할 때는 항상 */}
      {model && (
        <div className={`${preview ? "block" : "hidden"} pt-6 print:block print:pt-0`}>
          <ReportDocument m={model} />
        </div>
      )}
    </div>
  );
}

/** 엑셀 시트 이름 (reportExcel.ts 와 같은 순서·조건) */
function excelSheets(x: ReportModel): string[] {
  return [
    "요약",
    "지역 순위",
    "권고 대안",
    "부족 원인 시설",
    ...(x.slotMatrix && x.slotColumns ? ["시간대별 부족"] : []),
    ...(x.reasonTotals ? ["이유별 합계"] : []),
    ...(x.unmet ? ["부모 검색 신호"] : []),
    ...(x.decision ? ["선택한 대안"] : []),
    "시설 목록",
    ...(x.comparison ? ["시점 비교"] : []),
    "산정 방법·출처",
  ];
}

function pdfSections(x: ReportModel): string[] {
  return [
    "핵심 숫자·핵심 요약",
    "지역 순위 (이유별)",
    "부족 상위 동 권고 대안",
    "지역별 부족 인원과 이유",
    ...(x.slotMatrix ? ["시간대별 부족 인원"] : []),
    ...(x.reasonTotals ? ["이유별 합계 (예산 근거)"] : []),
    ...(x.unmet ? ["부모 검색 신호"] : []),
    "선택한 대안과 효과",
    ...(x.comparison ? ["시점 비교"] : []),
    "산정 방법·출처",
  ];
}

function Kpi({ label, value, unit, dark }: { label: string; value: string; unit?: string; dark?: boolean }) {
  return (
    <div className={`rounded-2xl p-5 ${dark ? "bg-neutral-900 text-white" : "card"}`}>
      <p className={`text-[12px] font-medium ${dark ? "text-neutral-400" : "text-neutral-500"}`}>{label}</p>
      <p className="mt-1 text-[32px] font-semibold tracking-tight tabular-nums">
        {value}
        {unit && <span className={`ml-1 text-[15px] font-medium ${dark ? "text-neutral-400" : "text-neutral-500"}`}>{unit}</span>}
      </p>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-4 p-6">
      <div>
        <h3 className="card-title">{title}</h3>
        {sub && <p className="card-sub mt-0.5">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function RankingTable({ rows }: { rows: ReportModel["ranking"] }) {
  if (rows.length === 0) return <p className="py-6 text-center text-[13px] text-neutral-400">부족한 동이 없습니다.</p>;
  const max = Math.max(1, rows[0].gap);
  return (
    <table className="w-full text-[13px]">
      <thead className="text-left text-[11px] text-neutral-500">
        <tr className="border-b border-black/[0.06]">
          <th className="w-6 py-2 font-medium">#</th>
          <th className="py-2 font-medium">행정동</th>
          <th className="w-[38%] py-2 font-medium">부족 인원</th>
          <th className="py-2 text-right font-medium">자리 없음</th>
          <th className="py-2 text-right font-medium">문 닫음</th>
          <th className="py-2 text-right font-medium">교사 부족</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.emdCode} className="border-b border-black/[0.04] last:border-0" title={`${r.name}: 수요 ${r.demand} · 자리 ${r.seats} · 부족 ${r.gap}`}>
            <td className="py-2.5 tabular-nums text-neutral-400">{r.rank}</td>
            <td className="py-2.5 font-medium text-neutral-900">{r.name}</td>
            <td className="py-2.5">
              <span className="flex items-center gap-2">
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.05]">
                  <span className="block h-full rounded-full bg-neutral-800" style={{ width: `${(r.gap / max) * 100}%` }} />
                </span>
                <span className="w-10 text-right font-semibold tabular-nums">{r.gap}</span>
              </span>
            </td>
            <td className="py-2.5 text-right tabular-nums text-neutral-600">{r.space || "–"}</td>
            <td className="py-2.5 text-right tabular-nums text-neutral-600">{r.time || "–"}</td>
            <td className="py-2.5 text-right tabular-nums text-neutral-600">{r.staff || "–"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 break-after-avoid border-b border-neutral-300 pb-1 text-base font-bold text-neutral-900">{title}</h2>
      {children}
    </section>
  );
}

const th = "border border-neutral-300 bg-neutral-100 px-2 py-1 text-left font-semibold";
const td = "border border-neutral-300 px-2 py-1";
const tdNum = `${td} text-right tabular-nums`;

function ReportDocument({ m }: { m: ReportModel }) {
  return (
    <article className="card mx-auto my-6 max-w-[210mm] break-keep bg-white px-[16mm] py-[14mm] text-[12px] leading-relaxed text-neutral-800 print:my-0 print:rounded-none print:max-w-none print:px-0 print:py-0 print:shadow-none">
      <header>
        <p className="text-[11px] text-neutral-500">
          서울특별시 {m.sigunguName} · {m.purpose}
        </p>
        <h1 className="mt-1 text-xl font-bold text-neutral-900">{m.title}</h1>
        <p className="mt-1 text-neutral-600">
          기간: {m.periodLabel} · 기준: {m.contextLabel}
        </p>
        <p className="text-[11px] text-neutral-500">
          데이터 기준일 {m.dataDate} · 작성 {new Date(m.generatedAt).toLocaleString("ko-KR")}
        </p>
        <div className="mt-4 grid grid-cols-4 border border-neutral-300">
          {[
            ["추정 수요", people(m.totals.demand)],
            ["이용 가능한 자리", people(m.totals.seats)],
            ["부족 인원", people(m.totals.gap)],
            ["부족한 동", `${m.totals.shortDongs} / ${m.totals.dongs}개`],
          ].map(([k, v], i) => (
            <div key={k} className={`px-3 py-2 ${i ? "border-l border-neutral-300" : ""} ${k === "부족 인원" ? "bg-neutral-900 text-white" : ""}`}>
              <p className={`text-[10px] ${k === "부족 인원" ? "text-neutral-300" : "text-neutral-500"}`}>{k}</p>
              <p className="text-lg font-bold tabular-nums">{v}</p>
            </div>
          ))}
        </div>
      </header>

      <Section title="핵심 요약">
        <ol className="list-decimal space-y-1 pl-5 text-[12.5px] text-neutral-900">
          {m.keyFindings.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ol>
      </Section>

      <Section title="지역 순위 (부족 인원 순)">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["순위", "행정동", "추정 수요", "이용 가능", "부족", "비율", "자리 없음", "문 닫음", "교사 부족", "부족 규모"].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.ranking.map((r) => (
              <tr key={r.emdCode}>
                <td className={tdNum}>{r.rank}</td>
                <td className={td}>{r.name}</td>
                <td className={tdNum}>{r.demand.toLocaleString()}</td>
                <td className={tdNum}>{r.seats.toLocaleString()}</td>
                <td className={`${tdNum} font-semibold`}>{r.gap.toLocaleString()}</td>
                <td className={tdNum}>{r.gap > 0 ? percent(r.ratio) : "-"}</td>
                <td className={tdNum}>{r.space || ""}</td>
                <td className={tdNum}>{r.time || ""}</td>
                <td className={tdNum}>{r.staff || ""}</td>
                <td className={`${td} w-[22%]`}>
                  {r.gap > 0 ? (
                    <div className="h-2.5 rounded-sm bg-neutral-800" style={{ width: `${(r.gap / Math.max(1, m.ranking[0].gap)) * 100}%` }} />
                  ) : (
                    <span className="text-[10px] text-neutral-500">{r.reason}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="부족 상위 동 권고 대안 (자동 산출 · 현장 확인 전 참고)">
        {m.recommendations.length === 0 ? (
          <p>부족한 동이 없습니다.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["행정동", "현재 부족", "효과가 가장 큰 대안", "줄어듦", "남는 부족", "모든 대안 적용 시"].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.recommendations.map((r) => (
                <tr key={r.name} className="break-inside-avoid">
                  <td className={`${td} font-semibold`}>{r.name}</td>
                  <td className={tdNum}>{r.gap}</td>
                  <td className={td}>
                    {r.best ? (
                      <>
                        <b>{r.best.title}</b>
                        <span className="block text-[10.5px] text-neutral-600">{r.best.needs.join(" · ")}</span>
                      </>
                    ) : (
                      "해당 대안 없음 (신규 정원 검토)"
                    )}
                  </td>
                  <td className={tdNum}>{r.best ? `−${r.best.reduction}` : "-"}</td>
                  <td className={tdNum}>{r.best ? r.best.remaining : r.gap}</td>
                  <td className={`${tdNum} font-semibold`}>{r.allCombinedAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="지역별 부족 인원과 이유">
        {m.reasonDetails.length === 0 ? (
          <p>부족한 동이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {m.reasonDetails.map((d) => (
              <li key={d.name} className="break-inside-avoid">
                <p>
                  <b>{d.name}</b> {people(d.gap)} 부족 —{" "}
                  {d.segments
                    .filter((s) => s.people > 0)
                    .map((s) => `${s.label} ${s.people}명${s.estimated ? "(추정)" : ""}`)
                    .join(", ")}
                </p>
                {d.facilities.length > 0 && (
                  <ul className="ml-4 list-disc text-[11px] text-neutral-600">
                    {d.facilities.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {m.slotMatrix && m.slotColumns && (
        <Section title="시간대별 부족 인원">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>행정동</th>
                {m.slotColumns.map((c) => (
                  <th key={c.id} className={th}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.slotMatrix.map((r) => (
                <tr key={r.name}>
                  <td className={td}>{r.name}</td>
                  {m.slotColumns!.map((c) => (
                    <td key={c.id} className={tdNum}>
                      {r.gaps[c.id].toLocaleString()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {m.reasonTotals && (
        <Section title="이유별 합계 (예산 항목 근거)">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["부족한 이유", "부족 인원 합계 (시간대 합)", "관련 예산"].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.reasonTotals.map((r) => (
                <tr key={r.axis}>
                  <td className={td}>{r.label}</td>
                  <td className={tdNum}>{r.people.toLocaleString()}</td>
                  <td className={td}>{r.budgetHint}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-neutral-500">시간대마다 같은 아동이 겹쳐 셀 수 있어, 합계는 규모 비교용입니다.</p>
        </Section>
      )}

      {m.unmet && (
        <Section title={`부모 검색 신호 (${m.unmet.quarter})${m.unmet.synthetic ? " — 시연용 가상 데이터" : ""}`}>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["행정동", "분기 검색", "결과 없음 비율", "표본", "공백 신호"].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.unmet.rows.map((r) => (
                <tr key={r.name}>
                  <td className={td}>{r.name}</td>
                  <td className={tdNum}>{r.searches}</td>
                  <td className={tdNum}>{r.noResultRate == null ? "표본 부족" : percent(r.noResultRate)}</td>
                  <td className={td}>{r.reliability === "reliable" ? "충분" : r.reliability === "reference" ? "참고(±15%p)" : "부족"}</td>
                  <td className={td}>{r.gapSignal ? "⚠ 있음" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-neutral-500">검색 신호는 스마트폰 이용이 많은 지역에 치우칠 수 있어 추정 수요와 함께 봐야 합니다.</p>
        </Section>
      )}

      <Section title="선택한 대안과 효과">
        {!m.decision ? (
          <p className="text-neutral-500">선택한 대안이 없습니다. 지도 화면에서 대안 카드를 선택한 뒤 리포트를 열면 포함됩니다.</p>
        ) : (
          <>
            <p className="mb-2">
              <b>{m.decision.dongName}</b>: 현재 {people(m.decision.combined.before)} 부족 → 대안 적용 후 <b>{people(m.decision.combined.after)} 부족</b>
            </p>
            <ul className="space-y-2">
              {m.decision.alternatives.map((a) => (
                <li key={a.title} className="break-inside-avoid rounded border border-neutral-300 p-2">
                  <p className="font-semibold">
                    {a.title} — {people(a.reduction)} 감소 (남는 부족 {people(a.remaining)})
                  </p>
                  <p>{a.sentence}</p>
                  {a.residualNote && <p>{a.residualNote}</p>}
                  {a.needs.length > 0 && <p className="text-[11px] text-neutral-600">필요한 것: {a.needs.join(" / ")}</p>}
                  {a.costs.map((c) => (
                    <p key={c.label} className="text-[11px] text-neutral-600">
                      {c.label}: {c.amount != null ? won(c.amount) : c.missing} · {c.formula} · 출처: {c.source ?? "미입력"}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      {m.comparison && (
        <Section title="시점 비교 (월별 부족 인원)">
          {m.comparison.months.length < 2 && (
            <p className="mb-1 text-[11px] text-neutral-500">
              스냅샷이 {m.comparison.months.join(", ")} 한 달분뿐입니다. 다음 데이터 갱신부터 전후 비교가 가능합니다.
            </p>
          )}
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>행정동</th>
                {m.comparison.months.map((mo) => (
                  <th key={mo} className={th}>
                    {mo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.comparison.rows.map((r) => (
                <tr key={r.name}>
                  <td className={td}>{r.name}</td>
                  {r.gaps.map((g, i) => (
                    <td key={i} className={tdNum}>
                      {g == null ? "-" : g.toLocaleString()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title="산정 방법">
        <ul className="list-disc pl-4 text-[11px] text-neutral-700">
          {m.methodology.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </Section>

      <Section title="데이터 기준일·출처와 유의 사항">
        <ul className="list-disc pl-4 text-[11px] text-neutral-600">
          {m.dataSources.map((s) => (
            <li key={s.label}>
              {s.label}: {s.value}
            </li>
          ))}
          {m.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Section>
    </article>
  );
}
