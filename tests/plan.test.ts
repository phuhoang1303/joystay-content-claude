import { describe, expect, it } from "vitest";
import { createFakeProvider } from "@/lib/ai/fake";
import type { Db } from "@/lib/db/client";
import { aiUsage, contentItem, pillar, weekPlan } from "@/lib/db/schema";
import { defaultWeekConfig, weekConfigSchema, type WeekConfig } from "@/features/week-plan/config";
import { generateWeekPlan, regenerateItem } from "@/features/week-plan/generate";
import { validatePlan, type PlannedItem } from "@/features/week-plan/validate";
import { setupDb } from "./helpers";

const WEEK = "2026-11-16";

function setup(db: Db, workspaceId: number) {
  const pillars = ["Ăn uống địa phương", "Du lịch & lịch trình Sài Gòn", "Trải nghiệm ở Joystay"].map(
    (name, i) => db.insert(pillar).values({ workspaceId, name, sortOrder: i }).returning().get().id,
  );
  const config = defaultWeekConfig(pillars);
  const plan = db
    .insert(weekPlan)
    .values({ workspaceId, weekStart: WEEK, config: JSON.stringify(config) })
    .returning()
    .get();
  return { pillars, config, planId: plan.id };
}

function goodPlan(p: number[]): PlannedItem[] {
  const base = { angle: "góc", reason: "lý do" };
  return [
    { ...base, type: "seo", pillar_id: p[0], topic: "Bánh mì ngon Quận 3", main_keyword: "bánh mì quận 3", publish_date: "2026-11-17" },
    { ...base, type: "seo", pillar_id: p[1], topic: "Lịch trình 1 ngày ở Sài Gòn", main_keyword: "lịch trình sài gòn 1 ngày", publish_date: "2026-11-19" },
    { ...base, type: "social", pillar_id: p[2], topic: "Ánh đèn phòng J3", social_format: "khoanh_khac", publish_date: "2026-11-16" },
    { ...base, type: "social", pillar_id: p[2], topic: "Buổi sáng ở Joystay", social_format: "khoanh_khac", publish_date: "2026-11-20" },
    { ...base, type: "social", pillar_id: p[1], topic: "Vì sao nhà phố Sài Gòn hẹp?", social_format: "goc_nhin", publish_date: "2026-11-18" },
    { ...base, type: "social", pillar_id: p[0], topic: "5 tiệm bánh mì Quận 3", social_format: "carousel", seo_ref: 0, publish_date: "2026-11-21" },
  ];
}

describe("week config", () => {
  it("defaults to 2 SEO on 2 pillars and 4 social 2/1/1", () => {
    expect(defaultWeekConfig([5, 6, 7])).toEqual({
      seo: [
        { pillarId: 5, count: 1 },
        { pillarId: 6, count: 1 },
      ],
      social: { count: 4, mix: { khoanh_khac: 2, goc_nhin: 1, carousel: 1 } },
      targetKeywords: [],
      notes: "",
    });
  });

  it("rejects a mix that does not add up or carousels without SEO", () => {
    const bad = weekConfigSchema.safeParse({ seo: [], social: { count: 2, mix: { khoanh_khac: 1, goc_nhin: 0, carousel: 1 } } });
    expect(bad.success).toBe(false);
    const msgs = bad.success ? [] : bad.error.issues.map((i) => i.message).join(" ");
    expect(msgs).toContain("carousel");
    expect(weekConfigSchema.safeParse({ seo: [], social: { count: 3, mix: { khoanh_khac: 1, goc_nhin: 1, carousel: 0 } } }).success).toBe(false);
  });
});

