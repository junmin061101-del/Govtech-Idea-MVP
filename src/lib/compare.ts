import type { SnapshotFile } from "@/lib/report";
import type { CareTargetId, Dong, TimeSlotId } from "@/types";

/** 월별 스냅샷에서 동별 부족 인원 추이와 (처음 → 최근) 변화를 뽑는다. 부족 인원이 큰 동부터 */
export function compareSnapshots(snapshots: SnapshotFile[], dongs: Dong[], slot: TimeSlotId, target: CareTargetId) {
  const sorted = [...snapshots].sort((a, b) => a.month.localeCompare(b.month));
  const months = sorted.map((s) => s.month);
  const rows = dongs.map((d) => {
    const gaps = sorted.map((s) => s.rows.find(([emd, sl, tg]) => emd === d.id && sl === slot && tg === target)?.[5] ?? null);
    const known = gaps.filter((g): g is number => g != null);
    const change = known.length >= 2 ? known[known.length - 1] - known[0] : null;
    return { emdCode: d.id, name: d.name, gaps, change };
  });
  rows.sort((a, b) => (b.gaps.at(-1) ?? -1) - (a.gaps.at(-1) ?? -1));
  return { months, rows };
}
