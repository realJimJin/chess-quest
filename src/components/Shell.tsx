"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppProvider } from "@/lib/store";
import QuestIcon, { type IconName } from "./QuestIcon";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Library", icon: "book" },
  { href: "/today", label: "Training", icon: "target" },
  { href: "/world", label: "Journey", icon: "map" },
  { href: "/coach", label: "Coach", icon: "spark" },
  { href: "/profile", label: "Profile", icon: "user" },
];
export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return <AppProvider>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="app-header" data-chrome>
      <div className="header-inner">
        <Link href="/" className="wordmark" aria-label="Chess Quest home"><span className="brand-mark"><QuestIcon name="knight" /></span><span>CHESS <b>QUEST</b><small>THE ART OF IMPROVEMENT</small></span></Link>
        <nav className="main-nav" aria-label="Main navigation">
          {NAV.map(({ href, label, icon }) => {
            const on = href === "/" ? ["/", "/library", "/import"].includes(path) : path.startsWith(href) || (href === "/today" && path === "/train") || (href === "/profile" && path === "/partner");
            return <Link key={href} href={href} className="nav-link" aria-current={on ? "page" : undefined}><QuestIcon name={icon} /><span>{label}</span></Link>;
          })}
        </nav>
        <span className="header-note"><span /> Your personal study</span>
      </div>
    </header>
    <main id="main-content" className="app-main">{children}</main>
    <footer className="app-footer" data-chrome><span>One position. A little deeper.</span><div><Link href="/privacy">Privacy</Link><Link href="/support">Support &amp; license</Link></div></footer>
  </AppProvider>;
}
