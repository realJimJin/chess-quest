// Accounts. A user row is created the first time a verified identity signs in.
import { asSystem, type Db } from "./db";

export interface Identity { sub: string; email?: string | null; emailVerified?: boolean; name?: string | null; picture?: string | null }

const clip = (v: string | null | undefined, max: number): string | null => (typeof v === "string" && v ? v.slice(0, max) : null);

/** Find or create the account for an identity-provider subject and return its id.
 *  Runs in system context because the caller has no user id yet. */
export async function ensureUser(db: Db, who: Identity): Promise<string> {
  if (typeof who.sub !== "string" || !who.sub || who.sub.length > 255) throw new Error("invalid identity subject");
  const rows = await asSystem(db, (q) => q.query<{ id: string }>(
    `insert into users (auth_sub, email, email_verified, name, picture)
     values ($1, $2, $3, $4, $5)
     on conflict (auth_sub) do update set
       email = coalesce(excluded.email, users.email),
       email_verified = case when excluded.email is null then users.email_verified else excluded.email_verified end,
       name = coalesce(excluded.name, users.name), picture = coalesce(excluded.picture, users.picture),
       last_seen_at = now()
     returning id`,
    [who.sub, clip(who.email, 320), !!who.emailVerified, clip(who.name, 200), clip(who.picture, 2000)]));
  return rows[0].id;
}
