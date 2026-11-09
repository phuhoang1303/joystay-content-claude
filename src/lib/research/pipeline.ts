import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { AiError, generateText, type AiProvider } from "../ai";
import type { Db } from "../db/client";
import {
  brandProfile,
  contentItem,
  EXCERPT_MAX,
  factCard,
  pillar,
  researchPack,
  source,
  weekPlan,
  type ResearchPack,
} from "../db/schema";
import { packCoverage } from "./coverage";
import { summarisePage, type PageSummary } from "./summarise";
import type { TavilyClient } from "./tavily";
import { withTavilyLogging } from "./tavily-usage";
import { plainText } from "./text";
import { domainOf, isSocialOrVideo, normalizeUrl, rankCandidates, type Candidate } from "./url-filter";

export const MIN_SOURCES_DONE = 8;
export const MAX_SOURCES = 15;
export const RESULTS_PER_QUERY = 8;
export const EXTRACT_BATCH = 5;
export const TOPUP_PAGES = 5;
export const PASTED_PRIORITY = 100;
const SUMMARISE_CONCURRENCY = 3;

export type ResearchDeps = {
  db: Db;
  /** Raw client; the pipeline wraps it so every call is logged to ai_usage. */
  tavily: TavilyClient;
  provider?: AiProvider;
  jobId?: number | null;
  signal?: AbortSignal;
};

/** Error with a Vietnamese message that should not be retried by the job runner. */
export class ResearchError extends Error {
  readonly retryable = false;
}

type PackContext = {
  pack: ResearchPack;
  pillarName: string;
  topics: string[];
  keywords: string[];
  ownDomains: string[];
  focus: string;
};

export function loadPackContext(db: Db, packId: number): PackContext {
  const pack = db.select().from(researchPack).where(eq(researchPack.id, packId)).get();
  if (!pack) throw new ResearchError(`Không tìm thấy gói research #${packId}.`);
  const p = db.select().from(pillar).where(eq(pillar.id, pack.pillarId)).get();
  const plan = db.select().from(weekPlan).where(eq(weekPlan.id, pack.weekPlanId)).get();
  const items = db
    .select()
    .from(contentItem)
    .where(and(eq(contentItem.weekPlanId, pack.weekPlanId), eq(contentItem.pillarId, pack.pillarId)))
    .orderBy(asc(contentItem.sortOrder))
    .all();
  const seo = items.filter((i) => i.type === "seo");
  const topics = (seo.length ? seo : items).map((i) => i.topic).filter(Boolean);
  const keywords = seo.map((i) => i.mainKeyword ?? "").filter(Boolean);
  let configKeywords: string[] = [];
  try {
    const cfg = JSON.parse(plan?.config ?? "{}") as { targetKeywords?: unknown };
    if (Array.isArray(cfg.targetKeywords)) configKeywords = cfg.targetKeywords.map(String);
  } catch {
    /* ignore */
  }
  const profile = db.select().from(brandProfile).where(eq(brandProfile.workspaceId, pack.workspaceId)).get();
  const siteUrl = profile?.website.match(/https?:\/\/[^\s)]+/)?.[0];
  const ownDomains = siteUrl ? [domainOf(siteUrl)] : [];
  const pillarName = p?.name ?? "";
  return {
    pack,
    pillarName,
    topics,
    keywords: [...new Set([...keywords, ...configKeywords])],
    ownDomains,
    focus: [pillarName, ...topics].filter(Boolean).join(" · "),
  };
}

const queriesSchema = z.object({ queries: z.array(z.string().trim().min(3).max(150)).min(1) });

export const QUERIES_SYSTEM = `Bạn lập truy vấn tìm kiếm Google bằng tiếng Việt để nghiên cứu nội dung cho một homestay ở Quận 3, TP.HCM.
Viết 3 đến 4 truy vấn ngắn (3-8 từ), mỗi truy vấn một góc khác nhau, bao phủ các chủ đề và từ khoá được cho. Ưu tiên cách người Việt thực sự gõ tìm kiếm. Không dùng dấu ngoặc kép hay toán tử.
Trả về JSON: {"queries": string[]}`;

