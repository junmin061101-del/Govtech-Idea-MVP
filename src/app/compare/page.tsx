"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SIGUNGU, DEFAULT_SIGUNGU_CODE } from "@/lib/constants/regions";
import { TIME_SLOTS, type TimeSlotId } from "@/lib/constants/timeSlots";
import { ALL_DONGS, SNAPSHOT_MONTHS, useSnapshots } from "@/lib/hooks/useSeoulData";
import { compareSnapshots } from "@/lib/compare";

/** 시점 비교 — 같은 동의 월별 부족 인원 (정책 시행 전후 확인) */
export default function ComparePage() {
  const [sgg, setSgg] = useState(DEFAULT_SIGUNGU_CODE);
  const [slot, setSlot] = useState<TimeSlotId>("daytime");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("sgg");
    if (q && SIGUNGU.some((s) => s.code === q)) setSgg(q);
  }, []);
  const snapshots = useSnapshots();
  const dongs = useMemo(() => ALL_DONGS.filter((d) => d.sigunguCode === sgg), [sgg]);
  const result = useMemo(() => (snapshots ? compareSnapshots(snapshots, dongs, slot, "infant") : null), [snapshots, dongs, slot]);

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-5xl break-keep px-4 py-8">
        <Link href={`/?sgg=${sgg}`} className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800">
          <ArrowLeft className="h-4 w-4" /> 지도로 돌아가기
        </Link>
        <h1 className="text-xl font-bold text-neutral-900">시점 비교</h1>
        <p className="mt-1 text-sm text-neutral-600">데이터를 갱신할 때마다 남긴 월별 스냅샷으로 같은 동의 부족 인원을 비교합니다 (영유아 기준).</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select value={sgg} onChange={(e) => setSgg(e.target.value)} className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm">
            {SIGUNGU.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
            {TIME_SLOTS.filter((t) => t.dataAvailable).map((t) => (
              <button
                key={t.id}
                onClick={() => setSlot(t.id)}
                aria-pressed={slot === t.id}
                className={`rounded-md px-2.5 py-1 text-sm ${slot === t.id ? "bg-neutral-900 text-white" : "text-neutral-600"}`}
              >
                {t.shortLabel}
              </button>
            ))}
          </div>
        </div>

        {SNAPSHOT_MONTHS.length < 2 && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
            스냅샷이 {SNAPSHOT_MONTHS.join(", ")} 한 달분뿐입니다. 다음 달 데이터 갱신(npm run data:fetch → data:build → data:snapshot)부터
            전후 비교가 가능합니다. 과거 달 수치는 만들어 넣지 않습니다.
          </p>
        )}

        {!result ? (
          <p className="mt-8 text-center text-sm text-neutral-400">불러오는 중...</p>
        ) : (
          <table className="mt-4 w-full border-collapse bg-white text-sm">
            <thead>
              <tr>
                <th className="border border-neutral-200 bg-neutral-100 px-2 py-1 text-left">행정동</th>
                {result.months.map((m) => (
                  <th key={m} className="border border-neutral-200 bg-neutral-100 px-2 py-1 text-right">
                    {m}
                  </th>
                ))}
                <th className="border border-neutral-200 bg-neutral-100 px-2 py-1 text-right">변화 (처음 → 최근)</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.emdCode}>
                  <td className="border border-neutral-200 px-2 py-1">{r.name}</td>
                  {r.gaps.map((g, i) => (
                    <td key={i} className="border border-neutral-200 px-2 py-1 text-right tabular-nums">
                      {g == null ? "-" : `${g.toLocaleString()}명`}
                    </td>
                  ))}
                  <td className="border border-neutral-200 px-2 py-1 text-right tabular-nums">
                    {r.change == null ? "-" : `${r.change > 0 ? "+" : ""}${r.change.toLocaleString()}명`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
