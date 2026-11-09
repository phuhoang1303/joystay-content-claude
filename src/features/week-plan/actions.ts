"use server";

import { revalidatePath } from "next/cache";
import { and, eq, max } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { contentItem, pillar, researchPack, SOCIAL_FORMATS, weekPlan } from "@/lib/db/schema";
import { isInWeek, isWeekStart } from "@/lib/calendar/week";
import { PLAN_GENERATE_JOB, PLAN_REGENERATE_ITEM_JOB } from "@/lib/jobs/handlers/plan";
import { RESEARCH_TOPUP_JOB } from "@/lib/jobs/handlers/research";
import { enqueue } from "@/lib/jobs/queue";
import { MIN_COVERAGE, packCoverage } from "@/lib/research/coverage";
import { getCurrentWorkspace } from "@/features/workspace/server";
import { defaultWeekConfig, weekConfigSchema } from "./config";
import { lockWeek, unlockWeek } from "./lock";

export type ActionResult = { ok: boolean; message?: string; jobId?: number };

const fail = (message: string): ActionResult => ({ ok: false, message });

function refresh() {
  revalidatePath("/ke-hoach-tuan");
  revalidatePath("/research");
  revalidatePath("/");
}

async function loadPlan(planId: number) {
  const ws = await getCurrentWorkspace();
  const plan = getDb()
    .select()
    .from(weekPlan)
    .where(and(eq(weekPlan.id, planId), eq(weekPlan.workspaceId, ws.id)))
    .get();
  return { ws, plan };
}

async function loadDraftItem(itemId: number) {
  const ws = await getCurrentWorkspace();
  const db = getDb();
  const item = db
    .select()
    .from(contentItem)
    .where(and(eq(contentItem.id, itemId), eq(contentItem.workspaceId, ws.id)))
    .get();
  if (!item) return { error: "Không tìm thấy bài này." } as const;
  const plan = db.select().from(weekPlan).where(eq(weekPlan.id, item.weekPlanId)).get()!;
  if (plan.status === "locked") return { error: "Tuần đã chốt. Mở khoá để sửa." } as const;
  return { item, plan, ws } as const;
}

export async function createWeekPlan(weekStart: string): Promise<ActionResult> {
  if (!isWeekStart(weekStart)) return fail("Tuần không hợp lệ.");
  const ws = await getCurrentWorkspace();
  const db = getDb();
  const pillarIds = db.select({ id: pillar.id }).from(pillar).where(eq(pillar.workspaceId, ws.id)).orderBy(pillar.sortOrder, pillar.id).all().map((p) => p.id);
  if (pillarIds.length === 0) return fail("Chưa có chủ đề nào. Thêm chủ đề trong Cài đặt trước.");
  db.insert(weekPlan)
    .values({ workspaceId: ws.id, weekStart, config: JSON.stringify(defaultWeekConfig(pillarIds)) })
    .onConflictDoNothing()
    .run();
  refresh();
  return { ok: true };
}

export async function saveWeekConfig(planId: number, raw: unknown): Promise<ActionResult> {
  const { ws, plan } = await loadPlan(planId);
  if (!plan) return fail("Không tìm thấy kế hoạch tuần.");
  if (plan.status === "locked") return fail("Tuần đã chốt. Mở khoá để sửa cấu hình.");
  const parsed = weekConfigSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Cấu hình không hợp lệ.");
  const db = getDb();
  const valid = new Set(db.select({ id: pillar.id }).from(pillar).where(eq(pillar.workspaceId, ws.id)).all().map((p) => p.id));
  if (parsed.data.seo.some((s) => !valid.has(s.pillarId))) return fail("Có chủ đề không còn tồn tại.");
  db.update(weekPlan).set({ config: JSON.stringify(parsed.data), updatedAt: new Date() }).where(eq(weekPlan.id, planId)).run();
  refresh();
  return { ok: true, message: "Đã lưu cấu hình tuần." };
}

export async function startGeneratePlan(planId: number): Promise<ActionResult> {
  const { ws, plan } = await loadPlan(planId);
  if (!plan) return fail("Không tìm thấy kế hoạch tuần.");
  if (plan.status === "locked") return fail("Tuần đã chốt.");
  const j = enqueue(getDb(), { workspaceId: ws.id, type: PLAN_GENERATE_JOB, payload: { weekPlanId: planId }, maxAttempts: 2 });
  refresh();
  return { ok: true, jobId: j.id };
}

const itemPatch = z.object({
  topic: z.string().trim().min(1, "Cần nhập đề tài").max(200),
  mainKeyword: z.string().trim().max(120).optional(),
  angle: z.string().trim().max(500).default(""),
  pillarId: z.number().int().nullable(),
  socialFormat: z.enum(SOCIAL_FORMATS).nullable().optional(),
});

