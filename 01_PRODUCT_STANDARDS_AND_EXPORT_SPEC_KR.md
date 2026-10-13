# MANUAL STUDIO — HQ Product Standards & PPT/PDF Export Specification v1.0

**상태:** 개발용 초안 / 2026-10-12  
**프로젝트:** MANUAL STUDIO (KODO KODO TYCOON 및 Equipment Master와 별개의 프로젝트)  
**적용:** 다중 브랜드 지원. 첫 파일럿은 KODO KODO.  
**확정된 결정:** (1) 현장 Quick Capture 및 Guided Capture 병행 (2) 본사 Product Standards 편집·승인 (3) 개별 매뉴얼 및 다중 선택 통합 PPTX/PDF 출력.

## 0. 제품 목적과 범위

- 현장(Field): 모바일로 재료 목록, 사용량, 재료별 손질 전/중/후 촬영, 손질 규격, 작업 영상·음성·텍스트, 조리과정, 완성 사진을 수집한다.
- 본사(HQ): 현장 자료를 검토하고 공식 기준(보관방법, 보관온도, 사용기한, 제공량, 품질 기준 등)을 입력한 뒤 SOP를 승인·발행한다.
- 출력(Export): 승인된 버전의 구조화된 데이터에서 **개별 매뉴얼** 또는 **선택한 여러 매뉴얼을 합친 통합본**을 editable PPTX 및 PDF로 생성한다. 모바일 최신 승인본도 함께 제공한다.
- **PPT/PDF는 결과물이지 원본 DB가 아니다.** 승인 당시의 스냅샷을 보존한다. 발행 완료 후 기존 버전 덮어쓰기는 금지한다.
- 단계 1~3 구현은 KODO KODO 기준 데모 데이터로 시작하되 `brand_id`, `store_id`, 적용범위(`brand_all`, `selected_stores`)를 최초 설계부터 지원한다.

## 1. 사용자/권한

| 역할 | 현장 수집 | 기준 입력 | 편집 | 승인·발행 | 출력 | 계정관리 |
|---|---|---|---|---|---|---|
| Field Staff | 자신/허가된 매장 | 불가 | 자신의 제출 임시본 | 불가 | 승인본 조회·허용 시 다운로드 | 불가 |
| Store Manager | 소속 매장 제출·피드백 | 초안 의견만 | 제한적 | 불가 | 승인본 | 불가 |
| HQ Editor | 모든 할당 브랜드 | 초안 작성 | 가능 | 불가 | 초안 미리보기/승인본 | 불가 |
| HQ Approver | 할당 브랜드 | 기준 확정 | 가능 | 가능 | 가능 | 불가 |
| System Admin | 정책에 따른 접근 | 관리 | 관리 | 관리 권한 별도 설정 | 가능 | 가능 |

**불변 정책:** 신규 자산마다 `brand_id` 소유권 검증. 데이터/미디어/내보내기 모두 서버 측 RBAC 적용. 직원에게 관리자 전용 보관·기한·제공량 확정 폼 노출 금지. 발행 승인권한은 HQ 역할만.

## 2. 현장 입력 두 가지 경로

### 2.1 Quick Capture (자유 제출)
- 제목, 브랜드·매장·파트, 촬영 파일 여러 개, 텍스트·음성 메모, 관련 기존 매뉴얼(수정 제안 시)을 제출한다.
- 각 미디어 원본의 업로드시각, 작성자, 캡션, 파일 종류, 순서 정보를 보관한다.
- 관리자가 매뉴얼 초안의 단계에 배치한다. 자유 제출임을 명확히 표시하고 데이터 누락을 승인 전에 검사한다.

