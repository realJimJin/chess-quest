// The HTTP face of the sync services. Route files are thin wrappers around
// these handlers so they can be tested without a running server.
import { dbConfigured, getDb, type Db } from "./db";
import { authConfigured, identify, type Caller } from "./auth";
import { ensureUser } from "./users";
import { SyncError, dueReviews, getProfile, pullProgress, pushProgress, putProfile } from "./sync";
import { SYNC_ACCOUNT_HEADER } from "../lib/cloud/errors";

export interface Deps { ready(): boolean; db(): Promise<Db>; identify(req: Request): Promise<Caller | null>; baseUrl(): string }
const live: Deps = { ready: () => dbConfigured() && authConfigured(), db: getDb, identify, baseUrl: () => process.env.APP_BASE_URL ?? "" };

const MAX_BODY = 9 * 1024 * 1024; // 500 attempts at the 16 KB cap, plus envelope
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const fail = (status: number, error: string, message: string) => json({ error, message }, status);

const origin = (u: string): string => { try { return new URL(u).origin; } catch { return ""; } };
/** A cookie travels with any request the browser makes, so writes that rely on
 *  it must come from our own pages. Bearer callers prove themselves per request. */
function sameSite(req: Request, deps: Deps): boolean {
  if (req.headers.get("sec-fetch-site") === "cross-site") return false;
  const from = req.headers.get("origin");
  return !from || from === origin(req.url) || from === origin(deps.baseUrl());
}

async function body(req: Request): Promise<Record<string, unknown>> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) throw new SyncError("request body too large", 413);
  const text = await req.text();
  if (text.length > MAX_BODY) throw new SyncError("request body too large", 413);
  let v: unknown;
  try { v = JSON.parse(text); } catch { throw new SyncError("body must be JSON", 400); }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new SyncError("body must be a JSON object", 400);
  return v as Record<string, unknown>;
}

type Work = (ctx: { db: Db; userId: string; req: Request }) => Promise<Response>;
async function run(req: Request, deps: Deps, work: Work): Promise<Response> {
  if (!deps.ready()) return fail(501, "not-configured", "Accounts are not set up on this server.");
  try {
    const who = await deps.identify(req);
    if (!who) return fail(401, "signed-out", "Sign in to sync.");
    if (who.via === "cookie" && req.method !== "GET" && !sameSite(req, deps)) return fail(403, "cross-site", "Request must come from the app.");
    const expected = req.headers.get(SYNC_ACCOUNT_HEADER);
    if (who.via === "cookie" && !expected) return fail(428, "account-required", "Reload the app before syncing so it can confirm your account.");
    const db = await deps.db();
    const userId = await ensureUser(db, who.identity);
    if (expected && expected !== userId) return fail(409, "account-changed", "The signed-in account changed. Reload the app before syncing. Your saved work has not been moved.");
    return await work({ db, userId, req });
  } catch (e) {
    if (e instanceof SyncError) return fail(e.status, "invalid", e.message);
    console.error("sync request failed", e);
    return fail(500, "server", "Something went wrong.");
  }
}

/** GET /api/me — whether accounts exist here and who is signed in. Never an error for signed-out visitors. */
export async function me(req: Request, deps: Deps = live): Promise<Response> {
  if (!deps.ready()) return json({ configured: false, user: null });
  try {
    const who = await deps.identify(req);
    if (!who) return json({ configured: true, user: null });
    const id = await ensureUser(await deps.db(), who.identity);
    const { email, name, picture } = who.identity;
    return json({ configured: true, user: { id, email: email ?? null, name: name ?? null, picture: picture ?? null } });
  } catch (e) { console.error("me failed", e); return fail(500, "server", "Something went wrong."); }
}

/** GET /api/sync/progress?after=<cursor> */
export const progressGet = (req: Request, deps: Deps = live) => run(req, deps, async ({ db, userId }) => {
  const raw = new URL(req.url).searchParams.get("after") ?? "0";
  if (!/^\d{1,15}$/.test(raw)) throw new SyncError("after must be a cursor", 400);
  return json(await pullProgress(db, userId, Number(raw)));
});
/** POST /api/sync/progress { attempts, resetAt?, origin? } */
export const progressPost = (req: Request, deps: Deps = live) => run(req, deps, async ({ db, userId }) =>
  json(await pushProgress(db, userId, await body(req))));
/** GET /api/sync/due — exercise ids due for review now */
export const dueGet = (req: Request, deps: Deps = live) => run(req, deps, async ({ db, userId }) =>
  json({ due: await dueReviews(db, userId) }));
/** GET /api/sync/profile */
export const profileGet = (req: Request, deps: Deps = live) => run(req, deps, async ({ db, userId }) =>
  json({ profile: await getProfile(db, userId) }));
/** PUT /api/sync/profile { data, baseVersion } — 409 with the stored copy when someone else saved first */
export const profilePut = (req: Request, deps: Deps = live) => run(req, deps, async ({ db, userId }) => {
  const r = await putProfile(db, userId, await body(req));
  return json(r, r.ok ? 200 : 409);
});
