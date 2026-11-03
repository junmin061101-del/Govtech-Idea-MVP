#!/usr/bin/env bash
# 에뮬레이터 안에서 Next 개발 서버(3100)를 에뮬레이터 설정으로 띄우고 종단 검증을 실행한다.
set -euo pipefail
export NEXT_DIST_DIR=.next-e2e
export NEXT_PUBLIC_FIREBASE_EMULATORS=1 NEXT_PUBLIC_FIREBASE_API_KEY=demo-key NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-careos NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=localhost
npx next dev -p 3100 > "${TMPDIR:-/tmp}/careos-e2e-next.log" 2>&1 &
NEXT_PID=$!
trap 'kill $NEXT_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 90); do curl -s -o /dev/null -w "%{http_code}" localhost:3100 | grep -q 200 && break; sleep 2; done
node tests/e2e/emulator.e2e.mjs
