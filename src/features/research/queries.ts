import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { aiUsage, contentItem, factCard, job, pillar, researchPack, source, weekPlan, type FactCardKind } from "@/lib/db/schema";

const PACK_JOBS = ["research.pack", "research.source", "research.topup"];

function packJobIds(db: Db, packId: number): number[] {
  return db
    .select({ id: job.id })
    .from(job)
    .where(and(inArray(job.type, PACK_JOBS), sql`json_extract(${job.payload}, '$.packId') = ${packId}`))
    .all()
    .map((r) => r.id);
}

export function packCredits(db: Db, packId: number): number {
  const ids = packJobIds(db, packId);
  if (!ids.length) return 0;
  return Number(
    db
      .select({ n: sql<number>`coalesce(sum(${aiUsage.credits}), 0)` })
      .from(aiUsage)
      .where(and(eq(aiUsage.provider, "tavily"), inArray(aiUsage.jobId, ids)))
      .get()?.n ?? 0,
  );
}

export type CardView = { id: number; kind: FactCardKind; text: string; needsCheck: boolean };
export type SourceView = {
  id: number;
  url: string;
  title: string;
  domain: string;
  origin: "auto" | "pasted";
  status: "active" | "dropped";
  summary: string;
  fetchedAt: string | null;
  cards: CardView[];
};

export function getResearchData(workspaceId: number, weekStart: string) {
  const db = getDb();
  const plan = db
    .select()
    .from(weekPlan)
    .where(and(eq(weekPlan.workspaceId, workspaceId), eq(weekPlan.weekStart, weekStart)))
    .get();
  if (!plan) return { plan: null, packs: [] };

  const packs = db
    .select({ pack: researchPack, pillarName: pillar.name })
    .from(researchPack)
    .innerJoin(pillar, eq(pillar.id, researchPack.pillarId))
    .where(eq(researchPack.weekPlanId, plan.id))
    .orderBy(asc(researchPack.id))
    .all()
    .map(({ pack, pillarName }) => {
      const sources = db
        .select()
        .from(source)
        .where(eq(source.researchPackId, pack.id))
        .orderBy(desc(source.priority), asc(source.id))
        .all();
      const cards = db.select().from(factCard).where(eq(factCard.researchPackId, pack.id)).orderBy(asc(factCard.id)).all();
      const bySource = new Map<number, CardView[]>();
      for (const c of cards) {
        const list = bySource.get(c.sourceId) ?? [];
        list.push({ id: c.id, kind: c.kind, text: c.text, needsCheck: c.needsCheck });
        bySource.set(c.sourceId, list);
      }
      const topics = db
        .select({ topic: contentItem.topic, type: contentItem.type, keyword: contentItem.mainKeyword })
        .from(contentItem)
        .where(eq(contentItem.researchPackId, pack.id))
        .all();
      const activeJob = db
        .select({ id: job.id, type: job.type })
        .from(job)
        .where(
          and(
            inArray(job.type, PACK_JOBS),
            inArray(job.status, ["queued", "running"]),
            sql`json_extract(${job.payload}, '$.packId') = ${pack.id}`,
          ),
        )
        .orderBy(desc(job.id))
        .get();
      const active = sources.filter((s) => s.status === "active");
      return {
        id: pack.id,
        pillarName,
        status: pack.status,
        error: pack.error,
        queries: JSON.parse(pack.queries) as string[],
        credits: packCredits(db, pack.id),
        topics,
        activeJob: activeJob ?? null,
        activeSources: active.length,
        activeCards: active.reduce((n, s) => n + (bySource.get(s.id)?.length ?? 0), 0),
        sources: sources.map(
          (s): SourceView => ({
            id: s.id,
            url: s.url,
            title: s.title,
            domain: s.domain,
            origin: s.origin,
            status: s.status,
            summary: s.summary,
            fetchedAt: s.fetchedAt ? s.fetchedAt.toISOString() : null,
            cards: bySource.get(s.id) ?? [],
          }),
        ),
      };
    });
  return { plan: { id: plan.id, status: plan.status }, packs };
}

/** Small snapshot for live polling. */
export function getPackSnapshot(workspaceId: number, weekPlanId: number) {
  const db = getDb();
  return db
    .select({
      id: researchPack.id,
      status: researchPack.status,
      sources: sql<number>`(select count(*) from source s where s.research_pack_id = ${researchPack.id})`,
      running: sql<number>`(select count(*) from job j where j.status in ('queued','running') and j.type in ('research.pack','research.source','research.topup') and json_extract(j.payload, '$.packId') = ${researchPack.id})`,
    })
    .from(researchPack)
    .where(and(eq(researchPack.weekPlanId, weekPlanId), eq(researchPack.workspaceId, workspaceId)))
    .all();
}
