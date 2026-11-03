/**
 * Node 모듈 해석 훅: "@/..." 경로를 src/...로 바꾸고, 확장자 없는 TypeScript import에 .ts를 붙인다.
 * 화면과 같은 계산 코드(src/lib/*.ts)를 데이터 빌드 스크립트에서 그대로 쓰기 위함 (Node 타입 제거 실행).
 */
import { existsSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

function withExt(path) {
  for (const p of [path, `${path}.ts`, join(path, "index.ts")]) if (existsSync(p) && !p.endsWith("/")) {
    if (p === path && !/\.[a-z]+$/.test(p)) continue;
    return p;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const p = withExt(join(SRC, specifier.slice(2)));
    if (p) return next(pathToFileURL(p).href, context);
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.includes("/src/")) {
    const p = withExt(join(dirname(fileURLToPath(context.parentURL)), specifier));
    if (p) return next(pathToFileURL(p).href, context);
  }
  return next(specifier, context);
}
