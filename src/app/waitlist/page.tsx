"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, ShieldCheck, Upload } from "lucide-react";
import { SIGUNGU, DEFAULT_SIGUNGU_CODE } from "@/lib/constants/regions";
import { validateWaitlist, WAITLIST_TEMPLATE_CSV, type WaitlistResult } from "@/lib/waitlist";
import { diagnoseAllDongs } from "@/lib/calculator";
import { signalOf } from "@/lib/unmet";
import { ALL_DONGS, DATA_DATE, useFacilities, useUnmetDemand } from "@/lib/hooks/useSeoulData";
import { people, percent } from "@/lib/mapScale";
import { canWriteDistrict, usesServer, useAuth } from "@/lib/firebase/AuthProvider";
import { loadLatestWaitlist, saveWaitlist } from "@/lib/store/waitlists";

/** 입소 대기 대조 — 정규 보육 입소 대기라 주간(09~17) 영유아 기준과 비교한다 */
const SLOT = "daytime" as const;

export default function WaitlistPage() {
  const [sgg, setSgg] = useState(DEFAULT_SIGUNGU_CODE);
  const [result, setResult] = useState<WaitlistResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [month, setMonth] = useState(DATA_DATE.slice(0, 7).replace("-", ""));
  const auth = useAuth();
  const server = usesServer(auth);
  const canUpload = !server || canWriteDistrict(auth, sgg);
  // 로그인이면 저장해 둔 최근 집계를 불러온다
  useEffect(() => {
    if (auth.loading) return;
    loadLatestWaitlist(auth, sgg)
      .then((w) => {
        if (!w) return;
        setResult({ ok: true, errors: [], warnings: [], byDong: w.byDong, total: w.total });
        setFileName(`저장된 집계 (${w.month.slice(0, 4)}-${w.month.slice(4)})`);
        setMonth(w.month);
      })
      .catch(() => undefined);
  }, [auth.loading, auth.user, auth.role, sgg]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("sgg");
    if (q && SIGUNGU.some((s) => s.code === q)) setSgg(q);
  }, []);

  const dongs = useMemo(() => ALL_DONGS.filter((d) => d.sigunguCode === sgg), [sgg]);
  const facilities = useFacilities(sgg);
  const unmet = useUnmetDemand(sgg);
  const diagnoses = useMemo(
    () => (facilities ? new Map(diagnoseAllDongs(dongs, facilities.filter((f) => f.emdCode), SLOT, "infant").map((d) => [d.dongId, d])) : null),
    [dongs, facilities],
  );

  const onFile = async (file: File) => {
    setFileName(file.name);
    // 파일은 이 브라우저 안에서만 읽는다 (서버로 보내지 않음)
    setResult(validateWaitlist(await file.text(), dongs));
  };

  const downloadTemplate = () => {
    const lines = ["행정동코드,행정동명,연령,대기인원", ...dongs.flatMap((d) => [0, 1, 2, 3, 4, 5].map((a) => `${d.emdCode},${d.name},${a},`))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `입소대기_집계_견본_${SIGUNGU.find((s) => s.code === sgg)?.name}.csv`;
    a.click();
  };

  const rows =
    result?.ok && diagnoses
      ? dongs
          .map((d) => {
            const w = result.byDong.get(d.emdCode);
            const diag = diagnoses.get(d.id)!;
            const cell = unmet?.cells.find((c) => c.emdCode === d.id && c.timeSlot === SLOT && c.target === "infant");
            return { d, w, diag, sig: unmet ? signalOf(cell) : null };
          })
          .sort((a, b) => (b.w ? b.w.reduce((x, y) => x + y, 0) : -1) - (a.w ? a.w.reduce((x, y) => x + y, 0) : -1))
      : [];

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-5xl break-keep px-4 py-8">
        <Link href={`/?sgg=${sgg}`} className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800">
          <ArrowLeft className="h-4 w-4" /> 지도로 돌아가기
        </Link>
        <h1 className="text-xl font-bold text-neutral-900">입소 대기 대조</h1>
        <p className="mt-1 text-sm text-neutral-600">
          보육통합정보시스템의 행정동 × 연령별 대기 인원 <b>집계</b>를 올리면, 인구 기반 추정 수요·부모 검색 신호와 나란히 비교합니다.
        </p>
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800 ring-1 ring-emerald-200">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            구청 관리자 전용 기능입니다. 파일은 이 브라우저 안에서 검사하고, 원본 파일은 어디에도 보내지 않습니다. 이름·생년월일·연락처·주소·주민등록번호
            같은 개인 식별 정보가 열이나 값에 있으면 파일 전체를 거부합니다.{" "}
            {server ? "로그인한 구 관리자는 검증된 집계(행정동 × 연령별 인원)만 구청 계정에 저장할 수 있습니다." : "시연 모드: 새로고침하면 사라집니다."}
          </span>
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select
            value={sgg}
            onChange={(e) => {
              setSgg(e.target.value);
              setResult(null);
              setFileName(null);
            }}
            className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm"
          >
            {SIGUNGU.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
          <button onClick={downloadTemplate} className="flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm">
            <Download className="h-4 w-4" /> 견본 CSV
          </button>
          <label
            className={`flex items-center gap-1 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white ${canUpload ? "cursor-pointer" : "pointer-events-none opacity-40"}`}
            title={canUpload ? undefined : "그 구 관리자만 올릴 수 있습니다"}
          >
            <Upload className="h-4 w-4" /> 집계 CSV 올리기
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          {fileName && <span className="text-xs text-neutral-500">{fileName}</span>}
        </div>
        <p className="mt-2 text-[11px] text-neutral-500">
          형식: 행정동코드, 행정동명, 연령(0~5), 대기인원 — 또는 행정동명, 0세~5세 열. UTF-8로 저장하세요. ({WAITLIST_TEMPLATE_CSV.split("\n")[0]})
        </p>

        {result && !result.ok && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200" role="alert">
            <p className="font-semibold">파일을 받지 않았습니다</p>
            <ul className="mt-1 list-disc pl-5 text-xs">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {result?.ok && result.warnings.length > 0 && (
          <ul className="mt-4 list-disc rounded-lg bg-amber-50 p-3 pl-8 text-xs text-amber-800 ring-1 ring-amber-200">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        {result?.ok && (
          <>
            {server && canUpload && fileName && !fileName.startsWith("저장된") && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <label className="text-neutral-600">
                  기준 연월{" "}
                  <input
                    value={month}
                    onChange={(e) => setMonth(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-24 rounded border border-neutral-300 px-2 py-1 tabular-nums"
                    placeholder="202611"
                  />
                </label>
                <button
                  disabled={!/^\d{6}$/.test(month)}
                  onClick={() =>
                    saveWaitlist(auth, sgg, month, result.byDong, result.total)
                      .then(() => setSaveMsg("구청 계정에 집계를 저장했습니다 (원본 파일은 저장하지 않음)."))
                      .catch((e) => setSaveMsg(e instanceof Error ? e.message : "저장하지 못했습니다."))
                  }
                  className="rounded-md border border-neutral-300 bg-white px-3 py-1 disabled:opacity-40"
                >
                  집계 저장
                </button>
                {saveMsg && <span className="text-neutral-600">{saveMsg}</span>}
              </div>
            )}
            <p className="mt-4 text-sm text-neutral-700">
              대기 인원 합계 <b>{people(result.total)}</b> · 비교 기준: 영유아 평일 주간 09~17시, 추정 수요·자리는 {DATA_DATE} 데이터
              {unmet?.synthetic && " · 검색 신호는 시연용 가상 데이터"}
            </p>
            <table className="mt-2 w-full border-collapse bg-white text-sm">
              <thead>
                <tr className="bg-neutral-100">
                  {["행정동", "대기 인원", "0~2세", "3~5세", "추정 수요", "추정 부족", "결과 없음 검색"].map((h) => (
                    <th key={h} className="border border-neutral-200 px-2 py-1 text-left font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ d, w, diag, sig }) => (
                  <tr key={d.id}>
                    <td className="border border-neutral-200 px-2 py-1">{d.name}</td>
                    <td className="border border-neutral-200 px-2 py-1 text-right font-semibold tabular-nums">
                      {w ? people(w.reduce((a, b) => a + b, 0)) : <span className="font-normal text-neutral-400">자료 없음</span>}
                    </td>
                    <td className="border border-neutral-200 px-2 py-1 text-right tabular-nums">{w ? people(w[0] + w[1] + w[2]) : "-"}</td>
                    <td className="border border-neutral-200 px-2 py-1 text-right tabular-nums">{w ? people(w[3] + w[4] + w[5]) : "-"}</td>
                    <td className="border border-neutral-200 px-2 py-1 text-right tabular-nums">{people(diag.demand)}</td>
                    <td className="border border-neutral-200 px-2 py-1 text-right tabular-nums">
                      {diag.careGap > 0 ? `${people(diag.careGap)} (${percent(diag.careGap / diag.demand)})` : "부족 없음"}
                    </td>
                    <td className="border border-neutral-200 px-2 py-1 text-right tabular-nums">
                      {!sig ? "-" : sig.noResultRate == null ? <span className="text-neutral-400">표본 부족</span> : percent(sig.noResultRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
              세 숫자는 서로 다른 신호입니다. 대기 인원은 실제 신청했지만 입소하지 못한 수, 추정 부족은 인구로 계산한 자리 부족, 결과 없음 검색은 부모가
              찾다 못 찾은 비율입니다. 셋이 함께 높은 동은 공백 가능성이 크고, 서로 다르면 원인(예: 특정 시설 선호, 신청 포기)을 현장에서 확인하세요.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