async function generateQueries(deps: ResearchDeps, ctx: PackContext): Promise<string[]> {
  const prompt = `Chủ đề (pillar): ${ctx.pillarName}
Các bài SEO tuần này: ${ctx.topics.join("; ") || "(chưa có)"}
Từ khoá: ${ctx.keywords.join("; ") || "(không có)"}`;
  const r = await generateText(
    {
      db: deps.db,
      workspaceId: ctx.pack.workspaceId,
      step: "research.queries",
      jobId: deps.jobId,
      provider: deps.provider,
      signal: deps.signal,
    },
    { tier: "fast", system: QUERIES_SYSTEM, prompt, json: true },
  );
  const parsed = queriesSchema.safeParse(JSON.parse(r.text));
  const fromAi = [...new Set(parsed.success ? parsed.data.queries : [])];
  // Pad with keywords/topics only when the model gave fewer than 3 queries.
  const fallback = [...ctx.keywords, ...ctx.topics, ctx.pillarName].filter(Boolean);
  const out = (fromAi.length >= 3 ? fromAi : [...new Set([...fromAi, ...fallback])].slice(0, 3)).slice(0, 4);
  if (out.length === 0) throw new ResearchError("Không tạo được truy vấn tìm kiếm cho gói này.");
  return out;
}

function packUrls(db: Db, packId: number): Set<string> {
  return new Set(
    db
      .select({ url: source.url })
      .from(source)
      .where(eq(source.researchPackId, packId))
      .all()
      .map((r) => r.url),
  );
}

export function countPackSources(db: Db, packId: number): number {
  return db.select({ n: count() }).from(source).where(eq(source.researchPackId, packId)).get()?.n ?? 0;
}

function excerptOf(text: string): string {
  return plainText(text).slice(0, EXCERPT_MAX);
}

