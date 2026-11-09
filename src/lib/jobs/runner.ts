import type { Db } from "../db/client";
import type { Job } from "../db/schema";
import { claimNext, markDone, markFailed } from "./queue";

export type JobContext = {
  db: Db;
  job: Job;
  payload: unknown;
  signal: AbortSignal;
};

export type JobHandler = (ctx: JobContext) => Promise<unknown>;
export type JobRegistry = Record<string, JobHandler>;

/** Errors may set `retryable: false` (e.g. AiError not_installed) to skip retries. */
function isRetryable(err: unknown): boolean {
  if (err && typeof err === "object" && "retryable" in err) {
    return Boolean((err as { retryable: unknown }).retryable);
  }
  return true;
}

function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 2000) || "Lỗi không rõ.";
}

export type RunOutcome =
  | { kind: "idle" }
  | { kind: "done"; jobId: number }
  | { kind: "retry" | "failed"; jobId: number; error: string };

/** Claims and runs at most one job. Never throws for handler errors. */
export async function runOnce(
  db: Db,
  registry: JobRegistry,
  opts: { signal?: AbortSignal; now?: () => Date } = {},
): Promise<RunOutcome> {
  const now = opts.now ?? (() => new Date());
  const j = claimNext(db, now());
  if (!j) return { kind: "idle" };

  const handler = registry[j.type];
  if (!handler) {
    const error = `Không có bộ xử lý cho loại job "${j.type}".`;
    markFailed(db, j, error, { retryable: false, now: now() });
    return { kind: "failed", jobId: j.id, error };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(j.payload);
  } catch {
    payload = {};
  }

  try {
    const result = await handler({
      db,
      job: j,
      payload,
      signal: opts.signal ?? new AbortController().signal,
    });
    markDone(db, j.id, result, now());
    return { kind: "done", jobId: j.id };
  } catch (err) {
    const error = errorMessage(err);
    const state = markFailed(db, j, error, { retryable: isRetryable(err), now: now() });
    return { kind: state === "queued" ? "retry" : "failed", jobId: j.id, error };
  }
}
