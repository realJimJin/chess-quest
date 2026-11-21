"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppProvider, useApp } from "@/lib/store";
import QuestIcon, { type IconName } from "./QuestIcon";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Library", icon: "book" },
  { href: "/today", label: "Training", icon: "target" },
  { href: "/world", label: "Journey", icon: "map" },
  { href: "/coach", label: "Coach", icon: "spark" },
  { href: "/profile", label: "Profile", icon: "user" },
];
function ProgressNotice() {
  const { progressError, canRetryProgressSave, retryProgressSave } = useApp();
  return progressError ? <div role="alert" className="notice-error mb-5"><p>{progressError}</p>{canRetryProgressSave && <button className="btn mt-3" onClick={retryProgressSave}>Retry saving</button>}</div> : null;
}
export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname().replace(/\/+$/, "") || "/";
  const surface = path === "/" || path === "/library" ? "library" : "study";
  return <AppProvider>
    <div className="app-shell" data-surface={surface}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="app-header" data-chrome>
      <div className="header-inner">
        <Link href="/" className="wordmark" aria-label="Chess Quest home"><span className="brand-mark"><QuestIcon name="knight" /></span><span>CHESS QUEST</span></Link>
        <nav className="main-nav" aria-label="Main navigation">
          {NAV.map(({ href, label, icon }) => {
            const on = href === "/" ? ["/", "/library", "/import"].includes(path) : path.startsWith(href) || (href === "/today" && path === "/train") || (href === "/profile" && path === "/partner");
            return <Link key={href} href={href} className="nav-link" aria-current={on ? "page" : undefined}><QuestIcon name={icon} /><span>{label}</span></Link>;
          })}
        </nav>
        <Link href="/battles" className="header-note" aria-current={path === "/battles" ? "page" : undefined}>Book Battles <QuestIcon name="swords" /></Link>
      </div>
    </header>
    <main id="main-content" className="app-main"><ProgressNotice />{children}</main>
    <footer className="app-footer" data-chrome><span>One position. A little deeper.</span><div><Link href="/battles">Book Battles</Link><Link href="/privacy">Privacy</Link><Link href="/support">Support &amp; license</Link></div></footer>
    </div>
  </AppProvider>;
}
