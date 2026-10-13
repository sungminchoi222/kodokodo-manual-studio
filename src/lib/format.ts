// DB 시각은 UTC. 표시만 매장 시간대로 변환한다 (기본 Asia/Manila).
export function formatDateTime(iso: string | null | undefined, timeZone = "Asia/Manila"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function safeNextPath(next: unknown): string | null {
  if (typeof next !== "string") return null;
  // 오픈 리다이렉트 방지: 같은 오리진의 절대 경로만
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
