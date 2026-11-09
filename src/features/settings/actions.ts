"use server";

import { revalidatePath } from "next/cache";
import { and, eq, max, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { brandProfile, examplePost, pillar } from "@/lib/db/schema";
import { AI_TEST_JOB } from "@/lib/jobs/handlers/ai-test";
import { enqueue } from "@/lib/jobs/queue";
import { setSetting } from "@/lib/settings";
import { getCurrentWorkspace } from "@/features/workspace/server";
import {
  aiSettingsSchema,
  brandProfileSchema,
  examplePostSchema,
  pillarNameSchema,
  zodErrors,
  type FormState,
} from "./schema";

const formString = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

function done(message: string): FormState {
  revalidatePath("/cai-dat");
  revalidatePath("/");
  return { ok: true, message };
}

export async function saveBrandProfile(_prev: FormState, fd: FormData): Promise<FormState> {
  const ws = await getCurrentWorkspace();
  const parsed = brandProfileSchema.safeParse(
    Object.fromEntries(Object.keys(brandProfileSchema.shape).map((k) => [k, formString(fd, k)])),
  );
  if (!parsed.success) return { ok: false, message: "Kiểm tra lại các ô báo lỗi.", errors: zodErrors(parsed.error) };

  const values = {
    ...parsed.data,
    bannedPhrases: parsed.data.bannedPhrases
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n"),
  };
  getDb()
    .insert(brandProfile)
    .values({ workspaceId: ws.id, ...values })
    .onConflictDoUpdate({
      target: brandProfile.workspaceId,
      set: { ...values, updatedAt: sql`(cast(unixepoch('subsec') * 1000 as integer))` },
    })
    .run();
  return done("Đã lưu Brand Profile.");
}

export async function addPillar(_prev: FormState, fd: FormData): Promise<FormState> {
  const ws = await getCurrentWorkspace();
  const parsed = pillarNameSchema.safeParse(formString(fd, "name"));
  if (!parsed.success) return { ok: false, errors: { name: parsed.error.issues[0].message } };
  const db = getDb();
  const next = (db.select({ m: max(pillar.sortOrder) }).from(pillar).where(eq(pillar.workspaceId, ws.id)).get()?.m ?? -1) + 1;
  const r = db.insert(pillar).values({ workspaceId: ws.id, name: parsed.data, sortOrder: next }).onConflictDoNothing().run();
  if (!r.changes) return { ok: false, errors: { name: "Chủ đề này đã có." } };
  return done("Đã thêm chủ đề.");
}

export async function renamePillar(_prev: FormState, fd: FormData): Promise<FormState> {
  const ws = await getCurrentWorkspace();
  const id = Number(formString(fd, "id"));
  const parsed = pillarNameSchema.safeParse(formString(fd, "name"));
  if (!parsed.success) return { ok: false, errors: { name: parsed.error.issues[0].message } };
  try {
    getDb()
      .update(pillar)
      .set({ name: parsed.data })
      .where(and(eq(pillar.id, id), eq(pillar.workspaceId, ws.id)))
      .run();
  } catch {
    return { ok: false, errors: { name: "Chủ đề này đã có." } };
  }
  return done("Đã đổi tên.");
}

export async function deletePillar(id: number): Promise<void> {
  const ws = await getCurrentWorkspace();
  getDb().delete(pillar).where(and(eq(pillar.id, id), eq(pillar.workspaceId, ws.id))).run();
  revalidatePath("/cai-dat");
}

export async function addExamplePost(_prev: FormState, fd: FormData): Promise<FormState> {
  const ws = await getCurrentWorkspace();
  const parsed = examplePostSchema.safeParse({
    type: formString(fd, "type"),
    title: formString(fd, "title"),
    format: formString(fd, "format"),
    body: formString(fd, "body"),
    url: formString(fd, "url"),
  });
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const v = parsed.data;
  const title = v.title || v.url || v.body.split(/\r?\n/)[0].slice(0, 100);
  getDb()
    .insert(examplePost)
    .values({
      workspaceId: ws.id,
      type: v.type,
      title,
      format: v.format || null,
      body: v.body || null,
      url: v.url || null,
    })
    .run();
  return done("Đã thêm bài mẫu.");
}

export async function deleteExamplePost(id: number): Promise<void> {
  const ws = await getCurrentWorkspace();
  getDb()
    .delete(examplePost)
    .where(and(eq(examplePost.id, id), eq(examplePost.workspaceId, ws.id)))
    .run();
  revalidatePath("/cai-dat");
}

export async function saveAiSettings(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = aiSettingsSchema.safeParse({
    provider: formString(fd, "provider"),
    monthlyPaidCapUsd: formString(fd, "monthlyPaidCapUsd"),
  });
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const db = getDb();
  setSetting(db, "ai.provider", parsed.data.provider);
  setSetting(db, "cost.monthlyPaidCapUsd", parsed.data.monthlyPaidCapUsd);
  return done("Đã lưu cài đặt AI.");
}

/** Enqueues an ai_test job; the worker runs it. Returns the job id for polling. */
export async function startClaudeTest(): Promise<{ jobId: number }> {
  const ws = await getCurrentWorkspace();
  const j = enqueue(getDb(), { workspaceId: ws.id, type: AI_TEST_JOB });
  revalidatePath("/");
  return { jobId: j.id };
}
