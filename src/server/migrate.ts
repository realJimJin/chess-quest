// Migration runner. Self-contained (Node built-ins only, erasable types only) so
// scripts/db-migrate.mjs can load this file directly with Node's type stripping.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

interface Q {
  query(text: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  exec(sql: string): Promise<void>;
}
interface MigrationDb extends Q { tx<T>(fn: (q: Q) => Promise<T>): Promise<T> }

export interface MigrateOptions { dir: string; appRole?: string | null; log?: (message: string) => void }

/** Apply every migration in `dir` that has not run yet, each in its own
 *  transaction, and return the names that were applied. */
export async function migrate(db: MigrationDb, opts: MigrateOptions): Promise<string[]> {
  const log = opts.log ?? (() => {});
  await db.exec("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const files = readdirSync(opts.dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const applied: string[] = [];
  for (const name of files) {
    const ran = await db.tx(async (q) => {
      await q.query("select pg_advisory_xact_lock(482913)");   // one migrator at a time
      const seen = await q.query("select 1 from schema_migrations where name = $1", [name]);
      if (seen.length) return false;
      await q.exec(readFileSync(path.join(opts.dir, name), "utf8"));
      await q.query("insert into schema_migrations (name) values ($1)", [name]);
      return true;
    });
    if (ran) { applied.push(name); log(`applied ${name}`); }
  }
  if (opts.appRole) await grantAppRole(db, opts.appRole, log);
  return applied;
}

/** Create (if needed) the restricted role requests run as, and let it use the
 *  tables. It has no BYPASSRLS, so row-level security always applies to it. */
async function grantAppRole(db: MigrationDb, role: string, log: (m: string) => void) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error("invalid app role name");
  const exists = await db.query("select 1 from pg_roles where rolname = $1", [role]);
  if (!exists.length) { await db.exec(`create role "${role}" nologin`); log(`created role ${role}`); }
  await db.exec(`
    grant usage on schema public to "${role}";
    grant select, insert, update, delete on all tables in schema public to "${role}";
    grant usage, select on all sequences in schema public to "${role}";
    revoke all on schema_migrations from "${role}";
  `);
  try { await db.exec(`grant "${role}" to current_user`); } catch { /* already a member, or a superuser */ }
}
