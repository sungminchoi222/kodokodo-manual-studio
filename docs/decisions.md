# MANUAL STUDIO — 결정 사항 기록

원본 요구사항: `01_PRODUCT_STANDARDS_AND_EXPORT_SPEC_KR.md`. 이 문서는 확정된 결정과 **미확정 정책**을 분리해 기록한다.
미확정 항목은 코드에서 임의로 확정하지 않으며, 설정값/플래그로 분리하고 보수적인 기본값(접근 거부·필수 입력)을 쓴다.

## 확정 (명세 기준)

| # | 결정 | 구현 위치 |
|---|---|---|
| 1 | Quick Capture + Guided Capture 병행 | `submissions.capture_mode` |
| 2 | 재료별 BEFORE/DURING/AFTER, 손질 스펙, N/A 사유 | `submission_preparations`, `media_links.role` |
| 3 | HQ 전용 Product Standards (상태별 보관·기한·기산점, 제공량, QC) | `storage_standards`, `serving_standards`, `manual_drafts.draft_json` |
| 4 | Field Staff 는 기준 확정·승인 불가 | RLS(`manual_drafts` HQ 전용), `app.guard_standard_row` |
| 5 | 승인 시 불변 스냅샷 + checksum, 파일은 파생물 | `manual_versions` + `app.guard_manual_version` |
| 6 | Individual / Combined PPTX·PDF | `export_jobs.scope` (Step 4~6) |
| 8 | 온도·기한 등은 입력·검증된 값만. 기본값/추정/AI 자동채움 금지 | 컬럼 nullable, 시드도 비워 둠 |
| 9 | 화면·DB·스토리지·API 모두 브랜드/매장 권한 검사 | `src/auth/rbac.ts` + `0002_rls.sql` + storage 정책 |

## 구현 중 내린 기술 결정

- **호스팅: Vercel(앱) + Supabase(Postgres/Auth/Storage).** 로컬 Docker 없이 클라우드 Supabase 사용. 마이그레이션은 `npm run db:migrate`(pg 직접 연결)로 적용.
- **Next.js 16**: `middleware` 대신 `proxy.ts`(세션 갱신 + 비로그인 리다이렉트만). 역할 판정은 레이아웃/액션 + RLS.
- **users → `profiles`**: Supabase `auth.users` 1:1. 가입 시 트리거로 생성. 본인은 `name` 만 수정 가능.
- **system_admin 범위**: `brand_id = null` 이면 조직 전체, 지정 시 해당 브랜드만.
- **현장 임시저장 비공개**: 작성자의 `draft` 제출은 HQ/매니저에게 보이지 않는다. 제출 후에만 Inbox 에 노출.
- **현장 사실 보존**: 제출 이후 HQ 는 제출 내용을 수정할 수 없고 상태(검토/반려/사용)만 바꾼다. 수정은 매뉴얼 초안에서 한다.
- **반려(rejected)는 종결 상태**: 현장은 새 제출로 보완한다. (재개 흐름이 필요하면 추후 추가)
- **표준 행 구조**: `storage_standards`/`serving_standards` 는 `draft_id` XOR `version_id`. 발행 시 초안 행을 복제해 버전 행으로 고정(불변).
- **검증 표시**: `verified_by/at` 는 HQ Approver 본인만 설정. 검증 후 값이 바뀌면 트리거가 검증을 자동 해제.
- **상태별 1행**: 같은 부모에서 `product_state` 중복 금지 (`other` 는 설명을 달리해 여러 행 허용).
- **checksum**: DB 트리거가 `sha256(jsonb::text)` 계산 (jsonb 는 키 순서가 정규화됨).
- **문서코드**: `{brand.code}-{station_code}-{NNN}` (예: `KK-MAIN-001`), `next_document_code()` RPC. station code 매핑은 `STATION_PRESETS`.
- **스토리지**: private 버킷 `media`, `exports`. 경로 첫 폴더 = `brand_id`. 업로드는 `media_assets(pending)` 행을 먼저 만든 본인만 해당 키로 가능. 삭제 정책 없음(원본 보존).
- **QR/딥링크**: `/m/{manualId}` — 로그인 후 RLS 로 확인하고 역할별 화면으로 이동. signed URL 을 인쇄하지 않는다.
- **시간**: DB 는 `timestamptz`(UTC), 표시만 매장 `timezone`(기본 `Asia/Manila`).
- **UI 언어**: 현재 영어 UI (현장 직원 기준). 다국어 UI 는 미확정 정책 확정 후.

## 미확정 정책 (결정 필요 — 임의 확정 금지)

| 항목 | 명세 제안 | 현재 처리 |
|---|---|---|
| Storage/Serving 필수 범위 | `recipe` 만 필수, 기타 템플릿별 | Step 3 에서 `template_required_fields` 설정으로 분리. 데모 기본값 = 제안안 (확정 아님) |
| DURING 사진 N/A 허용 | 사유 기록 + HQ 확인 | 컬럼(`before/during/after_na_reason`)만 준비. 허용 여부는 설정으로 |
| 최초 지원 언어 | UI en/ko, 매뉴얼 en 우선, tl 확대 | DB enum `en/ko/tl` 지원, UI 영어 |
| Combined 최대 개수·파일 크기·영상 길이 | 파일럿 측정 후 | 제한값은 관리자 설정 (Step 6) |
| 직원 다운로드 권한 / 외부 공유 | 브랜드별 정책 | `fieldExportAllowed` 플래그, **기본 false** |
| 안전 기준 발행 승인 프로세스 (품질 책임자 검증 필수 여부, 담당자) | 미정 | 현재는 HQ Approver 검증 = 확정. 별도 품질 책임자 역할은 미도입 |
| 브랜드 로고/폰트/PPT 템플릿 자산 | 별도 수집 | `brand_theme_json` 자리만 있음. 자산 수령 필요 |
| 버전 번호 규칙 | v1.0 → v1.1 (정책) | `version_label` 형식 `vN.N` 만 강제. 증가 규칙은 Step 3 에서 설정 |
