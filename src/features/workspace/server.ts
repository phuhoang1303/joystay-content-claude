import "server-only";
import { cookies } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { workspace, type Workspace } from "@/lib/db/schema";

export const WORKSPACE_COOKIE = "ws";

export function listWorkspaces(): Workspace[] {
  return getDb().select().from(workspace).orderBy(asc(workspace.id)).all();
}

/** Workspace from the cookie, else the first one. Throws a Vietnamese hint if the DB is empty. */
export async function getCurrentWorkspace(): Promise<Workspace> {
  const db = getDb();
  const id = Number((await cookies()).get(WORKSPACE_COOKIE)?.value);
  const chosen = Number.isInteger(id)
    ? db.select().from(workspace).where(eq(workspace.id, id)).get()
    : undefined;
  const ws = chosen ?? db.select().from(workspace).orderBy(asc(workspace.id)).get();
  if (!ws) {
    throw new Error('Chưa có workspace nào. Hãy chạy "npm run db:migrate" rồi "npm run db:seed".');
  }
  return ws;
}
