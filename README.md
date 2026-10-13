# MANUAL STUDIO

다중 브랜드 현장 수집(모바일) → 본사 매뉴얼 편집·기준 확정·승인 → 개별/통합 PPTX·PDF 출력 웹 앱.
요구사항 원본: [01_PRODUCT_STANDARDS_AND_EXPORT_SPEC_KR.md](01_PRODUCT_STANDARDS_AND_EXPORT_SPEC_KR.md) · 결정 기록: [docs/decisions.md](docs/decisions.md)

> KODO KODO TYCOON(게임), Equipment Master 와 별개 프로젝트. 첫 파일럿 브랜드는 KODO KODO 이지만 브랜드는 데이터로만 존재한다.

## 스택

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres + Auth + Storage + RLS) · zod · Vitest · 배포: Vercel

## 진행 상태

| Step | 내용 | 상태 |
|---|---|---|
| 1 | 스키마/RLS/트리거, RBAC, 시드, 라우트 골격 | ✅ |
| 2 | Field Quick/Guided Capture, 업로드, HQ Inbox | ⏳ |
| 3 | Manual Builder, Product Standards 폼, 발행 검증, 불변 버전 | ⏳ |
| 4 | ExportDocument 모델 + mapper + 브랜드 템플릿 | ⏳ |
| 5 | 개별 PPTX/PDF 렌더러 | ⏳ |
| 6 | Combined 출력 + export history | ⏳ |
| 7 | E2E/시각 회귀/권한 테스트 | ⏳ |

## 처음 설정 (Vercel + Supabase)

1. Vercel 프로젝트 생성 → **Storage → Supabase** 연동 (Supabase 프로젝트와 환경변수가 자동 생성됨).
2. 로컬로 환경변수 받기:
   ```bash
   npx vercel link
   npx vercel env pull .env.local
   ```
   연동을 쓰지 않으면 `.env.example` 을 `.env.local` 로 복사해 직접 채운다.
3. `.env.local` 에 직접 추가: `DEMO_USER_PASSWORD`(10자 이상), `DEMO_MODE=true`(로그인 화면에 데모 계정 목록 표시), `NEXT_PUBLIC_APP_URL`.
4. 설치·마이그레이션·시드:
   ```bash
   npm install
   npm run db:migrate      # supabase/migrations/*.sql 적용 (POSTGRES_URL_NON_POOLING 사용)
   npm run db:seed         # DEMO 조직/브랜드/매장/계정/샘플 제출·초안
   npm run dev             # http://localhost:3000
   ```

**Vercel 배포 시 자동 처리:** Supabase 연동 변수는 Sensitive 라서 `vercel env pull` 로는 실제 값이 내려오지 않는다.
그래서 Production 빌드(`npm run vercel-build` → `scripts/predeploy.ts`)가 마이그레이션을 적용하고,
`DEMO_MODE=true` 이면 DEMO 시드도 실행한다. Preview 빌드는 DB 를 건드리지 않는다. 프레임워크는 `vercel.json` 에 고정.
로컬에서 직접 실행하려면 Supabase 대시보드(Project Settings → API / Database)의 값을 `.env.local` 에 직접 넣는다.

마이그레이션은 `ms_meta.applied_migrations` 에 이력을 남긴다. **이미 적용된 파일은 수정하지 말고 새 번호 파일을 추가한다** (수정 시 runner 가 중단).

## 데모 로그인

비밀번호는 모두 `DEMO_USER_PASSWORD`. 전부 DEMO 데이터이며 실제 기준이 아니다.

| 계정 | 역할 | 범위 |
|---|---|---|
| field.makati@example.com | Field Staff | KODO KODO / DEMO Makati |
| field.bgc@example.com | Field Staff | KODO KODO / DEMO BGC |
| manager.makati@example.com | Store Manager | KODO KODO / DEMO Makati |
| editor@example.com | HQ Editor | KODO KODO |
| approver@example.com | HQ Approver | KODO KODO |
| admin@example.com | System Admin | 조직 전체 |
| field.other@example.com | Field Staff | DEMO Brand B (브랜드 격리 확인용) |

## 테스트

```bash
npm test            # 단위: RBAC 매트릭스, 입력 검증
npm run test:db     # DB: 마이그레이션을 PGlite(임베디드 Postgres)에 적용하고 RLS/트리거 시나리오 검증
npm run typecheck
```

`test:db` 는 Supabase 의 `auth`/`storage` 스키마를 스텁으로 흉내 낸다. 실제 Supabase 에서의 최종 확인은 Step 7 E2E 에서 한다.

## 구조

```
app/                    라우트 (field/, hq/, login/, m/[manualId] 딥링크)
proxy.ts                세션 갱신 + 비로그인 리다이렉트
src/auth/               rbac.ts (권한 매트릭스), session.ts (요청별 사용자 컨텍스트)
src/db/                 Supabase 클라이언트, 조회 헬퍼
src/domain/             DB enum/행 타입
src/validation/         zod 입력 스키마
src/demo/               DEMO 고정 ID·계정
supabase/migrations/    0001 스키마 · 0002 RLS/스토리지 · 0003 트리거(불변성·audit)
scripts/                migrate.ts, seed-demo.ts
tests/unit, tests/db
```

## 보안 원칙

- 권한은 앱(`rbac.ts`)과 DB(RLS) 양쪽에서 검사한다. service role 클라이언트는 앱 권한 검사를 통과한 서버 코드에서만 사용.
- 미디어/출력물은 private 버킷. QR 에는 만료 signed URL 대신 `/m/{manualId}` 딥링크.
- 발행 버전과 그 기준 행은 DB 트리거로 수정·삭제가 차단된다. 롤백은 이전 내용을 새 버전으로 발행.
- 비밀값은 `.env.local`/Vercel 환경변수에만. 저장소에는 `.env.example` 만 커밋.
