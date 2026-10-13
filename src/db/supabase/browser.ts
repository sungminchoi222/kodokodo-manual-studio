import { createBrowserClient } from "@supabase/ssr";

// 클라이언트 번들에서는 NEXT_PUBLIC_* 를 정적으로 참조해야 인라인된다.
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public env is not configured");
  return createBrowserClient(url, key);
}
