import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asSystem, asUser, type Db } from "../db";
import { migrate } from "../migrate";
import path from "node:path";
import { makeUser, testDb } from "./helpers";

let db: Db, alice: string, bob: string;
beforeAll(async () => { db = await testDb(); alice = await makeUser(db, "auth0|alice"); bob = await makeUser(db, "auth0|bob"); });
afterAll(async () => { await db.close(); });

describe("migrations", () => {
  it("apply once and are idempotent", async () => {
    const again = await migrate(db, { dir: path.join(process.cwd(), "db", "migrations"), appRole: "cq_app" });
    expect(again).toEqual([]);
    const rows = await db.query("select name from schema_migrations order by name");
    expect(rows.map((r) => r.name)).toEqual(["0001_core.sql", "0002_ingestion.sql", "0003_multiplayer.sql"]);
  });
});

describe("row-level security", () => {
  const TENANT = ["profiles", "attempts", "srs_state", "library_books", "library_exercises", "uploads", "ingestion_jobs", "ingestion_events"];

  it("every table has forced row-level security and a policy", async () => {
    const rows = await db.query(`select c.relname, c.relrowsecurity, c.relforcerowsecurity,
        (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'schema_migrations'`);
    expect(rows.length).toBeGreaterThanOrEqual(15);
    for (const r of rows) expect([r.relname, r.relrowsecurity, r.relforcerowsecurity, Number(r.policies) > 0]).toEqual([r.relname, true, true, true]);
  });

  it("a user sees only their own rows, even with no WHERE clause", async () => {
    await asUser(db, alice, (q) => q.query("insert into profiles (user_id, data, seq) values ($1, '{\"name\":\"A\"}', 1)", [alice]));
    await asUser(db, bob, (q) => q.query("insert into profiles (user_id, data, seq) values ($1, '{\"name\":\"B\"}', 1)", [bob]));
    const seenByAlice = await asUser(db, alice, (q) => q.query("select user_id from profiles"));
    expect(seenByAlice.map((r) => r.user_id)).toEqual([alice]);
    const users = await asUser(db, bob, (q) => q.query("select id from users"));
    expect(users.map((r) => r.id)).toEqual([bob]);
  });

  it("a user cannot write, update or delete another user's rows", async () => {
    await expect(asUser(db, alice, (q) => q.query("insert into attempts (user_id, exercise_id, ts, mode, result, time_ms, payload, hash, seq) values ($1, 'x', 1, 'flow', 'solved', 1, '{}', 'h', 1)", [bob]))).rejects.toThrow(/row-level security/);
    const upd = await asUser(db, alice, (q) => q.query("update profiles set data = '{}' where user_id = $1 returning user_id", [bob]));
    expect(upd).toEqual([]);
    const del = await asUser(db, alice, (q) => q.query("delete from profiles where user_id = $1 returning user_id", [bob]));
    expect(del).toEqual([]);
    const still = await asUser(db, bob, (q) => q.query("select data from profiles"));
    expect(still[0].data).toEqual({ name: "B" });
  });

  it("with no user in context nothing is visible; system context sees all", async () => {
    const none = await db.tx(async (q) => { await q.exec('set local role "cq_app"'); return q.query("select * from profiles"); });
    expect(none).toEqual([]);
    const all = await asSystem(db, (q) => q.query("select user_id from profiles"));
    expect(all.length).toBe(2);
    for (const t of TENANT) expect(await db.tx(async (q) => { await q.exec('set local role "cq_app"'); return q.query(`select * from ${t}`); })).toEqual([]);
  });

  it("battle tables are closed to user context", async () => {
    await asSystem(db, (q) => q.query("insert into battles (book_id, config, seed) values ('b', '{}', 's')"));
    expect(await asUser(db, alice, (q) => q.query("select * from battles"))).toEqual([]);
  });
});
