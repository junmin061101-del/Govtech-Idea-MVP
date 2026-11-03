/**
 * 경계(GeoJSON) 계산 유틸 — 화면과 데이터 빌드 스크립트(scripts/build-data.mjs)가 함께 쓴다.
 * Node에서 타입 제거 방식으로 직접 import하므로 이 파일은 다른 모듈을 import하지 않는다.
 *
 * 좌표 순서는 GeoJSON 규약대로 [lng, lat].
 */

export type Position = [number, number];
export type Ring = Position[];
export type PolygonCoords = Ring[]; // [외곽, 구멍...]
export type MultiPolygonCoords = PolygonCoords[];

export interface Geometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: PolygonCoords | MultiPolygonCoords;
}

export function toMultiPolygon(g: Geometry): MultiPolygonCoords {
  return g.type === "Polygon" ? [g.coordinates as PolygonCoords] : (g.coordinates as MultiPolygonCoords);
}

/** 레이 캐스팅. 경계선 위의 점은 어느 쪽으로든 판정될 수 있다. */
export function pointInRing([x, y]: Position, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInGeometry(p: Position, g: Geometry): boolean {
  for (const poly of toMultiPolygon(g)) {
    if (!pointInRing(p, poly[0])) continue;
    if (poly.slice(1).some((hole) => pointInRing(p, hole))) continue;
    return true;
  }
  return false;
}

function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a / 2;
}

export function bbox(g: Geometry): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of toMultiPolygon(g)) for (const [x, y] of poly[0]) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/**
 * 라벨 위치: 가장 큰 조각의 면적 중심. 오목한 모양이라 중심이 경계 밖이면
 * 중심 위도에서 가로로 잘랐을 때 가장 긴 내부 구간의 가운데를 쓴다(항상 경계 안).
 */
export function labelPoint(g: Geometry): Position {
  const polys = toMultiPolygon(g);
  const largest = polys.reduce((a, b) => (Math.abs(ringArea(b[0])) > Math.abs(ringArea(a[0])) ? b : a));
  const ring = largest[0];
  let cx = 0, cy = 0;
  const a = ringArea(ring);
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    cx += (ring[j][0] + ring[i][0]) * f;
    cy += (ring[j][1] + ring[i][1]) * f;
  }
  const c: Position = [cx / (6 * a), cy / (6 * a)];
  if (pointInGeometry(c, { type: "Polygon", coordinates: largest })) return c;

  const xs: number[] = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > c[1] !== yj > c[1]) xs.push(xi + ((c[1] - yi) * (xj - xi)) / (yj - yi));
  }
  xs.sort((p, q) => p - q);
  let best: Position = ring[0];
  let bestLen = -1;
  for (let k = 0; k + 1 < xs.length; k += 2) {
    if (xs[k + 1] - xs[k] > bestLen) {
      bestLen = xs[k + 1] - xs[k];
      best = [(xs[k] + xs[k + 1]) / 2, c[1]];
    }
  }
  return best;
}

/** Douglas–Peucker 단순화 (tolerance는 도 단위). 링의 시작·끝점은 유지한다. */
export function simplifyRing(ring: Ring, tolerance: number): Ring {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack: [number, number][] = [[0, ring.length - 1]];
  const t2 = tolerance * tolerance;
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0, idx = -1;
    const [x1, y1] = ring[s];
    const [x2, y2] = ring[e];
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = ring[i];
      let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = px - (x1 + t * dx), ey = py - (y1 + t * dy);
      const d = ex * ex + ey * ey;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx >= 0 && maxD > t2) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out = ring.filter((_, i) => keep[i]);
  // 너무 줄어 면이 사라지면 원본 유지
  return out.length >= 4 ? out : ring;
}

export function simplifyGeometry(g: Geometry, tolerance: number, decimals = 5): Geometry {
  const f = 10 ** decimals;
  const round = (r: Ring): Ring => r.map(([x, y]) => [Math.round(x * f) / f, Math.round(y * f) / f]);
  return {
    type: "MultiPolygon",
    coordinates: toMultiPolygon(g).map((poly) => poly.map((ring) => round(simplifyRing(ring, tolerance)))),
  };
}
