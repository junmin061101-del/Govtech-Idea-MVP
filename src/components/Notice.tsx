"use client";

import { useEffect } from "react";
import { Info, X } from "lucide-react";

/** 아직 볼 수 없는 항목을 눌렀을 때 이유를 잠깐 알려 주는 안내 (4초 뒤 사라짐) */
export default function Notice({ message, onClose }: { message: { text: string; id: number } | null; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[100px] z-50 flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex max-w-xl items-start gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm text-white shadow-lg"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-neutral-300" />
        <span className="break-keep">{message.text}</span>
        <button onClick={onClose} aria-label="닫기" className="ml-1 text-neutral-400 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** 볼 수 없는 항목별 안내 문구 */
export const UNAVAILABLE_TEXT = {
  lower_elementary: "초등 저학년은 키움센터·다함께돌봄센터·지역아동센터 시설 정보가 아직 없어 볼 수 없습니다.",
  early_morning: "이른 아침(07–09시)은 시설별 개원 시각 정보가 없어 아직 볼 수 없습니다.",
  vacation: "방학은 방학 중 운영 정보가 없어 아직 볼 수 없습니다.",
  signal: "이 구는 시민 돌봄지도 이용 기록이 아직 없어 부모의 미충족 수요를 볼 수 없습니다.",
} as const;
