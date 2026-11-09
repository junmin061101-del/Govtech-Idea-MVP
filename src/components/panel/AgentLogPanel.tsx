"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, ChevronDown, Info, Lock, MessageSquareText } from "lucide-react";
import type { CareTargetId, Dong, TimeSlotId } from "@/types";
import { canReadDistrict, useAuth } from "@/lib/firebase/AuthProvider";
import { firebase } from "@/lib/firebase/client";
import { timeSlotDef } from "@/lib/constants/timeSlots";
import { CARE_TARGETS } from "@/lib/constants/targets";
import { sigunguByCode } from "@/lib/constants/regions";
import { percent } from "@/lib/mapScale";
import { ago, computeAgentStats, sameKstDay, type AgentInsight } from "@/lib/agentStats";
import { subscribeAgentInsights, subscribeAgentLogs, subscribeAgentSummary, type AgentLog, type AgentSummary } from "@/lib/store/agentLogs";

interface AgentLogPanelProps {
  sigunguCode: string;
  /** 지도에서 고른 동 — 대화 목록의 '선택 동' 거르기에만 쓴다 (집계는 구 전체) */
  dong: Dong | null;
  timeSlot: TimeSlotId;
  target: CareTargetId;
  dongName: (id: string) => string | undefined;
  onSelectDong: (id: string) => void;
}

/** 실시간 숫자 집계에 쓰는 기간·최대 건수 */
const INSIGHT_DAYS = 7;
const INSIGHT_MAX = 2000;
/** 실시간 대화 목록 최대 건수 */
const LOG_MAX = 100;

type Stream<T> = { key: string; data: T; error: string | null } | null;
type Filter = "all" | "dong" | "noResult" | "view";
type Period = "today" | "week";

const targetShort = (id: CareTargetId | null) => (CARE_TARGETS.find((t) => t.id === id)?.label ?? "연령 미상").split("(")[0];
const fmt = (d: Date | null) =>
  d ? d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const errText = (e: Error) => (/permission|insufficient/i.test(e.message) ? "열람 권한이 없거나 규칙이 아직 배포되지 않았습니다" : e.message);

