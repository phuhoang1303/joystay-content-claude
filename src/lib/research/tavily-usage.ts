import { and, eq, gte, lt, sum } from "drizzle-orm";
import type { Db } from "../db/client";
import { aiUsage } from "../db/schema";
import { capStatus, monthRange } from "../cost/cap";
import { TavilyError, type TavilyClient } from "./tavily";

export const TAVILY_FREE_CREDITS = 1_000;
export const TAVILY_USD_PER_CREDIT = 0.008;

export function monthlyTavilyCredits(db: Db, now: Date = new Date()): number {
  const { start, end } = monthRange(now);
  const row = db
    .select({ total: sum(aiUsage.credits) })
    .from(aiUsage)
    .where(and(eq(aiUsage.provider, "tavily"), gte(aiUsage.createdAt, start), lt(aiUsage.createdAt, end)))
    .get();
  return Number(row?.total ?? 0);
}

/** Splits a call's credits into free and paid parts given what the month already used. */
export function priceCredits(usedBefore: number, credits: number): { paidCredits: number; costUsd: number } {
  const freeLeft = Math.max(0, TAVILY_FREE_CREDITS - usedBefore);
  const paidCredits = Math.max(0, credits - freeLeft);
  return { paidCredits, costUsd: Number((paidCredits * TAVILY_USD_PER_CREDIT).toFixed(4)) };
}

export type TavilyCallContext = {
  db: Db;
  workspaceId: number;
  step: string;
  jobId?: number | null;
};

/**
 * Wraps a client so every call writes one ai_usage row (provider "tavily", model search/extract,
 * credits). Beyond the free 1,000 credits a month calls are paid and respect the paid cap.
 */
export function withTavilyLogging(client: TavilyClient, ctx: TavilyCallContext): TavilyClient {
  function guard() {
    if (monthlyTavilyCredits(ctx.db) >= TAVILY_FREE_CREDITS && capStatus(ctx.db).level === "blocked") {
      const err = new TavilyError(
        "cap_reached",
        "Đã dùng hết 1.000 credit Tavily miễn phí và chạm hạn mức chi phí tháng này. Tăng hạn mức trong Cài đặt nếu muốn tiếp tục.",
      );
      log("search", { ok: false, error: err.message, credits: 0, durationMs: 0 });
      throw err;
    }
  }

  function log(
    model: "search" | "extract",
    r: { ok: boolean; error?: string; credits: number; durationMs: number; inputChars?: number; outputChars?: number },
  ) {
    const { paidCredits, costUsd } = priceCredits(monthlyTavilyCredits(ctx.db), r.credits);
    ctx.db
      .insert(aiUsage)
      .values({
        workspaceId: ctx.workspaceId,
        step: ctx.step,
        provider: "tavily",
        model,
        credits: r.credits,
        costUsd,
        isPaid: paidCredits > 0,
        ok: r.ok,
        error: r.error?.slice(0, 1000) ?? null,
        inputChars: r.inputChars ?? 0,
        outputChars: r.outputChars ?? 0,
        durationMs: r.durationMs,
        jobId: ctx.jobId ?? null,
      })
      .run();
  }

  return {
    async search(p) {
      guard();
      const started = Date.now();
      try {
        const r = await client.search(p);
        log("search", {
          ok: true,
          credits: r.credits,
          durationMs: Date.now() - started,
          inputChars: p.query.length,
          outputChars: r.results.length,
        });
        return r;
      } catch (err) {
        // Failed requests are not billed by Tavily.
        log("search", { ok: false, error: (err as Error).message, credits: 0, durationMs: Date.now() - started });
        throw err;
      }
    },
    async extract(urls) {
      guard();
      const started = Date.now();
      try {
        const r = await client.extract(urls);
        log("extract", {
          ok: true,
          credits: r.credits,
          durationMs: Date.now() - started,
          inputChars: urls.length,
          outputChars: r.results.length,
        });
        return r;
      } catch (err) {
        log("extract", { ok: false, error: (err as Error).message, credits: 0, durationMs: Date.now() - started });
        throw err;
      }
    },
  };
}
