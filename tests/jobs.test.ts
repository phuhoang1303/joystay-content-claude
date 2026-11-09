import { describe, expect, it } from "vitest";
import { AiError } from "@/lib/ai";
import { createFakeProvider } from "@/lib/ai/fake";
import { aiUsage } from "@/lib/db/schema";
import { AI_TEST_JOB, createAiTestHandler } from "@/lib/jobs/handlers/ai-test";
import {
  backoffMs,
  claimNext,
  enqueue,
  getJob,
  recentJobs,
  requeueStale,
} from "@/lib/jobs/queue";
import { runOnce, type JobRegistry } from "@/lib/jobs/runner";
import { setupDb } from "./helpers";

describe("job queue", () => {
  it("claims the oldest due job once and marks it running", () => {
    const { db, workspaceId } = setupDb();
    const a = enqueue(db, { workspaceId, type: "x" });
    enqueue(db, { workspaceId, type: "x" });

    const claimed = claimNext(db);
    expect(claimed?.id).toBe(a.id);
    expect(claimed?.status).toBe("running");
    expect(claimed?.attempts).toBe(1);

    const second = claimNext(db);
    expect(second?.id).not.toBe(a.id);
    expect(claimNext(db)).toBeUndefined();
  });

  it("does not claim jobs scheduled in the future", () => {
    const { db, workspaceId } = setupDb();
    enqueue(db, { workspaceId, type: "x" });
    expect(claimNext(db, new Date(Date.now() - 60_000))).toBeUndefined();
  });

  it("backoff grows 2s, 8s, 32s", () => {
    expect([1, 2, 3].map(backoffMs)).toEqual([2_000, 8_000, 32_000]);
  });

  it("requeues jobs left running after a crash", () => {
    const { db, workspaceId } = setupDb();
    const j = enqueue(db, { workspaceId, type: "x" });
    claimNext(db);
    expect(requeueStale(db)).toBe(1);
    expect(getJob(db, j.id)?.status).toBe("queued");
  });
});

describe("runOnce", () => {
  it("returns idle when nothing is queued", async () => {
    const { db } = setupDb();
    expect(await runOnce(db, {})).toEqual({ kind: "idle" });
  });

  it("runs a handler and stores the result", async () => {
    const { db, workspaceId } = setupDb();
    const j = enqueue(db, { workspaceId, type: "echo", payload: { n: 2 } });
    const registry: JobRegistry = {
      echo: async ({ payload }) => ({ doubled: (payload as { n: number }).n * 2 }),
    };
    expect(await runOnce(db, registry)).toEqual({ kind: "done", jobId: j.id });
    const after = getJob(db, j.id)!;
    expect(after.status).toBe("done");
    expect(JSON.parse(after.result!)).toEqual({ doubled: 4 });
    expect(after.finishedAt).toBeInstanceOf(Date);
  });

  it("retries with backoff, then fails after max attempts", async () => {
    const { db, workspaceId } = setupDb();
    const j = enqueue(db, { workspaceId, type: "boom" });
    const registry: JobRegistry = {
      boom: async () => {
        throw new Error("hỏng");
      },
    };
    let clock = Date.now();
    const now = () => new Date(clock);

    const r1 = await runOnce(db, registry, { now });
    expect(r1.kind).toBe("retry");
    const q1 = getJob(db, j.id)!;
    expect(q1.status).toBe("queued");
    expect(q1.runAfter.getTime()).toBe(clock + 2_000);

    // Not due yet
    expect((await runOnce(db, registry, { now })).kind).toBe("idle");

    clock += 2_000;
    expect((await runOnce(db, registry, { now })).kind).toBe("retry");
    clock += 8_000;
    const r3 = await runOnce(db, registry, { now });
    expect(r3.kind).toBe("failed");

    const final = getJob(db, j.id)!;
    expect(final.status).toBe("failed");
    expect(final.attempts).toBe(3);
    expect(final.error).toBe("hỏng");
  });

  it("does not retry non-retryable errors", async () => {
    const { db, workspaceId } = setupDb();
    const j = enqueue(db, { workspaceId, type: "x" });
    const registry: JobRegistry = {
      x: async () => {
        throw new AiError("not_installed", "Không tìm thấy lệnh claude");
      },
    };
    expect((await runOnce(db, registry)).kind).toBe("failed");
    expect(getJob(db, j.id)?.attempts).toBe(1);
  });

  it("fails unknown job types without crashing", async () => {
    const { db, workspaceId } = setupDb();
    const j = enqueue(db, { workspaceId, type: "nope" });
    const r = await runOnce(db, {});
    expect(r.kind).toBe("failed");
    expect(getJob(db, j.id)?.error).toContain("nope");
  });

  it("lists recent jobs newest first", () => {
    const { db, workspaceId } = setupDb();
    const ids = [1, 2, 3].map(() => enqueue(db, { workspaceId, type: "x" }).id);
    expect(recentJobs(db, workspaceId, 2).map((j) => j.id)).toEqual([ids[2], ids[1]]);
  });
});

describe("ai_test job with fake provider", () => {
  it("goes queued -> done, stores the reply and one usage row", async () => {
    const { db, workspaceId } = setupDb();
    const provider = createFakeProvider({ reply: "Chào anh chị chủ Joystay!" });
    const j = enqueue(db, { workspaceId, type: AI_TEST_JOB });
    expect(j.status).toBe("queued");

    await runOnce(db, { [AI_TEST_JOB]: createAiTestHandler(provider) });

    const done = getJob(db, j.id)!;
    expect(done.status).toBe("done");
    const result = JSON.parse(done.result!);
    expect(result.reply).toBe("Chào anh chị chủ Joystay!");
    expect(provider.calls[0].tier).toBe("fast");

    const usage = db.select().from(aiUsage).all();
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ step: AI_TEST_JOB, jobId: j.id, ok: true, id: result.usageId });
  });

  it("fails with the Vietnamese error when claude is missing", async () => {
    const { db, workspaceId } = setupDb();
    const provider = createFakeProvider({
      error: new AiError("not_installed", 'Không tìm thấy lệnh "claude" trên máy.'),
    });
    const j = enqueue(db, { workspaceId, type: AI_TEST_JOB });
    await runOnce(db, { [AI_TEST_JOB]: createAiTestHandler(provider) });
    const failed = getJob(db, j.id)!;
    expect(failed.status).toBe("failed");
    expect(failed.error).toContain("Không tìm thấy");
    expect(db.select().from(aiUsage).all()[0].ok).toBe(false);
  });
});
