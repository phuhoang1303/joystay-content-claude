import { and, eq, gte, lt, sum } from "drizzle-orm";
import type { Db } from "../db/client";
import { aiUsage } from "../db/schema";
import { getMonthlyCapUsd } from "../settings";

export const WARN_RATIO = 0.8;

export function monthRange(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

/** Paid spend this calendar month across all workspaces (the cap is per install). */
export function monthlyPaidSpendUsd(db: Db, now: Date = new Date()): number {
  const { start, end } = monthRange(now);
  const row = db
    .select({ total: sum(aiUsage.costUsd) })
    .from(aiUsage)
    .where(
      and(eq(aiUsage.isPaid, true), gte(aiUsage.createdAt, start), lt(aiUsage.createdAt, end)),
    )
    .get();
  return Number(row?.total ?? 0);
}

export type CapStatus = {
  spendUsd: number;
  capUsd: number;
  ratio: number;
  level: "ok" | "warn" | "blocked";
};

export function capStatus(db: Db, now: Date = new Date()): CapStatus {
  const spendUsd = monthlyPaidSpendUsd(db, now);
  const capUsd = getMonthlyCapUsd(db);
  const ratio = capUsd > 0 ? spendUsd / capUsd : spendUsd > 0 ? Infinity : 0;
  const level = spendUsd >= capUsd ? "blocked" : ratio >= WARN_RATIO ? "warn" : "ok";
  return { spendUsd, capUsd, ratio, level };
}
