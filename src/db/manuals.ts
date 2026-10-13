import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Manual } from "@/domain/types";
import { createSupabaseServerClient } from "./supabase/server";

/** RLS 경유 매뉴얼 조회. 권한 밖이거나 없으면 404 (존재 여부를 구분해 노출하지 않음). */
export const getManualOr404 = cache(async (id: string): Promise<Manual> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("manuals").select("*").eq("id", id).maybeSingle<Manual>();
  if (!data) notFound();
  return data;
});
