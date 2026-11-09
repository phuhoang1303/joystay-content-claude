import { describe, expect, it } from "vitest";
import { aiUsage } from "@/lib/db/schema";
import { setSetting } from "@/lib/settings";
import { createTavilyClient, extractCredits, TavilyError } from "@/lib/research/tavily";
import { createFakeTavily } from "@/lib/research/fake-tavily";
import {
  monthlyTavilyCredits,
  priceCredits,
  withTavilyLogging,
} from "@/lib/research/tavily-usage";
import { setupDb } from "./helpers";

function fakeFetch(status: number, body: unknown) {
  const seen: { url: string; init: RequestInit }[] = [];
  const fn = async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  return { fn, seen };
}

describe("Tavily client", () => {
  it("searches with basic depth and bearer auth", async () => {
    const f = fakeFetch(200, { results: [{ title: "T", url: "https://a.vn/x", content: "c", score: 0.9 }] });
    const c = createTavilyClient({ apiKey: "tvly-test", fetch: f.fn });
    const r = await c.search({ query: "ăn gì ở quận 3", maxResults: 8 });

    expect(r).toEqual({ results: [{ title: "T", url: "https://a.vn/x", content: "c", score: 0.9 }], credits: 1 });
    expect(f.seen[0].url).toBe("https://api.tavily.com/search");
    expect((f.seen[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tvly-test");
    const body = JSON.parse(String(f.seen[0].init.body));
    expect(body).toMatchObject({ query: "ăn gì ở quận 3", search_depth: "basic", max_results: 8, auto_parameters: false });
  });

  it("charges 1 credit per 5 successful extracts", async () => {
    expect([0, 1, 5, 6, 10, 11].map(extractCredits)).toEqual([0, 1, 1, 2, 2, 3]);
    const f = fakeFetch(200, {
      results: [
        { url: "https://a.vn", raw_content: "nội dung" },
        { url: "https://b.vn", raw_content: "   " },
      ],
      failed_results: [{ url: "https://c.vn", error: "timeout" }],
    });
    const r = await createTavilyClient({ apiKey: "k", fetch: f.fn }).extract([
      "https://a.vn",
      "https://b.vn",
      "https://c.vn",
    ]);
    expect(r.results.map((x) => x.url)).toEqual(["https://a.vn"]);
    expect(r.failed.map((x) => x.url).sort()).toEqual(["https://b.vn", "https://c.vn"]);
    expect(r.credits).toBe(1);
  });

  it("fails without a key, non-retryable, in Vietnamese", async () => {
    const saved = process.env.TAVILY_API_KEY;
    delete process.env.TAVILY_API_KEY;
    try {
      const p = createTavilyClient({ fetch: fakeFetch(200, {}).fn }).search({ query: "x" });
      await expect(p).rejects.toMatchObject({ code: "missing_key", retryable: false });
      await expect(p).rejects.toThrow(/TAVILY_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.TAVILY_API_KEY = saved;
    }
  });

  it("maps HTTP errors to retryable or not", async () => {
    const run = (status: number) =>
      createTavilyClient({ apiKey: "k", fetch: fakeFetch(status, {}).fn }).search({ query: "x" });
    await expect(run(429)).rejects.toMatchObject({ code: "rate_limited", retryable: true });
    await expect(run(503)).rejects.toMatchObject({ code: "server_error", retryable: true });
    await expect(run(401)).rejects.toMatchObject({ code: "unauthorized", retryable: false });
    await expect(run(432)).rejects.toMatchObject({ code: "plan_limit", retryable: false });

    const netFail = createTavilyClient({
      apiKey: "k",
      fetch: async () => {
        throw new Error("ECONNRESET");
      },
    }).search({ query: "x" });
    await expect(netFail).rejects.toMatchObject({ code: "network", retryable: true });
  });
});

describe("Tavily usage logging", () => {
  it("logs one ai_usage row per call with credits", async () => {
    const { db, workspaceId } = setupDb();
    const t = withTavilyLogging(createFakeTavily(), { db, workspaceId, step: "research.pack" });
    await t.search({ query: "q" });
    await t.extract(["https://a.vn", "https://b.vn", "https://c.vn", "https://d.vn", "https://e.vn", "https://f.vn"]);
    const rows = db.select().from(aiUsage).all();
    expect(rows.map((r) => [r.provider, r.model, r.credits, r.isPaid])).toEqual([
      ["tavily", "search", 1, false],
      ["tavily", "extract", 2, false],
    ]);
    expect(monthlyTavilyCredits(db)).toBe(3);
  });

  it("prices credits beyond the free 1,000 and applies the paid cap", async () => {
    expect(priceCredits(0, 5)).toEqual({ paidCredits: 0, costUsd: 0 });
    expect(priceCredits(998, 5)).toEqual({ paidCredits: 3, costUsd: 0.024 });
    expect(priceCredits(1200, 2)).toEqual({ paidCredits: 2, costUsd: 0.016 });

    const { db, workspaceId } = setupDb();
    db.insert(aiUsage).values({ workspaceId, step: "seed", provider: "tavily", model: "search", credits: 1000 }).run();
    setSetting(db, "cost.monthlyPaidCapUsd", 0.01);
    const t = withTavilyLogging(createFakeTavily(), { db, workspaceId, step: "x" });

    await t.search({ query: "q" }); // paid: 0.008 < 0.01
    const last = db.select().from(aiUsage).all().at(-1)!;
    expect(last).toMatchObject({ isPaid: true, costUsd: 0.008, credits: 1 });

    await t.search({ query: "q" }); // 0.016 >= cap after this call
    await expect(t.search({ query: "q" })).rejects.toMatchObject({ code: "cap_reached", retryable: false });
  });

  it("logs failed calls with 0 credits", async () => {
    const { db, workspaceId } = setupDb();
    const t = withTavilyLogging(createFakeTavily({ error: new TavilyError("rate_limited", "429") }), {
      db,
      workspaceId,
      step: "x",
    });
    await expect(t.search({ query: "q" })).rejects.toThrow("429");
    expect(db.select().from(aiUsage).get()).toMatchObject({ ok: false, credits: 0 });
  });
});
