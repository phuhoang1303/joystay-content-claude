import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AiError } from "@/lib/ai";
import { createFakeProvider } from "@/lib/ai/fake";
import type { Db } from "@/lib/db/client";
import {
  aiUsage,
  brandProfile,
  contentItem,
  factCard,
  pillar,
  researchPack,
  source,
  weekPlan,
} from "@/lib/db/schema";
import { packCoverage } from "@/lib/research/coverage";
import { createFakeTavily } from "@/lib/research/fake-tavily";
import { QUERIES_SYSTEM, runPastedSource, runResearchPack, runTopup } from "@/lib/research/pipeline";
import { TavilyError, type TavilyClient } from "@/lib/research/tavily";
import { looksVolatile } from "@/lib/research/text";
import { normalizeUrl, rankCandidates } from "@/lib/research/url-filter";
import { setupDb } from "./helpers";

function setupPack(db: Db, workspaceId: number) {
  db.insert(brandProfile).values({ workspaceId, name: "Joystay", website: "https://joystay.vn (Next.js)" }).run();
  const p = db.insert(pillar).values({ workspaceId, name: "Ăn uống địa phương" }).returning().get();
  const plan = db.insert(weekPlan).values({ workspaceId, weekStart: "2026-11-16" }).returning().get();
  db.insert(contentItem)
    .values({
      workspaceId,
      weekPlanId: plan.id,
      type: "seo",
      pillarId: p.id,
      topic: "Bánh mì ngon Quận 3",
      mainKeyword: "bánh mì quận 3",
      publishDate: "2026-11-17",
    })
    .run();
  const pack = db.insert(researchPack).values({ workspaceId, weekPlanId: plan.id, pillarId: p.id }).returning().get();
  return { packId: pack.id };
}

/** Fake AI: queries for the query prompt, a summary with a price fact otherwise. */
function fakeAi() {
  return createFakeProvider({
    reply: (input) =>
      input.system === QUERIES_SYSTEM
        ? JSON.stringify({ queries: ["bánh mì quận 3", "bánh mì ngon sài gòn", "ăn sáng quận 3"] })
        : JSON.stringify({
            title: "Bánh mì Quận 3",
            summary: "Tổng hợp các tiệm bánh mì ở Quận 3.",
            facts: [
              { text: "Tiệm Bánh Mì Hòa có bánh mì thịt nướng giòn", needs_check: false },
              { text: "Giá một ổ khoảng 35.000đ", needs_check: false },
            ],
            questions: ["Bánh mì Quận 3 ở đâu ngon?"],
            outline: ["Giới thiệu", "Danh sách tiệm"],
            gaps: ["Thiếu giờ mở cửa"],
          }),
  });
}

const tavilyCredits = (db: Db) =>
  db
    .select({ n: sql<number>`coalesce(sum(${aiUsage.credits}), 0)` })
    .from(aiUsage)
    .where(eq(aiUsage.provider, "tavily"))
    .get()!.n;

describe("url filter", () => {
  it("normalises and dedupes URLs and drops junk", () => {
    expect(normalizeUrl("https://WWW.Example.vn/a/?utm_source=x&b=2#top")).toBe("https://example.vn/a?b=2");
    const ranked = rankCandidates(
      [
        [
          { title: "A", url: "https://a.vn/x?utm_medium=y", content: "", score: 0.5 },
          { title: "FB", url: "https://facebook.com/page", content: "", score: 0.99 },
          { title: "YT", url: "https://m.youtube.com/watch?v=1", content: "", score: 0.98 },
          { title: "PDF", url: "https://b.vn/menu.pdf", content: "", score: 0.97 },
          { title: "Own", url: "https://joystay.vn/blog/x", content: "", score: 0.96 },
          { title: "C1", url: "https://c.vn/1", content: "", score: 0.4 },
          { title: "C2", url: "https://c.vn/2", content: "", score: 0.39 },
          { title: "C3", url: "https://c.vn/3", content: "", score: 0.38 },
        ],
        [{ title: "A again", url: "https://www.a.vn/x", content: "", score: 0.45 }],
      ],
      { ownDomains: ["joystay.vn"] },
    );
    expect(ranked.map((c) => c.url)).toEqual(["https://a.vn/x", "https://c.vn/1", "https://c.vn/2"]);
    expect(ranked[0].score).toBeCloseTo(0.6); // best score + bonus for appearing twice
  });

  it("flags volatile facts", () => {
    expect(looksVolatile("Giá vé 50.000 đồng")).toBe(true);
    expect(looksVolatile("Mở cửa từ 7h đến 22h")).toBe(true);
    expect(looksVolatile("Số 12 đường Võ Văn Tần, Quận 3")).toBe(true);
    expect(looksVolatile("Hotline 0901 234 567")).toBe(true);
    expect(looksVolatile("Bánh mì là món ăn sáng phổ biến")).toBe(false);
  });
});

