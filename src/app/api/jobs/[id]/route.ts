import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { aiUsage } from "@/lib/db/schema";
import { getJob } from "@/lib/jobs/queue";
import { getCurrentWorkspace } from "@/features/workspace/server";

export const dynamic = "force-dynamic";

/** Job status for UI polling. Returns usage rows linked to the job (no secrets stored there). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getCurrentWorkspace();
  const db = getDb();
  const j = getJob(db, Number(id));
  if (!j || j.workspaceId !== ws.id) {
    return NextResponse.json({ error: "Không tìm thấy job." }, { status: 404 });
  }
  const usage = db
    .select({
      id: aiUsage.id,
      provider: aiUsage.provider,
      model: aiUsage.model,
      inputTokens: aiUsage.inputTokens,
      outputTokens: aiUsage.outputTokens,
      costUsd: aiUsage.costUsd,
      ok: aiUsage.ok,
      durationMs: aiUsage.durationMs,
      createdAt: aiUsage.createdAt,
    })
    .from(aiUsage)
    .where(eq(aiUsage.jobId, j.id))
    .all();
  return NextResponse.json({
    id: j.id,
    type: j.type,
    status: j.status,
    attempts: j.attempts,
    maxAttempts: j.maxAttempts,
    result: j.result ? JSON.parse(j.result) : null,
    error: j.error,
    usage,
  });
}
