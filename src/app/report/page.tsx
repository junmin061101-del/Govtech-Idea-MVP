"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileSpreadsheet, Printer } from "lucide-react";
import { buildReport, REPORT_TEMPLATES, type ReportModel, type ReportTemplate } from "@/lib/report";
import { decodeView, encodeView, type ViewState } from "@/lib/viewState";
import { loadUnitCosts, won, DEFAULT_UNIT_COSTS, type UnitCost } from "@/lib/config/unitCosts";
import { ALL_DONGS, DATA_DATE, DATA_SOURCES, dongName, useFacilities, useSnapshots, useUnmetDemand } from "@/lib/hooks/useSeoulData";
import { people, percent } from "@/lib/mapScale";

const TEMPLATES = Object.keys(REPORT_TEMPLATES) as ReportTemplate[];
const TEMPLATE_LABEL: Record<ReportTemplate, string> = { monthly: "월 (운영 조정)", quarterly: "분기 (돌봄협의체)", annual: "연 (예산 편성 전)" };

export default function ReportPage() {
  const [view, setView] = useState<ViewState | null>(null);
  const [template, setTemplate] = useState<ReportTemplate>("monthly");
  const [unitCosts, setUnitCosts] = useState<UnitCost[]>(DEFAULT_UNIT_COSTS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setView(decodeView(window.location.search));
    const t = q.get("template");
    if (TEMPLATES.includes(t as ReportTemplate)) setTemplate(t as ReportTemplate);
    setUnitCosts(loadUnitCosts());
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

  return (
    <div className="min-h-screen bg-neutral-100 print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-4 py-2 print:hidden">
        <Link href={view ? `/?${encodeView(view)}` : "/"} className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800">
          <ArrowLeft className="h-4 w-4" /> 지도로
        </Link>
        <div className="ml-2 flex gap-1 rounded-lg bg-neutral-100 p-1" role="group" aria-label="리포트 템플릿">
          {TEMPLATES.map((t) => (
            <button
              key={t}
              onClick={() => setTemplate(t)}
              aria-pressed={template === t}
              className={`rounded-md px-2.5 py-1 text-sm ${template === t ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-200"}`}
            >
              {TEMPLATE_LABEL[t]}
            </button>
          ))}
        </div>
        <p className="hidden text-xs text-neutral-500 xl:block">
          지금 보던 구·시간대 기준 보고서입니다. 용도를 고른 뒤 PDF 또는 엑셀로 내려받으세요.
        </p>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => window.print()}
            disabled={!model}
            className="flex items-center gap-1 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            <Printer className="h-4 w-4" /> PDF로 저장
            <span className="text-[11px] font-normal text-neutral-300">인쇄 창에서 “PDF로 저장”</span>
          </button>
          <button
            onClick={download}
            disabled={!model || busy}
            className="flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-40"
          >
            <FileSpreadsheet className="h-4 w-4" /> {busy ? "만드는 중..." : "엑셀 내려받기"}
            {model && (
              <span className="text-[11px] text-neutral-400">
                시트 {7 + [model.reasonTotals, model.unmet, model.decision, model.comparison].filter(Boolean).length}개
              </span>
            )}
          </button>
        </div>
      </div>

      {!model ? (
        <p className="p-10 text-center text-sm text-neutral-400">리포트를 만드는 중...</p>
      ) : (
        <ReportDocument m={model} />
      )}
    </div>
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
    <article className="mx-auto my-6 max-w-[210mm] break-keep bg-white px-[16mm] py-[14mm] text-[12px] leading-relaxed text-neutral-800 shadow print:my-0 print:max-w-none print:px-0 print:py-0 print:shadow-none">
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
