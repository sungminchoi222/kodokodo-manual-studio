"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/db/supabase/server";
import { safeNextPath } from "@/lib/format";

export interface SignInState {
  error: string | null;
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter email and password." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Sign-in failed. Check your email and password." };

  redirect(safeNextPath(formData.get("next")) ?? "/");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
