#!/usr/bin/env node
// Apply database migrations: `npm run db:migrate` (needs DATABASE_URL).
// Run it as a deploy step, never from a request handler.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }
const { migrate } = await import("../src/server/migrate.ts");

const pool = new pg.Pool({ connectionString: url, max: 1 });
const wrap = (c) => ({ query: async (t, p) => (await c.query(t, p)).rows, exec: async (s) => { await c.query(s); } });
const db = {
  ...wrap(pool),
  async tx(fn) {
    const c = await pool.connect();
    try { await c.query("begin"); const out = await fn(wrap(c)); await c.query("commit"); return out; }
    catch (e) { await c.query("rollback").catch(() => {}); throw e; }
    finally { c.release(); }
  },
};
try {
  const applied = await migrate(db, { dir: path.join(root, "db", "migrations"), appRole: process.env.DATABASE_APP_ROLE || null, log: (m) => console.log(m) });
  console.log(applied.length ? `${applied.length} migration(s) applied` : "database is up to date");
} finally { await pool.end(); }
