import { manualContentSchema, type ManualContent } from "@/domain/manual-content";

/** 발행 스냅샷 읽기. 형식이 맞지 않으면(구버전/손상) null + 사유 */
export function readSnapshot(json: unknown): { content: ManualContent | null; error: string | null } {
  const r = manualContentSchema.safeParse(json);
  return r.success ? { content: r.data, error: null } : { content: null, error: r.error.issues[0]?.message ?? "Invalid snapshot" };
}
