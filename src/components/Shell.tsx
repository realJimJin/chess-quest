"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppProvider } from "@/lib/store";

const NAV = [["/", "World"], ["/library", "Library"], ["/today", "Train"], ["/coach", "AI Coach"], ["/profile", "Profile"]];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <AppProvider>
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur" data-chrome>
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-lg text-[#062a26]">♞</span>
            <span className="hidden sm:inline">Chess Quest</span>
          </Link>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto text-sm">
            {NAV.map(([href, label]) => {
              const on = href === "/" ? path === "/" : path.startsWith(href) || (href === "/today" && path === "/train") || (href === "/library" && path === "/import") || (href === "/profile" && path === "/partner");
              return <Link key={href} href={href} className={`rounded-lg px-3 py-1.5 whitespace-nowrap ${on ? "bg-panel2 text-ink" : "text-mute hover:text-ink"}`}>{label}</Link>;
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="mx-auto flex max-w-6xl gap-4 px-4 pb-28 text-xs text-mute lg:pb-8" data-chrome>
        <Link href="/privacy" className="hover:text-ink">Privacy</Link><Link href="/support" className="hover:text-ink">Support &amp; license</Link>
      </footer>
    </AppProvider>
  );
}
