/**
 * 초안 + 정규화 기준 행 + 메타 → ManualContent (순수 함수).
 * 미리보기와 발행 스냅샷이 같은 함수를 쓰므로 "미리 본 것 = 발행되는 것"이 보장된다.
 */
import type { Brand, Manual, ServingStandardRow, StorageStandardRow, Store } from "@/domain/types";
import type {
  ManualContent,
  ManualDraftContent,
  MediaMeta,
  ServingStandardView,
  StorageStandardView,
} from "@/domain/manual-content";
import { referencedMediaIds } from "@/domain/manual-content";

export interface AssembleInput {
  manual: Pick<Manual, "id" | "document_code" | "title" | "station" | "manual_type" | "store_scope" | "display_language">;
  brand: Pick<Brand, "id" | "name" | "code">;
  applicableStores: Pick<Store, "id" | "name">[];
  draft: ManualDraftContent;
  storageRows: StorageStandardRow[];
  servingRows: ServingStandardRow[];
  /** 참조 가능한 미디어 메타 (RLS 로 읽힌 것만) */
  mediaMeta: Record<string, MediaMeta>;
  profileNames: Record<string, string>;
  sourceSubmissionIds: string[];
  hqDirectSourceNote: string | null;
}

const num = (v: number | string | null) => (v === null ? null : Number(v));

function verified(by: string | null, at: string | null, names: Record<string, string>) {
  return by && at ? { by_name: names[by] ?? "Unknown approver", at } : null;
}

export function toStorageView(r: StorageStandardRow, names: Record<string, string>): StorageStandardView {
  return {
    product_state: r.product_state,
    product_state_note: r.product_state_note,
    storage_method: r.storage_method,
    storage_method_note: r.storage_method_note,
    temperature_min_c: num(r.temperature_min_c),
    temperature_max_c: num(r.temperature_max_c),
    shelf_life_value: num(r.shelf_life_value),
    shelf_life_unit: r.shelf_life_unit,
    shelf_life_start_event: r.shelf_life_start_event,
    start_event_description: r.start_event_description,
    label_instructions: r.label_instructions,
    container_and_cover: r.container_and_cover,
    disposal_rule: r.disposal_rule,
    reference_note: r.reference_note,
    verified: verified(r.verified_by, r.verified_at, names),
  };
}

export function toServingView(r: ServingStandardRow, names: Record<string, string>): ServingStandardView {
  return {
    quantity: num(r.quantity),
    unit: r.unit,
    serving_context: r.serving_context,
    measurement_method: r.measurement_method,
    tolerance: r.tolerance_json,
    plating_instructions: r.plating_instructions,
    reference_image: r.reference_image_asset_id ? { media_id: r.reference_image_asset_id, caption: null } : null,
    verified: verified(r.verified_by, r.verified_at, names),
  };
}

const PRODUCT_STATE_ORDER = ["raw", "prepared", "cooked", "hot_held", "opened", "other"];

export function assembleManualContent(input: AssembleInput): ManualContent {
  const storage = [...input.storageRows]
    .sort(
      (a, b) =>
        PRODUCT_STATE_ORDER.indexOf(a.product_state) - PRODUCT_STATE_ORDER.indexOf(b.product_state) || a.sort_order - b.sort_order,
    )
    .map((r) => toStorageView(r, input.profileNames));
  const serving = [...input.servingRows].sort((a, b) => a.sort_order - b.sort_order).map((r) => toServingView(r, input.profileNames));

  const content: ManualContent = {
    schema_version: 1,
    manual: {
      id: input.manual.id,
      document_code: input.manual.document_code,
      title: input.manual.title,
      brand: { id: input.brand.id, name: input.brand.name, code: input.brand.code },
      station: input.manual.station,
      manual_type: input.manual.manual_type,
      store_scope: input.manual.store_scope,
      stores: input.manual.store_scope === "selected_stores" ? input.applicableStores.map((s) => ({ id: s.id, name: s.name })) : [],
      locale: input.manual.display_language,
    },
    blocks: input.draft.blocks,
    quality: input.draft.quality,
    storage_standards: storage,
    serving_standards: serving,
    media: {},
    sources: { submission_ids: [...input.sourceSubmissionIds].sort(), hq_direct_source_note: input.hqDirectSourceNote },
  };
  for (const id of referencedMediaIds(content)) {
    const meta = input.mediaMeta[id];
    if (meta) content.media[id] = meta;
  }
  return content;
}
