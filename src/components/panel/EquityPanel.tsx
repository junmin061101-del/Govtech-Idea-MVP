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
    <div className="flex flex-col gap-2 break-keep px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-neutral-900">
          <Bus className="h-4 w-4 text-neutral-400" /> 형평성
        </p>
        <span title={`도보권: 지하철 ${TRANSIT.subwayM}m·버스 ${TRANSIT.busM}m 안 (가정값). 동 안 인구를 고르게 놓고 계산해 산지·공원이 넓은 동은 낮게 나올 수 있습니다.${META.transit ? ` 출처: 서울 열린데이터광장 역사 마스터·버스정류소 위치 (${META.transit.fetchedAt.slice(0, 10)})` : ""}`} className="cursor-help text-neutral-400">
          <Info className="h-3.5 w-3.5" />
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-[11px] text-neutral-500">대중교통 도보권</dt>
          <dd className="font-bold tabular-nums text-neutral-900">{t ? percent(t.coverage) : "-"}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-neutral-500">지하철 도보권</dt>
          <dd className="font-bold tabular-nums text-neutral-900">{t ? percent(t.subwayCoverage) : "-"}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-neutral-500">취약가구 비중</dt>
          <dd className="text-xs text-neutral-500" title="동별 기초생활수급자 통계가 Open API·파일로 제공되지 않아 구청 자료로 확보 필요">
            자료 확보 필요
          </dd>
        </div>
      </dl>
    </div>
  );
}
