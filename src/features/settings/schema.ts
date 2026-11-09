import { z } from "zod";
import { PROVIDER_NAMES } from "@/lib/settings";

const text = (max: number) => z.string().trim().max(max, `Tối đa ${max} ký tự`);

export const brandProfileSchema = z.object({
  name: text(200).min(1, "Cần nhập tên thương hiệu"),
  tagline: text(300),
  website: text(500),
  location: text(500),
  description: text(5000),
  targetGuests: text(3000),
  rooms: text(5000),
  contact: text(2000),
  seoStyleRules: text(20000),
  socialStyleRules: text(20000),
  bannedPhrases: text(10000),
});
export type BrandProfileInput = z.infer<typeof brandProfileSchema>;

export const BRAND_FIELDS: {
  name: keyof BrandProfileInput;
  label: string;
  multiline?: boolean;
  rows?: number;
  hint?: string;
}[] = [
  { name: "name", label: "Tên thương hiệu" },
  { name: "tagline", label: "Tagline" },
  { name: "website", label: "Website" },
  { name: "location", label: "Địa điểm" },
  { name: "description", label: "Mô tả", multiline: true, rows: 5 },
  { name: "targetGuests", label: "Khách mục tiêu", multiline: true, rows: 3 },
  { name: "rooms", label: "Phòng / sản phẩm", multiline: true, rows: 4 },
  { name: "contact", label: "Liên hệ", multiline: true, rows: 2 },
  { name: "seoStyleRules", label: "Quy tắc viết SEO", multiline: true, rows: 10 },
  { name: "socialStyleRules", label: "Quy tắc viết social", multiline: true, rows: 10 },
  {
    name: "bannedPhrases",
    label: "Cụm từ cấm",
    multiline: true,
    rows: 8,
    hint: "Mỗi dòng một cụm từ.",
  },
];

export const pillarNameSchema = text(120).min(1, "Cần nhập tên chủ đề");

export const examplePostSchema = z
  .object({
    type: z.enum(["social", "seo"]),
    title: text(200),
    format: text(100),
    body: text(20000),
    url: z.union([z.literal(""), z.url("URL không hợp lệ").max(1000)]),
  })
  .refine((v) => v.body || v.url, { message: "Cần nhập nội dung hoặc URL", path: ["body"] });

export const aiSettingsSchema = z.object({
  provider: z.enum(PROVIDER_NAMES),
  monthlyPaidCapUsd: z.coerce
    .number({ message: "Hạn mức phải là số" })
    .min(0, "Hạn mức không được âm")
    .max(10_000, "Hạn mức quá lớn"),
});

export type FormState = { ok?: boolean; message?: string; errors?: Record<string, string> };

export function zodErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? "_");
    out[key] ??= issue.message;
  }
  return out;
}
