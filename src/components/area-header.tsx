import Link from "next/link";
import { signOut } from "@/actions/auth";

export interface NavItem {
  href: string;
  label: string;
}

export function AreaHeader({
  area,
  userName,
  nav,
  switchTo,
}: {
  area: "Field" | "HQ";
  userName: string;
  nav: NavItem[];
  switchTo?: NavItem;
}) {
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href={area === "HQ" ? "/hq/inbox" : "/field"} className="font-bold tracking-tight">
          MANUAL STUDIO <span className="ml-1 rounded bg-stone-900 px-1.5 py-0.5 text-xs text-white">{area}</span>
        </Link>
        <nav className="flex flex-wrap gap-4 text-sm">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="text-stone-700 hover:text-stone-950">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-stone-600">
          {switchTo && (
            <Link href={switchTo.href} className="underline">
              {switchTo.label}
            </Link>
          )}
          <span className="hidden sm:inline">{userName}</span>
          <form action={signOut}>
            <button className="underline">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
