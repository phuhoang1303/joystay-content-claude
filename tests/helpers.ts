import { createDb, runMigrations, type Db } from "@/lib/db/client";
import { workspace } from "@/lib/db/schema";

/** Fresh in-memory DB with real migrations and one workspace. */
export function setupDb(): { db: Db; workspaceId: number } {
  const db = createDb(":memory:");
  runMigrations(db);
  const ws = db.insert(workspace).values({ slug: "test", name: "Test" }).returning().get();
  return { db, workspaceId: ws.id };
}
