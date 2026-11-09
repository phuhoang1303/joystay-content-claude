import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { job, type Job } from "../db/schema";

export const BASE_BACKOFF_MS = 2_000;

/** 2 s, 8 s, 32 s ... after attempt 1, 2, 3. */
export function backoffMs(attempt: number): number {
  return BASE_BACKOFF_MS * 4 ** Math.max(0, attempt - 1);
}

export function enqueue(
  db: Db,
  p: { workspaceId: number; type: string; payload?: unknown; maxAttempts?: number; now?: Date },
): Job {
  const now = p.now ?? new Date();
  return db
    .insert(job)
    .values({
      workspaceId: p.workspaceId,
      type: p.type,
      payload: JSON.stringify(p.payload ?? {}),
      maxAttempts: p.maxAttempts ?? 3,
      runAfter: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}

/** Atomically takes the oldest due queued job and marks it running. Safe with several workers. */
export function claimNext(db: Db, now: Date = new Date()): Job | undefined {
  const nowMs = now.getTime();
  return db
    .update(job)
    .set({
      status: "running",
      attempts: sql`${job.attempts} + 1`,
      startedAt: now,
      updatedAt: now,
    })
    .where(
      eq(
        job.id,
        sql`(select id from job where status = 'queued' and run_after <= ${nowMs} order by run_after, id limit 1)`,
      ),
    )
    .returning()
    .get();
}

export function markDone(db: Db, id: number, result: unknown, now: Date = new Date()): void {
  db.update(job)
    .set({
      status: "done",
      result: JSON.stringify(result ?? null),
      error: null,
      finishedAt: now,
      updatedAt: now,
    })
    .where(eq(job.id, id))
    .run();
}

/** Re-queues with backoff when retryable and attempts remain; otherwise marks failed. */
export function markFailed(
  db: Db,
  j: Pick<Job, "id" | "attempts" | "maxAttempts">,
  message: string,
  opts: { retryable: boolean; now?: Date },
): "queued" | "failed" {
  const now = opts.now ?? new Date();
  const retry = opts.retryable && j.attempts < j.maxAttempts;
  db.update(job)
    .set(
      retry
        ? {
            status: "queued",
            error: message,
            runAfter: new Date(now.getTime() + backoffMs(j.attempts)),
            updatedAt: now,
          }
        : { status: "failed", error: message, finishedAt: now, updatedAt: now },
    )
    .where(eq(job.id, j.id))
    .run();
  return retry ? "queued" : "failed";
}

/** On worker start: jobs left "running" by a crash go back to the queue. */
export function requeueStale(db: Db): number {
  return db
    .update(job)
    .set({ status: "queued", updatedAt: new Date() })
    .where(eq(job.status, "running"))
    .run().changes;
}

export function getJob(db: Db, id: number): Job | undefined {
  return db.select().from(job).where(eq(job.id, id)).get();
}

export function recentJobs(db: Db, workspaceId: number, limit = 5): Job[] {
  return db
    .select()
    .from(job)
    .where(eq(job.workspaceId, workspaceId))
    .orderBy(desc(job.createdAt), desc(job.id))
    .limit(limit)
    .all();
}