describe("validatePlan", () => {
  const p = [1, 2, 3];
  const config: WeekConfig = defaultWeekConfig(p);

  it("accepts a correct plan", () => {
    expect(validatePlan(goodPlan(p), config, WEEK, p)).toEqual([]);
  });

  it("catches wrong counts, dates outside the week, bad carousel refs and crowded days", () => {
    const items = goodPlan(p);
    items[1].publish_date = "2026-11-24"; // outside week
    items[3].social_format = "goc_nhin"; // mix 1/2/1
    items[5].seo_ref = 5; // no such SEO
    items[4].publish_date = "2026-11-16"; // two social posts on Monday
    const errors = validatePlan(items, config, WEEK, p).join("\n");
    expect(errors).toContain("ngoài tuần");
    expect(errors).toMatch(/khoanh_khac.*có 1/);
    expect(errors).toContain("seo_ref");
    expect(errors).toMatch(/2026-11-16 có 2 bài social/);
  });

  it("requires carousels on or after their SEO article and SEO keywords", () => {
    const items = goodPlan(p);
    items[5].publish_date = "2026-11-16";
    items[2].publish_date = "2026-11-22";
    items[0].main_keyword = null;
    const errors = validatePlan(items, config, WEEK, p).join("\n");
    expect(errors).toContain("cùng ngày hoặc sau");
    expect(errors).toContain("thiếu main_keyword");
  });
});

describe("generateWeekPlan", () => {
  it("saves a valid plan as idea items, carousel inherits its SEO pillar", async () => {
    const { db, workspaceId } = setupDb();
    const { pillars, planId } = setup(db, workspaceId);
    const items = goodPlan(pillars);
    items[5].pillar_id = pillars[2];
    const provider = createFakeProvider({ reply: JSON.stringify({ items }) });

    expect(await generateWeekPlan({ db, provider }, planId)).toEqual({ items: 6 });
    const saved = db.select().from(contentItem).all();
    expect(saved).toHaveLength(6);
    expect(saved.every((s) => s.status === "idea")).toBe(true);
    expect(saved.find((s) => s.socialFormat === "carousel")?.pillarId).toBe(pillars[0]);
    expect(provider.calls[0].tier).toBe("smart");
    expect(provider.calls[0].prompt).toContain("Ngày Nhà giáo Việt Nam 20/11");
  });

  it("retries once with the validation errors, then succeeds", async () => {
    const { db, workspaceId } = setupDb();
    const { pillars, planId } = setup(db, workspaceId);
    const bad = goodPlan(pillars).slice(0, 5);
    let call = 0;
    const provider = createFakeProvider({
      reply: () => JSON.stringify({ items: call++ === 0 ? bad : goodPlan(pillars) }),
    });
    await generateWeekPlan({ db, provider }, planId);
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1].prompt).toContain("Cần 4 bài social, kết quả có 3");
    expect(db.select().from(aiUsage).all()).toHaveLength(2);
  });

  it("fails with a Vietnamese message after two invalid answers, keeping old items", async () => {
    const { db, workspaceId } = setupDb();
    const { pillars, planId } = setup(db, workspaceId);
    db.insert(contentItem).values({ workspaceId, weekPlanId: planId, type: "seo", topic: "cũ", publishDate: "2026-11-16" }).run();
    const provider = createFakeProvider({ reply: JSON.stringify({ items: goodPlan(pillars).slice(0, 2) }) });
    await expect(generateWeekPlan({ db, provider }, planId)).rejects.toMatchObject({ retryable: false });
    await expect(generateWeekPlan({ db, provider }, planId)).rejects.toThrow(/sau 2 lần thử/);
    expect(db.select().from(contentItem).all().map((i) => i.topic)).toEqual(["cũ"]);
  });

  it("refuses to regenerate a locked week", async () => {
    const { db, workspaceId } = setupDb();
    const { planId } = setup(db, workspaceId);
    db.update(weekPlan).set({ status: "locked" }).run();
    await expect(generateWeekPlan({ db, provider: createFakeProvider() }, planId)).rejects.toThrow(/đã chốt/);
  });
});

describe("regenerateItem", () => {
  it("replaces one card's topic and keeps the rest", async () => {
    const { db, workspaceId } = setupDb();
    const { pillars, planId } = setup(db, workspaceId);
    await generateWeekPlan({ db, provider: createFakeProvider({ reply: JSON.stringify({ items: goodPlan(pillars) }) }) }, planId);
    const target = db.select().from(contentItem).all().find((i) => i.type === "seo")!;
    const provider = createFakeProvider({
      reply: JSON.stringify({ item: { pillar_id: pillars[0], topic: "Hủ tiếu Nam Vang Quận 3", main_keyword: "hủ tiếu quận 3", angle: "a", social_format: null, reason: "r" } }),
    });
    await regenerateItem({ db, provider }, target.id);
    const after = db.select().from(contentItem).all();
    const changed = after.find((i) => i.id === target.id)!;
    expect(changed).toMatchObject({ topic: "Hủ tiếu Nam Vang Quận 3", mainKeyword: "hủ tiếu quận 3", publishDate: target.publishDate });
    expect(after.filter((i) => i.id !== target.id).map((i) => i.topic)).not.toContain("Hủ tiếu Nam Vang Quận 3");
    expect(provider.calls[0].prompt).toContain("Bánh mì ngon Quận 3");
  });
});

