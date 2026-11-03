"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { DEFAULT_UNIT_COSTS, isUsable, loadUnitCosts, saveUnitCosts, won, type UnitCost } from "@/lib/config/unitCosts";

/**
 * 단가 설정 (unit_costs). 출처가 입력된 항목만 대안 카드에 비용이 표시된다.
 * TODO(Firebase 이전): district_admin만 쓰기 가능한 Firestore unit_costs/{id}로 옮기고 변경 이력을 남긴다.
 */
export default function SettingsPage() {
  const [costs, setCosts] = useState<UnitCost[]>(DEFAULT_UNIT_COSTS);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => setCosts(loadUnitCosts()), []);

  const update = (id: string, patch: Partial<UnitCost>) => {
    setStatus(null);
    setCosts((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-3xl break-keep px-4 py-8">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800">
          <ArrowLeft className="h-4 w-4" /> 지도로 돌아가기
        </Link>
        <h1 className="text-xl font-bold text-neutral-900">대안 비용 단가 설정</h1>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-neutral-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
          출처가 입력된 단가만 대안 카드에 비용으로 표시됩니다. 금액만 있고 출처가 없으면 ‘단가 출처 입력 필요’로 남습니다.
          지금은 이 브라우저에만 저장됩니다.
        </p>

        <ul className="mt-6 space-y-4">
          {costs.map((c) => (
            <li key={c.id} className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-neutral-900">{c.item}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">{c.note}</p>
                  {c.reference && <p className="mt-0.5 text-xs text-neutral-400">{c.reference}</p>}
                </div>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                    isUsable(c) ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {isUsable(c) ? `표시 중 · ${won(c.amount!)}` : "표시 안 함"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr_100px]">
                <label className="text-xs text-neutral-600">
                  단가 ({c.unit})
                  <input
                    type="number"
                    min={0}
                    value={c.amount ?? ""}
                    onChange={(e) => update(c.id, { amount: e.target.value === "" ? null : Number(e.target.value) })}
                    className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm tabular-nums"
                  />
                </label>
                <label className="text-xs text-neutral-600">
                  출처 (문서명·발행기관·쪽)
                  <input
                    type="text"
                    value={c.source ?? ""}
                    placeholder="예: 2026 보육사업안내, 보건복지부, 312쪽"
                    onChange={(e) => update(c.id, { source: e.target.value || null })}
                    className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs text-neutral-600">
                  기준연도
                  <input
                    type="number"
                    value={c.baseYear ?? ""}
                    onChange={(e) => update(c.id, { baseYear: e.target.value === "" ? null : Number(e.target.value) })}
                    className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm tabular-nums"
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={() => setStatus(saveUnitCosts(costs) ? "저장했습니다." : "이 브라우저에서는 저장할 수 없습니다.")}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            저장
          </button>
          <button
            onClick={() => {
              setCosts(DEFAULT_UNIT_COSTS);
              setStatus(saveUnitCosts(DEFAULT_UNIT_COSTS) ? "기본값으로 되돌렸습니다." : null);
            }}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            기본값으로
          </button>
          {status && <span className="text-sm text-neutral-600">{status}</span>}
        </div>
      </div>
    </div>
  );
}
