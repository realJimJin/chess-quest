import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { asSystem, type Db } from "../db";
import { verifyBearer, type Caller } from "../auth";
import { dueGet, me, profileGet, profilePut, progressGet, progressPost, type Deps } from "../http";
import { testDb } from "./helpers";

const BASE = "https://app.example.test";
let db: Db;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });

const deps = (who: Caller | null, ready = true): Deps => ({ ready: () => ready, db: async () => db, identify: async () => who, baseUrl: () => BASE });
const cookie = (sub: string): Caller => ({ identity: { sub, email: `${sub}@example.test`, emailVerified: true, name: sub }, via: "cookie" });
const bearer = (sub: string): Caller => ({ identity: { sub }, via: "bearer" });
const req = (path: string, init: RequestInit = {}) => new Request(BASE + path, init);
const send = (path: string, method: string, body: unknown, headers: Record<string, string> = {}) =>
  req(path, { method, body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });
const att = (exerciseId: string, ts = Date.now() - 60_000) =>
  ({ exerciseId, ts, mode: "flow", result: "solved", timeMs: 1234, wrongMoves: [], offBookMoves: [], hintLevel: 0, finished: true });

describe("sync routes", () => {
  it("answer 501 when accounts are not set up, and 401 when signed out", async () => {
    expect((await progressGet(req("/api/sync/progress"), deps(cookie("a"), false))).status).toBe(501);
    const r = await progressGet(req("/api/sync/progress"), deps(null));
    expect(r.status).toBe(401);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await (await me(req("/api/me"), deps(null, false))).json()).toEqual({ configured: false, user: null });
    expect(await (await me(req("/api/me"), deps(null))).json()).toEqual({ configured: true, user: null });
  });

  it("push then pull round-trips, and each account sees only its own attempts", async () => {
    const a = deps(cookie("auth0|http-a")), b = deps(cookie("auth0|http-b"));
    const push = await progressPost(send("/api/sync/progress", "POST", { attempts: [att("x1"), att("x2", Date.now() - 30_000)] }, { origin: BASE }), a);
    expect(push.status).toBe(200);
    const pushed = await push.json();
    expect(pushed.stored).toBe(2);
    const mine = await (await progressGet(req("/api/sync/progress?after=0"), a)).json();
    expect(mine.attempts.map((x: { exerciseId: string }) => x.exerciseId).sort()).toEqual(["x1", "x2"]);
    expect(mine.cursor).toBe(pushed.cursor);
    expect((await (await progressGet(req(`/api/sync/progress?after=${mine.cursor}`), a)).json()).attempts).toEqual([]);
    expect((await (await progressGet(req("/api/sync/progress"), b)).json()).attempts).toEqual([]);
    expect((await dueGet(req("/api/sync/due"), a)).status).toBe(200);
    const who = await (await me(req("/api/me"), a)).json();
    expect(who.user).toMatchObject({ email: "auth0|http-a@example.test", name: "auth0|http-a" });
  });

  it("rejects bad input with a 4xx and a message", async () => {
    const a = deps(cookie("auth0|http-bad"));
    expect((await progressGet(req("/api/sync/progress?after=-1"), a)).status).toBe(400);
    expect((await progressGet(req("/api/sync/progress?after=abc"), a)).status).toBe(400);
    expect((await progressPost(send("/api/sync/progress", "POST", "{nope"), a)).status).toBe(400);
    expect((await progressPost(send("/api/sync/progress", "POST", [1]), a)).status).toBe(400);
    const r = await progressPost(send("/api/sync/progress", "POST", { attempts: [{ ...att("x"), mode: "cheat" }] }), a);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("invalid");
    expect((await progressPost(send("/api/sync/progress", "POST", {}, { "content-length": String(50 * 1024 * 1024) }), a)).status).toBe(413);
  });

  it("refuses cookie-backed writes from another site but allows bearer callers", async () => {
    const evil = { origin: "https://evil.example" };
    const body = { attempts: [att("csrf")] };
    expect((await progressPost(send("/api/sync/progress", "POST", body, evil), deps(cookie("auth0|http-c")))).status).toBe(403);
    expect((await progressPost(send("/api/sync/progress", "POST", body, { "sec-fetch-site": "cross-site" }), deps(cookie("auth0|http-c")))).status).toBe(403);
    expect((await progressGet(req("/api/sync/progress"), deps(cookie("auth0|http-c")))).status).toBe(200);
    expect((await (await progressGet(req("/api/sync/progress"), deps(cookie("auth0|http-c")))).json()).attempts).toEqual([]);
    expect((await progressPost(send("/api/sync/progress", "POST", body, { origin: "capacitor://localhost" }), deps(bearer("auth0|http-c")))).status).toBe(200);
  });

  it("a bearer sign-in does not wipe the email a cookie sign-in stored", async () => {
    await me(req("/api/me"), deps(cookie("auth0|http-mail")));
    await me(req("/api/me"), deps(bearer("auth0|http-mail")));
    const rows = await asSystem(db, (q) => q.query("select email, email_verified from users where auth_sub = $1", ["auth0|http-mail"]));
    expect(rows).toEqual([{ email: "auth0|http-mail@example.test", email_verified: true }]);
  });

  it("profile saves with a version and answers 409 to a stale save", async () => {
    const a = deps(cookie("auth0|http-p"));
    expect(await (await profileGet(req("/api/sync/profile"), a)).json()).toEqual({ profile: null });
    const first = await profilePut(send("/api/sync/profile", "PUT", { data: { name: "Jo" }, baseVersion: 0 }), a);
    expect(first.status).toBe(200);
    const v = (await first.json()).profile.version;
    const stale = await profilePut(send("/api/sync/profile", "PUT", { data: { name: "Old" }, baseVersion: v - 1 }), a);
    expect(stale.status).toBe(409);
    expect((await stale.json()).profile.data).toEqual({ name: "Jo" });
    expect((await (await profileGet(req("/api/sync/profile"), a)).json()).profile.data).toEqual({ name: "Jo" });
  });

  it("hides internal errors behind a 500", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: Deps = { ...deps(cookie("auth0|http-x")), db: async () => { throw new Error("secret connection string"); } };
    const r = await progressGet(req("/api/sync/progress"), broken);
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("secret");
    log.mockRestore();
  });
});

describe("verifyBearer", () => {
  it("accepts a token for our API and rejects wrong audience, issuer, key or expiry", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const other = await generateKeyPair("RS256");
    const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" }] });
    const o = { keys, issuer: "https://t.example.test/", audience: "https://api.example.test" };
    const mint = (c: { iss?: string; aud?: string; exp?: string; key?: CryptoKey; sub?: string } = {}) => {
      const j = new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(c.iss ?? o.issuer).setAudience(c.aud ?? o.audience).setIssuedAt().setExpirationTime(c.exp ?? "5m");
      if (c.sub !== "") j.setSubject(c.sub ?? "auth0|tok");
      return j.sign(c.key ?? privateKey);
    };
    expect(await verifyBearer(await mint(), o)).toEqual({ sub: "auth0|tok" });
    expect(await verifyBearer(await mint({ aud: "https://other.example" }), o)).toBeNull();
    expect(await verifyBearer(await mint({ iss: "https://evil.example/" }), o)).toBeNull();
    expect(await verifyBearer(await mint({ key: other.privateKey as CryptoKey }), o)).toBeNull();
    expect(await verifyBearer(await mint({ exp: "-1m" }), o)).toBeNull();
    expect(await verifyBearer(await mint({ sub: "" }), o)).toBeNull();
    expect(await verifyBearer("not.a.token", o)).toBeNull();
  });
});
