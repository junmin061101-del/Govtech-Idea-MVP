#!/usr/bin/env bash
# 자동 갱신(.github/workflows/data-refresh.yml)에 필요한 GitHub Secrets 4개를 등록한다.
# 저장소 관리자가 본인 GitHub 계정으로 한 번만 실행한다. 값은 화면·명령줄 인자에 남기지 않고 .env.local에서 바로 넘긴다.
#
#   bash scripts/setup-refresh.sh
#
# 1~3번(공공데이터 키·카카오 키·Firebase 웹 설정)은 이 스크립트가 등록하고,
# 4번(배포용 서비스 계정)은 Firebase가 만들어 등록하도록 마지막에 안내한다.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO=junmin061101-del/Govtech-Idea-MVP

# Codespace 기본 토큰(GITHUB_TOKEN)은 비밀값을 쓸 권한이 없어, 본인 계정 로그인으로 실행한다
gh_me() { env -u GITHUB_TOKEN gh "$@"; }
if ! gh_me auth status -h github.com >/dev/null 2>&1; then
  echo "GitHub 본인 계정으로 로그인합니다 (브라우저 인증)."
  gh_me auth login -h github.com -s repo,workflow
fi

[ -f .env.local ] || { echo ".env.local 이 없습니다." >&2; exit 1; }
val() { grep -E "^$1=" .env.local | head -1 | cut -d= -f2-; }
put() {
  local name=$1 value=$2
  [ -n "$value" ] || { echo "  ✗ $name: .env.local 에 값이 없습니다" >&2; return 1; }
  printf '%s' "$value" | gh_me secret set "$name" -R "$REPO" >/dev/null
  echo "  ✓ $name"
}

echo "GitHub Secrets 등록 ($REPO)"
put SEOUL_OPEN_DATA_API_KEY "$(val SEOUL_OPEN_DATA_API_KEY)"
put NEXT_PUBLIC_KAKAO_MAP_API_KEY "$(val NEXT_PUBLIC_KAKAO_MAP_API_KEY)"
put FIREBASE_WEB_CONFIG_DEV "$(grep -E '^NEXT_PUBLIC_FIREBASE_(API_KEY|AUTH_DOMAIN|PROJECT_ID|APP_ID)=' .env.local)"

if gh_me secret list -R "$REPO" | grep -qE '^FIREBASE_SERVICE_ACCOUNT_(DEV|CAREOS_DEV_1103174)\b'; then
  echo "  ✓ 배포용 서비스 계정 (이미 있음)"
else
  cat <<'MSG'

남은 1개 — 배포용 서비스 계정 (Firebase가 만들어 GitHub에 등록해 줍니다):
  npx firebase init hosting:github --project dev
    · 저장소: junmin061101-del/Govtech-Idea-MVP
    · "Set up the workflow to run a build script before every deploy?"  → No
    · "Set up automatic deployment to your site's live channel ..."      → No
  (FIREBASE_SERVICE_ACCOUNT_CAREOS_DEV_1103174 비밀값이 생기고, 워크플로가 이 이름도 인식합니다)
MSG
fi
echo
echo "등록 후 바로 한 번 돌려 보기:  env -u GITHUB_TOKEN gh workflow run data-refresh.yml -R $REPO -f mode=daily"
