import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgliteDb, asSystem, type Db } from "../db";
import { migrate } from "../migrate";

/** A fresh in-memory Postgres with every migration applied and the restricted
 *  app role in force, so row-level security is really exercised. */
export async function testDb(): Promise<Db> {
  process.env.DATABASE_APP_ROLE = "cq_app";
  const db = pgliteDb(new PGlite());
  await migrate(db, { dir: path.join(process.cwd(), "db", "migrations"), appRole: "cq_app" });
  return db;
}

export async function makeUser(db: Db, sub: string): Promise<string> {
  const rows = await asSystem(db, (q) => q.query<{ id: string }>("insert into users (auth_sub, email) values ($1, $2) returning id", [sub, `${sub}@example.test`]));
  return rows[0].id;
}
