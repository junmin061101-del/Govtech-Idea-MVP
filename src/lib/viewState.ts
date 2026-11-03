/**
 * 화면 상태 ↔ URL 쿼리. 판단 이력 "다시 열기"와 리포트가 같은 형식을 쓴다.
 * 예: /?sgg=11590&slot=night&target=infant&dong=1159053000&alts=add_staff,extend_hours&layer=both
 */
import { SIGUNGU, DEFAULT_SIGUNGU_CODE } from "@/lib/constants/regions";
import { TIME_SLOTS, type TimeSlotId } from "@/lib/constants/timeSlots";
import { CARE_TARGETS, type CareTargetId } from "@/lib/constants/targets";
import type { AlternativeKind } from "@/lib/alternatives";

export type MapLayerId = "estimate" | "signal" | "both";

export interface ViewState {
  sigunguCode: string;
  timeSlot: TimeSlotId;
  target: CareTargetId;
  dongId: string | null;
  alternatives: AlternativeKind[];
  layer: MapLayerId;
  /** 형평성 겹쳐 보기: 대중교통 접근성 */
  equityTransit: boolean;
}

export const DEFAULT_VIEW: ViewState = {
  sigunguCode: DEFAULT_SIGUNGU_CODE,
  timeSlot: "daytime",
  target: "infant",
  dongId: null,
  alternatives: [],
  layer: "estimate",
  equityTransit: false,
};

const ALT_KINDS: AlternativeKind[] = ["extend_hours", "add_staff", "link_capacity"];
const LAYERS: MapLayerId[] = ["estimate", "signal", "both"];

export function encodeView(v: ViewState): string {
  const q = new URLSearchParams({ sgg: v.sigunguCode, slot: v.timeSlot, target: v.target });
  if (v.dongId) q.set("dong", v.dongId);
  if (v.alternatives.length) q.set("alts", v.alternatives.join(","));
  if (v.layer !== "estimate") q.set("layer", v.layer);
  if (v.equityTransit) q.set("eq", "transit");
  return q.toString();
}

/** 알 수 없는 값·쓸 수 없는 시간대/대상은 기본값으로 바꾼다 */
export function decodeView(search: string): ViewState {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const sgg = q.get("sgg");
  const slot = q.get("slot");
  const target = q.get("target");
  const dong = q.get("dong");
  const layer = q.get("layer");
  return {
    sigunguCode: SIGUNGU.some((s) => s.code === sgg) ? sgg! : DEFAULT_VIEW.sigunguCode,
    timeSlot: TIME_SLOTS.some((t) => t.id === slot && t.dataAvailable) ? (slot as TimeSlotId) : DEFAULT_VIEW.timeSlot,
    target: CARE_TARGETS.some((t) => t.id === target && t.dataAvailable) ? (target as CareTargetId) : DEFAULT_VIEW.target,
    // 행정동 코드는 10자리이고 그 구 소속이어야 한다
    dongId: dong && /^\d{10}$/.test(dong) && sgg && dong.startsWith(sgg) ? dong : null,
    alternatives: (q.get("alts") ?? "").split(",").filter((k): k is AlternativeKind => ALT_KINDS.includes(k as AlternativeKind)),
    layer: LAYERS.includes(layer as MapLayerId) ? (layer as MapLayerId) : "estimate",
    equityTransit: (q.get("eq") ?? "").split(",").includes("transit"),
  };
}
