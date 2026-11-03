/**
 * 입소 대기 집계 CSV — 구청이 보육통합정보시스템에서 뽑은 "행정동 × 연령별 대기 인원" 집계를 올려
 * 추정 수요·검색 신호와 나란히 비교한다. 개인 식별 정보가 있으면 파일 전체를 거부한다.
 *
 * 받는 형식 (둘 중 하나, UTF-8 또는 UTF-8 BOM, 첫 줄은 열 이름)
 *  - 긴 형식: 행정동코드, 행정동명, 연령, 대기인원
 *  - 넓은 형식: 행정동코드, 행정동명, 0세, 1세, 2세, 3세, 4세, 5세
 *  행정동코드가 없으면 행정동명으로 찾는다 (선택한 구 안에서).
 *
 * 개인정보 보호: 거부 사유에 문제의 "값"은 다시 보여 주지 않는다 (행·열 위치만).
 * 파일은 브라우저 안에서만 읽고 서버로 보내지 않는다.
 * TODO(Firebase 이전): district_admin만 업로드, 원본 대신 검증된 집계만 Firestore waitlist/{sgg}_{yyyymm}에 저장.
 */
import type { Dong } from "@/types";

export const WAITLIST_AGES = [0, 1, 2, 3, 4, 5] as const;
export const MAX_FILE_BYTES = 1_000_000;

export const WAITLIST_TEMPLATE_CSV = [
  "행정동코드,행정동명,연령,대기인원",
  "1159051000,노량진1동,0,0",
  "1159051000,노량진1동,1,0",
].join("\n");

/** 개인 식별 정보로 보이는 열 이름 */
const PII_HEADER = /(이름|성명|아동명|보호자|부모명|생년월일|생일|주민|외국인등록|연락처|전화|휴대|핸드폰|주소|이메일|e-?mail|\bname\b|birth|phone|mobile|address|ssn|rrn)/i;

/** 개인 식별 정보로 보이는 값 (주민등록번호, 휴대전화, 이메일) */
const PII_VALUE: { label: string; re: RegExp }[] = [
  { label: "주민등록번호 형식", re: /\b\d{6}-?[1-8]\d{6}\b/ },
  { label: "휴대전화 번호 형식", re: /\b01[016789]-?\d{3,4}-?\d{4}\b/ },
  { label: "이메일 형식", re: /[^\s@,]+@[^\s@,]+\.[^\s@,]+/ },
];

export interface WaitlistResult {
  ok: boolean;
  /** 거부 사유 (하나라도 있으면 ok = false) */
  errors: string[];
  warnings: string[];
  /** 행정동 코드 → 0~5세 대기 인원 */
  byDong: Map<string, number[]>;
  total: number;
}

