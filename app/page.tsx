import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSession } from "@/auth/session";
import { availableAreas } from "@/auth/rbac";
import { isSupabaseConfigured } from "@/db/env";
import { signOut } from "@/actions/auth";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  await connection(); // 환경/세션에 따라 분기하므로 항상 요청 시 렌더링
  if (!isSupabaseConfigured()) redirect("/login");
  const session = await getSession();
  if (!session) redirect("/login");

  const { error } = await searchParams;
  const areas = availableAreas(session.actor);

  // 권한 부족으로 돌아온 경우가 아니면 기본 영역으로 이동
  if (error !== "forbidden") {
    if (areas.hq) redirect("/hq/inbox");
    if (areas.field) redirect("/field");
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-xl font-bold">MANUAL STUDIO</h1>
      <p className="mt-3 text-sm text-stone-700">
        {error === "forbidden"
          ? "You do not have access to that area."
          : "Your account has no brand or store assignment yet. Ask a system admin to add you."}
      </p>
      <div className="mt-6 flex gap-3 text-sm">
        {areas.hq && <a className="underline" href="/hq/inbox">HQ</a>}
        {areas.field && <a className="underline" href="/field">Field</a>}
        <form action={signOut}>
          <button className="underline">Sign out</button>
        </form>
      </div>
    </main>
  );
}
