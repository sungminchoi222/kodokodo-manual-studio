import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabasePublicKey, supabaseServiceKey, supabaseUrl } from "../env";

/** 로그인 사용자 권한으로 동작하는 클라이언트 (RLS 적용). 서버 컴포넌트/액션/라우트 핸들러용. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabasePublicKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy.ts 가 담당한다.
        }
      },
    },
  });
}

/**
 * RLS 를 우회하는 관리 클라이언트. 앱 계층 권한 검사(rbac.ts)를 통과한 뒤에만 사용한다.
 * (export job 처리, signed URL 발급 등)
 */
export function createSupabaseAdminClient() {
  return createPlainClient(supabaseUrl(), supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
