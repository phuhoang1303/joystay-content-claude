import { z } from "zod";
import { SOCIAL_FORMATS, type SocialFormat } from "@/lib/db/schema";

export const SOCIAL_FORMAT_LABELS: Record<SocialFormat, string> = {
  khoanh_khac: "Khoảnh khắc ở Joystay",
  goc_nhin: "Góc nhìn / kiến thức",
  carousel: "Carousel chủ đề",
};

/** Short definitions sent to the planner (full rules live in the brand profile's social style). */
export const SOCIAL_FORMAT_HINTS: Record<SocialFormat, string> = {
  khoanh_khac: "khoảnh khắc thật ở Joystay, một chi tiết giác quan của phòng (ánh sáng, đèn, tranh, mùi cà phê), ảnh thật từ Drive",
  goc_nhin: "góc nhìn / kiến thức về Sài Gòn, kiến trúc, nghệ thuật trong phòng Joystay; tiêu đề dạng câu hỏi gợi tò mò",
  carousel: "carousel 3-4 ảnh, cắt từ bài SEO cùng tuần (dùng lại chủ đề của một bài SEO)",
};

export const weekConfigSchema = z
  .object({
    seo: z
      .array(z.object({ pillarId: z.number().int(), count: z.number().int().min(1).max(7) }))
      .max(5)
      .default([]),
    social: z
      .object({
        count: z.number().int().min(0).max(14),
        mix: z.object({
          khoanh_khac: z.number().int().min(0).max(14),
          goc_nhin: z.number().int().min(0).max(14),
          carousel: z.number().int().min(0).max(14),
        }),
      })
      .default({ count: 4, mix: { khoanh_khac: 2, goc_nhin: 1, carousel: 1 } }),
    targetKeywords: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    notes: z.string().trim().max(3000).default(""),
  })
  .superRefine((c, ctx) => {
    const mixSum = SOCIAL_FORMATS.reduce((s, f) => s + c.social.mix[f], 0);
    if (mixSum !== c.social.count) {
      ctx.addIssue({ code: "custom", path: ["social"], message: `Tổng định dạng social (${mixSum}) phải bằng số bài social (${c.social.count}).` });
    }
    const seoTotal = c.seo.reduce((s, x) => s + x.count, 0);
    if (c.social.mix.carousel > seoTotal) {
      ctx.addIssue({ code: "custom", path: ["social"], message: "Mỗi carousel cần một bài SEO cùng tuần để cắt nội dung." });
    }
    const ids = c.seo.map((s) => s.pillarId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["seo"], message: "Mỗi chủ đề chỉ chọn một lần." });
    }
    if (seoTotal + c.social.count === 0) {
      ctx.addIssue({ code: "custom", path: ["seo"], message: "Cần ít nhất một bài." });
    }
  });

export type WeekConfig = z.infer<typeof weekConfigSchema>;

/** Default: 2 SEO across the first 2 pillars (1 each), 4 social (2 khoảnh khắc, 1 góc nhìn, 1 carousel). */
export function defaultWeekConfig(pillarIds: number[]): WeekConfig {
  return {
    seo: pillarIds.slice(0, 2).map((pillarId) => ({ pillarId, count: 1 })),
    social: { count: 4, mix: { khoanh_khac: 2, goc_nhin: 1, carousel: pillarIds.length ? 1 : 0 } },
    targetKeywords: [],
    notes: "",
  };
}

export function parseWeekConfig(json: string, pillarIds: number[]): WeekConfig {
  try {
    const r = weekConfigSchema.safeParse(JSON.parse(json));
    if (r.success && (r.data.seo.length || r.data.social.count)) return r.data;
  } catch {
    /* fall through */
  }
  return defaultWeekConfig(pillarIds);
}
