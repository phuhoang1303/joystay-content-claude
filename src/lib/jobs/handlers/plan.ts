import { z } from "zod";
import type { AiProvider } from "../../ai";
import { generateWeekPlan, regenerateItem } from "@/features/week-plan/generate";
import type { JobHandler } from "../runner";

export const PLAN_GENERATE_JOB = "plan.generate";
export const PLAN_REGENERATE_ITEM_JOB = "plan.regenerate_item";

export function createPlanHandlers(d: { provider?: AiProvider } = {}): Record<string, JobHandler> {
  return {
    [PLAN_GENERATE_JOB]: async (ctx) => {
      const { weekPlanId } = z.object({ weekPlanId: z.number().int() }).parse(ctx.payload);
      return generateWeekPlan({ db: ctx.db, provider: d.provider, jobId: ctx.job.id, signal: ctx.signal }, weekPlanId);
    },
    [PLAN_REGENERATE_ITEM_JOB]: async (ctx) => {
      const { itemId } = z.object({ itemId: z.number().int() }).parse(ctx.payload);
      return regenerateItem({ db: ctx.db, provider: d.provider, jobId: ctx.job.id, signal: ctx.signal }, itemId);
    },
  };
}
