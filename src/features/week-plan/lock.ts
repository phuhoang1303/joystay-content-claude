/** Lock/unlock logic, shared by the server action and tests. */
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { contentItem, researchPack, weekPlan } from "@/lib/db/schema";
import { RESEARCH_PACK_JOB } from "@/lib/jobs/handlers/research";
import { enqueue } from "@/lib/jobs/queue";

/**
 * Locks the week, creates one research pack per distinct SEO pillar (only those that do not exist
 * yet), enqueues research.pack for new packs, and links every item to the pack of its pillar.
 */
export function lockWeek(db: Db, weekPlanId: number): { packsCreated: number; jobIds: number[] } {
  return db.transaction((tx) => {
    const plan = tx.select().from(weekPlan).where(eq(weekPlan.id, weekPlanId)).get();
    if (!plan) throw new Error("Không tìm thấy kế hoạch tuần.");
    const items = tx.select().from(contentItem).where(eq(contentItem.weekPlanId, weekPlanId)).all();
    if (items.length === 0) throw new Error("Tuần chưa có bài nào để chốt.");
    const missing = items.filter((i) => !i.topic.trim() || (i.type === "seo" && !i.mainKeyword?.trim()));
    if (missing.length) throw new Error(`Còn ${missing.length} bài thiếu đề tài hoặc từ khoá chính.`);

    tx.update(weekPlan).set({ status: "locked", lockedAt: new Date(), updatedAt: new Date() }).where(eq(weekPlan.id, weekPlanId)).run();

    const seoPillars = [...new Set(items.filter((i) => i.type === "seo" && i.pillarId).map((i) => i.pillarId as number))];
    const jobIds: number[] = [];
    let packsCreated = 0;
    for (const pillarId of seoPillars) {
      const created = tx
        .insert(researchPack)
        .values({ workspaceId: plan.workspaceId, weekPlanId, pillarId })
        .onConflictDoNothing()
        .returning()
        .get();
      if (created) {
        packsCreated++;
        jobIds.push(enqueue(tx as unknown as Db, { workspaceId: plan.workspaceId, type: RESEARCH_PACK_JOB, payload: { packId: created.id } }).id);
      }
    }

    const packs = tx.select().from(researchPack).where(eq(researchPack.weekPlanId, weekPlanId)).all();
    for (const pack of packs) {
      tx.update(contentItem)
        .set({ researchPackId: pack.id })
        .where(and(eq(contentItem.weekPlanId, weekPlanId), eq(contentItem.pillarId, pack.pillarId)))
        .run();
    }
    const linkedPillars = packs.map((p) => p.pillarId);
    const unlinked = items.filter((i) => !i.pillarId || !linkedPillars.includes(i.pillarId)).map((i) => i.id);
    if (unlinked.length) {
      tx.update(contentItem).set({ researchPackId: null }).where(inArray(contentItem.id, unlinked)).run();
    }
    return { packsCreated, jobIds };
  });
}

export function unlockWeek(db: Db, weekPlanId: number): void {
  db.update(weekPlan).set({ status: "draft", updatedAt: new Date() }).where(eq(weekPlan.id, weekPlanId)).run();
}
