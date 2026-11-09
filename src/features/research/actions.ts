"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { researchPack, source } from "@/lib/db/schema";
import { RESEARCH_PACK_JOB, RESEARCH_SOURCE_JOB } from "@/lib/jobs/handlers/research";
import { enqueue } from "@/lib/jobs/queue";
import { normalizeUrl, type Candidate } from "@/lib/research/url-filter";
import { getCurrentWorkspace } from "@/features/workspace/server";

export type ActionResult = { ok: boolean; message?: string; jobId?: number };

function refresh() {
  revalidatePath("/research");
  revalidatePath("/ke-hoach-tuan");
  revalidatePath("/");
}

async function setSourceStatus(id: number, status: "active" | "dropped"): Promise<ActionResult> {
  const ws = await getCurrentWorkspace();
  const r = getDb()
    .update(source)
    .set({ status })
    .where(and(eq(source.id, id), eq(source.workspaceId, ws.id)))
    .run();
  if (!r.changes) return { ok: false, message: "Không tìm thấy nguồn." };
  refresh();
  return { ok: true };
}

export async function dropSource(id: number) {
  return setSourceStatus(id, "dropped");
}

export async function restoreSource(id: number) {
  return setSourceStatus(id, "active");
}

export async function pasteUrl(packId: number, rawUrl: string): Promise<ActionResult> {
  const ws = await getCurrentWorkspace();
  const db = getDb();
  const pack = db.select().from(researchPack).where(and(eq(researchPack.id, packId), eq(researchPack.workspaceId, ws.id))).get();
  if (!pack) return { ok: false, message: "Không tìm thấy gói research." };
  const url = normalizeUrl(rawUrl);
  if (!url) return { ok: false, message: "URL không hợp lệ (cần bắt đầu bằng http:// hoặc https://)." };
  const exists = db.select({ id: source.id }).from(source).where(and(eq(source.researchPackId, packId), eq(source.url, url))).get();
  if (exists) return { ok: false, message: "URL này đã có trong gói." };
  const j = enqueue(db, { workspaceId: ws.id, type: RESEARCH_SOURCE_JOB, payload: { packId, url } });
  refresh();
  return { ok: true, jobId: j.id, message: "Đang xử lý URL..." };
}

/** Re-runs a pack: resumes pending pages if any, otherwise searches again for new sources. */
export async function retryPack(packId: number): Promise<ActionResult> {
  const ws = await getCurrentWorkspace();
  const db = getDb();
  const pack = db.select().from(researchPack).where(and(eq(researchPack.id, packId), eq(researchPack.workspaceId, ws.id))).get();
  if (!pack) return { ok: false, message: "Không tìm thấy gói research." };
  if (pack.status === "queued" || pack.status === "running") return { ok: false, message: "Gói đang chạy." };
  const candidates = JSON.parse(pack.candidates) as Candidate[];
  const fresh = candidates.length > 0 && !candidates.some((c) => c.state === "pending");
  db.update(researchPack).set({ status: "queued", error: null, updatedAt: new Date() }).where(eq(researchPack.id, packId)).run();
  const j = enqueue(db, { workspaceId: ws.id, type: RESEARCH_PACK_JOB, payload: { packId, fresh } });
  refresh();
  return { ok: true, jobId: j.id };
}
