"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ChevronDown, Save } from "lucide-react";
import type { CareTargetId, Dong, DongDiagnosis, Facility, TimeSlotId } from "@/types";
import { buildAlternatives, combineAlternatives, type Alternative, type AlternativeContext, type AlternativeKind } from "@/lib/alternatives";
import { newId } from "@/lib/history";
import { canWriteDistrict, usesServer, useAuth } from "@/lib/firebase/AuthProvider";
import { decisionStore } from "@/lib/store/decisions";
import type { ViewState } from "@/lib/viewState";
import { sigunguByCode } from "@/lib/constants/regions";
import { CARE_TARGETS } from "@/lib/constants/targets";
import { DATA_DATE } from "@/lib/hooks/useSeoulData";
import { won, DEFAULT_UNIT_COSTS } from "@/lib/config/unitCosts";
import { timeSlotDef } from "@/lib/constants/timeSlots";
import { people } from "@/lib/mapScale";

interface AlternativesPanelProps {
  dong: Dong | null;
  dongs: Dong[];
  facilities: Facility[];
  diagnoses: DongDiagnosis[];
  timeSlot: TimeSlotId;
  target: CareTargetId;
  dongName?: (dongId: string) => string | undefined;
  selected: AlternativeKind[];
  onSelectedChange: (kinds: AlternativeKind[]) => void;
  view: ViewState;
}

const GAP_BAR_COLOR = "#1e293b";

export default function AlternativesPanel({
  dong,
  dongs,
  facilities,
  diagnoses,
  timeSlot,
  target,
  dongName,
  selected: selectedKinds,
  onSelectedChange,
  view,
}: AlternativesPanelProps) {
  const auth = useAuth();
  // 비용은 출처가 확인된 기본 단가(2026 최저임금 등)로만 계산한다 (단가 입력 화면은 두지 않음)
  const unitCosts = DEFAULT_UNIT_COSTS;

  const ctx: AlternativeContext | null = dong ? { dong, dongs, facilities, diagnoses, timeSlot, target, unitCosts, dongName } : null;
  const alternatives = useMemo(() => (ctx ? buildAlternatives(ctx) : []), [dong, dongs, facilities, diagnoses, timeSlot, target, unitCosts]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = new Set<string>(selectedKinds);
  const [saving, setSaving] = useState(false);
  const [author, setAuthor] = useState("");
  const [memo, setMemo] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    setSaving(false);
    setSaved(null);
  }, [dong?.id, timeSlot, target]);
  useEffect(() => {
    try {
      setAuthor(window.localStorage.getItem("careos.author") ?? auth.user?.email ?? "");
    } catch {
      /* 저장소를 못 쓰면 빈 값 */
    }
  }, [auth.user?.email]);

  if (!dong || !ctx) return null;

  const slot = timeSlotDef(timeSlot);
  if (alternatives.length === 0) {
    return (
      <div className="p-5">
        <p className="text-sm font-semibold text-neutral-800">대안 비교</p>
        <p className="mt-1 text-xs text-neutral-500">
          {dong.name}은(는) {slot.label}에 부족 인원이 없어 대안이 필요하지 않습니다.
        </p>
      </div>
    );
  }

  const chosen = alternatives.filter((a) => selected.has(a.kind));
  const combined = combineAlternatives(ctx, chosen);
  // 효과가 가장 큰 카드 (같은 값이면 모두 표시)
  const maxReduction = alternatives[0].reduction;

  const toggle = (kind: AlternativeKind) =>
    onSelectedChange(selected.has(kind) ? selectedKinds.filter((k) => k !== kind) : [...selectedKinds, kind]);

  const server = usesServer(auth);
  const canSave = !server || canWriteDistrict(auth, view.sigunguCode);
  const save = async () => {
    try {
      window.localStorage.setItem("careos.author", author.trim());
    } catch {
      /* 무시 */
    }
    const record = {
      id: newId(),
      createdAt: new Date().toISOString(),
      author: author.trim() || "(이름 없음)",
      memo: memo.trim(),
      view,
      summary: {
        sigunguName: sigunguByCode(view.sigunguCode)?.name ?? view.sigunguCode,
        dongName: dong.name,
        slotLabel: slot.label,
        targetLabel: CARE_TARGETS.find((t) => t.id === target)!.label,
        gapBefore: combined.before,
        gapAfter: combined.after,
        alternativeTitles: chosen.map((c) => c.title),
        dataDate: DATA_DATE,
      },
    };
    try {
      await decisionStore(auth).save(record);
      setSaved(server ? "구청 계정의 판단 이력에 저장했습니다." : "판단 이력에 저장했습니다 (이 브라우저).");
      setSaving(false);
      setMemo("");
    } catch (e) {
      setSaved(e instanceof Error ? e.message : "저장하지 못했습니다.");
    }
  };

  return (
    <div className="flex flex-col gap-3 break-keep p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-neutral-900">대안 비교</p>
          <p className="text-[11px] text-neutral-500">카드를 고르면 합친 효과를 보여 줍니다</p>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {alternatives.map((a) => (
          <AlternativeCard
            key={a.kind}
            alt={a}
            best={maxReduction > 0 && a.reduction === maxReduction}
            selected={selected.has(a.kind)}
            onToggle={() => toggle(a.kind)}
          />
        ))}
      </ul>

      <div className="rounded-lg border border-neutral-200 p-3" aria-live="polite">
        {chosen.length === 0 ? (
          <p className="text-xs text-neutral-500">카드를 선택하면 합친 효과가 여기에 나옵니다.</p>
        ) : (
          <>
            <p className="text-sm text-neutral-700">
              <b className="text-base text-neutral-900">{people(combined.before)}</b> 부족 →{" "}
              <b className="text-base text-neutral-900">{people(combined.after)}</b> 부족
            </p>
            <div className="mt-2 space-y-1.5">
              <GapBar label="현재" value={combined.before} max={combined.before} />
              <GapBar label="적용 후" value={combined.after} max={combined.before} />
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-500" title="같은 시설을 함께 바꾸는 효과를 겹치지 않게 다시 계산한 값">
              {chosen.map((c) => c.title).join(" + ")}
            </p>
            {!canSave ? (
              <p className="mt-2 text-[11px] text-neutral-500">
                {auth.sigunguCode === view.sigunguCode
                  ? "조회 권한입니다. 판단 저장은 구 관리자만 할 수 있습니다."
                  : "다른 구는 시연 모드입니다(공개 데이터만). 판단 저장은 소속 구에서만 할 수 있습니다."}
              </p>
            ) : !saving ? (
              <button
                onClick={() => {
                  setSaving(true);
                  setSaved(null);
                }}
                className="mt-2 flex items-center gap-1 rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-700"
              >
                <Save className="h-3 w-3" /> 이 판단 저장
              </button>
            ) : (
              <div className="mt-2 space-y-1.5 rounded-md bg-neutral-50 p-2">
                <label className="block text-[11px] text-neutral-600">
                  작성자
                  <input
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="예: 보육정책과 홍길동 주무관"
                    className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-xs"
                  />
                </label>
                <label className="block text-[11px] text-neutral-600">
                  메모
                  <textarea
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    rows={2}
                    placeholder="예: 2027년 1분기 연장반 지정 검토, 현장 확인 후 확정"
                    className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-xs"
                  />
                </label>
                <div className="flex gap-1.5">
                  <button onClick={save} className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white">
                    저장
                  </button>
                  <button onClick={() => setSaving(false)} className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600">
                    취소
                  </button>
                </div>
              </div>
            )}
            {saved && (
              <p className="mt-1 text-[11px] text-neutral-600">
                {saved}{" "}
                <Link href="/history" className="underline">
                  이력 보기
                </Link>
              </p>
            )}
          </>
        )}
      </div>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-neutral-500">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        실제 부지·인허가·채용 가능 여부는 현장 확인이 필요합니다.
      </p>
    </div>
  );
}