export async function updateItem(itemId: number, raw: unknown): Promise<ActionResult> {
  const r = await loadDraftItem(itemId);
  if ("error" in r) return fail(r.error as string);
  const parsed = itemPatch.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ.");
  const v = parsed.data;
  if (r.item.type === "seo" && !v.mainKeyword) return fail("Bài SEO cần từ khoá chính.");
  if (r.item.type === "social" && !v.socialFormat) return fail("Bài social cần định dạng.");
  getDb()
    .update(contentItem)
    .set({
      topic: v.topic,
      angle: v.angle,
      pillarId: v.pillarId,
      mainKeyword: r.item.type === "seo" ? v.mainKeyword : null,
      socialFormat: r.item.type === "social" ? v.socialFormat : null,
      updatedAt: new Date(),
    })
    .where(eq(contentItem.id, itemId))
    .run();
  refresh();
  return { ok: true };
}

export async function moveItem(itemId: number, date: string): Promise<ActionResult> {
  const r = await loadDraftItem(itemId);
  if ("error" in r) return fail(r.error as string);
  if (!isInWeek(date, r.plan.weekStart)) return fail("Ngày nằm ngoài tuần.");
  getDb().update(contentItem).set({ publishDate: date, updatedAt: new Date() }).where(eq(contentItem.id, itemId)).run();
  refresh();
  return { ok: true };
}

export async function deleteItem(itemId: number): Promise<ActionResult> {
  const r = await loadDraftItem(itemId);
  if ("error" in r) return fail(r.error as string);
  getDb().delete(contentItem).where(eq(contentItem.id, itemId)).run();
  refresh();
  return { ok: true };
}

export async function addItem(planId: number, raw: unknown): Promise<ActionResult> {
  const { ws, plan } = await loadPlan(planId);
  if (!plan) return fail("Không tìm thấy kế hoạch tuần.");
  if (plan.status === "locked") return fail("Tuần đã chốt. Mở khoá để thêm bài.");
  const parsed = z
    .object({
      type: z.enum(["seo", "social"]),
      publishDate: z.string(),
      topic: z.string().trim().min(1, "Cần nhập đề tài").max(200),
      pillarId: z.number().int().nullable(),
      mainKeyword: z.string().trim().max(120).optional(),
      socialFormat: z.enum(SOCIAL_FORMATS).optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ.");
  const v = parsed.data;
  if (!isInWeek(v.publishDate, plan.weekStart)) return fail("Ngày nằm ngoài tuần.");
  if (v.type === "seo" && !v.mainKeyword) return fail("Bài SEO cần từ khoá chính.");
  const db = getDb();
  const next = (db.select({ m: max(contentItem.sortOrder) }).from(contentItem).where(eq(contentItem.weekPlanId, planId)).get()?.m ?? 0) + 1;
  db.insert(contentItem)
    .values({
      workspaceId: ws.id,
      weekPlanId: planId,
      type: v.type,
      pillarId: v.pillarId,
      topic: v.topic,
      mainKeyword: v.type === "seo" ? v.mainKeyword : null,
      socialFormat: v.type === "social" ? (v.socialFormat ?? "khoanh_khac") : null,
      publishDate: v.publishDate,
      reason: "Thêm thủ công",
      sortOrder: next,
    })
    .run();
  refresh();
  return { ok: true };
}

export async function regenerateItemAction(itemId: number): Promise<ActionResult> {
  const r = await loadDraftItem(itemId);
  if ("error" in r) return fail(r.error as string);
  const j = enqueue(getDb(), { workspaceId: r.ws.id, type: PLAN_REGENERATE_ITEM_JOB, payload: { itemId }, maxAttempts: 2 });
  return { ok: true, jobId: j.id };
}

export async function lockWeekAction(planId: number): Promise<ActionResult> {
  const { plan } = await loadPlan(planId);
  if (!plan) return fail("Không tìm thấy kế hoạch tuần.");
  if (plan.status === "locked") return fail("Tuần đã chốt.");
  try {
    const r = lockWeek(getDb(), planId);
    refresh();
    return {
      ok: true,
      message: r.packsCreated ? `Đã chốt tuần. Đang tạo ${r.packsCreated} gói research.` : "Đã chốt tuần. Các gói research đã có từ trước.",
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Không chốt được tuần.");
  }
}

export async function unlockWeekAction(planId: number): Promise<ActionResult> {
  const { plan } = await loadPlan(planId);
  if (!plan) return fail("Không tìm thấy kế hoạch tuần.");
  unlockWeek(getDb(), planId);
  refresh();
  return { ok: true, message: "Đã mở khoá. Gói research hiện có được giữ nguyên." };
}

export async function topupAction(itemId: number): Promise<ActionResult> {
  const ws = await getCurrentWorkspace();
  const db = getDb();
  const item = db.select().from(contentItem).where(and(eq(contentItem.id, itemId), eq(contentItem.workspaceId, ws.id))).get();
  if (!item || item.type !== "seo" || !item.mainKeyword || !item.researchPackId) return fail("Bài này chưa có gói research.");
  const pack = db.select().from(researchPack).where(eq(researchPack.id, item.researchPackId)).get();
  if (pack?.status !== "done") return fail("Gói research chưa xong.");
  const coverage = packCoverage(db, pack.id, item.mainKeyword);
  if (coverage >= MIN_COVERAGE) return fail(`Đã đủ ${coverage} thẻ dữ kiện cho từ khoá này.`);
  const j = enqueue(db, { workspaceId: ws.id, type: RESEARCH_TOPUP_JOB, payload: { packId: pack.id, keyword: item.mainKeyword } });
  return { ok: true, jobId: j.id };
}
