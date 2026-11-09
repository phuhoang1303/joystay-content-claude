import { z } from "zod";
import { generateText, type AiProvider } from "../ai";
import type { Db } from "../db/client";
import { looksVolatile } from "./text";

export const PAGE_TEXT_LIMIT = 12_000;

const str = (max: number) => z.string().trim().min(1).max(max);
const list = (item: z.ZodType<string>, max: number) =>
  z
    .array(z.unknown())
    .default([])
    .transform((arr) =>
      arr.flatMap((x) => {
        const r = item.safeParse(typeof x === "string" ? x : "");
        return r.success ? [r.data] : [];
      }).slice(0, max),
    );

export const pageSummarySchema = z.object({
  title: z.string().trim().max(300).default(""),
  summary: z.string().trim().max(1500).default(""),
  facts: z
    .array(z.object({ text: str(600), needs_check: z.boolean().default(false) }).catch({ text: "", needs_check: false }))
    .default([])
    .transform((a) => a.filter((f) => f.text).slice(0, 15)),
  questions: list(str(300), 6),
  outline: list(str(200), 15),
  gaps: list(str(300), 5),
});
export type PageSummary = z.infer<typeof pageSummarySchema>;

export const SUMMARISE_SYSTEM = `Bạn là trợ lý nghiên cứu cho đội nội dung của một homestay ở Quận 3, TP.HCM.
Từ nội dung một trang web, hãy trích xuất tài liệu nghiên cứu bằng tiếng Việt:
- "title": tiêu đề trang.
- "summary": tóm tắt 2-3 câu, viết lại bằng lời của bạn.
- "facts": tối đa 12 dữ kiện cụ thể, mỗi dữ kiện một ý độc lập, viết lại ngắn gọn (không chép nguyên câu dài). "needs_check": true nếu dữ kiện là giá, giờ mở cửa, địa chỉ, số điện thoại, ngày diễn ra, hoặc thông tin dễ thay đổi.
- "questions": tối đa 5 câu hỏi người đọc thường có về chủ đề này.
- "outline": các tiêu đề mục chính (H2/H3) của trang theo thứ tự.
- "gaps": tối đa 3 điều trang này còn thiếu mà một bài viết tốt hơn nên có.
Chỉ dùng thông tin có trong trang. Bỏ qua quảng cáo, menu, chân trang.
Trả về JSON: {"title": string, "summary": string, "facts": [{"text": string, "needs_check": boolean}], "questions": string[], "outline": string[], "gaps": string[]}`;

export function buildSummarisePrompt(p: { url: string; title: string; text: string; focus: string }): string {
  return `Chủ đề nghiên cứu: ${p.focus}
URL: ${p.url}
Tiêu đề (từ kết quả tìm kiếm): ${p.title || "(không có)"}

--- NỘI DUNG TRANG (đã cắt bớt) ---
${p.text.slice(0, PAGE_TEXT_LIMIT)}`;
}

/** Calls tier fast once. Code-side check also flags volatile facts the model missed. */
export async function summarisePage(
  ctx: { db: Db; workspaceId: number; jobId?: number | null; provider?: AiProvider; signal?: AbortSignal },
  page: { url: string; title: string; text: string; focus: string },
): Promise<PageSummary> {
  const r = await generateText(
    { ...ctx, step: "research.summarise" },
    { tier: "fast", system: SUMMARISE_SYSTEM, prompt: buildSummarisePrompt(page), json: true },
  );
  const parsed = pageSummarySchema.parse(JSON.parse(r.text));
  return {
    ...parsed,
    facts: parsed.facts.map((f) => ({ ...f, needs_check: f.needs_check || looksVolatile(f.text) })),
  };
}
