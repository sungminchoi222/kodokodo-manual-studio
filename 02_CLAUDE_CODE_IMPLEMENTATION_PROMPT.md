# Claude Code 시작 프롬프트 — MANUAL STUDIO

당신은 Next.js / TypeScript / Supabase / PPTX/PDF 자동화에 능숙한 시니어 풀스택 엔지니어다.

## 프로젝트 목표
첨부된 `01_PRODUCT_STANDARDS_AND_EXPORT_SPEC_KR.md`를 제품 요구사항의 원본 문서로 사용하여, **MANUAL STUDIO**라는 다중 브랜드 통합형 모바일 현장 수집 + 본사 매뉴얼 편집/승인/발행 + 개별/통합 PPTX/PDF 내보내기 웹 앱을 단계적으로 제작하라.

**별도 프로젝트 주의:** KODO KODO TYCOON 게임 및 Equipment Master 자산관리 시스템과 혼합하지 않는다. 최초 시범 브랜드는 KODO KODO이지만 특정 브랜드명으로 DB/구조를 하드코딩하지 않는다.

## 반드시 따라야 하는 결정
1. 현장 모바일 입력: Quick Capture(자유 제출) + Guided Capture(단계별 수집) 병행.
2. Guided Cooking: 필요재료 목록 → 재료별 BEFORE/DURING/AFTER 촬영 → 손질 스펙(치수/중량/도구) → 조리단계/영상 → 최종 제품 사진/메모.
3. HQ 전용 Product Standards: 상태별 보관방법/온도, 사용기한의 기간/기산점, 1회 제공량/단위/허용오차, QC, 품질·안전 기준, 승인 근거.
4. Field Staff는 HQ 기준 확정/승인 권한이 없다.
5. DB에서 버전별 승인 스냅샷을 관리. 파일은 원본이 아닌 파생 출력물.
6. 승인한 매뉴얼 하나를 개별 PPTX/PDF로, 승인본 여러 개를 체크하여 통합 PPTX/PDF로 출력.
7. PPTX는 텍스트·도형·이미지를 개별 편집 가능하도록 만들고, PDF는 검색 가능한 텍스트 + 출력용 페이지 레이아웃.
8. 모든 보관온도/사용기한 등은 사용자 입력/검증된 값만 표시; 임의 추정, AI 자동채움 금지.
9. 화면/DB/스토리지/API 모두 브랜드/매장 권한을 검사한다.

## 구현 접근 (한 번에 모든 걸 만들지 말 것)
- 먼저 현재 프로젝트 파일을 확인해 기존 코드와 충돌하지 않는 작업계획을 요약한다.
- Step 1: Next.js 타입/DB schema 및 seed DEMO, RBAC 모델, 라우트 설계.
- Step 2: Field Quick/Guided Capture + media uploads + draft save + HQ Inbox.
- Step 3: HQ Manual Builder + Product Standards form + 승인 전 검증 + immutable published versions.
- Step 4: 공통 `ExportDocument` 타입과 source -> export mapper, 브랜드 템플릿.
- Step 5: 개별 PPTX/PDF renderer; 수동 다운로드 테스트.
- Step 6: 다중선택/정렬/목차/combined PPTX/PDF + export history.
- Step 7: Vitest 및 Playwright E2E, 문서 렌더링 시각 회귀 및 권한 테스트.

## 기술 선택 제안
- Next.js / TypeScript / Tailwind / Supabase / PostgreSQL / Supabase Storage.
- PPTX: `pptxgenjs`; PDF: `playwright` HTML print renderer.
- 미디어와 바이너리를 DB row 자체에 보관하지 않는다.
- 자격증명/환경값은 `.env.example`만 제공하고 실제 비밀값은 커밋하지 않는다.
- 외부 API/배포·실제 계정 연결이 필요하면 해당 단계에서 사용자에게 요청한다.

## 산출물
- 실행 가능한 현장/관리자 웹 UI, DB migration, typed validation schemas, CRUD/RBAC, export 서비스 및 테스트.
- `README.md`: 로컬 실행, 환경변수, Supabase 설정, 데모 로그인, 테스트, 내보내기 방법.
- `docs/decisions.md`: 확정사항과 미확정 정책. 미확정 기준은 임의 확정하지 않는다.
- 먼저 모바일 제출·HQ Product Standards 폼을 데모 데이터로 작동시키고, 사용자 검토 후 출력 엔진을 연결한다.

시작 시 **Step 1의 파일 구조/DB 설계/화면 목록만 먼저 제시**하고, 사용자가 승인하면 코드 생성을 시작한다.
