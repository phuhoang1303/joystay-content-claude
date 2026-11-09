import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

export const MIGRATIONS_FOLDER = path.resolve(process.cwd(), "drizzle");

export function dataDir(): string {
  return path.resolve(process.cwd(), process.env.DATA_DIR || ".data");
}

export function dbFilePath(): string {
  return path.join(dataDir(), "app.db");
}

/** Open a database. Use ":memory:" in tests. */
export function createDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

const globalForDb = globalThis as unknown as { __joystayDb?: Db };

/** Shared connection for the web app and the worker (one per process). */
export function getDb(): Db {
  if (!globalForDb.__joystayDb) globalForDb.__joystayDb = createDb(dbFilePath());
  return globalForDb.__joystayDb;
}