/** 사용자 로그 · AI 상담 — 시민 앱 AI 상담을 구 단위로 실시간 집계하고, 수집 동의한 대화를 바로 보여 준다 */
export default function AgentLogPanel({ sigunguCode, dong, timeSlot, target, dongName, onSelectDong }: AgentLogPanelProps) {
  const auth = useAuth();
  const allowed = Boolean(firebase()) && canReadDistrict(auth, sigunguCode);
  const districtName = sigunguByCode(sigunguCode)?.name ?? sigunguCode;

  const [insights, setInsights] = useState<Stream<AgentInsight[]>>(null);
  const [logs, setLogs] = useState<Stream<AgentLog[]>>(null);
  const [summary, setSummary] = useState<Stream<AgentSummary | null>>(null);
  const [fresh, setFresh] = useState<{ key: string; ids: Set<string> }>({ key: "", ids: new Set() });
  const [period, setPeriod] = useState<Period>("week");
  const [filter, setFilter] = useState<Filter>("all");
  const [now, setNow] = useState(() => new Date());

  // "3분 전" 같은 표시와 '오늘' 경계를 갱신
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!allowed) return;
    const key = sigunguCode;
    const fail = (set: (s: Stream<never>) => void) => (e: Error) => set({ key, data: [] as never, error: errText(e) });
    const offs = [
      subscribeAgentInsights(
        key,
        INSIGHT_DAYS,
        INSIGHT_MAX,
        (rows) => {
          setInsights({ key, data: rows, error: null });
          setNow(new Date());
        },
        fail(setInsights),
      ),
      subscribeAgentLogs(
        key,
        LOG_MAX,
        (rows, added) => {
          setLogs({ key, data: rows, error: null });
          if (added.length)
            setFresh((f) => ({ key, ids: new Set([...(f.key === key ? f.ids : []), ...added]) }));
        },
        fail(setLogs),
      ),
      subscribeAgentSummary(key, (s) => setSummary({ key, data: s, error: null }), (e) => setSummary({ key, data: null, error: errText(e) })),
    ];
    return () => offs.forEach((off) => off());
  }, [allowed, sigunguCode]);

  const ins = insights?.key === sigunguCode ? insights : null;
  const lg = logs?.key === sigunguCode ? logs : null;
  const sm = summary?.key === sigunguCode ? summary?.data ?? null : null;
  const freshIds = fresh.key === sigunguCode ? fresh.ids : new Set<string>();

  const stats = useMemo(() => {
    if (!ins || ins.error) return null;
    const rows = period === "today" ? ins.data.filter((r) => r.createdAt && sameKstDay(r.createdAt, now)) : ins.data;
    return computeAgentStats(rows, now, period === "today" ? 1 : INSIGHT_DAYS);
  }, [ins, period, now]);
  const lastAt = useMemo(() => {
    const a = ins?.data[0]?.createdAt ?? null;
    const b = lg?.data[0]?.createdAt ?? null;
    return a && b ? (a > b ? a : b) : (a ?? b);
  }, [ins, lg]);

  const slot = timeSlotDef(timeSlot);
  const header = (
    <p className="flex items-center gap-1.5 text-sm font-bold text-neutral-900">
      <Bot className="h-4 w-4 text-neutral-400" /> 사용자 로그 · AI 상담
    </p>
  );

  if (auth.loading) return null;
  if (!allowed) {
    return (
      <div className="flex flex-col gap-2 break-keep p-5">
        {header}
        <p className="flex items-center gap-1.5 text-xs text-neutral-500">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          {auth.user ? "이 구의 열람 권한이 없습니다 (자기 구만 볼 수 있습니다)." : "구청 담당자로 로그인하면 이 구 시민의 AI 상담 기록을 실시간으로 볼 수 있습니다."}
        </p>
      </div>
    );
  }

  const live = Boolean(ins && !ins.error) || Boolean(lg && !lg.error);
  const periodLabel = period === "today" ? "오늘" : `최근 ${INSIGHT_DAYS}일`;
  const shownLogs = (lg?.data ?? []).filter((l) =>
    filter === "dong"
      ? l.emdCode === dong?.id
      : filter === "noResult"
        ? l.noResult
        : filter === "view"
          ? l.timeSlots.includes(timeSlot) && l.target === target
          : true,
  );
  const filters: [Filter, string][] = [
    ["all", "전체"],
    ...(dong ? ([["dong", dong.name]] as [Filter, string][]) : []),
    ["noResult", "시설 못 찾음"],
    ["view", `${slot.shortLabel}·${targetShort(target)}`],
  ];
  const topTopics = stats?.topics.slice(0, 5) ?? [];
  const topDongs = stats?.dongs.slice(0, 5) ?? [];
  const maxTopic = topTopics[0]?.count ?? 1;

  return (
    <div className="flex flex-col gap-3 break-keep p-5" data-testid="agent-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {header}
        <span className="flex items-center gap-1.5 text-[11px] text-neutral-500" data-testid="agent-live">
          <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-emerald-500" : "bg-neutral-300"}`} aria-hidden />
          {live ? "실시간" : "연결 중"}
          {lastAt && <span>· 마지막 상담 {ago(lastAt, now)}</span>}
        </span>
      </div>

      {/* 구 전체 실시간 집계 */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-neutral-800">{districtName} 전체</p>
        <div className="flex rounded-md border border-neutral-200 p-0.5 text-[11px]" role="group" aria-label="집계 기간">
          {(
            [
              ["today", "오늘"],
              ["week", `${INSIGHT_DAYS}일`],
            ] as [Period, string][]
          ).map(([p, label]) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              className={`rounded px-2 py-0.5 ${period === p ? "bg-neutral-900 font-semibold text-white" : "text-neutral-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!ins ? (
        <p className="text-xs text-neutral-400">불러오는 중...</p>
      ) : ins.error ? (
        <p className="text-xs text-neutral-500">상담 집계를 불러오지 못했습니다: {ins.error}</p>
      ) : stats && stats.count === 0 ? (
        <p className="text-xs text-neutral-500">{periodLabel} 상담이 없습니다. 시민이 AI 상담을 마치면 바로 여기에 집계됩니다.</p>
      ) : stats ? (
        <>
          <dl className="grid grid-cols-3 overflow-hidden rounded-lg border border-neutral-200" data-testid="agent-stats">
            <Stat label={`${periodLabel} 상담`} value={`${stats.count}건`} sub={period === "week" ? `오늘 ${stats.today}건` : undefined} />
            <Stat label="시설 못 찾음" value={stats.noResultRate == null ? "-" : percent(stats.noResultRate)} sub={`${stats.noResult}건`} />
            <Stat label={`${slot.shortLabel} 문의`} value={`${stats.bySlot[timeSlot] ?? 0}건`} sub={`${targetShort(target)} ${stats.byTarget[target] ?? 0}건`} />
          </dl>

          {topTopics.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-[11px] font-semibold text-neutral-700">많이 물은 주제</p>
              {topTopics.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-[11px] text-neutral-700">
                  <span className="w-20 shrink-0 truncate">{t.label}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded bg-neutral-100">
                    <span className="block h-full rounded bg-neutral-700" style={{ width: `${(t.count / maxTopic) * 100}%` }} />
                  </span>
                  <span className="w-9 shrink-0 text-right font-semibold text-neutral-900">{t.count}</span>
                </div>
              ))}
            </div>
          )}

          {topDongs.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-[11px] font-semibold text-neutral-700">상담이 많은 동 · 누르면 지도에서 선택</p>
              <ol className="overflow-hidden rounded-lg border border-neutral-200">
                {topDongs.map((d, i) => (
                  <li key={d.emdCode} className="border-b border-neutral-100 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => onSelectDong(d.emdCode)}
                      aria-current={dong?.id === d.emdCode ? "true" : undefined}
                      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-neutral-50 ${dong?.id === d.emdCode ? "bg-neutral-100 font-semibold" : ""}`}
                    >
                      <span className="w-4 text-neutral-400">{i + 1}</span>
                      <span className="flex-1 text-neutral-900">{dongName(d.emdCode) ?? d.emdCode}</span>
                      <span className="font-semibold text-neutral-900">{d.count}건</span>
                      <span className="w-16 text-right text-[11px] text-neutral-500">못 찾음 {d.noResult}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {ins.data.length >= INSIGHT_MAX && <p className="text-[11px] text-neutral-500">최근 {INSIGHT_MAX}건까지만 집계했습니다.</p>}
        </>
      ) : null}

      {/* 실시간 대화 */}
      <div className="flex flex-col gap-2 border-t border-neutral-100 pt-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800">
          <MessageSquareText className="h-3.5 w-3.5 text-neutral-400" /> 실시간 대화
          {freshIds.size > 0 && (
            <span className="rounded-full bg-neutral-900 px-1.5 text-[10px] font-semibold text-white" data-testid="agent-fresh-count">
              새 {freshIds.size}
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-1" role="group" aria-label="대화 거르기">
          {filters.map(([f, label]) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${filter === f ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-600"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {!lg ? (
          <p className="text-xs text-neutral-400">불러오는 중...</p>
        ) : lg.error ? (
          <p className="text-xs text-red-600">대화를 불러오지 못했습니다: {lg.error}</p>
        ) : shownLogs.length === 0 ? (
          <p className="text-xs text-neutral-500">
            {lg.data.length === 0 ? "아직 수집 동의한 대화가 없습니다." : "조건에 맞는 대화가 없습니다."}
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-2" data-testid="agent-feed">
              {shownLogs.map((l) => {
                const isNew = freshIds.has(l.id);
                return (
                  <li key={l.id} className={`rounded-lg border ${isNew ? "border-neutral-900" : "border-neutral-200"}`}>
                    <details
                      className="group"
                      onToggle={(e) => {
                        if ((e.currentTarget as HTMLDetailsElement).open && isNew)
                          setFresh((f) => ({ key: f.key, ids: new Set([...f.ids].filter((x) => x !== l.id)) }));
                      }}
                    >
                      <summary className="flex cursor-pointer list-none flex-col gap-1 p-2.5">
                        <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
                          {isNew && <span className="rounded bg-neutral-900 px-1 font-semibold text-white">새 대화</span>}
                          <span title={fmt(l.createdAt)}>{ago(l.createdAt, now)}</span>
                          {l.emdCode && <span>· {dongName(l.emdCode) ?? l.emdCode}</span>}
                          {l.target && <span>· {targetShort(l.target)}</span>}
                          {l.timeSlots.length > 0 && <span>· {l.timeSlots.map((t) => timeSlotDef(t).shortLabel).join("·")}</span>}
                          {l.noResult && <span className="rounded border border-neutral-900 px-1 font-semibold text-neutral-900">시설 못 찾음</span>}
                        </span>
                        <span className="flex items-start gap-1 text-xs text-neutral-900">
                          <span className="line-clamp-2 flex-1">{l.question}</span>
                          <ChevronDown className="mt-0.5 h-3 w-3 shrink-0 text-neutral-400 transition-transform group-open:rotate-180" />
                        </span>
                      </summary>
                      <p className="whitespace-pre-wrap border-t border-neutral-100 p-2.5 text-xs leading-relaxed text-neutral-700">{l.answer}</p>
                    </details>
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-neutral-500">
              최근 {lg.data.length}건 중 {shownLogs.length}건 · 수집 동의한 대화만
            </p>
          </>
        )}
      </div>

      {/* 매일 AI 요약 (최근 30일) */}
      {sm && (sm.summary || (dong && sm.dongSummaries[dong.id])) && (
        <div className="flex flex-col gap-2 rounded-lg bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-800">
          <p className="font-semibold text-neutral-900">
            AI 요약 <span className="font-normal text-neutral-500">· 최근 {sm.periodDays}일 · {fmt(sm.generatedAt)} 갱신</span>
          </p>
          {sm.summary && <p>{sm.summary}</p>}
          {dong && sm.dongSummaries[dong.id] && (
            <p>
              <span className="font-semibold text-neutral-900">{dong.name}</span> · {sm.dongSummaries[dong.id]}
            </p>
          )}
        </div>
      )}

      <details className="group text-[11px] leading-relaxed text-neutral-500">
        <summary className="flex cursor-pointer list-none items-center gap-1">
          <Info className="h-3 w-3 shrink-0" /> 읽는 법·개인정보
          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
        </summary>
        <ul className="mt-1 space-y-0.5 pl-4">
          <li>숫자 집계: 시민 앱 AI 상담 전체의 익명 기록(행정동·시간대·대상·주제·결과). 상담이 끝나는 즉시 반영. 회원 식별 정보·대화 원문 없음.</li>
          <li>대화: 대화 내용 수집에 동의한 시민 것만. 전화번호·이메일·이름·상세 주소는 자동으로 가렸지만 완전하지 않을 수 있어 외부 공유 금지.</li>
          <li>대화는 90일 뒤 자동 삭제되고, 시민이 동의를 철회하거나 탈퇴하면 즉시 삭제됩니다.</li>
          <li>AI 요약은 매일 05시에 최근 30일을 정리한 참고용입니다. 앱 이용자 중심이라 실제 수요와 다를 수 있습니다.</li>
        </ul>
      </details>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-r border-neutral-200 p-2.5 last:border-r-0">
      <dt className="text-[10px] text-neutral-500">{label}</dt>
      <dd className="text-base font-bold text-neutral-900">{value}</dd>
      {sub && <dd className="text-[10px] text-neutral-500">{sub}</dd>}
    </div>
  );
}
