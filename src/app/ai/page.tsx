"use client";

/**
 * AI 상담 탭 — 시민 앱 AI 상담을 구 단위로 실시간 집계하고(익명 기록), 수집 동의한 대화를 바로 보여 준다.
 * 운영자(careos_admin)는 "서울 전체"로 25개 구를 한 번에 비교할 수 있다.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Lock, MapPin } from "lucide-react";
import TopController from "@/components/TopController";
import Notice from "@/components/Notice";
import { BarList, ColumnChart } from "@/components/charts/Bars";
import { canReadDistrict, useAuth } from "@/lib/firebase/AuthProvider";
import { firebase } from "@/lib/firebase/client";
import { ago, AGENT_TOPICS, computeAgentStats, sameKstDay } from "@/lib/agentStats";
import { INSIGHT_DAYS, INSIGHT_MAX, LOG_MAX, useAgentLive } from "@/lib/hooks/useAgentLive";
import { decodeView, encodeView, DEFAULT_VIEW, type ViewState } from "@/lib/viewState";
import { sigunguByCode } from "@/lib/constants/regions";
import { TIME_SLOTS, timeSlotDef } from "@/lib/constants/timeSlots";
import { CARE_TARGETS } from "@/lib/constants/targets";
import { dongName } from "@/lib/hooks/useSeoulData";
import { percent } from "@/lib/mapScale";
import type { CareTargetId } from "@/types";

type Period = "today" | "week";
type Filter = "all" | "noResult";

const targetShort = (id: CareTargetId | null) => (CARE_TARGETS.find((t) => t.id === id)?.label ?? "연령 미상").split("(")[0];
const fmt = (d: Date | null) =>
  d ? d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const sggName = (code: string) => sigunguByCode(code)?.name ?? code;

export default function AiPage() {
  const auth = useAuth();
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW);
  const [allSeoul, setAllSeoul] = useState(false);
  const [restored, setRestored] = useState(false);
  const [period, setPeriod] = useState<Period>("week");
  const [filter, setFilter] = useState<Filter>("all");
  const [dongFilter, setDongFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null);
  const closeNotice = useCallback(() => setNotice(null), []);

  useEffect(() => {
    setView(decodeView(window.location.search));
    setAllSeoul(new URLSearchParams(window.location.search).get("scope") === "all");
    setRestored(true);
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const isAdmin = auth.role === "careos_admin";
  const all = allSeoul && isAdmin;
  const sgg = view.sigunguCode;
  const query = encodeView(view);
  useEffect(() => {
    if (restored) window.history.replaceState(null, "", `?${query}${all ? "&scope=all" : ""}`);
  }, [restored, query, all]);

  const allowed = Boolean(firebase()) && (all ? isAdmin : canReadDistrict(auth, sgg));
  const live = useAgentLive(allowed && restored, all ? null : sgg);
  // 새 기록이 들어오면 '지금'도 갱신 (오늘 경계·"n분 전")
  useEffect(() => setNow(new Date()), [live.insights, live.logs]);

  const stats = useMemo(() => {
    const ins = live.insights;
    if (!ins || ins.error) return null;
    const rows = period === "today" ? ins.data.filter((r) => r.createdAt && sameKstDay(r.createdAt, now)) : ins.data;
    return computeAgentStats(rows, now, period === "today" ? 1 : INSIGHT_DAYS);
  }, [live.insights, period, now]);
  const week = useMemo(() => (live.insights && !live.insights.error ? computeAgentStats(live.insights.data, now, INSIGHT_DAYS) : null), [live.insights, now]);

  const place = all ? "서울 전체" : sggName(sgg);
  const periodLabel = period === "today" ? "오늘" : `최근 ${INSIGHT_DAYS}일`;
  const logs = useMemo(() => live.logs?.data ?? [], [live.logs]);
  const shown = logs.filter(
    (l) =>
      (filter !== "noResult" || l.noResult) &&
      (!dongFilter || (all ? l.sigunguCode === dongFilter : l.emdCode === dongFilter)) &&
      (!topicFilter || l.topics.includes(topicFilter)),
  );
  const feedPlaces = useMemo(() => {
    const ids = [...new Set(logs.map((l) => (all ? l.sigunguCode : l.emdCode)).filter(Boolean) as string[])];
    return ids.map((id) => ({ id, name: all ? sggName(id) : (dongName(id) ?? id) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [logs, all]);

  const header = (
    <TopController
      tab="ai"
      showFilters={false}
      allowAll={isAdmin}
      sigunguCode={all ? "all" : sgg}
      onSigunguChange={(code) => {
        if (code === "all") return setAllSeoul(true);
        setAllSeoul(false);
        setView((v) => ({ ...v, sigunguCode: code, dongId: null, alternatives: [] }));
        setDongFilter("");
      }}
      target={view.target}
      onTargetChange={(target) => setView((v) => ({ ...v, target }))}
      timeSlot={view.timeSlot}
      onTimeSlotChange={(timeSlot) => setView((v) => ({ ...v, timeSlot }))}
      query={query}
      onUnavailable={(text) => setNotice({ text, id: Date.now() })}
    />
  );

  if (auth.loading || !restored) return <div className="min-h-screen">{header}</div>;

  return (
    <div className="min-h-screen pb-16">
      {header}
      <Notice message={notice} onClose={closeNotice} />

      <main className="mx-auto flex max-w-[1440px] flex-col gap-5 break-keep px-6 pt-8">
        {/* 제목 */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-neutral-500">{place}</p>
            <h2 className="text-[28px] font-semibold tracking-tight text-neutral-900">AI 상담</h2>
            <p className="mt-1 text-[13px] text-neutral-500">시민 앱에서 AI 상담이 끝나는 즉시 이 화면에 들어옵니다.</p>
          </div>
          {allowed && (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[12px] text-neutral-500" data-testid="agent-live">
                <span className={`h-2 w-2 rounded-full ${live.live ? "animate-pulse bg-emerald-500" : "bg-neutral-300"}`} aria-hidden />
                {live.live ? "실시간" : "연결 중"}
                {live.lastAt && <span>· 마지막 상담 {ago(live.lastAt, now)}</span>}
              </span>
              <div className="seg" role="group" aria-label="집계 기간">
                {(
                  [
                    ["today", "오늘"],
                    ["week", `${INSIGHT_DAYS}일`],
                  ] as [Period, string][]
                ).map(([p, label]) => (
                  <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)} className="seg-item">
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {!allowed ? (
          <section className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
            <Lock className="h-6 w-6 text-neutral-400" />
            <p className="text-[15px] font-semibold text-neutral-900">
              {auth.user ? "이 구의 AI 상담 기록을 볼 권한이 없습니다" : "로그인하면 AI 상담 기록을 실시간으로 볼 수 있습니다"}
            </p>
            <p className="text-[13px] text-neutral-500">
              {auth.user ? "자기 구만 볼 수 있습니다. 운영자는 모든 구를 볼 수 있습니다." : "구청 담당자·운영자 계정으로 로그인해 주세요."}
            </p>
            {!auth.user && (
              <Link href="/login" className="btn-primary mt-2">
                로그인
              </Link>
            )}
          </section>
        ) : (
          <>
            {/* 핵심 숫자 */}
            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="agent-stats">
              <Kpi label={`${periodLabel} 상담`} value={stats ? `${stats.count}` : "–"} unit="건" sub={week && period === "week" ? `오늘 ${week.today}건` : undefined} />
              <Kpi
                label="시설 못 찾음"
                value={stats?.noResultRate == null ? "–" : percent(stats.noResultRate)}
                sub={stats ? `${stats.noResult}건 · 부모의 미충족 수요 신호` : undefined}
                dark
              />
              <Kpi label="가장 많이 물은 주제" value={stats?.topics[0]?.label ?? "–"} sub={stats?.topics[0] ? `${stats.topics[0].count}건` : undefined} />
              <Kpi label="수집 동의 대화" value={live.logs ? `${logs.length}` : "–"} unit="건" sub={`최근 ${LOG_MAX}건까지 · 원문 확인 가능`} />
            </section>
            {live.insights?.error && <p className="text-[13px] text-neutral-500">상담 집계를 불러오지 못했습니다: {live.insights.error}</p>}
            {live.insights && !live.insights.error && live.insights.data.length >= INSIGHT_MAX && (
              <p className="text-[12px] text-neutral-500">최근 {INSIGHT_MAX.toLocaleString()}건까지만 집계했습니다.</p>
            )}

            {/* 언제 */}
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card title="날짜별 상담" sub={`최근 ${INSIGHT_DAYS}일 · 막대에 마우스를 올리면 시설 못 찾음 건수`}>
                {week && (
                  <ColumnChart
                    label="날짜별 상담 수"
                    data={week.byDay.map((d, i) => ({
                      key: d.date,
                      axis: i === week.byDay.length - 1 ? "오늘" : d.date.slice(5).replace("-", "/"),
                      value: d.count,
                      tip: `${d.date.slice(5).replace("-", "/")} · ${d.count}건 (못 찾음 ${d.noResult})`,
                      highlight: i === week.byDay.length - 1,
                    }))}
                  />
                )}
              </Card>
              <Card title="시각별 상담" sub={`${periodLabel} · 한국 시간 · 지금 시각 강조`}>
                {stats && (
                  <ColumnChart
                    label="시각별 상담 수"
                    data={stats.byHour.map((v, h) => ({
                      key: String(h),
                      axis: h % 6 === 0 ? `${h}시` : "",
                      value: v,
                      tip: `${h}시대 · ${v}건`,
                      highlight: h === new Date(now.getTime() + 9 * 3600_000).getUTCHours(),
                    }))}
                  />
                )}
              </Card>
              <Card title="많이 물은 주제" sub={`${periodLabel} · 한 상담에 여러 주제가 있을 수 있음`}>
                {stats && stats.topics.length > 0 ? (
                  <BarList data={stats.topics.slice(0, 6).map((t) => ({ key: t.id, label: t.label, value: t.count }))} />
                ) : (
                  <Empty />
                )}
              </Card>
            </section>

            {/* 어디서 */}
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
              <Card
                title={all ? "구별 상담" : "동별 상담"}
                sub={all ? "누르면 그 구로 이동" : "지도 아이콘을 누르면 지도에서 그 동을 엽니다"}
              >
                {stats && (all ? stats.sigungus.length : stats.dongs.length) > 0 ? (
                  <PlaceTable
                    rows={
                      all
                        ? stats.sigungus.map((g) => ({ id: g.sigunguCode, name: sggName(g.sigunguCode), count: g.count, noResult: g.noResult, topic: null }))
                        : stats.dongs.map((d) => ({ id: d.emdCode, name: dongName(d.emdCode) ?? d.emdCode, count: d.count, noResult: d.noResult, topic: d.topTopic }))
                    }
                    showTopic={!all}
                    onPick={(id) => {
                      if (all) {
                        setAllSeoul(false);
                        setView((v) => ({ ...v, sigunguCode: id, dongId: null, alternatives: [] }));
                      }
                    }}
                    mapHref={all ? undefined : (id) => `/?${encodeView({ ...view, dongId: id, alternatives: [] })}`}
                  />
                ) : (
                  <Empty />
                )}
              </Card>
              <div className="flex flex-col gap-4">
                <Card title="시간대·대상별 문의" sub={`${periodLabel} · 시민이 말한 이용 시간 기준`}>
                  {stats && stats.count > 0 ? (
                    <div className="flex flex-col gap-4">
                      <BarList
                        data={TIME_SLOTS.map((t) => ({ key: t.id, label: t.shortLabel, value: stats.bySlot[t.id] ?? 0 }))}
                        labelWidth="w-16"
                      />
                      <div className="border-t border-black/[0.06] pt-3">
                        <BarList
                          data={CARE_TARGETS.map((t) => ({ key: t.id, label: targetShort(t.id), value: stats.byTarget[t.id] ?? 0 }))}
                          labelWidth="w-16"
                        />
                      </div>
                    </div>
                  ) : (
                    <Empty />
                  )}
                </Card>
                {!all && live.summary?.summary && (
                  <Card title="AI 요약" sub={`최근 ${live.summary.periodDays}일 · ${fmt(live.summary.generatedAt)} 갱신 · 참고용`}>
                    <p className="text-[13px] leading-relaxed text-neutral-800">{live.summary.summary}</p>
                  </Card>
                )}
              </div>
            </section>

            {/* 대화 */}
            <section className="card flex flex-col gap-4 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="card-title">실시간 대화</h3>
                  {live.fresh.size > 0 && (
                    <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white" data-testid="agent-fresh-count">
                      새 {live.fresh.size}
                    </span>
                  )}
                  <span className="card-sub">수집에 동의한 시민 대화만 · 개인정보 자동 가림</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="seg" role="group" aria-label="결과">
                    {(
                      [
                        ["all", "전체"],
                        ["noResult", "시설 못 찾음"],
                      ] as [Filter, string][]
                    ).map(([f, label]) => (
                      <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className="seg-item">
                        {label}
                      </button>
                    ))}
                  </div>
                  <Select label={all ? "구" : "동"} value={dongFilter} onChange={setDongFilter} options={feedPlaces.map((p) => [p.id, p.name])} />
                  <Select label="주제" value={topicFilter} onChange={setTopicFilter} options={Object.entries(AGENT_TOPICS)} />
                </div>
              </div>

              {!live.logs ? (
                <p className="text-[13px] text-neutral-400">불러오는 중...</p>
              ) : live.logs.error ? (
                <p className="text-[13px] text-neutral-500">대화를 불러오지 못했습니다: {live.logs.error}</p>
              ) : shown.length === 0 ? (
                <Empty text={logs.length === 0 ? "아직 수집 동의한 대화가 없습니다." : "조건에 맞는 대화가 없습니다."} />
              ) : (
                <ul className="flex flex-col divide-y divide-black/[0.06]" data-testid="agent-feed">
                  {shown.map((l) => {
                    const isNew = live.fresh.has(l.id);
                    return (
                      <li key={l.id} className={isNew ? "-mx-3 rounded-xl bg-neutral-100 px-3" : ""}>
                        <details
                          className="group"
                          onToggle={(e) => {
                            if ((e.currentTarget as HTMLDetailsElement).open && isNew) live.markSeen(l.id);
                          }}
                        >
                          <summary className="flex cursor-pointer list-none items-start gap-4 py-3.5">
                            <div className="w-28 shrink-0 text-[12px] text-neutral-500">
                              <p className="font-medium text-neutral-800">{all ? sggName(l.sigunguCode) : (l.emdCode && dongName(l.emdCode)) || "동 미상"}</p>
                              <p title={fmt(l.createdAt)}>{ago(l.createdAt, now)}</p>
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                              <p className="text-[14px] leading-snug text-neutral-900">{l.question}</p>
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
                                {isNew && <span className="rounded-full bg-neutral-900 px-1.5 py-0.5 font-semibold text-white">새 대화</span>}
                                {l.noResult && <span className="rounded-full px-1.5 py-0.5 font-semibold text-neutral-900 ring-1 ring-neutral-900">시설 못 찾음</span>}
                                {l.topics.map((t) => (
                                  <span key={t} className="rounded-full bg-black/[0.05] px-1.5 py-0.5">
                                    {AGENT_TOPICS[t] ?? t}
                                  </span>
                                ))}
                                {l.target && <span>· {targetShort(l.target)}</span>}
                                {l.timeSlots.length > 0 && <span>· {l.timeSlots.map((t) => timeSlotDef(t).shortLabel).join("·")}</span>}
                              </div>
                            </div>
                            <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-neutral-400 transition-transform group-open:rotate-180" />
                          </summary>
                          <div className="mb-4 ml-32 whitespace-pre-wrap rounded-xl bg-[#f5f5f7] p-4 text-[13px] leading-relaxed text-neutral-700">
                            <p className="mb-1 text-[11px] font-semibold text-neutral-500">AI 답변</p>
                            {l.answer}
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              )}
              {live.logs && !live.logs.error && logs.length > 0 && (
                <p className="text-[12px] text-neutral-500">
                  최근 {logs.length}건 중 {shown.length}건
                </p>
              )}
            </section>

            <details className="group px-1 text-[12px] leading-relaxed text-neutral-500">
              <summary className="flex cursor-pointer list-none items-center gap-1">
                읽는 법·개인정보 <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
              </summary>
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                <li>숫자 집계: 시민 앱 AI 상담 전체의 익명 기록(행정동·시간대·대상·주제·결과). 상담이 끝나는 즉시 반영. 회원 식별 정보·대화 원문 없음.</li>
                <li>시설 못 찾음: AI가 조건에 맞는 시설을 한 곳도 찾지 못한 상담으로, 부모의 미충족 수요 신호입니다.</li>
                <li>대화: 대화 내용 수집에 동의한 시민 것만. 전화번호·이메일·이름·상세 주소는 자동으로 가렸지만 완전하지 않을 수 있어 외부 공유 금지. 90일 뒤 자동 삭제, 동의 철회·탈퇴 시 즉시 삭제.</li>
                <li>AI 요약은 매일 05시에 최근 30일을 정리한 참고용입니다. 앱 이용자 중심이라 실제 수요와 다를 수 있습니다.</li>
              </ul>
            </details>
          </>
        )}
      </main>
    </div>
  );
}

function Kpi({ label, value, unit, sub, dark }: { label: string; value: string; unit?: string; sub?: string; dark?: boolean }) {
  return (
    <div className={`rounded-2xl p-5 ${dark ? "bg-neutral-900 text-white" : "card"}`}>
      <p className={`text-[12px] font-medium ${dark ? "text-neutral-400" : "text-neutral-500"}`}>{label}</p>
      <p className="mt-1 truncate text-[32px] font-semibold tracking-tight tabular-nums">
        {value}
        {unit && <span className={`ml-0.5 text-[15px] font-medium ${dark ? "text-neutral-400" : "text-neutral-500"}`}>{unit}</span>}
      </p>
      {sub && <p className={`mt-0.5 text-[12px] ${dark ? "text-neutral-400" : "text-neutral-500"}`}>{sub}</p>}
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

function Empty({ text = "기간 안 상담이 없습니다." }: { text?: string }) {
  return <p className="py-6 text-center text-[13px] text-neutral-400">{text}</p>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="relative flex items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 appearance-none rounded-[10px] bg-black/[0.05] pl-3 pr-7 text-[13px] font-medium text-neutral-800 outline-none hover:bg-black/[0.08]"
      >
        <option value="">{label} 전체</option>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-neutral-500" />
    </label>
  );
}

interface PlaceRow {
  id: string;
  name: string;
  count: number;
  noResult: number;
  topic: string | null;
}

/** 동(또는 구)별 표 — 상담 수 막대와 시설 못 찾음 비율 */
function PlaceTable({
  rows,
  showTopic,
  onPick,
  mapHref,
}: {
  rows: PlaceRow[];
  showTopic: boolean;
  onPick: (id: string) => void;
  mapHref?: (id: string) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="max-h-[420px] overflow-y-auto">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 bg-white text-left text-[11px] text-neutral-500">
          <tr className="border-b border-black/[0.06]">
            <th className="w-8 py-2 font-medium">#</th>
            <th className="py-2 font-medium">{mapHref ? "행정동" : "자치구"}</th>
            <th className="w-[34%] py-2 font-medium">상담</th>
            <th className="py-2 text-right font-medium">못 찾음</th>
            <th className="py-2 text-right font-medium">비율</th>
            {showTopic && <th className="py-2 pl-4 font-medium">주요 주제</th>}
            {mapHref && <th className="w-8" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.id}
              className={`border-b border-black/[0.04] last:border-0 ${mapHref ? "" : "cursor-pointer hover:bg-black/[0.03]"}`}
              onClick={() => onPick(r.id)}
            >
              <td className="py-2.5 tabular-nums text-neutral-400">{i + 1}</td>
              <td className="py-2.5 font-medium text-neutral-900">{r.name}</td>
              <td className="py-2.5">
                <span className="flex items-center gap-2">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.05]">
                    <span className="block h-full rounded-full bg-neutral-800" style={{ width: `${(r.count / max) * 100}%` }} />
                  </span>
                  <span className="w-8 text-right font-semibold tabular-nums">{r.count}</span>
                </span>
              </td>
              <td className="py-2.5 text-right tabular-nums text-neutral-700">{r.noResult}</td>
              <td className="py-2.5 text-right tabular-nums font-medium text-neutral-900">{percent(r.noResult / r.count)}</td>
              {showTopic && <td className="py-2.5 pl-4 text-neutral-600">{r.topic ?? "–"}</td>}
              {mapHref && (
                <td className="py-2.5 text-right">
                  <Link href={mapHref(r.id)} title={`${r.name} 지도에서 보기`} className="inline-flex rounded-full p-1 text-neutral-400 hover:bg-black/[0.05] hover:text-neutral-900">
                    <MapPin className="h-4 w-4" />
                    <span className="sr-only">{r.name} 지도에서 보기</span>
                  </Link>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
