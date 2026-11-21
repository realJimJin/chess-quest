"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppProvider, useApp } from "@/lib/store";
import QuestIcon, { type IconName } from "./QuestIcon";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Library", icon: "book" },
  { href: "/today", label: "Training", icon: "target" },
  { href: "/world", label: "Journey", icon: "map" },
  { href: "/battles", label: "Battles", icon: "swords" },
];
function ProgressNotice() {
  const { progressError, canRetryProgressSave, retryProgressSave } = useApp();
  return progressError ? <div role="alert" className="notice-error"><p>{progressError}</p>{canRetryProgressSave && <button className="btn mt-3" onClick={retryProgressSave}>Retry saving</button>}</div> : null;
}
export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname().replace(/\/+$/, "") || "/";
  const surface = path === "/" || path === "/library" ? "library" : "study";
  return <AppProvider><div className="app-shell" data-surface={surface} data-route={path}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="app-rail" data-chrome>
      <Link href="/" className="brand-mark" aria-label="Chess Quest home"><QuestIcon name="knight" /></Link>
      <nav className="main-nav" aria-label="Main navigation">{NAV.map(({ href, label, icon }) => {
        const on = href === "/" ? ["/", "/library", "/import"].includes(path) : path.startsWith(href) || (href === "/today" && path === "/train");
        return <Link key={href} href={href} className="nav-link" aria-current={on ? "page" : undefined}><QuestIcon name={icon} /><span>{label}</span></Link>;
      })}</nav>
      <Link href="/profile" className="rail-profile" aria-label="Your profile and settings" aria-current={path === "/profile" ? "page" : undefined}>CQ</Link>
    </aside>
    <div className="app-content">
      <header className="app-header" data-chrome><Link href="/" className="wordmark">CHESS<span>QUEST</span><small>A place to think.</small></Link><div className="header-status"><span>YOUR PERSONAL STUDY SPACE</span><span className="local-status">On this device</span><Link href="/profile" className="mobile-profile" aria-label="Your profile and settings"><QuestIcon name="user" /></Link></div></header>
      <main id="main-content" className="app-main"><ProgressNotice />{children}</main>
      <footer className="app-footer" data-chrome><span>A small library. A deeper understanding.</span><div><Link href="/coach">Coach</Link><Link href="/profile">Profile</Link><Link href="/privacy">Privacy</Link><Link href="/support">Support &amp; license</Link></div></footer>
    </div>
  </div></AppProvider>;
}
