// The player's own profile. Phase 1 keeps it in this browser; the shape is what
// an account record would hold later.
import { notifyLocalWrite } from "./cloud/events";
export interface PlayerProfile {
  name: string;
  ratings: { label: string; value: string }[];
  repertoire: { side: string; opening: string }[];
  goals: string[];
  allocation: { key: AreaKey; label: string; weight: number }[];
  freeRoam: boolean;
  dailyGoal: number;
}
export type AreaKey = "games" | "calculation" | "positional" | "endgames" | "repertoire";



const BLANK_PROFILE: PlayerProfile = {
  name: "",
  ratings: [{ label: "Over-the-board rating", value: "" }, { label: "Online blitz", value: "" }, { label: "Online rapid", value: "" }],
  repertoire: [], goals: [],
  allocation: [
    { key: "games", label: "Serious games and postgame analysis", weight: 30 }, { key: "calculation", label: "Deep calculation", weight: 25 },
    { key: "positional", label: "Positional decision-making", weight: 20 }, { key: "endgames", label: "Endgames", weight: 15 }, { key: "repertoire", label: "Repertoire training", weight: 10 },
  ],
  freeRoam: false,
  dailyGoal: 12,
};
// Personal defaults are not kept in the source. A private deployment may supply them as JSON
// in NEXT_PUBLIC_PERSONAL ({ profile, shelf }), set in .env.local or the host's settings.
// The condition is written out in full so the public iOS build drops the value at build time.
const PERSONAL_JSON = process.env.NEXT_PUBLIC_TARGET === "ios" ? "{}" : (process.env.NEXT_PUBLIC_PERSONAL ?? "{}");
function readPersonal(): { profile?: Partial<PlayerProfile>; shelf?: ShelfBook[] } {
  try { const v = JSON.parse(PERSONAL_JSON); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
const PERSONAL = readPersonal();
export const DEFAULT_PROFILE: PlayerProfile = { ...BLANK_PROFILE, ...(PERSONAL.profile ?? {}) };

const KEY = "cst.profile.v1";
export function loadProfile(): PlayerProfile {
  try { const raw = localStorage.getItem(KEY); return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : DEFAULT_PROFILE; } catch { return DEFAULT_PROFILE; }
}
export function saveProfile(p: PlayerProfile) { try { localStorage.setItem(KEY, JSON.stringify(p)); notifyLocalWrite("profile"); } catch { /* ignore */ } }
/** The saved profile exactly as stored, or null if nothing was ever saved. For sync. */
export function readStoredProfile(): Record<string, unknown> | null {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return null;
  const v: unknown = JSON.parse(raw);
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Invalid saved profile");
  return v as Record<string, unknown>;
}
export function writeStoredProfile(d: Record<string, unknown>) { localStorage.setItem(KEY, JSON.stringify(d)); }

// Rating milestones are personal goals the player ticks off after earning them
// over the board. The app never awards a rating or a title.
export const MILESTONES = [
  { key: "1900", label: "1900 USCF" }, { key: "2000", label: "2000 USCF" }, { key: "2100", label: "2100 USCF" },
  { key: "2200", label: "2200 USCF · National Master" }, { key: "2300", label: "2300 · FIDE Master" },
];

// The planned curriculum. Only books the player has imported contain exercises.
export interface ShelfBook { id: string; title: string; author: string; area: AreaKey; lesson: string; hue: number }
// The source ships no reading list; the shelf shows what the user imports, plus any private list.
export const SHELF: ShelfBook[] = Array.isArray(PERSONAL.shelf) ? PERSONAL.shelf : [];