/** 따옴표·쉼표·줄바꿈을 처리하는 CSV 파서 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ""));
}

const norm = (h: string) => h.replace(/\s+/g, "").toLowerCase();

export function validateWaitlist(text: string, dongs: Dong[]): WaitlistResult {
  const fail = (errors: string[]): WaitlistResult => ({ ok: false, errors, warnings: [], byDong: new Map(), total: 0 });
  if (text.length > MAX_FILE_BYTES) return fail([`파일이 너무 큽니다 (${MAX_FILE_BYTES / 1_000_000}MB 이하). 집계 파일이 맞는지 확인하세요.`]);

  const rows = parseCsv(text);
  if (rows.length < 2) return fail(["내용이 없습니다. 첫 줄에 열 이름, 그 아래에 집계 행이 있어야 합니다."]);
  const header = rows[0];
  const body = rows.slice(1);

  // 1) 개인 식별 정보 — 열 이름
  const piiCols = header.filter((h) => PII_HEADER.test(h));
  if (piiCols.length) {
    return fail([`개인 식별 정보로 보이는 열이 있어 거부했습니다: ${piiCols.join(", ")}. 행정동·연령별 집계(인원 수)만 올려 주세요.`]);
  }
  // 2) 개인 식별 정보 — 값 (값 자체는 다시 보여 주지 않는다)
  const piiHits: string[] = [];
  body.forEach((r, i) =>
    r.forEach((v, j) => {
      const hit = PII_VALUE.find((p) => p.re.test(v));
      if (hit && piiHits.length < 5) piiHits.push(`${i + 2}행 ${j + 1}열(${hit.label})`);
    }),
  );
  if (piiHits.length) return fail([`개인 식별 정보로 보이는 값이 있어 거부했습니다: ${piiHits.join(", ")}. 해당 값은 화면에 표시하지 않습니다.`]);

  // 3) 형식 판별
  const h = header.map(norm);
  const codeIdx = h.findIndex((x) => x === "행정동코드" || x === "emd_code" || x === "adm_cd");
  const nameIdx = h.findIndex((x) => x === "행정동명" || x === "행정동" || x === "동명");
  const ageIdx = h.findIndex((x) => x === "연령" || x === "나이" || x === "age");
  const countIdx = h.findIndex((x) => x === "대기인원" || x === "대기" || x === "인원" || x === "waiting");
  const wideIdx = WAITLIST_AGES.map((a) => h.findIndex((x) => x === `${a}세` || x === `만${a}세`));
  const wide = wideIdx.every((i) => i >= 0);
  const errors: string[] = [];
  if (codeIdx < 0 && nameIdx < 0) errors.push("행정동코드 또는 행정동명 열이 필요합니다.");
  if (!wide && (ageIdx < 0 || countIdx < 0)) errors.push("'연령'과 '대기인원' 열(긴 형식) 또는 '0세'~'5세' 열(넓은 형식)이 필요합니다.");
  if (errors.length) return fail(errors);

  const byCode = new Map(dongs.map((d) => [d.emdCode, d]));
  const byName = new Map(dongs.map((d) => [norm(d.name), d]));
  const byDong = new Map<string, number[]>();
  const seen = new Set<string>();
  const warnings: string[] = [];
  const intOf = (v: string) => (/^\d+$/.test(v.replace(/,/g, "")) ? Number(v.replace(/,/g, "")) : NaN);

  body.forEach((r, i) => {
    const line = i + 2;
    const code = codeIdx >= 0 ? r[codeIdx] : "";
    const name = nameIdx >= 0 ? r[nameIdx] : "";
    const dong = (code && byCode.get(code)) || (name && byName.get(norm(name)));
    if (!dong) {
      if (/^(합계|소계|총계|계)$/.test(norm(name)) || (code === "" && name === "")) {
        warnings.push(`${line}행: 합계·빈 행으로 보고 건너뛰었습니다.`);
        return;
      }
      errors.push(`${line}행: 선택한 구의 행정동을 찾을 수 없습니다 (${code || name}).`);
      return;
    }
    const counts = byDong.get(dong.emdCode) ?? [0, 0, 0, 0, 0, 0];
    const entries: [number, string][] = wide ? WAITLIST_AGES.map((a, k) => [a, r[wideIdx[k]] ?? ""]) : [[intOf(r[ageIdx] ?? ""), r[countIdx] ?? ""]];
    for (const [age, raw] of entries) {
      if (!WAITLIST_AGES.includes(age as (typeof WAITLIST_AGES)[number])) {
        if (Number.isFinite(age) && age > 5) warnings.push(`${line}행: ${age}세는 영유아(0~5세) 범위 밖이라 건너뛰었습니다.`);
        else errors.push(`${line}행: 연령은 0~5 정수여야 합니다.`);
        continue;
      }
      const n = intOf(raw);
      if (!Number.isFinite(n)) {
        errors.push(`${line}행: 대기 인원은 0 이상의 정수여야 합니다.`);
        continue;
      }
      const k = `${dong.emdCode}|${age}`;
      if (seen.has(k)) {
        errors.push(`${line}행: ${dong.name} ${age}세가 여러 행에 있습니다. 집계 형태가 아닙니다(개인 단위 명단일 수 있음).`);
        continue;
      }
      seen.add(k);
      counts[age] += n;
    }
    byDong.set(dong.emdCode, counts);
  });

  if (errors.length) return { ok: false, errors: errors.slice(0, 20), warnings, byDong: new Map(), total: 0 };
  const missing = dongs.filter((d) => !byDong.has(d.emdCode)).map((d) => d.name);
  if (missing.length) warnings.push(`파일에 없는 행정동(0명으로 보지 않고 '자료 없음'으로 표시): ${missing.join(", ")}`);
  const total = [...byDong.values()].reduce((a, c) => a + c.reduce((x, y) => x + y, 0), 0);
  return { ok: true, errors: [], warnings, byDong, total };
}