function GapBar({ label, value, max }: { label: string; value: number; max: number }) {
  const w = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-12 shrink-0 text-neutral-500">{label}</span>
      <div className="h-3 flex-1 rounded-full bg-neutral-100">
        {value > 0 && <div className="h-3 rounded-full" style={{ width: `${w}%`, backgroundColor: GAP_BAR_COLOR }} />}
      </div>
      <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-neutral-800">{people(value)}</span>
    </div>
  );
}

function AlternativeCard({ alt, best, selected, onToggle }: { alt: Alternative; best: boolean; selected: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false);
  const usable = alt.applicable && alt.reduction > 0;
  return (
    <li className={`rounded-lg border px-3 py-2.5 transition-colors ${selected ? "border-neutral-900 bg-neutral-50" : "border-neutral-200"}`}>
      <div className="flex items-center gap-2.5">
        <button
          onClick={onToggle}
          disabled={!usable}
          role="checkbox"
          aria-checked={selected}
          aria-label={`${alt.title} 선택`}
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
            selected ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-400 bg-white"
          } disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-100`}
        >
          {selected && <Check className="h-3 w-3" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold ${usable ? "text-neutral-900" : "text-neutral-400"}`}>
            {alt.title}
            {best && <span className="ml-1.5 text-[11px] font-semibold text-neutral-500">· 효과 가장 큼</span>}
          </p>
        </div>
        {usable ? (
          <span className="shrink-0 text-lg font-bold tabular-nums text-neutral-900">−{people(alt.reduction)}</span>
        ) : (
          <span className="shrink-0 text-xs text-neutral-400">해당 없음</span>
        )}
      </div>
      <p className={`mt-1 pl-[26px] text-xs leading-relaxed ${usable ? "text-neutral-700" : "text-neutral-400"}`}>{alt.sentence}</p>
      {alt.residualNote && <p className="mt-0.5 pl-[26px] text-xs font-medium text-neutral-800">{alt.residualNote}</p>}

      {(usable || alt.costs.length > 0) && (
        <div className="pl-[26px]">
          <button onClick={() => setOpen((v) => !v)} className="mt-1 flex items-center gap-0.5 text-[11px] font-medium text-neutral-500" aria-expanded={open}>
            자세히 <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div className="mt-1 space-y-1 rounded bg-neutral-50 p-2 text-[11px] text-neutral-600">
              {usable && <p>남는 부족 인원 <b className="text-neutral-900">{people(alt.remaining)}</b></p>}
              {alt.needs.map((n) => (
                <p key={n}>{n}</p>
              ))}
              {alt.costs.map((c) => (
                <div key={c.label}>
                  <p>
                    {c.label}: {c.amount != null ? <b className="tabular-nums text-neutral-900">{won(c.amount)}</b> : <span className="font-medium text-neutral-800">{c.missing}</span>}
                  </p>
                  <p className="text-neutral-400">
                    {c.formula} · 출처 {c.source ?? "미입력"}
                    {c.reference ? ` · 참고 ${c.reference}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
