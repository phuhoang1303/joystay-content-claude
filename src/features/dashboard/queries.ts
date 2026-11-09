import "server-only";
import { and, count, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { aiUsage, contentItem, researchPack, weekPlan } from "@/lib/db/schema";
import { capStatus, monthRange } from "@/lib/cost/cap";
import { currentWeekStart, nextWeekStart } from "@/lib/calendar/week";
import { recentJobs } from "@/lib/jobs/queue";
import { monthlyTavilyCredits, TAVILY_FREE_CREDITS } from "@/lib/research/tavily-usage";

function weekSummary(workspaceId: number, weekStart: string) {
  const db = getDb();
  const plan = db
    .select()
    .from(weekPlan)
    .where(and(eq(weekPlan.workspaceId, workspaceId), eq(weekPlan.weekStart, weekStart)))
    .get();
  if (!plan) return { weekStart, status: null, seo: 0, social: 0, packs: {} as Record<string, number> };
  const items = db
    .select({ type: contentItem.type, n: count() })
    .from(contentItem)
    .where(eq(contentItem.weekPlanId, plan.id))
    .groupBy(contentItem.type)
    .all();
  const packs = db
    .select({ status: researchPack.status, n: count() })
    .from(researchPack)
    .where(eq(researchPack.weekPlanId, plan.id))
    .groupBy(researchPack.status)
    .all();
  return {
    weekStart,
    status: plan.status,
    seo: items.find((i) => i.type === "seo")?.n ?? 0,
    social: items.find((i) => i.type === "social")?.n ?? 0,
    packs: Object.fromEntries(packs.map((p) => [p.status, p.n])) as Record<string, number>,
  };
}

export function getDashboardData(workspaceId: number, now: Date = new Date()) {
  const db = getDb();
  const { start, end } = monthRange(now);
  const byProvider = db
    .select({
      provider: aiUsage.provider,
      calls: count(),
      failed: sql<number>`sum(case when ${aiUsage.ok} = 0 then 1 else 0 end)`,
    })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.workspaceId, workspaceId),
        gte(aiUsage.createdAt, start),
        lt(aiUsage.createdAt, end),
      ),
    )
    .groupBy(aiUsage.provider)
    .all();

  return {
    monthLabel: `tháng ${now.getMonth() + 1}/${now.getFullYear()}`,
    byProvider,
    totalCalls: byProvider.reduce((s, r) => s + r.calls, 0),
    cap: capStatus(db, now),
    tavily: { used: monthlyTavilyCredits(db, now), free: TAVILY_FREE_CREDITS },
    weeks: [weekSummary(workspaceId, currentWeekStart(now)), weekSummary(workspaceId, nextWeekStart(now))],
    jobs: recentJobs(db, workspaceId, 5),
  };
}