### 2.2 Guided Capture (조리/손질 SOP 기본)
1. 기본 정보: 메뉴명/작업명, 카테고리, 브랜드, 매장, 담당 파트, 배치 단위와 생산량.
2. Ingredient List: `ingredient_name`, 원재료 사용량·단위, 필요 도구(선택), 특이사항.
3. Ingredient Preparation: **재료마다 별도 카드**를 만들어 `BEFORE → DURING → AFTER` 사진·캡션, 손질방법, 길이/너비/두께(mm/cm), 손질 전·후 중량, 도구, 실제 측정치와 주의사항을 입력.
4. Cooking Steps: 공정 번호, 이미지·동영상, 실제 시간·온도·투입량, 작업 설명, 안전주의.
5. Final Product: 완성 사진, 실제 완성량, 테스트 제공량, QC 관찰사항.
6. Review & Submit: 누락 체크, 업로드 상태 확인, 제출. 임시저장 지원.

**N/A 처리:** 손질 없는 기성 소스·식용유 등은 직원이 사유를 적고 `no_preparation_required=true`로 사진 항목을 제외할 수 있다. 편집자 검토 대상이다.

**사진 가이드:** 가까운 거리/충분한 조명/정확한 색, 칼이나 저울 등 필요한 크기·중량 기준 함께 촬영, 가능하면 같은 구도. 미디어 원본 보존 및 앱 내 썸네일 생성.

## 3. HQ Product Standards 화면 구조

### 3.1 네 영역
- **기본 정보**: 제품명, 브랜드, 적용 매장, 담당 파트, 문서 유형, 제품 분류, 버전 상태, 작성자·검토자.
- **Storage & Shelf Life**: 상태별 저장·보관 기준과 사용기한.
- **Serving & Quality**: 1회 제공량, 플레이팅/소스/도구, 완성 상태와 불량 기준.
- **Approval & Publication**: 근거 자료, 변경 사유, 승인, 언어, 발행 범위, 출력 설정.

### 3.2 상세 입력 필드 표

#### A. 공통 메타데이터
| field_key | UI 이름 | 타입 | 필요 조건/검증 |
|---|---|---|---|
| `title` | Manual Title | string | 필수, 1~160자 |
| `brand_id` | Brand | FK | 필수, 접근 허가 확인 |
| `store_scope` | 적용 범위 | enum | `brand_all` 또는 `selected_stores` |
| `store_ids` | 적용 매장 | UUID[] | selected_stores면 1개 이상 |
| `station` | Part / Station | enum/string | 조리/서비스/청소/장비 사용 등 |
| `manual_type` | Manual Type | enum | `recipe`, `service_sop`, `cleaning_sop`, `equipment_instruction` |
| `display_language` | 대표 언어 | enum | en/ko/tl; 번역본은 별도 상태관리 |
| `source_submission_ids` | 원본 자료 연결 | UUID[] | 최소 1개 또는 HQ 직접 작성 출처 표기 |
| `revision_reason` | 변경 사유 | text | 발행본 수정 시 필수 |

#### B. 보관방법 · 사용기한 (상태별 반복 입력)
`storage_standards[]`는 필요에 따라 `raw`, `prepared`, `cooked`, `hot_held`, `opened`, `other` 각각 1행씩. 서로 다른 기준을 한 행에 섞지 않는다.

| field_key | UI 이름 | 타입 | 검증/설명 |
|---|---|---|---|
| `product_state` | 원재료/손질 후/조리 후 등 | enum | 필수 |
| `storage_method` | 보관방법 | enum+optional text | chilled/frozen/ambient/hot_hold/other; 별도 설명 |
| `temperature_min_c` | 최소 온도 °C | decimal? | 실제 승인 기준만 입력. 상한보다 낮아야 함 |
| `temperature_max_c` | 최대 온도 °C | decimal? | 저장 기준에 따라 min 또는 max 한쪽만 허용 가능 |
| `shelf_life_value` | 사용 가능 기간 수치 | positive decimal | 단위와 함께 필수 (해당 상태 설정 시) |
| `shelf_life_unit` | 기간 단위 | enum | hours/days |
| `shelf_life_start_event` | 기한 기산점 | enum | prepared_at/cooked_at/opened_at/thawed_at/received_at/custom |
| `start_event_description` | 기산점 설명 | text? | custom인 경우 필수 |
| `label_instructions` | 라벨 표시방법 | text | 제조·개봉시각, 로트/담당자 등 필요 시 |
| `container_and_cover` | 용기·밀봉 기준 | text? | 덮개, 밀폐, 구분 보관 등 |
| `disposal_rule` | 폐기/재사용 금지 기준 | text? | 재가열·폐기 기준 등이 있는 경우 |
| `reference_note` | 기준 근거 | text/link/file | 식품안전 관련 기준은 출처 검증 필수 |
| `verified_by`, `verified_at` | 검증자/시각 | UUID/timestamp | 공식 발행 전 검증 표시 |

