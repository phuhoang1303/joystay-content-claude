"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { workspace } from "@/lib/db/schema";
import { WORKSPACE_COOKIE } from "./server";

export async function switchWorkspace(id: number): Promise<void> {
  const exists = getDb().select().from(workspace).where(eq(workspace.id, id)).get();
  if (!exists) return;
  (await cookies()).set(WORKSPACE_COOKIE, String(id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
