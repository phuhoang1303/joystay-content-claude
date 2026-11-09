import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contentItem, job, pillar, researchPack, weekPlan } from "@/lib/db/schema";
import { eventsInWeek } from "@/lib/calendar/vn-events";
import { weekDays } from "@/lib/calendar/week";
import { MIN_COVERAGE, packCoverage } from "@/lib/research/coverage";
import { parseWeekConfig } from "./config";

export type BoardItem = {
  id: number;
  type: "seo" | "social";
  pillarId: number | null;
  topic: string;
  mainKeyword: string | null;
  angle: string;
  socialFormat: "khoanh_khac" | "goc_nhin" | "carousel" | null;
  publishDate: string;
  status: string;
  reason: string;
  researchPackId: number | null;
  /** SEO only, when the pack is done: relevant fact cards for the keyword. */
  coverage: number | null;
};

export function getWeekPlanData(workspaceId: number, weekStart: string) {
  const db = getDb();
  const pillars = db
    .select({ id: pillar.id, name: pillar.name })
    .from(pillar)
    .where(eq(pillar.workspaceId, workspaceId))
    .orderBy(asc(pillar.sortOrder), asc(pillar.id))
    .all();
  const plan = db
    .select()
    .from(weekPlan)
    .where(and(eq(weekPlan.workspaceId, workspaceId), eq(weekPlan.weekStart, weekStart)))
    .get();
  const days = weekDays(weekStart);
  const events = eventsInWeek(weekStart);
  if (!plan) return { plan: null, pillars, days, events, items: [], packs: [], activeJobs: [], config: null };

  const packs = db.select().from(researchPack).where(eq(researchPack.weekPlanId, plan.id)).all();
  const packStatus = new Map(packs.map((p) => [p.id, p.status]));
  const items: BoardItem[] = db
    .select()
    .from(contentItem)
    .where(eq(contentItem.weekPlanId, plan.id))
    .orderBy(asc(contentItem.publishDate), asc(contentItem.sortOrder), asc(contentItem.id))
    .all()
    .map((i) => ({
      id: i.id,
      type: i.type,
      pillarId: i.pillarId,
      topic: i.topic,
      mainKeyword: i.mainKeyword,
      angle: i.angle,
      socialFormat: i.socialFormat,
      publishDate: i.publishDate,
      status: i.status,
      reason: i.reason,
      researchPackId: i.researchPackId,
      coverage:
        i.type === "seo" && i.researchPackId && i.mainKeyword && packStatus.get(i.researchPackId) === "done"
          ? packCoverage(db, i.researchPackId, i.mainKeyword)
          : null,
    }));

  // Jobs still running for this plan (survives a page reload).
  const activeJobs = db
    .select({ id: job.id, type: job.type, payload: job.payload, status: job.status })
    .from(job)
    .where(
      and(
        eq(job.workspaceId, workspaceId),
        inArray(job.status, ["queued", "running"]),
        inArray(job.type, ["plan.generate", "plan.regenerate_item", "research.topup"]),
        sql`(json_extract(${job.payload}, '$.weekPlanId') = ${plan.id}
          or json_extract(${job.payload}, '$.itemId') in (select id from content_item where week_plan_id = ${plan.id})
          or json_extract(${job.payload}, '$.packId') in (select id from research_pack where week_plan_id = ${plan.id}))`,
      ),
    )
    .orderBy(desc(job.id))
    .all()
    .map((j) => ({ id: j.id, type: j.type, payload: JSON.parse(j.payload) as Record<string, number | string> }));

  return {
    plan: { id: plan.id, weekStart: plan.weekStart, status: plan.status },
    config: parseWeekConfig(plan.config, pillars.map((p) => p.id)),
    pillars,
    days,
    events,
    items,
    packs: packs.map((p) => ({ id: p.id, pillarId: p.pillarId, status: p.status })),
    activeJobs,
  };
}

export { MIN_COVERAGE };