/** Saves one source and its cards. Returns false if the URL is already in the pack. */
function saveSource(
  db: Db,
  pack: ResearchPack,
  page: { url: string; title: string; rawText: string; origin: "auto" | "pasted"; priority: number },
  s: PageSummary,
): boolean {
  return db.transaction((tx) => {
    const row = tx
      .insert(source)
      .values({
        workspaceId: pack.workspaceId,
        researchPackId: pack.id,
        url: page.url,
        title: (s.title || page.title || page.url).slice(0, 300),
        domain: domainOf(page.url),
        origin: page.origin,
        priority: page.priority,
        summary: s.summary,
        excerpt: excerptOf(page.rawText),
        fetchedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: source.id })
      .get();
    if (!row) return false;
    const base = { workspaceId: pack.workspaceId, researchPackId: pack.id, sourceId: row.id };
    const cards = [
      ...s.facts.map((f) => ({ ...base, kind: "fact" as const, text: f.text, needsCheck: f.needs_check })),
      ...s.questions.map((q) => ({ ...base, kind: "question" as const, text: q, needsCheck: false })),
      ...(s.outline.length ? [{ ...base, kind: "outline" as const, text: s.outline.join("\n"), needsCheck: false }] : []),
      ...s.gaps.map((g) => ({ ...base, kind: "gap" as const, text: g, needsCheck: false })),
    ];
    if (cards.length) tx.insert(factCard).values(cards).run();
    return true;
  });
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Errors that mean "stop the whole job" rather than "skip this page". */
function isFatal(err: unknown): boolean {
  if (err instanceof AiError) return err.code !== "bad_output" && !err.retryable;
  return Boolean(err && typeof err === "object" && "retryable" in err && (err as { retryable: boolean }).retryable === false);
}

function saveCandidates(db: Db, packId: number, candidates: Candidate[]) {
  db.update(researchPack)
    .set({ candidates: JSON.stringify(candidates), updatedAt: new Date() })
    .where(eq(researchPack.id, packId))
    .run();
}

/**
 * Extracts pending candidates in batches of 5, summarises each page (raw text is discarded right
 * after), saves sources + cards and persists candidate states after every batch so a retry resumes.
 */
async function processCandidates(
  deps: ResearchDeps,
  ctx: PackContext,
  tavily: TavilyClient,
  candidates: Candidate[],
  origin: "auto" | "pasted",
): Promise<{ saved: number; failed: number }> {
  let saved = 0;
  let failed = 0;
  const known = packUrls(deps.db, ctx.pack.id);
  for (const c of candidates) if (c.state === "pending" && known.has(c.url)) c.state = "done";

  const pending = candidates.filter((c) => c.state === "pending");
  for (let i = 0; i < pending.length; i += EXTRACT_BATCH) {
    const batch = pending.slice(i, i + EXTRACT_BATCH);
    const ex = await tavily.extract(batch.map((c) => c.url));
    for (const f of ex.failed) {
      const c = batch.find((b) => b.url === f.url);
      if (c) Object.assign(c, { state: "failed", error: f.error.slice(0, 200) });
    }
    await mapLimit(ex.results, SUMMARISE_CONCURRENCY, async (page) => {
      const c = batch.find((b) => b.url === page.url);
      if (!c) return;
      try {
        const summary = await summarisePage(
          { db: deps.db, workspaceId: ctx.pack.workspaceId, jobId: deps.jobId, provider: deps.provider, signal: deps.signal },
          { url: page.url, title: c.title, text: page.rawContent, focus: ctx.focus },
        );
        if (!summary.summary && summary.facts.length === 0) {
          Object.assign(c, { state: "failed", error: "không có dữ kiện" });
          failed++;
          return;
        }
        const ok = saveSource(
          deps.db,
          ctx.pack,
          { url: c.url, title: c.title, rawText: page.rawContent, origin, priority: origin === "pasted" ? PASTED_PRIORITY : 0 },
          summary,
        );
        c.state = "done";
        if (ok) saved++;
      } catch (err) {
        if (isFatal(err)) throw err;
        Object.assign(c, { state: "failed", error: (err as Error).message.slice(0, 200) });
        failed++;
      }
    });
    for (const c of batch) if (c.state === "pending") Object.assign(c, { state: "failed", error: "không có nội dung" });
    failed += ex.failed.length;
    saveCandidates(deps.db, ctx.pack.id, candidates);
  }
  return { saved, failed };
}

export type PackResult = { status: "done" | "failed"; sources: number; queries: string[]; message: string };

/** research.pack: queries -> search -> rank -> extract -> summarise. Resumable. */
export async function runResearchPack(
  deps: ResearchDeps,
  packId: number,
  opts: { fresh?: boolean } = {},
): Promise<PackResult> {
  const ctx = loadPackContext(deps.db, packId);
  const tavily = withTavilyLogging(deps.tavily, {
    db: deps.db,
    workspaceId: ctx.pack.workspaceId,
    step: "research.pack",
    jobId: deps.jobId,
  });
  deps.db
    .update(researchPack)
    .set({ status: "running", error: null, updatedAt: new Date() })
    .where(eq(researchPack.id, packId))
    .run();

  let queries: string[] = JSON.parse(ctx.pack.queries);
  let candidates: Candidate[] = JSON.parse(ctx.pack.candidates);

  if (opts.fresh || queries.length === 0) {
    queries = await generateQueries(deps, ctx);
    deps.db.update(researchPack).set({ queries: JSON.stringify(queries) }).where(eq(researchPack.id, packId)).run();
  }

  if (opts.fresh || candidates.length === 0) {
    const sets = [];
    for (const q of queries) sets.push((await tavily.search({ query: q, maxResults: RESULTS_PER_QUERY })).results);
    const have = countPackSources(deps.db, packId);
    const fresh = rankCandidates(sets, {
      ownDomains: ctx.ownDomains,
      exclude: [...packUrls(deps.db, packId), ...candidates.map((c) => c.url)],
      limit: Math.max(TOPUP_PAGES, MAX_SOURCES - have),
    });
    candidates = [...candidates, ...fresh];
    saveCandidates(deps.db, packId, candidates);
  }

  await processCandidates(deps, ctx, tavily, candidates, "auto");

  const sources = countPackSources(deps.db, packId);
  const done = sources >= MIN_SOURCES_DONE;
  const message = done
    ? `Xong: ${sources} nguồn.`
    : `Chỉ lấy được ${sources}/${MIN_SOURCES_DONE} nguồn cần thiết. Thử "Chạy lại" để tìm thêm hoặc dán URL.`;
  deps.db
    .update(researchPack)
    .set({ status: done ? "done" : "failed", error: done ? null : message, updatedAt: new Date() })
    .where(eq(researchPack.id, packId))
    .run();
  if (!done) throw new ResearchError(message);
  return { status: "done", sources, queries, message };
}

/** research.source: one pasted URL, high priority. Social URLs only if extract returns text. */
export async function runPastedSource(deps: ResearchDeps, packId: number, rawUrl: string) {
  const ctx = loadPackContext(deps.db, packId);
  const url = normalizeUrl(rawUrl);
  if (!url) throw new ResearchError("URL không hợp lệ.");
  if (packUrls(deps.db, packId).has(url)) return { url, added: false, message: "URL này đã có trong gói." };

  const tavily = withTavilyLogging(deps.tavily, {
    db: deps.db,
    workspaceId: ctx.pack.workspaceId,
    step: "research.source",
    jobId: deps.jobId,
  });
  const c: Candidate = { url, title: "", score: 1, state: "pending" };
  const r = await processCandidates(deps, ctx, tavily, [c], "pasted");
  if (!r.saved) {
    throw new ResearchError(
      isSocialOrVideo(url)
        ? "Không đọc được nội dung URL mạng xã hội này qua Tavily. Chúng mình không lấy nội dung mạng xã hội bằng cách khác."
        : `Không đọc được nội dung URL này${c.error ? ` (${c.error})` : ""}.`,
    );
  }
  const sources = countPackSources(deps.db, packId);
  const pack = deps.db.select().from(researchPack).where(eq(researchPack.id, packId)).get();
  if (pack?.status === "failed" && sources >= MIN_SOURCES_DONE) {
    deps.db.update(researchPack).set({ status: "done", error: null }).where(eq(researchPack.id, packId)).run();
  }
  return { url, added: true, message: "Đã thêm nguồn." };
}

/** research.topup: one extra query (the keyword) and up to 5 new pages. */
export async function runTopup(deps: ResearchDeps, packId: number, keyword: string) {
  const ctx = loadPackContext(deps.db, packId);
  const tavily = withTavilyLogging(deps.tavily, {
    db: deps.db,
    workspaceId: ctx.pack.workspaceId,
    step: "research.topup",
    jobId: deps.jobId,
  });
  const before = packCoverage(deps.db, packId, keyword);
  const existing: Candidate[] = JSON.parse(ctx.pack.candidates);
  const found = await tavily.search({ query: keyword, maxResults: RESULTS_PER_QUERY });
  const fresh = rankCandidates([found.results], {
    ownDomains: ctx.ownDomains,
    exclude: [...packUrls(deps.db, packId), ...existing.map((c) => c.url)],
    limit: TOPUP_PAGES,
  });
  const all = [...existing, ...fresh];
  saveCandidates(deps.db, packId, all);
  const r = await processCandidates({ ...deps }, { ...ctx, focus: `${ctx.focus} · ${keyword}` }, tavily, all, "auto");
  return { keyword, added: r.saved, coverageBefore: before, coverageAfter: packCoverage(deps.db, packId, keyword) };
}
