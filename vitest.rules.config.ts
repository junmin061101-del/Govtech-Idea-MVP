import { defineConfig } from "vitest/config";

/** Firestore 보안 규칙 테스트 — 에뮬레이터 위에서만 돈다 (npm run test:rules) */
export default defineConfig({
  test: { include: ["tests/rules/**/*.test.ts"], testTimeout: 20_000, fileParallelism: false },
});