**주의:** 온도·보관기한은 데이터로 주어지지 않으면 **빈칸으로 두고 발행 전 입력 요청**. AI 또는 예시값을 실제 기준으로 전환하지 않는다. `shelf_life`는 날짜 문자열 하나가 아니라 **기간 + 기산점**으로 기록한다. 오프라인 적용 매장 현지 시간대(`Asia/Manila`)는 표시 변환용이고 DB 시각은 UTC로 저장.

#### C. 제공량·완성 규격
| field_key | UI 이름 | 타입 | 검증/설명 |
|---|---|---|---|
| `portion.quantity` | 제공량 | positive decimal | 예: 6 |
| `portion.unit` | 단위 | enum | g/ml/pcs/scoops/ladles/bowls/servings |
| `portion.serving_context` | 제공 대상/메뉴 | string/FK | 메뉴 버전에 따라 제공량이 다를 수 있음 |
| `portion.measurement_method` | 계량 방법 | text | 저울·스푼·개수 기준 |
| `portion.tolerance` | 허용 오차 | optional structured | 본사 승인값만, 예: ±g (가정 금지) |
| `portion.reference_image_asset_id` | 기준 플레이팅 사진 | FK | 권장, published 매뉴얼에서 참조 가능 |
| `plating_instructions` | 제공 방법 | text | 담는 위치, 도구, 순서 |
| `sauce_rules[]` | 소스 규정 | structured | 사용/제공 소스·양·조건; HQ 확인값만 |
| `quality_acceptance_criteria[]` | 합격 기준 | text[] | 색/형태/식감/크기/온도 등 |
| `quality_rejection_criteria[]` | 불합격 기준 | text[] | 폐기·재작업 기준 |
| `critical_warnings[]` | 주의 사항 | text[] | 위생/알레르겐/화상 등 |
| `allergen_notes` | 알레르겐 정보 | structured/text | 근거자료 검증 및 HQ 확인 필요 |

#### D. 편집·승인·배포
| field_key | UI 이름 | 타입 | 검증/설명 |
|---|---|---|---|
| `review_status` | Workflow Status | enum | draft/in_review/revision_requested/pending_approval/published/archived |
| `approval_comment` | 승인 코멘트 | text | 거절/보완 요청 시 필수 |
| `approver_id`, `approved_at` | 승인 정보 | UUID/time | 발행 시 필수 |
| `effective_from` | 적용 시작일 | timestamp? | 예약 발행 지원은 2차 가능 |
| `translations[]` | 언어별 본문 | FK/structured | en/ko/tl, 검토/승인 상태별 분리 |
| `document_code` | 문서코드 | generated stable | 예: KK-MAIN-001 (생성규칙 설정) |
| `published_version` | 버전 번호 | semver/string | 최초 v1.0, 개정 시 v1.1 등 (정책) |
| `change_log` | 변경 이력 | text | 새 버전 발행에 필수 |

### 3.3 편집 UI 동작
- 본사 편집창: 좌측 `Media & Submissions`, 중앙 `Manual Builder`, 우측 `Product Standards / Publish Checks`.
- 저장 버튼 및 autosave: 편집 중에는 draft에만 반영. 타 사용자 충돌은 낙관적 버전 체크 또는 잠금.
- 각 필드 입력 변경 시 `updated_by`, `updated_at`, old/new audit history.
- 관리자 미리보기는 미확정 필드를 `NEEDS HQ CONFIRMATION` 표시하고 WATERMARK `DRAFT`를 붙인다.
- 승인 시 모든 필수항목을 검증. 사진 누락, 확인되지 않은 온도/사용기한, 잘못된 단위, 미승인 번역본 등의 문제는 오류 목록으로 구체적으로 제시.
- 조리/손질 템플릿에만 Storage/Serving 필수 정책 적용; 서비스/청소/장비 안내는 서로 다른 필수 규칙 적용. `template_required_fields` 설정 가능.

