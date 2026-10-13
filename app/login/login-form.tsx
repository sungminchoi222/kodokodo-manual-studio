"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "@/actions/auth";

export function LoginForm({ next, defaultEmail }: { next: string | null; defaultEmail?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { error: null });

  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={defaultEmail}
          required
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2.5 text-base"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2.5 text-base"
        />
      </label>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand py-3 font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
