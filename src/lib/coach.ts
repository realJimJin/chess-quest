import type { Exercise } from "./types";
import type { Stats } from "./progress";
import type { Campaign } from "./game";
import { SHELF, type AreaKey, type PlayerProfile } from "./profile";
import { CATEGORY_INFO } from "./diagnostics";
import { isTrainable } from "./validate";

export interface PlanItem { area: AreaKey | "review"; title: string; detail: string; href?: string; cta?: string; minutes: number; available: boolean }

/** Today's plan from the player's stated allocation and what the library can
 *  actually supply. Areas with no imported material are shown as gaps, not
 *  filled with invented exercises. */
export function todaysPlan(profile: PlayerProfile, st: Stats, camp: Campaign | null, exercises: Exercise[], sessionMinutes = 90): PlanItem[] {
  const items: PlanItem[] = [];
  if (st.due > 0) items.push({ area: "review", title: `Review ${st.due} missed exercise${st.due === 1 ? "" : "s"}`, detail: "Due today on the spaced-repetition schedule. Do these first.", href: "/train?mode=review", cta: "Start review", minutes: Math.min(20, st.due * 3), available: true });
  const has = (area: AreaKey) => exercises.some((e) => isTrainable(e) && SHELF.find((b) => b.id === e.bookId)?.area === area);
  const top = (Object.keys(st.categories) as (keyof typeof st.categories)[])
    .map((c) => ({ c, n: st.categories[c].evidence * 2 + st.categories[c].self })).sort((a, b) => b.n - a.n)[0];
  for (const a of profile.allocation) {
    const minutes = Math.round((sessionMinutes * a.weight) / 100);
    if (a.key === "calculation") {
      const lv = camp?.current;
      if (lv) {
        const deepFirst = top && top.n > 0 && ["missed_defence", "calculation", "visualization", "missed_candidate"].includes(top.c);
        items.push({ area: a.key, title: `${lv.boss ? "Boss level" : `Level ${lv.index + 1}`} · № ${lv.firstNumber}–${lv.lastNumber}`,
          detail: deepFirst ? `Your recorded misses point to “${CATEGORY_INFO[top.c].label.toLowerCase()}”. Take this level in Deep Calculation and write your lines.` : "Next open level on your campaign map.",
          href: `/train?mode=${deepFirst || lv.boss ? "deep" : "flow"}&level=${encodeURIComponent(lv.id)}`, cta: deepFirst || lv.boss ? "Think deep" : "Play level", minutes, available: true });
      } else items.push({ area: a.key, title: a.label, detail: has("calculation") ? "Every level is cleared. Replay bosses in Deep Calculation." : "No calculation book imported yet.", href: has("calculation") ? "/" : "/import", cta: has("calculation") ? "Open map" : "Import", minutes, available: has("calculation") });
    } else if (a.key === "games") {
      items.push({ area: a.key, title: a.label, detail: "Played away from this app. Game import and postgame review are not built yet.", minutes, available: false });
    } else {
      const books = SHELF.filter((b) => b.area === a.key).map((b) => b.title).join(", ");
      items.push({ area: a.key, title: a.label, detail: has(a.key) ? "Material available in your library." : books ? `Nothing in your library covers this yet. Planned sources: ${books}.` : "Nothing in your library covers this yet.", href: has(a.key) ? "/library" : undefined, cta: has(a.key) ? "Open" : undefined, minutes, available: has(a.key) });
    }
  }
  return items;
}
