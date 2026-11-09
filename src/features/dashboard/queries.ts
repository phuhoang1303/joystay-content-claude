import "server-only";
import { and, count, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { aiUsage } from "@/lib/db/schema";
import { capStatus, monthRange } from "@/lib/cost/cap";
import { recentJobs } from "@/lib/jobs/queue";

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
    jobs: recentJobs(db, workspaceId, 5),
  };
}
