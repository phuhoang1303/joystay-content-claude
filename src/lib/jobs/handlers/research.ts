import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AiProvider } from "../../ai";
import { researchPack } from "../../db/schema";
import { runPastedSource, runResearchPack, runTopup } from "../../research/pipeline";
import { createTavilyClient, type TavilyClient } from "../../research/tavily";
import type { JobContext, JobHandler } from "../runner";

export const RESEARCH_PACK_JOB = "research.pack";
export const RESEARCH_SOURCE_JOB = "research.source";
export const RESEARCH_TOPUP_JOB = "research.topup";

const packPayload = z.object({ packId: z.number().int(), fresh: z.boolean().optional() });
const sourcePayload = z.object({ packId: z.number().int(), url: z.string().min(1).max(2000) });
const topupPayload = z.object({ packId: z.number().int(), keyword: z.string().trim().min(1).max(200) });

export type ResearchHandlerDeps = { tavily?: () => TavilyClient; provider?: AiProvider };

function deps(ctx: JobContext, d: ResearchHandlerDeps) {
  return {
    db: ctx.db,
    tavily: d.tavily ? d.tavily() : createTavilyClient(),
    provider: d.provider,
    jobId: ctx.job.id,
    signal: ctx.signal,
  };
}

function isFinalFailure(ctx: JobContext, err: unknown): boolean {
  const retryable =
    err && typeof err === "object" && "retryable" in err ? Boolean((err as { retryable: unknown }).retryable) : true;
  return !retryable || ctx.job.attempts >= ctx.job.maxAttempts;
}

export function createResearchHandlers(d: ResearchHandlerDeps = {}): Record<string, JobHandler> {
  return {
    [RESEARCH_PACK_JOB]: async (ctx) => {
      const p = packPayload.parse(ctx.payload);
      try {
        return await runResearchPack(deps(ctx, d), p.packId, { fresh: p.fresh });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const final = isFinalFailure(ctx, err);
        ctx.db
          .update(researchPack)
          .set({
            status: final ? "failed" : "queued",
            error: final ? message : `Lỗi tạm thời, đang thử lại: ${message}`,
            updatedAt: new Date(),
          })
          .where(eq(researchPack.id, p.packId))
          .run();
        throw err;
      }
    },
    [RESEARCH_SOURCE_JOB]: async (ctx) => {
      const p = sourcePayload.parse(ctx.payload);
      return runPastedSource(deps(ctx, d), p.packId, p.url);
    },
    [RESEARCH_TOPUP_JOB]: async (ctx) => {
      const p = topupPayload.parse(ctx.payload);
      return runTopup(deps(ctx, d), p.packId, p.keyword);
    },
  };
}
