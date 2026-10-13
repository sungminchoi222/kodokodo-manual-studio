/**
 * Vercel 빌드 직전 단계 (package.json "vercel-build").
 * - Production 배포에서만 DB 마이그레이션 실행. Preview 브랜치가 운영 DB 를 바꾸지 않도록 한다.
 * - DEMO_MODE=true 이고 DEMO_USER_PASSWORD 가 있으면 DEMO 시드 실행 (반복 실행 안전).
 * Vercel 의 Supabase 연동 변수는 Sensitive 라서 로컬로 받아올 수 없으므로, 빌드 환경에서 처리한다.
 * 실패하면 빌드가 실패해 스키마와 코드가 어긋난 배포를 막는다.
 */
import { execSync } from "node:child_process";

const env = process.env.VERCEL_ENV;

function run(cmd: string) {
  execSync(cmd, { stdio: "inherit" });
}

if (env !== "production") {
  console.log(`[predeploy] VERCEL_ENV=${env ?? "(unset)"} → skip migrations/seed`);
} else {
  console.log("[predeploy] production → applying migrations");
  run("npx tsx scripts/migrate.ts");

  if (process.env.DEMO_MODE === "true" && process.env.DEMO_USER_PASSWORD) {
    console.log("[predeploy] DEMO_MODE → seeding DEMO data");
    run("npx tsx scripts/seed-demo.ts");
  }
}