describe("lockWeek", () => {
  it("creates one pack per SEO pillar, links items, and only adds missing packs on re-lock", async () => {
    const { lockWeek, unlockWeek } = await import("@/features/week-plan/lock");
    const { job, researchPack } = await import("@/lib/db/schema");
    const { db, workspaceId } = setupDb();
    const { pillars, planId } = setup(db, workspaceId);
    await generateWeekPlan({ db, provider: createFakeProvider({ reply: JSON.stringify({ items: goodPlan(pillars) }) }) }, planId);

    const first = lockWeek(db, planId);
    expect(first.packsCreated).toBe(2);
    expect(db.select().from(weekPlan).get()!.status).toBe("locked");
    const packs = db.select().from(researchPack).all();
    expect(packs.map((p) => p.pillarId).sort()).toEqual([pillars[0], pillars[1]].sort());
    expect(db.select().from(job).all().map((j) => j.type)).toEqual(["research.pack", "research.pack"]);

    const items = db.select().from(contentItem).all();
    const carousel = items.find((i) => i.socialFormat === "carousel")!;
    expect(carousel.researchPackId).toBe(packs.find((p) => p.pillarId === pillars[0])!.id);
    const joystaySocial = items.find((i) => i.pillarId === pillars[2])!;
    expect(joystaySocial.researchPackId).toBeNull(); // no SEO pack for that pillar

    unlockWeek(db, planId);
    db.insert(contentItem)
      .values({ workspaceId, weekPlanId: planId, type: "seo", pillarId: pillars[2], topic: "Phòng J5", mainKeyword: "homestay quận 3", publishDate: "2026-11-22" })
      .run();
    const second = lockWeek(db, planId);
    expect(second.packsCreated).toBe(1);
    expect(db.select().from(researchPack).all()).toHaveLength(3);
    expect(db.select().from(job).all()).toHaveLength(3);
  });

  it("refuses to lock with incomplete items", async () => {
    const { lockWeek } = await import("@/features/week-plan/lock");
    const { db, workspaceId } = setupDb();
    const { pillars, planId } = setup(db, workspaceId);
    db.insert(contentItem).values({ workspaceId, weekPlanId: planId, type: "seo", pillarId: pillars[0], topic: "X", publishDate: WEEK }).run();
    expect(() => lockWeek(db, planId)).toThrow(/thiếu đề tài hoặc từ khoá/);
    expect(db.select().from(weekPlan).get()!.status).toBe("draft");
  });
});

describe("parseSingleItem", () => {
  it("accepts item, items[0] or a bare object", async () => {
    const { parseSingleItem } = await import("@/features/week-plan/generate");
    const one = { pillar_id: 1, topic: "Đề tài mới", main_keyword: null, angle: "", reason: "r" };
    expect(parseSingleItem(JSON.stringify({ item: one }))?.topic).toBe("Đề tài mới");
    expect(parseSingleItem(JSON.stringify({ items: [{ ...one, type: "social", social_format: "Góc nhìn" }] }))?.topic).toBe("Đề tài mới");
    expect(parseSingleItem(JSON.stringify(one))?.topic).toBe("Đề tài mới");
    expect(parseSingleItem("{}")).toBeNull();
    expect(parseSingleItem("không phải json")).toBeNull();
  });
});

describe("plannedItemSchema", () => {
  it("clips long angle/reason instead of rejecting", async () => {
    const { plannedItemSchema } = await import("@/features/week-plan/validate");
    const r = plannedItemSchema.parse({
      type: "social", pillar_id: 1, topic: "Đề tài", angle: "a".repeat(1200), reason: "b".repeat(900),
      social_format: "goc_nhin", publish_date: "2026-11-20",
    });
    expect(r.angle.length).toBe(800);
    expect(r.reason.length).toBe(500);
    expect(r.angle.endsWith("…")).toBe(true);
  });
});
