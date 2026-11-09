"use client";

import { useEffect, useState } from "react";
import { Bot, ChevronDown, Info, Lock, MessageSquareText } from "lucide-react";
import type { CareTargetId, Dong, TimeSlotId } from "@/types";
import { canReadDistrict, useAuth } from "@/lib/firebase/AuthProvider";
import { firebase } from "@/lib/firebase/client";
import { timeSlotDef } from "@/lib/constants/timeSlots";
import { CARE_TARGETS } from "@/lib/constants/targets";
import { percent } from "@/lib/mapScale";
import { loadAgentLogs, loadAgentSummary, type AgentLog, type AgentStat, type AgentSummary } from "@/lib/store/agentLogs";

interface AgentLogPanelProps {
  sigunguCode: string;
  dong: Dong | null;
  timeSlot: TimeSlotId;
  target: CareTargetId;
  dongName: (id: string) => string | undefined;
}

type Loaded = { key: string; summary: AgentSummary | null; logs: AgentLog[]; error: string | null };

const targetLabel = (id: CareTargetId | null) => CARE_TARGETS.find((t) => t.id === id)?.label ?? "연령 미상";
const fmt = (d: Date | null) =>
  d ? d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

/** 사용자 로그 · AI 상담 — 시민 앱 AI 상담의 익명 집계·요약과, 수집 동의한 대화 */
export default function AgentLogPanel({ sigunguCode, dong, timeSlot, target, dongName }: AgentLogPanelProps) {
  const auth = useAuth();
  const allowed = Boolean(firebase()) && canReadDistrict(auth, sigunguCode);
  const emdCode = dong?.id ?? null;
  const key = `${sigunguCode}|${emdCode ?? ""}`;
  const [data, setData] = useState<Loaded | null>(null);
  const [onlyView, setOnlyView] = useState(true);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    Promise.all([loadAgentSummary(sigunguCode), loadAgentLogs(sigunguCode, emdCode)])
      .then(([summary, logs]) => alive && setData({ key, summary, logs, error: null }))
      .catch((e: Error) => alive && setData({ key, summary: null, logs: [], error: e.message }));
    return () => {
      alive = false;
    };
  }, [allowed, sigunguCode, emdCode, key]);

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
          {auth.user ? "이 구의 열람 권한이 없습니다 (자기 구만 볼 수 있습니다)." : "구청 담당자로 로그인하면 이 구 시민의 AI 상담 기록을 볼 수 있습니다."}
        </p>
      </div>
    );
  }

  const ready = data?.key === key ? data : null;
  const s = ready?.summary ?? null;
  const stat: AgentStat | null = s ? (emdCode ? (s.byDong[emdCode] ?? null) : s.total) : null;
  const logs = (ready?.logs ?? []).filter((l) => !onlyView || (l.timeSlots.includes(timeSlot) && (l.target ?? target) === target));
  const topTopics = stat
    ? Object.entries(stat.topics)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
    : [];
  const place = dong ? dong.name : "구 전체";

  return (
    <div className="flex flex-col gap-3 break-keep p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {header}
        {s && (
          <span className="text-[11px] text-neutral-500">
            최근 {s.periodDays}일 · {fmt(s.generatedAt)} 갱신
          </span>
        )}
      </div>

      {!ready ? (
        <p className="text-xs text-neutral-400">불러오는 중...</p>
      ) : ready.error ? (
        <p className="text-xs text-red-600">불러오지 못했습니다: {ready.error}</p>
      ) : (
        <>
          {!s ? (
            <p className="text-xs text-neutral-500">아직 집계가 없습니다. 시민 앱 AI 상담 기록은 매일 05시에 모아 요약합니다.</p>
          ) : (
            <>
              {s.summary && (
                <div className="rounded-lg bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-800">
                  <p className="mb-1 font-semibold text-neutral-900">구 전체 요약 (AI)</p>
                  {s.summary}
                </div>
              )}
              {emdCode && s.dongSummaries[emdCode] && (
                <p className="rounded-lg border border-neutral-200 p-3 text-xs leading-relaxed text-neutral-800">
                  <span className="font-semibold text-neutral-900">{place} 요약</span> · {s.dongSummaries[emdCode]}
                </p>
              )}
              {!stat || stat.count === 0 ? (
                <p className="text-xs text-neutral-500">{place}: 최근 {s.periodDays}일 상담 없음</p>
              ) : (
                <>
                  <dl className="grid grid-cols-3 overflow-hidden rounded-lg border border-neutral-200">
                    <Stat label={`${place} 상담`} value={`${stat.count}건`} />
                    <Stat label="시설 못 찾음" value={percent(stat.noResult / stat.count)} sub={`${stat.noResult}건`} />
                    <Stat label={`${slot.shortLabel} · ${targetLabel(target).split("(")[0]}`} value={`${stat.bySlot[timeSlot] ?? 0}건`} sub={`대상 ${stat.byTarget[target] ?? 0}건`} />
                  </dl>
                  {topTopics.length > 0 && (
                    <p className="text-xs text-neutral-600">
                      <span className="font-semibold text-neutral-800">많이 물은 주제</span> ·{" "}
                      {topTopics.map(([k, n]) => `${s.topicLabels[k] ?? k} ${n}건`).join(" · ")}
                    </p>
                  )}
                  {stat.count < s.summaryMin && <p className="text-[11px] text-neutral-500">표본 {s.summaryMin}건 미만이라 AI 요약은 표시하지 않습니다.</p>}
                </>
              )}
            </>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800">
              <MessageSquareText className="h-3.5 w-3.5 text-neutral-400" /> 최근 대화 ({place})
            </p>
            <label className="flex items-center gap-1 text-[11px] text-neutral-600">
              <input type="checkbox" checked={onlyView} onChange={(e) => setOnlyView(e.target.checked)} />
              {slot.shortLabel}·{targetLabel(target).split("(")[0]}만
            </label>
          </div>
          {logs.length === 0 ? (
            <p className="text-xs text-neutral-500">표시할 대화가 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {logs.map((l) => (
                <li key={l.id} className="rounded-lg border border-neutral-200">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-col gap-1 p-2.5">
                      <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
                        {fmt(l.createdAt)}
                        {!dong && l.emdCode && <span>· {dongName(l.emdCode) ?? l.emdCode}</span>}
                        {l.target && <span>· {targetLabel(l.target).split("(")[0]}</span>}
                        {l.timeSlots.length > 0 && <span>· {l.timeSlots.map((t) => timeSlotDef(t).shortLabel).join("·")}</span>}
                        {l.noResult && <span className="rounded border border-neutral-900 px-1 font-semibold text-neutral-900">시설 없음</span>}
                      </span>
                      <span className="flex items-start gap-1 text-xs text-neutral-900">
                        <span className="line-clamp-2 flex-1">{l.question}</span>
                        <ChevronDown className="mt-0.5 h-3 w-3 shrink-0 text-neutral-400 transition-transform group-open:rotate-180" />
                      </span>
                    </summary>
                    <p className="whitespace-pre-wrap border-t border-neutral-100 p-2.5 text-xs leading-relaxed text-neutral-700">{l.answer}</p>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <details className="group text-[11px] leading-relaxed text-neutral-500">
        <summary className="flex cursor-pointer list-none items-center gap-1">
          <Info className="h-3 w-3 shrink-0" /> 읽는 법·개인정보
          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
        </summary>
        <ul className="mt-1 space-y-0.5 pl-4">
          <li>집계·요약: 시민 앱 AI 상담 전체의 익명 기록(행정동·시간대·대상·주제·결과). 회원 식별 정보 없음.</li>
          <li>대화: 대화 내용 수집에 동의한 시민 것만. 전화번호·이메일·이름·상세 주소는 자동으로 가렸지만 완전하지 않을 수 있어 외부 공유 금지.</li>
          <li>대화는 90일 뒤 자동 삭제되고, 시민이 동의를 철회하거나 탈퇴하면 즉시 삭제됩니다.</li>
          <li>AI 요약은 참고용입니다. 앱 이용자 중심이라 실제 수요와 다를 수 있습니다.</li>
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
