import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import type { Db } from "./client";
import { brandProfile, examplePost, pillar, workspace } from "./schema";
import {
  DEFAULT_PILLARS,
  parseBannedPhrases,
  parseBrandProfile,
  parseSocialExamples,
  parseUrls,
} from "./seed-parsers";

export type SeedSummary = {
  workspaceId: number;
  createdWorkspace: boolean;
  createdBrandProfile: boolean;
  pillarsAdded: number;
  examplesAdded: number;
};

/**
 * Idempotent seed. Only fills what is missing; never overwrites rows the user has edited.
 * Reads the markdown docs at seed time so the docs stay the single source.
 */
export function seedDatabase(db: Db, docsDir: string): SeedSummary {
  const read = (rel: string) => fs.readFileSync(path.join(docsDir, rel), "utf8");
  const brandMd = read("brand/joystay.md");
  const seoMd = read("style/seo-style.md");
  const socialMd = read("style/social-style.md");
  const examplesMd = read("style/social-examples.md");

  return db.transaction((tx) => {
    let createdWorkspace = false;
    let ws = tx.select().from(workspace).where(eq(workspace.slug, "joystay")).get();
    if (!ws) {
      ws = tx.insert(workspace).values({ slug: "joystay", name: "Joystay" }).returning().get();
      createdWorkspace = true;
    }
    const workspaceId = ws.id;

    let createdBrandProfile = false;
    const existingProfile = tx
      .select({ id: brandProfile.id })
      .from(brandProfile)
      .where(eq(brandProfile.workspaceId, workspaceId))
      .get();
    if (!existingProfile) {
      tx.insert(brandProfile)
        .values({
          workspaceId,
          ...parseBrandProfile(brandMd),
          seoStyleRules: seoMd.trim(),
          socialStyleRules: socialMd.trim(),
          bannedPhrases: parseBannedPhrases(socialMd).join("\n"),
        })
        .run();
      createdBrandProfile = true;
    }

    let pillarsAdded = 0;
    DEFAULT_PILLARS.forEach((name, i) => {
      const r = tx
        .insert(pillar)
        .values({ workspaceId, name, sortOrder: i })
        .onConflictDoNothing()
        .run();
      pillarsAdded += r.changes;
    });

    const examples = [
      ...parseSocialExamples(examplesMd).map((e) => ({
        workspaceId,
        type: "social" as const,
        seedKey: e.seedKey,
        title: e.title,
        format: e.format,
        body: e.body,
        url: null,
      })),
      ...parseUrls(seoMd).map((url) => ({
        workspaceId,
        type: "seo" as const,
        seedKey: `seo-url:${url}`,
        title: url,
        format: null,
        body: null,
        url,
      })),
    ];
    let examplesAdded = 0;
    for (const e of examples) {
      const exists = tx
        .select({ id: examplePost.id })
        .from(examplePost)
        .where(and(eq(examplePost.workspaceId, workspaceId), eq(examplePost.seedKey, e.seedKey)))
        .get();
      if (!exists) {
        tx.insert(examplePost).values(e).run();
        examplesAdded++;
      }
    }

    return { workspaceId, createdWorkspace, createdBrandProfile, pillarsAdded, examplesAdded };
  });
}
