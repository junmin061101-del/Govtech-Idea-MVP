/**
 * 지역 코드 체계 — 화면·데이터·(향후) Firestore 문서 키가 모두 이 코드를 기준으로 한다.
 *
 *  - sido_code     : 2자리 (서울특별시 = "11")
 *  - sigungu_code  : 5자리 (행정안전부 행정표준코드 / 통계청 시군구 코드, 예: 동작구 = "11590")
 *  - emd_code      : 행정동 코드 (vuski/admdongkor GeoJSON의 adm_cd2, 10자리) — S2에서 경계 데이터와 함께 채운다
 *
 * 서울 25개 구로 시작하고, 다른 시도를 추가할 때는 SIDO/SIGUNGU 목록만 늘리면 되도록 설계한다.
 */

export interface Sido {
  code: string;
  name: string;
}

export interface Sigungu {
  code: string;
  sidoCode: string;
  name: string;
}

export const SIDO: Sido[] = [{ code: "11", name: "서울특별시" }];

export const SIGUNGU: Sigungu[] = [
  { code: "11110", sidoCode: "11", name: "종로구" },
  { code: "11140", sidoCode: "11", name: "중구" },
  { code: "11170", sidoCode: "11", name: "용산구" },
  { code: "11200", sidoCode: "11", name: "성동구" },
  { code: "11215", sidoCode: "11", name: "광진구" },
  { code: "11230", sidoCode: "11", name: "동대문구" },
  { code: "11260", sidoCode: "11", name: "중랑구" },
  { code: "11290", sidoCode: "11", name: "성북구" },
  { code: "11305", sidoCode: "11", name: "강북구" },
  { code: "11320", sidoCode: "11", name: "도봉구" },
  { code: "11350", sidoCode: "11", name: "노원구" },
  { code: "11380", sidoCode: "11", name: "은평구" },
  { code: "11410", sidoCode: "11", name: "서대문구" },
  { code: "11440", sidoCode: "11", name: "마포구" },
  { code: "11470", sidoCode: "11", name: "양천구" },
  { code: "11500", sidoCode: "11", name: "강서구" },
  { code: "11530", sidoCode: "11", name: "구로구" },
  { code: "11545", sidoCode: "11", name: "금천구" },
  { code: "11560", sidoCode: "11", name: "영등포구" },
  { code: "11590", sidoCode: "11", name: "동작구" },
  { code: "11620", sidoCode: "11", name: "관악구" },
  { code: "11650", sidoCode: "11", name: "서초구" },
  { code: "11680", sidoCode: "11", name: "강남구" },
  { code: "11710", sidoCode: "11", name: "송파구" },
  { code: "11740", sidoCode: "11", name: "강동구" },
];

/** 현재 상세 데이터가 적재된 구 (S2에서 서울 25개 구로 확장 예정) */
export const DEFAULT_SIGUNGU_CODE = "11590";

export function sigunguByCode(code: string): Sigungu | undefined {
  return SIGUNGU.find((s) => s.code === code);
}
