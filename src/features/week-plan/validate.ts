import { z } from "zod";
import { SOCIAL_FORMATS, type SocialFormat } from "@/lib/db/schema";
import { isInWeek } from "@/lib/calendar/week";
import { SOCIAL_FORMAT_LABELS, type WeekConfig } from "./config";

/** One item as the planner model returns it. */
export const plannedItemSchema = z.object({
  type: z.enum(["seo", "social"]),
  pillar_id: z.number().int(),
  topic: z.string().trim().min(3).max(200),
  main_keyword: z.string().trim().max(120).nullish(),
  angle: z.string().trim().max(500).default(""),
  social_format: z.enum(SOCIAL_FORMATS).nullish(),
  /** For carousel: 0-based index of the SEO item (among SEO items, in output order) it is cut from. */
  seo_ref: z.number().int().min(0).nullish(),
  publish_date: z.string(),
  reason: z.string().trim().max(500).default(""),
});
export type PlannedItem = z.infer<typeof plannedItemSchema>;

export const planOutputSchema = z.object({ items: z.array(plannedItemSchema).min(1).max(30) });

/** Business rules on top of the schema. Returns Vietnamese error strings (empty = valid). */
export function validatePlan(
  items: PlannedItem[],
  config: WeekConfig,
  weekStart: string,
  pillarIds: number[],
): string[] {
  const errors: string[] = [];
  const seo = items.filter((i) => i.type === "seo");
  const social = items.filter((i) => i.type === "social");
  const known = new Set(pillarIds);

  for (const want of config.seo) {
    const got = seo.filter((i) => i.pillar_id === want.pillarId).length;
    if (got !== want.count) errors.push(`Chủ đề #${want.pillarId} cần ${want.count} bài SEO, kết quả có ${got}.`);
  }
  const seoPillars = new Set(config.seo.map((s) => s.pillarId));
  for (const i of seo) {
    if (!seoPillars.has(i.pillar_id)) errors.push(`Bài SEO "${i.topic}" dùng chủ đề #${i.pillar_id} không có trong cấu hình.`);
    if (!i.main_keyword) errors.push(`Bài SEO "${i.topic}" thiếu main_keyword.`);
    if (i.social_format) errors.push(`Bài SEO "${i.topic}" không được có social_format.`);
  }

  if (social.length !== config.social.count) {
    errors.push(`Cần ${config.social.count} bài social, kết quả có ${social.length}.`);
  }
  for (const f of SOCIAL_FORMATS) {
    const got = social.filter((i) => i.social_format === f).length;
    const want = config.social.mix[f];
    if (got !== want) errors.push(`Cần ${want} bài "${SOCIAL_FORMAT_LABELS[f]}" (${f}), kết quả có ${got}.`);
  }
  for (const i of social) {
    if (!i.social_format) errors.push(`Bài social "${i.topic}" thiếu social_format.`);
    if (i.social_format === "carousel") {
      const ref = i.seo_ref == null ? undefined : seo[i.seo_ref];
      if (!ref) errors.push(`Carousel "${i.topic}" phải có seo_ref trỏ tới một bài SEO trong tuần.`);
      else if (i.publish_date < ref.publish_date) {
        errors.push(`Carousel "${i.topic}" phải đăng cùng ngày hoặc sau bài SEO nó cắt ra (${ref.publish_date}).`);
      }
    }
  }

  for (const i of items) {
    if (!known.has(i.pillar_id)) errors.push(`"${i.topic}" dùng chủ đề #${i.pillar_id} không tồn tại.`);
    if (!isInWeek(i.publish_date, weekStart)) errors.push(`"${i.topic}" có ngày ${i.publish_date} nằm ngoài tuần.`);
  }

  // At most one post per channel per day, unless the count forces more.
  for (const [type, list] of [
    ["SEO", seo],
    ["social", social],
  ] as const) {
    const maxPerDay = Math.max(1, Math.ceil(list.length / 7));
    const perDay = new Map<string, number>();
    for (const i of list) perDay.set(i.publish_date, (perDay.get(i.publish_date) ?? 0) + 1);
    for (const [day, n] of perDay) {
      if (n > maxPerDay) errors.push(`Ngày ${day} có ${n} bài ${type}; tối đa ${maxPerDay} bài ${type} mỗi ngày.`);
    }
  }
  return errors;
}

export function formatOf(i: PlannedItem): SocialFormat | null {
  return i.type === "social" ? (i.social_format ?? null) : null;
}
