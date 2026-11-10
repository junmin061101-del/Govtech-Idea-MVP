"use client";

/**
 * 단색 막대 차트 (크기 비교용 한 계열) — 얇은 막대, 끝 4px 둥글게, 기준선에서 시작, 막대마다 마우스를 올리면 값 표시.
 * 계열이 하나라 범례 없이 카드 제목이 이름을 대신한다. 색은 잉크(neutral-800) 한 가지.
 */

export interface ColumnDatum {
  key: string;
  /** 축 아래 글자 (빈 문자열이면 표시 안 함 — 촘촘한 축에서 일부만 표시) */
  axis: string;
  value: number;
  /** 마우스를 올렸을 때 보이는 설명 */
  tip: string;
  /** 강조 (예: 오늘, 지금 시각) */
  highlight?: boolean;
}

export function ColumnChart({ data, height = 120, label }: { data: ColumnDatum[]; height?: number; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure aria-label={label} className="flex flex-col gap-1.5">
      <div className="relative flex items-end gap-[2px] border-b border-black/10" style={{ height }}>
        {/* 반·최대 보조선 (흐리게) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-black/[0.06]" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-black/[0.06]" aria-hidden />
        <span className="pointer-events-none absolute -top-1 right-0 -translate-y-full text-[10px] tabular-nums text-neutral-400">{max}</span>
        {data.map((d) => (
          <div key={d.key} className="group relative flex h-full flex-1 items-end" tabIndex={0} aria-label={d.tip}>
            <div
              className={`w-full rounded-t-[4px] transition-colors ${d.highlight ? "bg-neutral-900" : "bg-neutral-300"} group-hover:bg-neutral-600 group-focus:bg-neutral-600`}
              style={{ height: d.value ? `${Math.max(3, (d.value / max) * 100)}%` : 0 }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus:opacity-100">
              {d.tip}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-[2px]" aria-hidden>
        {data.map((d) => (
          <span key={d.key} className={`flex-1 text-center text-[10px] tabular-nums ${d.highlight ? "font-semibold text-neutral-900" : "text-neutral-400"}`}>
            {d.axis}
          </span>
        ))}
      </div>
    </figure>
  );
}

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** 오른쪽 값 옆 보조 글자 */
  sub?: string;
}

/** 가로 막대 목록 — 이름 | 막대 | 값 */
export function BarList({ data, labelWidth = "w-24" }: { data: BarDatum[]; labelWidth?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="flex flex-col gap-2">
      {data.map((d) => (
        <li key={d.key} className="group flex items-center gap-3 text-[13px]" title={`${d.label} ${d.value}건${d.sub ? ` · ${d.sub}` : ""}`}>
          <span className={`${labelWidth} shrink-0 truncate text-neutral-700`}>{d.label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.05]">
            <span
              className="block h-full rounded-full bg-neutral-800 transition-colors group-hover:bg-neutral-500"
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </span>
          <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-neutral-900">{d.value}</span>
          {d.sub !== undefined && <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-neutral-500">{d.sub}</span>}
        </li>
      ))}
    </ul>
  );
}
