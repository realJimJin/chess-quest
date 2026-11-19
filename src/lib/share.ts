// Partner sessions travel as a link: the position and one player's notes are
// encoded in the URL fragment, so nothing is stored on a server.
export interface PartnerNotes { name: string; lines: string; evaluation: string; answer: string }
export interface PartnerSession { v: 1; fen: string; label: string; exerciseId?: string; notes?: PartnerNotes }

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

export const encodeSession = (s: PartnerSession) => b64(JSON.stringify(s));
export function decodeSession(code: string): PartnerSession | null {
  try {
    const s = JSON.parse(unb64(code.trim().replace(/^.*#s=/, ""))) as PartnerSession;
    return s && s.v === 1 && typeof s.fen === "string" ? s : null;
  } catch { return null; }
}
