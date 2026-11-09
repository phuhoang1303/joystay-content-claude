import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDb, runMigrations } from "@/lib/db/client";
import { brandProfile, examplePost, pillar, workspace } from "@/lib/db/schema";
import { seedDatabase } from "@/lib/db/seed";
import { parseBannedPhrases, parseBoldBullets, parseSocialExamples } from "@/lib/db/seed-parsers";

const docsDir = path.resolve(__dirname, "..", "docs");

describe("seed parsers", () => {
  it("reads bold bullets", () => {
    const m = parseBoldBullets("- **Name:** Joystay\n- **Tagline:** The Art of Stay");
    expect(m.get("name")).toBe("Joystay");
    expect(m.get("tagline")).toBe("The Art of Stay");
  });

  it("reads banned phrases only from their section", () => {
    const md = "## Rules\n- not this\n## Banned phrases and patterns\n- tuyệt vời\n- đắm chìm\n## Next\n- no";
    expect(parseBannedPhrases(md)).toEqual(["tuyệt vời", "đắm chìm"]);
  });

  it("splits social examples by heading", () => {
    const md = "intro\n---\n## 1. Format: A (source: X)\n\nTitle one\nbody\n---\n## 2. Format: B\n\nT2";
    const r = parseSocialExamples(md);
    expect(r.map((e) => [e.seedKey, e.format, e.title])).toEqual([
      ["social-1", "A", "Title one"],
      ["social-2", "B", "T2"],
    ]);
  });
});

describe("seedDatabase", () => {
  it("seeds Joystay from the docs and is idempotent", () => {
    const db = createDb(":memory:");
    runMigrations(db);

    const first = seedDatabase(db, docsDir);
    expect(first.createdWorkspace).toBe(true);
    expect(first.pillarsAdded).toBe(5);
    expect(first.examplesAdded).toBeGreaterThanOrEqual(4);

    const profile = db.select().from(brandProfile).get()!;
    expect(profile.name).toBe("Joystay Vietnam");
    expect(profile.bannedPhrases).toContain("tuyệt vời");
    expect(profile.seoStyleRules).toContain("Meta description");

    const seo = db.select().from(examplePost).all().filter((e) => e.type === "seo");
    expect(seo.length).toBe(3);
    expect(seo.every((e) => e.url && !e.body)).toBe(true);

    // User edit survives a re-seed
    db.update(brandProfile).set({ tagline: "Đã sửa" }).run();
    const second = seedDatabase(db, docsDir);
    expect(second).toMatchObject({ createdWorkspace: false, pillarsAdded: 0, examplesAdded: 0 });
    expect(db.select().from(workspace).all()).toHaveLength(1);
    expect(db.select().from(pillar).all()).toHaveLength(5);
    expect(db.select().from(brandProfile).get()!.tagline).toBe("Đã sửa");
  });
});
