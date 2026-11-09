import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { brandProfile, examplePost, pillar } from "@/lib/db/schema";
import { getMonthlyCapUsd, getProviderName } from "@/lib/settings";
import { monthlyTavilyCredits } from "@/lib/research/tavily-usage";
import { getEnvStatus } from "./env-status";

export function getSettingsData(workspaceId: number) {
  const db = getDb();
  return {
    profile: db.select().from(brandProfile).where(eq(brandProfile.workspaceId, workspaceId)).get(),
    pillars: db
      .select()
      .from(pillar)
      .where(eq(pillar.workspaceId, workspaceId))
      .orderBy(asc(pillar.sortOrder), asc(pillar.id))
      .all(),
    examples: db
      .select()
      .from(examplePost)
      .where(eq(examplePost.workspaceId, workspaceId))
      .orderBy(asc(examplePost.type), desc(examplePost.createdAt), desc(examplePost.id))
      .all(),
    provider: getProviderName(db),
    monthlyPaidCapUsd: getMonthlyCapUsd(db),
    env: getEnvStatus(),
    tavilyCredits: monthlyTavilyCredits(db),
  };
}
