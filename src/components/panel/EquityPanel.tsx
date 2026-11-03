"use client";

import { Bus, Info } from "lucide-react";
import type { Dong } from "@/types";
import { TRANSIT } from "@/lib/config/assumptions";
import { percent } from "@/lib/mapScale";
import { META } from "@/lib/hooks/useSeoulData";

/** 형평성: 대중교통 접근성(실데이터)과 취약가구 비중(데이터 확보 필요) */
export default function EquityPanel({ dong }: { dong: Dong | null }) {
  if (!dong) return null;
  const t = dong.transit;
  return (
    <div className="flex flex-col gap-2 break-keep p-5">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-neutral-800">
        <Bus className="h-4 w-4 text-neutral-400" /> 형평성
      </p>
      {t ? (
        <dl className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded bg-neutral-100 py-1.5">
            <dt className="text-[10px] text-neutral-500">대중교통 도보권</dt>
            <dd className="text-base font-bold tabular-nums text-neutral-900">{percent(t.coverage)}</dd>
            <dd className="text-[10px] text-neutral-500">지하철 {TRANSIT.subwayM}m·버스 {TRANSIT.busM}m</dd>
          </div>
          <div className="rounded bg-neutral-100 py-1.5">
            <dt className="text-[10px] text-neutral-500">지하철 도보권</dt>
            <dd className="text-base font-bold tabular-nums text-neutral-900">{percent(t.subwayCoverage)}</dd>
            <dd className="text-[10px] text-neutral-500">
              동 안 역 {t.subwayStations}곳 · 정류소 {t.busStops}곳
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-xs text-neutral-500">대중교통 데이터가 없습니다 (npm run data:fetch 필요).</p>
      )}
      <p className="text-xs text-neutral-600">
        취약가구 비중: <span className="text-amber-700">데이터 확보 필요</span>
      </p>
      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-neutral-500">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          도보권 비율은 동 안 인구가 고르게 퍼져 있다고 보고 계산해, 산지·공원이 넓은 동은 실제보다 낮게 나올 수 있습니다. 동별 기초생활수급자
          통계는 Open API·파일이 제공되지 않아 구청 자료로 확보해야 합니다.
          {META.transit ? ` 출처: 서울 열린데이터광장 역사 마스터·버스정류소 위치 (${META.transit.fetchedAt.slice(0, 10)} 수집).` : ""}
        </span>
      </p>
    </div>
  );
}
