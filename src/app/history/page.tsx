"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import { exportHistory, type DecisionRecord } from "@/lib/history";
import { canWriteDistrict, useAuth } from "@/lib/firebase/AuthProvider";
import { decisionStore } from "@/lib/store/decisions";
import { encodeView } from "@/lib/viewState";
import { DATA_DATE } from "@/lib/hooks/useSeoulData";
import { people } from "@/lib/mapScale";

export default function HistoryPage() {
  const auth = useAuth();
  const store = decisionStore(auth);
  const [records, setRecords] = useState<DecisionRecord[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reload = () =>
    store
      .list()
      .then(setRecords)
      .catch(() => setStatus("판단 이력을 불러오지 못했습니다 (권한을 확인하세요)."));
  useEffect(() => {
    if (!auth.loading) reload();
  }, [auth.loading, auth.user, auth.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const onExport = () => {
    const blob = new Blob([JSON.stringify(exportHistory(records), null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `돌봄공백_판단이력_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const onImport = async (file: File) => {
    try {
      const n = await store.importJson(await file.text());
      setStatus(`가져왔습니다 (${n}건).`);
      await reload();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "가져오기에 실패했습니다.");
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-4xl break-keep px-4 py-8">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800">
          <ArrowLeft className="h-4 w-4" /> 지도로 돌아가기
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-neutral-900">판단 이력</h1>
            <p className="mt-1 text-sm text-neutral-600">
              저장한 대안 조합을 다시 열면 같은 화면이 나옵니다. 담당자가 바뀌면 내보내기 파일로 인수인계하세요.
            </p>
            <p className="text-xs text-neutral-400">
              {store.mode === "server"
                ? "구청 계정에 저장된 기록입니다. 같은 구 담당자가 함께 봅니다."
                : "시연 모드: 이 브라우저에만 저장됩니다. 로그인하면 구청 계정에 저장됩니다."}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={onExport} disabled={!records.length} className="flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm disabled:opacity-40">
              <Download className="h-4 w-4" /> 내보내기
            </button>
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm">
              <Upload className="h-4 w-4" /> 가져오기
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
            />
          </div>
        </div>
        {status && <p className="mt-3 text-sm text-neutral-700">{status}</p>}

        {records.length === 0 ? (
          <p className="mt-10 text-center text-sm text-neutral-400">
            저장한 판단이 없습니다. 지도 화면의 대안 비교에서 카드를 고른 뒤 ‘이 판단 저장’을 누르세요.
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {records.map((r) => {
              const q = encodeView(r.view);
              const stale = r.summary.dataDate !== DATA_DATE;
              return (
                <li key={r.id} className="rounded-xl border border-neutral-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-neutral-900">
                        {r.summary.sigunguName} {r.summary.dongName} · {r.summary.slotLabel}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {new Date(r.createdAt).toLocaleString("ko-KR")} · {r.author} · {r.summary.targetLabel}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <Link href={`/?${q}`} className="flex items-center gap-1 rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white">
                        <ExternalLink className="h-3 w-3" /> 다시 열기
                      </Link>
                      <Link href={`/report?${q}&template=monthly`} className="flex items-center gap-1 rounded-md border border-neutral-300 px-2.5 py-1 text-xs">
                        <FileText className="h-3 w-3" /> 리포트
                      </Link>
                      <button
                        disabled={store.mode === "server" && !canWriteDistrict(auth, r.view.sigunguCode)}
                        onClick={async () => {
                          if (!window.confirm("이 판단 기록을 지울까요?")) return;
                          await store.remove(r.id).catch(() => setStatus("삭제할 권한이 없습니다."));
                          await reload();
                        }}
                        className="flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-500"
                        aria-label="삭제"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-neutral-800">
                    {r.summary.alternativeTitles.join(" + ")}: {people(r.summary.gapBefore)} 부족 → {people(r.summary.gapAfter)} 부족
                  </p>
                  {r.memo && <p className="mt-1 whitespace-pre-wrap rounded bg-neutral-50 p-2 text-xs text-neutral-700">{r.memo}</p>}
                  <p className="mt-1 text-[11px] text-neutral-400">
                    저장 당시 데이터 기준일 {r.summary.dataDate}
                    {stale && ` — 지금 데이터(${DATA_DATE})로 다시 열면 숫자가 다를 수 있습니다`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
