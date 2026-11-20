import type { ReactNode } from "react";

export type IconName = "book" | "map" | "target" | "spark" | "user" | "arrow" | "search" | "plus" | "shield" | "clock" | "knight" | "swords";
const paths: Record<IconName, ReactNode> = {
  book: <><path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z" /></>,
  map: <><path d="m3 5 6-2 6 3 6-2v15l-6 2-6-3-6 2Zm6-2v15m6-12v15" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  spark: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  plus: <path d="M12 4v16M4 12h16" />,
  shield: <><path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5Z" /><path d="m8 12 3 3 5-6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
  knight: <><path d="M6 21h14l-1-4H8Zm3-4c-1-4 3-6 5-8l-4 2-4-2 3-6 3 1 3-2c5 5 6 10 3 15" /><path d="m10 6 1 .1" /></>,
  swords: <><path d="m4 3 4 1 13 16-2 2L5 7Zm16 0-4 1-3 4M4 20l6-7M3 16l5 5m8-5 5-5" /></>,
};
export default function QuestIcon({ name, className = "" }: { name: IconName; className?: string }) {
  return <svg className={`quest-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
