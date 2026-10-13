// Vercel Supabase 연동이 주입하는 변수명(anon/publishable, service_role/secret)을 모두 허용한다.

export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set (see .env.example)");
  return url;
}

export function supabasePublicKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY (or _PUBLISHABLE_KEY) is not set (see .env.example)");
  return key;
}

/** 서버 전용. 클라이언트 번들에서 호출하면 안 된다. */
export function supabaseServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) is not set (see .env.example)");
  return key;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  );
}
