import { NextResponse } from "next/server";
import { getPackSnapshot } from "@/features/research/queries";
import { getCurrentWorkspace } from "@/features/workspace/server";

export const dynamic = "force-dynamic";

/** Live pack status for the Research tab (no source text). */
export async function GET(_req: Request, { params }: { params: Promise<{ weekPlanId: string }> }) {
  const { weekPlanId } = await params;
  const ws = await getCurrentWorkspace();
  return NextResponse.json({ packs: getPackSnapshot(ws.id, Number(weekPlanId)) });
}
