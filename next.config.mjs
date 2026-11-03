/**
 * 모든 화면이 클라이언트에서 동작하므로 정적 파일로 내보내 Firebase Hosting에 올린다 (out/).
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: "export",
  // 에뮬레이터 검증(npm run test:e2e)은 별도 폴더를 써서, 테스트 설정이 들어간 빌드 캐시가 일반 개발·운영 빌드에 섞이지 않게 한다
  distDir: process.env.NEXT_DIST_DIR || ".next",
  trailingSlash: true,
};

export default nextConfig;