## 4. PPTX/PDF 출력 규칙

### 4.1 출력 범위 선택 C안 확정
1. **Individual:** 1개 특정 승인 버전을 출력.
2. **Combined:** 체크박스로 2개 이상 승인 버전을 골라 **1개 통합본** 출력. 선택순서는 drag/reorder 지원. 필터: 브랜드, 매장, 파트, 유형, 언어.
3. 초안 내보내기는 HQ 권한 사용자만 허용하며 `DRAFT — NOT FOR OPERATIONAL USE` 워터마크 필수. 정식 배포/현장 다운로드는 승인본만.
4. 서로 다른 브랜드 묶음은 관리자만 허용 및 명시적으로 확인. 기본값은 한 브랜드 내 통합.

### 4.2 공통 콘텐츠 모델(반드시 단일화)
`published_snapshot` → `export_document`(중간 표현) → `pptx_renderer` 및 `pdf_renderer`.

`export_document`에 표지, 목차, 매뉴얼 메타정보, Ingredient Table, Preparation Photo Trio, Cooking Steps, Final Standards, Storage/Serving, Warnings/QC, Revision Record, Video Links/QR을 포함한다.

**절대 데이터 모델과 슬라이드/PDF 배치 로직을 결합하지 말 것.** 화면 편집과 내보내기 로직은 같은 데이터소스를 읽고, 각 서식 렌더러가 별도 레이아웃 엔진으로 출력한다.

### 4.3 PPTX 규격
- 16:9 Widescreen(13.333 x 7.5 in), 브랜드별 템플릿(로고, 폰트, 컬러) 적용.
- 제목/설명/테이블/도형은 **편집 가능한 PPT 객체**. 이미지·영상 썸네일은 개별 이미지 객체로 삽입.
- 기본 슬라이드 구성:
  1) Brand Cover (문서명/브랜드/파트/버전/발행일)
  2) Overview & Ingredient List (많으면 자동 여러 장)
  3) Ingredient Preparation — 재료별 전/중/후 사진과 손질 스펙 (1재료 당 1장 기본, 많은 글자는 추가장)
  4) Cooking Steps — 단계별 1~3 단계/슬라이드 (글·사진량 기준 자동 분할)
  5) Final Product & Quality Criteria
  6) Storage / Shelf Life / Serving Standards — 제품 상태별 테이블
  7) Warnings / QC Checklist / Version & Approval
- Combined 문서: 전체 표지 + TOC + 매뉴얼별 섹션 커버(선택) + 위 슬라이드 블록 순서. 슬라이드 번호, 매뉴얼명 및 버전을 하단에 표시.
- 영문, 한국어, 타갈로그어 텍스트 길이에 따라 자동 줄바꿈·글자 축소 최소치·초과 시 새 슬라이드. **텍스트 잘라내기 금지.**
- 누락된 사진은 승인본에서 허용된 N/A 사유가 있는 경우에만 placeholder를 명시; 그렇지 않으면 발행 차단.
- 동영상은 플레이 가능한 영상 파일을 PPT 안에 직접 포함할 필요 없이 **썸네일 + 영상 제목 + URL 링크 + QR코드** 기본. 직원이 권한 내에서 로그인 후 접근하는 **안정적 딥링크**를 사용하고 만료되는 signed URL을 QR에 인쇄하지 않는다.
- 구현 후보: `pptxgenjs` (PptxGenJS). 슬라이드마다 좌표·텍스트 넘침 검사/렌더 검증.

