/**
 * supabase/migrations/*.sql 을 순서대로 적용한다 (Supabase CLI/Docker 없이).
 * 적용 이력은 ms_meta.applied_migrations 에 파일명 + sha256 으로 남기고,
 * 이미 적용된 파일 내용이 바뀌면 중단한다 (발행된 마이그레이션은 수정 대신 새 파일 추가).
 *
 * 사용: npm run db:migrate            (.env.local 의 POSTGRES_URL_NON_POOLING 사용)
 *       npm run db:migrate -- --dry   (적용 대상만 출력)
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });

const dryRun = process.argv.includes("--dry");
const dir = path.join(process.cwd(), "supabase", "migrations");

function connectionString(): string {
  const raw = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
  if (!raw) {
    throw new Error("POSTGRES_URL_NON_POOLING 이 없습니다. .env.local 을 확인하세요 (.env.example 참고).");
  }
  // pg 는 sslmode=require 를 verify-full 로 해석하는데 Supabase pooler 인증서 체인과 맞지 않는 경우가 있어
  // URL 의 sslmode 를 제거하고 아래 ssl 옵션으로 암호화 연결을 강제한다.
  const url = new URL(raw);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("supa");
  return url.toString();
}

async function main() {
  const files = readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const client = new pg.Client({ connectionString: connectionString(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(`
      create schema if not exists ms_meta;
      create table if not exists ms_meta.applied_migrations (
        name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      );
    `);
    const { rows } = await client.query<{ name: string; checksum: string }>(
      "select name, checksum from ms_meta.applied_migrations",
    );
    const applied = new Map(rows.map((r) => [r.name, r.checksum]));

    for (const file of files) {
      const sql = readFileSync(path.join(dir, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const prev = applied.get(file);
      if (prev) {
        if (prev !== checksum) {
          throw new Error(`${file} 이 적용 후 수정되었습니다. 기존 파일을 되돌리고 새 마이그레이션을 추가하세요.`);
        }
        continue;
      }
      if (dryRun) {
        console.log(`[dry] would apply ${file}`);
        continue;
      }
      console.log(`applying ${file} ...`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into ms_meta.applied_migrations (name, checksum) values ($1, $2)", [file, checksum]);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw new Error(`${file} 실패: ${(err as Error).message}`);
      }
    }
    console.log("migrations up to date");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
