/**
 * 매뉴얼 유형별 발행 필수 규칙 (명세 3.3 template_required_fields).
 * 현재 값은 명세 §10 의 "제안안"을 기본값으로 쓴 것이며 확정 정책이 아니다 (docs/decisions.md).
 * 정책이 확정되면 이 표만 바꾸면 된다.
 */
import type { ManualType, StorageMethod } from "./enums";

export interface TemplateRules {
  requireIngredients: boolean;
  /** 재료표의 모든 재료에 손질 카드(photo_trio)가 있어야 함 */
  requirePrepCardPerIngredient: boolean;
  requireSteps: boolean;
  requireFinalPhoto: boolean;
  requireStorage: boolean;
  requireServing: boolean;
}

export const TEMPLATE_RULES: Record<ManualType, TemplateRules> = {
  recipe: {
    requireIngredients: true,
    requirePrepCardPerIngredient: true,
    requireSteps: true,
    requireFinalPhoto: true,
    requireStorage: true,
    requireServing: true,
  },
  service_sop: {
    requireIngredients: false,
    requirePrepCardPerIngredient: false,
    requireSteps: true,
    requireFinalPhoto: false,
    requireStorage: false,
    requireServing: false,
  },
  cleaning_sop: {
    requireIngredients: false,
    requirePrepCardPerIngredient: false,
    requireSteps: true,
    requireFinalPhoto: false,
    requireStorage: false,
    requireServing: false,
  },
  equipment_instruction: {
    requireIngredients: false,
    requirePrepCardPerIngredient: false,
    requireSteps: true,
    requireFinalPhoto: false,
    requireStorage: false,
    requireServing: false,
  },
};

/**
 * 온도 기준(최소 또는 최대 중 하나 이상)이 필요한 보관방법.
 * 상온/기타는 온도 대신 설명으로 관리할 수 있게 둔다 (미확정 정책 — 기본값).
 */
export const TEMPERATURE_REQUIRED_METHODS: readonly StorageMethod[] = ["chilled", "frozen", "hot_hold"];

export function nextVersionLabel(existing: string[], bump: "minor" | "major"): string {
  let major = 0;
  let minor = -1;
  for (const label of existing) {
    const m = /^v(\d+)\.(\d+)$/.exec(label);
    if (!m) continue;
    const [maj, min] = [Number(m[1]), Number(m[2])];
    if (maj > major || (maj === major && min > minor)) {
      major = maj;
      minor = min;
    }
  }
  if (minor < 0) return "v1.0";
  return bump === "major" ? `v${major + 1}.0` : `v${major}.${minor + 1}`;
}