### 4.4 PDF 규격
- **A4 세로** 운영 매뉴얼 기본 출력(인쇄 친화적, 300dpi 이상의 원본이 있으면 사용); **16:9 가로** 교육용 PDF 추가 옵션.
- HTML/CSS 기반 전용 Print Renderer → Playwright/Chromium PDF 또는 동등한 렌더러 사용. PPTX를 PDF로 변환하는 단일 방식에만 의존하지 않음.
- 텍스트 선택/검색 가능, 페이지 번호·문서코드·버전·승인일, 적절한 페이지 분리(`page-break-inside: avoid`), 목차·책갈피(가능한 범위), QR 링크 포함.
- 복수 매뉴얼 통합 시 전체 표지/목차, 각 매뉴얼의 시작을 새 페이지에 배치, 각 섹션의 버전 정보 표기.
- 수집한 세로 사진은 잘리지 않게 `contain` 기준, 필요시 크롭 선택은 편집자가 명시적으로 승인.
- 다운로드 이름 예: `KODO_KODO_Main_Manual_v1.0_EN_20261012.pptx`; 통합 `KODO_KODO_Main_Manual_Collection_EN_20261012.pdf`.

### 4.5 언어와 내보내기 정책
- 미선택 시 매뉴얼 주 언어. Combined 통합 대상은 공통 언어만 기본 선택; 누락 번역이 있으면 경고 및 사용자에게 `skip/alternate language/cancel` 선택 요청(권한 정책).
- 공식 본문은 번역본 별도 승인 후 배포. 미승인 번역 자동 삽입 금지.
- Export Job: 요청자, 옵션, 대상 `version_id[]`(순서 포함), 템플릿 버전, 언어, 상태(queued/running/success/failed), 파일 경로, 생성 시각, 체크섬 저장.
- 실패 시 일부만 업로드한 결과물 배포 금지; 다운로드 링크는 사용자 권한 검증 후 생성. 완료 알림은 UI에서 제공.
- 재출력의 **동일한 승인 스냅샷 및 템플릿 버전** 조합은 본문이 변하지 않아야 함. 출력 생성시각 등 변경될 메타는 분리.
- 대용량 통합본은 백그라운드 Job, 진행률, 취소/재시도; 제한(최대 항목 수, 이미지 크기)은 관리자가 설정.

## 5. DB 스키마 제안 (PostgreSQL/Supabase)

```text
organizations(id, name)
brands(id, organization_id, code, name, brand_theme_json)
stores(id, brand_id, name, timezone, status)
users(id, name, email, status)
memberships(user_id, organization_id, brand_id?, store_id?, role)
submissions(id, brand_id, store_id, station, capture_mode, title, note, status, submitted_by, submitted_at, source_manual_id?)
submission_ingredients(id, submission_id, name, amount, unit, notes, sort_order)
submission_preparations(id, ingredient_id, cut_method, length_mm?, width_mm?, thickness_mm?, weight_before_g?, weight_after_g?, no_prep, na_reason, notes)
media_assets(id, brand_id, submission_id?, owner_id, storage_key, kind, mime, size, checksum, thumbnail_key?, duration?, created_at)
media_links(id, media_id, entity_type, entity_id, role, sort_order, caption)
manuals(id, brand_id, title, station, manual_type, store_scope, active_version_id?, created_by, archived_at?)
manual_drafts(id, manual_id, draft_json, updated_by, optimistic_version, updated_at)
manual_versions(id, manual_id, version_label, locale, content_snapshot_json, content_checksum, approved_by, approved_at, published_at, status)
storage_standards(id, draft_or_version_parent, product_state, storage_method, temp_min_c?, temp_max_c?, shelf_life_value?, shelf_life_unit?, start_event?, start_event_description?, label_instructions?, reference_note?, verified_by?)
serving_standards(id, draft_or_version_parent, quantity, unit, serving_context, measurement_method, tolerance_json?, plating_instructions?, reference_image_asset_id?)
manual_applicability(manual_id, store_id)
export_jobs(id, requested_by, brand_id, format, scope, locale, ordered_version_ids_json, template_version, status, file_key?, checksum?, error_message?, created_at, completed_at?)
audit_events(id, actor_id, brand_id, entity_type, entity_id, action, before_json?, after_json?, created_at)
```

