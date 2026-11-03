import { describe, expect, it } from "vitest";
import { parseCsv, validateWaitlist, WAITLIST_TEMPLATE_CSV } from "@/lib/waitlist";
import { loadEmds } from "@/test/seoulData";

const dongjak = loadEmds().filter((d) => d.sigunguCode === "11590");

describe("CSV 파서", () => {
  it("BOM·CRLF·따옴표 안 쉼표를 처리한다", () => {
    expect(parseCsv('﻿a,b\r\n"1,000","x ""y"""\r\n')).toEqual([["a", "b"], ["1,000", 'x "y"']]);
  });
});

describe("입소 대기 집계 검증", () => {
  it("견본 파일은 통과한다", () => {
    const r = validateWaitlist(WAITLIST_TEMPLATE_CSV, dongjak);
    expect(r.ok).toBe(true);
  });
  it("긴 형식: 동·연령별 합계", () => {
    const r = validateWaitlist("행정동코드,행정동명,연령,대기인원\n1159051000,노량진1동,0,12\n1159051000,노량진1동,2,\"1,003\"\n,흑석동,1,4", dongjak);
    expect(r.ok).toBe(true);
    expect(r.byDong.get("1159051000")).toEqual([12, 0, 1003, 0, 0, 0]);
    expect(r.byDong.get("1159060500")).toEqual([0, 4, 0, 0, 0, 0]);
    expect(r.total).toBe(1019);
  });
  it("넓은 형식(0세~5세 열)", () => {
    const r = validateWaitlist("행정동명,0세,1세,2세,3세,4세,5세\n상도1동,1,2,3,4,5,6\n합계,1,2,3,4,5,6", dongjak);
    expect(r.ok).toBe(true);
    expect(r.byDong.get("1159053000")).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.warnings.join(" ")).toContain("합계");
  });
  it.each(["아동명", "성명", "보호자 연락처", "생년월일", "주소", "Name"])("개인 식별 열 '%s'이 있으면 거부", (col) => {
    const r = validateWaitlist(`행정동코드,${col},연령,대기인원\n1159051000,x,0,1`, dongjak);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain("개인 식별");
  });
  it.each([
    ["주민등록번호", "900101-1234567"],
    ["휴대전화", "010-1234-5678"],
    ["이메일", "a@b.kr"],
  ])("값에 %s가 있으면 거부하고, 그 값은 메시지에 내지 않는다", (_, v) => {
    const r = validateWaitlist(`행정동코드,행정동명,연령,대기인원,비고\n1159051000,노량진1동,0,1,${v}`, dongjak);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).not.toContain(v);
    expect(r.errors[0]).toContain("2행 5열");
  });
  it("같은 동·연령이 여러 행이면 개인 단위 명단일 수 있어 거부", () => {
    const r = validateWaitlist("행정동코드,연령,대기인원\n1159051000,0,1\n1159051000,0,1", dongjak);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain("집계 형태가 아닙니다");
  });
  it("다른 구 행정동·잘못된 숫자·잘못된 연령은 오류", () => {
    expect(validateWaitlist("행정동코드,연령,대기인원\n1162053000,0,1", dongjak).errors[0]).toContain("찾을 수 없습니다");
    expect(validateWaitlist("행정동코드,연령,대기인원\n1159051000,0,-3", dongjak).ok).toBe(false);
    expect(validateWaitlist("행정동코드,연령,대기인원\n1159051000,영,3", dongjak).ok).toBe(false);
    expect(validateWaitlist("행정동명,연령,대기인원\n없는동,0,3", dongjak).ok).toBe(false);
  });
  it("6세 이상은 건너뛰고 경고", () => {
    const r = validateWaitlist("행정동코드,연령,대기인원\n1159051000,7,3\n1159051000,1,2", dongjak);
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toContain("7세");
  });
  it("필수 열이 없으면 오류", () => {
    expect(validateWaitlist("동,수\n노량진1동,3", dongjak).ok).toBe(false);
  });
});
