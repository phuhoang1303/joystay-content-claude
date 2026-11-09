import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { factCard, source } from "../db/schema";
import { keywordTokens, tokensVi } from "./text";

export const MIN_COVERAGE = 5;

/**
 * Number of active fact cards (kind fact or question) relevant to `keyword`.
 * A card is relevant when its text plus its source title contains at least half of the keyword's
 * meaningful tokens, compared without diacritics ("Bánh mì" matches "banh mi"). Cards of dropped
 * sources never count.
 */
export function packCoverage(db: Db, packId: number, keyword: string): number {
  const kw = keywordTokens(keyword);
  if (kw.length === 0) return 0;
  const need = Math.ceil(kw.length / 2);
  const rows = db
    .select({ text: factCard.text, title: source.title })
    .from(factCard)
    .innerJoin(source, eq(source.id, factCard.sourceId))
    .where(
      and(
        eq(factCard.researchPackId, packId),
        eq(source.status, "active"),
        inArray(factCard.kind, ["fact", "question"]),
      ),
    )
    .all();
  return rows.filter((r) => {
    const words = new Set(tokensVi(`${r.title} ${r.text}`));
    return kw.filter((t) => words.has(t)).length >= need;
  }).length;
}