**구현 메모:** 초안 DB를 JSON block editor로 관리해도 되지만 발행본은 immutable snapshot을 반드시 복제·서명(checksum)한다. 사용기한 등의 안전 기준은 별도 정규화/검색 가능 구조를 유지할 것. 멀티테넌시에는 앱 라우트 체크 + PostgreSQL RLS 모두 사용. 권한 없는 미디어 파일의 public bucket 사용 금지.

## 6. API/화면 계약 (제안)

| 화면/엔드포인트 | 기능 |
|---|---|
| `/field` | 직원 홈; View Manuals, New Submission, My Submissions |
| `/field/submissions/new?mode=quick\|guided` | 모바일 촬영·입력·임시저장·업로드 재시도 |
| `/hq/inbox` | 필터, 검토, 반려, 초안 생성 |
| `/hq/manuals/:id/edit` | 블록형 매뉴얼 에디터 + Media Library + Product Standards |
| `/hq/manuals/:id/preview` | DRAFT 워터마크 포함 웹/PDF/PPTX 미리보기 |
| `/hq/manuals/:id/approve` | 필수값 검증 → 승인 이벤트 → 발행 버전 스냅샷 |
| `/hq/exports` | 개별/다중 선택, 순서/형식/언어/템플릿/브랜드 옵션 |
| `POST /api/export-jobs` | **서버에서** version_id별 권한 검증 후 export job 생성 |
| `GET /api/export-jobs/:id` | 상태/오류/진행률 |
| `GET /api/export-jobs/:id/download` | 권한 체크 후 다운로드 링크 생성 |

## 7. 권장 기술 스택

- Next.js + TypeScript + Tailwind CSS: 모바일 Field 및 PC HQ 화면을 단일 애플리케이션에서 구축.
- Supabase(PostgreSQL/Auth/Storage + RLS): 조직/브랜드/매장/역할, 자료/버전 관리.
- 객체 저장소 + 업로드 재시도: 직접 업로드/사전 승인된 URL, 모바일 전송 실패 복구; 원본 보존.
- Tiptap 또는 유사 블록 에디터: `heading`, `paragraph`, `ingredient_table`, `photo_trio`, `video`, `step`, `warning`, `storage_table`, `serving_card`, `qc_checklist`.
- PptxGenJS: 편집 가능한 PPTX 렌더러.
- Playwright/Chromium HTML print: 검색 가능한 PDF 렌더러.
- 백그라운드 Job/Queue: 다중 매뉴얼 출력. 초기엔 소규모 동기 생성으로 시작할 수 있으나 내보내기 서비스 인터페이스는 job 추상화한다.
- AI 전사/초안/번역: **후속 단계**. 출력·안전기준을 AI가 채우도록 하지 않음.

## 8. 단계별 개발 계획

### Phase A — 설계/모델/권한
- DB 마이그레이션, RBAC/RLS, Brand/Store, Media Asset, Draft/Version 구조.
- 테스트 브랜드 KODO KODO와 샘플 매장 생성(가짜 데이터로 표기).

### Phase B — 현장 수집과 HQ 기준
- Quick/Guided Capture(재료별 BEFORE/DURING/AFTER), 업로드·초안·누락검사.
- HQ Inbox, 블록 편집기, Product Standards 폼, 저장·승인/미리보기.

### Phase C — 문서 출력
- 표준 `export_document` 모델 작성.
- 개별 PPTX, 개별 PDF → 다중 선택 Combined PPTX/PDF 순서로 개발.
- 브랜드 템플릿/목차/국문·영문 레이아웃/비디오 QR/넘침 점검.

### Phase D — 출시 전 검증
- 모바일 불안정 네트워크 업로드, 미디어 파일 크기, 권한 분리, 복수 브랜드, 장문 번역 및 사진 비율, 서식 회귀 테스트.
- 버전 롤백은 이전 버전을 변경하지 않고 **새 발행 버전으로 복원**하도록 구현.

