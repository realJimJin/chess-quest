// Database access. Two drivers sit behind one small interface: node-postgres
// for real deployments and PGlite (Postgres compiled to WebAssembly) for tests
// and zero-setup local development.
import path from "node:path";
import { migrate } from "./migrate";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;
export interface Sql {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  /** Run one or more statements without parameters. */
  exec(sql: string): Promise<void>;
}
export interface Db extends Sql {
  tx<T>(fn: (q: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

interface PgLike { query(text: string, params?: any[]): Promise<{ rows: any[] }> }
interface PgPool extends PgLike { connect(): Promise<PgLike & { release(): void }>; end(): Promise<void> }
const pgSql = (c: PgLike): Sql => ({
  query: async (text, params) => (await c.query(text, params as any[])).rows,
  exec: async (sql) => { await c.query(sql); },
});
export function pgDb(pool: PgPool): Db {
  return {
    ...pgSql(pool),
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query("begin");
        const out = await fn(pgSql(c));
        await c.query("commit");
        return out;
      } catch (e) {
        try { await c.query("rollback"); } catch { /* connection is gone */ }
        throw e;
      } finally { c.release(); }
    },
    close: () => pool.end(),
  };
}

interface LiteLike { query(text: string, params?: any[]): Promise<{ rows: any[] }>; exec(sql: string): Promise<unknown> }
interface Lite extends LiteLike { transaction<T>(fn: (tx: LiteLike) => Promise<T>): Promise<T>; close(): Promise<void> }
const liteSql = (c: LiteLike): Sql => ({
  query: async (text, params) => (await c.query(text, params as any[])).rows,
  exec: async (sql) => { await c.exec(sql); },
});
export function pgliteDb(lite: Lite): Db {
  return { ...liteSql(lite), tx: (fn) => lite.transaction((t) => fn(liteSql(t))), close: () => lite.close() };
}

/** JSON parameter. Always bind as `$n::text::jsonb` so both drivers send text. */
export const j = (v: unknown): string => JSON.stringify(v ?? null);
/** bigint columns arrive as string, number or bigint depending on the driver. */
export const num = (v: unknown): number => Number(v ?? 0);

const ROLE_RE = /^[a-z_][a-z0-9_]{0,62}$/;
/** Optional role without BYPASSRLS that every request switches to, for hosts
 *  whose login role would otherwise skip row-level security. */
export function appRole(): string | null {
  const r = process.env.DATABASE_APP_ROLE;
  if (!r) return null;
  if (!ROLE_RE.test(r)) throw new Error("DATABASE_APP_ROLE is not a valid role name");
  return r;
}

async function enter(q: Sql, userId: string | null, system: boolean) {
  const role = appRole();
  if (role) await q.exec(`set local role "${role}"`);
  await q.query("select set_config('app.user_id', $1, true), set_config('app.system', $2, true)", [userId ?? "", system ? "on" : "off"]);
}
/** A transaction that can see and change one user's rows only. */
export const asUser = <T>(db: Db, userId: string, fn: (q: Sql) => Promise<T>): Promise<T> =>
  db.tx(async (q) => { await enter(q, userId, false); return fn(q); });
/** A transaction for work that spans users: sign-in lookup, the job queue, battles. */
export const asSystem = <T>(db: Db, fn: (q: Sql) => Promise<T>): Promise<T> =>
  db.tx(async (q) => { await enter(q, null, true); return fn(q); });

export const migrationsDir = () => path.join(/* turbopackIgnore: true */ process.cwd(), "db", "migrations");

const g = globalThis as { __cqDb?: Promise<Db> };
export const dbConfigured = (): boolean => !!process.env.DATABASE_URL;
export function getDb(): Promise<Db> {
  if (!g.__cqDb) g.__cqDb = open().catch((e) => { g.__cqDb = undefined; throw e; });
  return g.__cqDb;
}

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (url.startsWith("pglite:")) {
    // Local development only: an embedded database, migrated on first use.
    if (process.env.NODE_ENV === "production") throw new Error("pglite: databases are for local development only");
    const name = "@electric-sql/pglite";
    const { PGlite } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ name);
    const dir = url.slice("pglite:".length);
    const db = pgliteDb(new PGlite(dir && dir !== "memory" ? dir : undefined));
    await migrate(db, { dir: migrationsDir(), appRole: appRole() });
    return db;
  }
  const { Pool } = await import("pg");
  return pgDb(new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 5), idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 }) as unknown as PgPool);
}
