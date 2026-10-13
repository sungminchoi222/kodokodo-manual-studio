import type { Metadata } from "next";
import { ROLE_LABELS } from "@/domain/enums";
import { DEMO_ACCOUNTS } from "@/demo/accounts";
import { isSupabaseConfigured } from "@/db/env";
import { safeNextPath } from "@/lib/format";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const demoMode = process.env.DEMO_MODE === "true";

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">MANUAL STUDIO</h1>
      <p className="mt-1 text-sm text-stone-600">Sign in with your work account.</p>

      {params.error === "disabled" && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">This account is disabled.</p>
      )}

      <div className="mt-6">
        {isSupabaseConfigured() ? (
          <LoginForm next={next} />
        ) : (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Supabase is not configured. Copy <code>.env.example</code> to <code>.env.local</code> and fill in the values.
          </p>
        )}
      </div>

      {demoMode && (
        <section className="mt-10 rounded-lg border border-dashed border-stone-300 p-4">
          <h2 className="text-sm font-semibold">DEMO accounts</h2>
          <p className="mt-1 text-xs text-stone-600">
            Password is the <code>DEMO_USER_PASSWORD</code> value used when seeding. Demo data only.
          </p>
          <ul className="mt-3 space-y-1 text-xs">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email} className="flex justify-between gap-2">
                <span className="font-mono">{a.email}</span>
                <span className="text-stone-500">{ROLE_LABELS[a.role]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