## 9. 검수(Acceptance) 기준 — 테스트 시나리오

1. 필리핀 현장 직원이 Guided Capture에서 재료 3개를 등록하고 각 BEFORE/DURING/AFTER 사진 및 스펙을 입력한 후 제출한다.
2. 재료 1개의 AFTER 사진이 누락됐을 때 N/A 사유 없이 발행 시도하면 해당 필드를 명시하는 에러가 나온다.
3. 본사 편집자가 제출 미디어를 1개 이상의 단계에 배치하고 사진·텍스트를 순서대로 수정한다.
4. 본사가 **손질 전/후, 조리 후 등 서로 다른 상태의 보관기준/기산점/기간**을 저장하고 화면에서 구분해 볼 수 있다.
5. 사용기한/온도에 미확정값이 있는 조리 매뉴얼은 승인 정책에 따라 발행 불가이며, 값 자동 생성은 없다.
6. 제공량 `6 pcs` 등 승인된 값을 입력하면 공개본·PPTX·PDF에 모두 동일하게 나타난다.
7. 승인 시 `manual_versions`의 스냅샷이 생성되고, 이후 Draft 수정에도 기존 v1.0 본문이 변하지 않는다.
8. 개별 매뉴얼 PPTX에서 텍스트/사진 객체를 PowerPoint에서 별도로 선택·편집할 수 있다.
9. 개별 PDF는 검색 가능한 텍스트와 페이지 번호·버전을 포함한다.
10. 선택한 세 매뉴얼의 순서를 바꿔 통합 PPTX/PDF를 생성하면 지정 순서·목차·각 버전이 일치한다.
11. 다른 브랜드 소속 직원은 미허가 브랜드 매뉴얼/미디어/내보내기를 URL 직접 접근으로도 열지 못한다.
12. 출력 문서 내 비디오 QR은 만료되는 스토리지 서명URL이 아니라, 인증·권한을 검사하는 안정적 문서 링크를 사용한다.
13. 초안에서의 Preview는 워터마크를 포함하고 현장 직원의 공식 매뉴얼 목록에 노출되지 않는다.
14. 2쪽 이상 긴 단계 설명과 세로 사진에도 PPT 텍스트 잘림/PDF 이미지 왜곡이 발생하지 않는다.
15. 선택한 매뉴얼들의 언어가 일치하지 않거나 미승인 번역이 포함됐을 때 발행 전 경고한다.

## 10. 아직 확정되지 않은 정책 (제안/결정 필요)

- 모든 매뉴얼에 동일한 Storage/Serving 요구 여부? 제안: `recipe`만 필수, 기타는 템플릿별 구성.
- 손질 중(DURING) 사진이 실질적으로 불필요한 재료에 N/A를 허용할지? 제안: 사유 기록 + HQ 확인.
- 앱 최초 지원 언어? 제안: UI 영어/한국어, 매뉴얼 내용 영어 우선, 타갈로그어 확대.
- Combined 출력 최대 매뉴얼 개수/파일 크기 및 동영상 길이? 파일럿에서 측정 후 제한.
- 직원의 매뉴얼 다운로드 권한과 외부 공유 정책? 브랜드별 정책 필요.
- 안전 기준 발행 승인 프로세스: 품질 책임자 검증의 필수 여부와 담당자 지정.
- 로고/폰트/브랜드별 PPT 템플릿 자산은 별도로 수집해야 함.

---

**운영 원칙:** `FIELD CAPTURES FACTS → HQ DEFINES STANDARDS → HQ APPROVES VERSION → SYSTEM EXPORTS DOCUMENTS`.  
**금지:** 불명확한 기준을 임의 생성, 미승인 번역 자동 발행, 공개 저장소에 비공개 매뉴얼 업로드, PPT를 원본 데이터로 사용, 다른 브랜드 자료에 대한 무권한 접근.
