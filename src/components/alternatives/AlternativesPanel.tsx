"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ChevronDown, Settings, Trophy } from "lucide-react";
import type { CareTargetId, Dong, DongDiagnosis, Facility, TimeSlotId } from "@/types";
import { buildAlternatives, combineAlternatives, type Alternative, type AlternativeContext } from "@/lib/alternatives";
import { loadUnitCosts, won, DEFAULT_UNIT_COSTS, type UnitCost } from "@/lib/config/unitCosts";
import { timeSlotDef } from "@/lib/constants/timeSlots";
import { people } from "@/lib/mapScale";

interface AlternativesPanelProps {
  dong: Dong | null;
  dongs: Dong[];
  facilities: Facility[];
  diagnoses: DongDiagnosis[];
  timeSlot: TimeSlotId;
  target: CareTargetId;
}

const GAP_BAR_COLOR = "#bb3930";

export default function AlternativesPanel({ dong, dongs, facilities, diagnoses, timeSlot, target }: AlternativesPanelProps) {
  const [unitCosts, setUnitCosts] = useState<UnitCost[]>(DEFAULT_UNIT_COSTS);
  useEffect(() => setUnitCosts(loadUnitCosts()), []);

  const ctx: AlternativeContext | null = dong ? { dong, dongs, facilities, diagnoses, timeSlot, target, unitCosts } : null;
  const alternatives = useMemo(() => (ctx ? buildAlternatives(ctx) : []), [dong, dongs, facilities, diagnoses, timeSlot, target, unitCosts]); // eslint-disable-line react-hooks/exhaustive-deps

  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setSelected(new Set()), [dong?.id, timeSlot, target]);

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

  const toggle = (kind: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(kind)) n.delete(kind);
      else n.add(kind);
      return n;
    });

  return (
    <div className="flex flex-col gap-3 break-keep p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-neutral-800">대안 비교</p>
          <p className="text-[11px] text-neutral-500">
            {dong.name} · {slot.label} · 카드를 골라 합친 효과를 확인하세요
          </p>
        </div>
        <Link href="/settings" className="flex shrink-0 items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-800">
          <Settings className="h-3 w-3" /> 단가 설정
        </Link>
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
            <p className="text-sm text-neutral-800">
              현재 <b>{people(combined.before)} 부족</b> → 대안 적용 후 <b>{people(combined.after)} 부족</b>
            </p>
            <div className="mt-2 space-y-1.5">
              <GapBar label="현재" value={combined.before} max={combined.before} />
              <GapBar label="적용 후" value={combined.after} max={combined.before} />
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-500">
              {chosen.map((c) => c.title).join(" + ")} · 같은 시설을 함께 바꾸는 효과를 겹치지 않게 다시 계산한 값입니다.
            </p>
          </>
        )}
      </div>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-700">
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
    <li
      className={`rounded-lg border p-3 transition-colors ${
        selected ? "border-neutral-900 bg-neutral-50" : "border-neutral-200"
      } ${usable ? "" : "opacity-70"}`}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={onToggle}
          disabled={!usable}
          role="checkbox"
          aria-checked={selected}
          aria-label={`${alt.title} 선택`}
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
            selected ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"
          } disabled:cursor-not-allowed disabled:bg-neutral-100`}
        >
          {selected && <Check className="h-3 w-3" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-semibold text-neutral-900">{alt.title}</p>
            {best && (
              <span className="flex items-center gap-0.5 rounded bg-neutral-900 px-1.5 py-px text-[10px] font-semibold text-white">
                <Trophy className="h-2.5 w-2.5" /> 가장 효과 큼
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-neutral-700">{alt.sentence}</p>
          {alt.residualNote && <p className="mt-0.5 text-xs leading-relaxed text-neutral-700">{alt.residualNote}</p>}

          {usable && (
            <dl className="mt-2 grid grid-cols-2 gap-2 text-center">
              <div className="rounded bg-neutral-100 py-1">
                <dt className="text-[10px] text-neutral-500">줄어드는 인원</dt>
                <dd className="text-sm font-bold tabular-nums text-neutral-900">{people(alt.reduction)}</dd>
              </div>
              <div className="rounded bg-neutral-100 py-1">
                <dt className="text-[10px] text-neutral-500">남는 부족 인원</dt>
                <dd className="text-sm font-bold tabular-nums text-neutral-900">{people(alt.remaining)}</dd>
              </div>
            </dl>
          )}

          {alt.needs.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[11px] text-neutral-600">
              {alt.needs.map((n) => (
                <li key={n}>· {n}</li>
              ))}
            </ul>
          )}

          {alt.costs.length > 0 && (
            <div className="mt-2 text-[11px]">
              {alt.costs.map((c) => (
                <p key={c.label} className="text-neutral-700">
                  {c.label}:{" "}
                  {c.amount != null ? <b className="tabular-nums">{won(c.amount)}</b> : <span className="text-amber-700">{c.missing}</span>}
                </p>
              ))}
              <button onClick={() => setOpen((v) => !v)} className="mt-0.5 flex items-center gap-0.5 text-neutral-500" aria-expanded={open}>
                계산식과 출처 <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open && (
                <ul className="mt-1 space-y-1 rounded bg-neutral-50 p-2 text-neutral-600">
                  {alt.costs.map((c) => (
                    <li key={c.label}>
                      <p>{c.formula}</p>
                      <p className="text-neutral-400">출처: {c.source ?? "미입력"}</p>
                      {c.reference && <p className="text-neutral-400">참고: {c.reference}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