describe("runResearchPack", () => {
  it("searches, batches extracts by 5, saves sources and cards, marks done", async () => {
    const { db, workspaceId } = setupDb();
    const { packId } = setupPack(db, workspaceId);
    const tavily = createFakeTavily();
    const r = await runResearchPack({ db, tavily, provider: fakeAi() }, packId);

    expect(r.status).toBe("done");
    expect(r.sources).toBe(15);
    expect(tavily.calls.filter((c) => c.kind === "search")).toHaveLength(3);
    const extracts = tavily.calls.filter((c) => c.kind === "extract");
    expect(extracts.map((c) => (c.arg as string[]).length)).toEqual([5, 5, 5]);
    expect(tavilyCredits(db)).toBe(3 + 3);

    const pack = db.select().from(researchPack).get()!;
    expect(pack.status).toBe("done");
    expect(JSON.parse(pack.queries)).toHaveLength(3);

    const sources = db.select().from(source).all();
    expect(sources.every((s) => s.excerpt.length <= 500 && s.origin === "auto")).toBe(true);
    const price = db.select().from(factCard).all().find((c) => c.text.includes("35.000"));
    expect(price?.needsCheck).toBe(true); // flagged by code even though the model said false
  });

  it("fails the pack below 8 successful sources", async () => {
    const { db, workspaceId } = setupDb();
    const { packId } = setupPack(db, workspaceId);
    let n = 0;
    const tavily = createFakeTavily({ page: () => (n++ % 3 === 0 ? "nội dung" : null) });
    await expect(runResearchPack({ db, tavily, provider: fakeAi() }, packId)).rejects.toThrow(/Chỉ lấy được 5\/8/);
    expect(db.select().from(researchPack).get()!.status).toBe("failed");
  });

  it("resumes after a crash without searching again", async () => {
    const { db, workspaceId } = setupDb();
    const { packId } = setupPack(db, workspaceId);
    const good = createFakeTavily();
    let extracts = 0;
    const flaky: TavilyClient = {
      search: good.search,
      extract: async (urls) => {
        if (++extracts === 2) throw new TavilyError("server_error", "503");
        return good.extract(urls);
      },
    };
    await expect(runResearchPack({ db, tavily: flaky, provider: fakeAi() }, packId)).rejects.toThrow("503");
    expect(db.select().from(source).all()).toHaveLength(5);

    const second = createFakeTavily();
    const r = await runResearchPack({ db, tavily: second, provider: fakeAi() }, packId);
    expect(r.sources).toBe(15);
    expect(second.calls.filter((c) => c.kind === "search")).toHaveLength(0);
    expect(second.calls.filter((c) => c.kind === "extract")).toHaveLength(2);
  });

  it("stops the job when Claude is missing", async () => {
    const { db, workspaceId } = setupDb();
    const { packId } = setupPack(db, workspaceId);
    const missing = createFakeProvider({ error: new AiError("not_installed", "Không tìm thấy lệnh claude") });
    await expect(runResearchPack({ db, tavily: createFakeTavily(), provider: missing }, packId)).rejects.toMatchObject({
      code: "not_installed",
    });
  });
});

describe("pasted URLs, topup and coverage", () => {
  it("adds a pasted URL with origin pasted and high priority", async () => {
    const { db, workspaceId } = setupDb();
    const { packId } = setupPack(db, workspaceId);
    const r = await runPastedSource({ db, tavily: createFakeTavily(), provider: fakeAi() }, packId, "https://blog.vn/banh-mi?utm_source=fb");
    expect(r.added).toBe(true);
    expect(db.select().from(source).get()).toMatchObject({ url: "https://blog.vn/banh-mi", origin: "pasted", priority: 100 });

    const again = await runPastedSource({ db, tavily: createFakeTavily(), provider: fakeAi() }, packId, "https://blog.vn/banh-mi");
    expect(again.added).toBe(false);
  });

  it("refuses a social URL that extract cannot read", async () => {
    const { db, workspaceId } = setupDb();
    const { packId } = setupPack(db, workspaceId);
    const tavily = createFakeTavily({ page: () => null });
    await expect(
      runPastedSource({ db, tavily, provider: fakeAi() }, packId, "https://www.facebook.com/somepage/posts/1"),
    ).rejects.toThrow(/mạng xã hội/);
  });

  it("counts relevant active cards without diacritics and excludes dropped sources", async () => {
    const { db, workspaceId } = setupDb();
    const { packId } = setupPack(db, workspaceId);
    await runResearchPack({ db, tavily: createFakeTavily({ perQuery: 3 }), provider: fakeAi() }, packId);
    // 9 sources x (fact "Bánh Mì Hòa..." + price fact without keyword? + question) -> relevant per source:
    // "Tiệm Bánh Mì Hòa có bánh mì..." (title "Bánh mì Quận 3" adds tokens) and the question.
    const withDiacritics = packCoverage(db, packId, "bánh mì quận 3");
    const without = packCoverage(db, packId, "banh mi quan 3");
    expect(withDiacritics).toBeGreaterThan(0);
    expect(without).toBe(withDiacritics);
    expect(packCoverage(db, packId, "phở bò Hà Nội")).toBe(0);

    const first = db.select().from(source).get()!;
    db.update(source).set({ status: "dropped" }).where(eq(source.id, first.id)).run();
    expect(packCoverage(db, packId, "bánh mì quận 3")).toBeLessThan(withDiacritics);
  });

  it("topup adds up to 5 new pages for a keyword", async () => {
    const { db, workspaceId } = setupDb();
    const { packId } = setupPack(db, workspaceId);
    await runResearchPack({ db, tavily: createFakeTavily({ perQuery: 3 }), provider: fakeAi() }, packId);
    const before = db.select().from(source).all().length;
    const tavily = createFakeTavily({
      search: () =>
        Array.from({ length: 8 }, (_, i) => ({ title: `Mới ${i}`, url: `https://moi${i}.vn/x`, content: "", score: 0.9 - i / 100 })),
    });
    const r = await runTopup({ db, tavily, provider: fakeAi() }, packId, "bánh mì quận 3");
    expect(r.added).toBe(5);
    expect(db.select().from(source).all().length).toBe(before + 5);
    expect(tavily.calls.map((c) => c.kind)).toEqual(["search", "extract"]);
  });
});
