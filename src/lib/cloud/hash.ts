// Canonical hashing shared by the browser and the server. Two JSON values that
// differ only in key order, or in keys set to undefined, hash the same, so a
// record that has been through Postgres jsonb still matches the local copy.

export function stableStringify(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of Object.keys(o).sort()) {
    if (o[k] === undefined) continue;
    parts.push(`${JSON.stringify(k)}:${stableStringify(o[k])}`);
  }
  return `{${parts.join(",")}}`;
}

/** cyrb53: a fast 53-bit string hash. Used for change detection, not security. */
export function hash53(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export const hashOf = (v: unknown): string => hash53(stableStringify(v));
