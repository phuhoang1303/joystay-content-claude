/** AI planning for a week. Runs in the worker (no server-only imports). */
import { and, asc, eq, gte, ne } from "drizzle-orm";
import { generateText, type AiProvider } from "@/lib/ai";
import { addDays, formatDayVi, weekDays } from "@/lib/calendar/week";
import { eventsInWeek } from "@/lib/calendar/vn-events";
import type { Db } from "@/lib/db/client";
import { brandProfile, contentItem, pillar, weekPlan, SOCIAL_FORMATS, type ContentItem, type WeekPlan } from "@/lib/db/schema";
import { parseWeekConfig, SOCIAL_FORMAT_HINTS, SOCIAL_FORMAT_LABELS, type WeekConfig } from "./config";
import { planOutputSchema, plannedItemSchema, validatePlan, type PlannedItem } from "./validate";

export type PlanDeps = { db: Db; provider?: AiProvider; jobId?: number | null; signal?: AbortSignal };

/** Vietnamese, user-facing, not retried by the job runner. */
export class PlanError extends Error {
  readonly retryable = false;
}

const PLAN_RULES = `Bạn là biên tập viên nội dung của một homestay boutique ở Quận 3, TP.HCM. Bạn lập kế hoạch nội dung cho một tuần: bài SEO tiếng Việt cho blog và bài Facebook giọng người thật.
Nguyên tắc:
- Mỗi đề tài cụ thể, hữu ích cho khách du lịch và người ở Sài Gòn, gắn với khu vực Quận 3 khi hợp lý. Không quảng cáo lộ liễu.
- Không lặp lại đề tài đã dùng trong 90 ngày qua.
- Tận dụng ngày lễ, sự kiện trong tuần nếu phù hợp.
- Bài SEO cần main_keyword là cụm từ người Việt thực sự tìm kiếm (2-6 từ).
- Bài carousel phải dùng lại chủ đề của một bài SEO cùng tuần (seo_ref là vị trí của bài SEO đó trong danh sách các bài SEO, bắt đầu từ 0) và đăng cùng ngày hoặc sau bài SEO đó.
- Mỗi kênh tối đa một bài mỗi ngày, rải đều trong tuần.
- "reason": một câu giải thích vì sao chọn đề tài này cho tuần này. Chỉ nêu sự thật (ví dụ không gọi một ngày là ngày nghỉ nếu không phải).`;

export const PLAN_SYSTEM = `${PLAN_RULES}
Trả về JSON: {"items": [{"type": "seo"|"social", "pillar_id": number, "topic": string, "main_keyword": string|null, "angle": string, "social_format": "khoanh_khac"|"goc_nhin"|"carousel"|null, "seo_ref": number|null, "publish_date": "YYYY-MM-DD", "reason": string}]}`;

type PlanContext = {
  plan: WeekPlan;
  config: WeekConfig;
  pillars: { id: number; name: string }[];
  brandText: string;
  socialRules: string;
  recentTopics: string[];
};

function loadContext(db: Db, weekPlanId: number): PlanContext {
  const plan = db.select().from(weekPlan).where(eq(weekPlan.id, weekPlanId)).get();
  if (!plan) throw new PlanError(`Không tìm thấy kế hoạch tuần #${weekPlanId}.`);
  const pillars = db
    .select({ id: pillar.id, name: pillar.name })
    .from(pillar)
    .where(eq(pillar.workspaceId, plan.workspaceId))
    .orderBy(asc(pillar.sortOrder), asc(pillar.id))
    .all();
  const config = parseWeekConfig(plan.config, pillars.map((p) => p.id));
  const bp = db.select().from(brandProfile).where(eq(brandProfile.workspaceId, plan.workspaceId)).get();
  const brandText = bp
    ? [
        `Tên: ${bp.name}`,
        bp.tagline && `Tagline: ${bp.tagline}`,
        bp.location && `Địa điểm: ${bp.location}`,
        bp.description && `Mô tả:\n${bp.description}`,
        bp.targetGuests && `Khách mục tiêu: ${bp.targetGuests}`,
        bp.rooms && `Phòng:\n${bp.rooms}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "";
  const since = addDays(plan.weekStart, -90);
  const recentTopics = db
    .select({ topic: contentItem.topic })
    .from(contentItem)
    .where(
      and(
        eq(contentItem.workspaceId, plan.workspaceId),
        ne(contentItem.weekPlanId, plan.id),
        gte(contentItem.publishDate, since),
      ),
    )
    .all()
    .map((r) => r.topic)
    .filter(Boolean);
  return { plan, config, pillars, brandText, socialRules: bp?.socialStyleRules ?? "", recentTopics };
}

function socialFormatsSection(socialRules: string): string {
  const defs = SOCIAL_FORMATS.map((f) => `- ${f} (${SOCIAL_FORMAT_LABELS[f]}): ${SOCIAL_FORMAT_HINTS[f]}`).join("\n");
  const formats = socialRules.match(/## Formats[\s\S]*?(?=\n## |$)/)?.[0];
  return formats ? `${defs}\n\nChi tiết từ quy tắc viết social:\n${formats.trim()}` : defs;
}

export function buildPlanPrompt(ctx: PlanContext): string {
  const { plan, config, pillars } = ctx;
  const name = (id: number) => pillars.find((p) => p.id === id)?.name ?? `#${id}`;
  const events = eventsInWeek(plan.weekStart);
  const lines = [
    `## Thương hiệu\n${ctx.brandText || "(chưa có brand profile)"}`,
    `## Các chủ đề (pillar)\n${pillars.map((p) => `- pillar_id ${p.id}: ${p.name}`).join("\n")}`,
    `## Tuần cần lập\n${weekDays(plan.weekStart).map((d) => `- ${d} (${formatDayVi(d)})`).join("\n")}`,
    `## Số bài\nSEO:\n${config.seo.map((s) => `- ${s.count} bài cho pillar_id ${s.pillarId} (${name(s.pillarId)})`).join("\n") || "- không có"}\nSocial: ${config.social.count} bài, gồm ${SOCIAL_FORMATS.map((f) => `${config.social.mix[f]} ${f}`).join(", ")}. Bài social chọn pillar phù hợp nhất trong danh sách.`,
    `## Định dạng social\n${socialFormatsSection(ctx.socialRules)}`,
    `## Ngày lễ / sự kiện trong tuần\n${events.length ? events.map((e) => `- ${e.date}: ${e.name}${e.note ? ` (${e.note})` : ""}`).join("\n") : "- không có"}`,
    `## Từ khoá chủ muốn nhắm tới\n${config.targetKeywords.length ? config.targetKeywords.map((k) => `- ${k}`).join("\n") : "- không có"}`,
    `## Ghi chú của chủ cho tuần này\n${config.notes || "(không có)"}`,
    `## Đề tài đã dùng trong 90 ngày qua (không lặp lại)\n${ctx.recentTopics.length ? ctx.recentTopics.map((t) => `- ${t}`).join("\n") : "- chưa có"}`,
  ];
  return lines.join("\n\n");
}

function parseItems(text: string): { items: PlannedItem[] | null; error?: string } {
  try {
    const r = planOutputSchema.safeParse(JSON.parse(text));
    if (r.success) return { items: r.data.items };
    return { items: null, error: r.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  } catch {
    return { items: null, error: "Không phải JSON hợp lệ." };
  }
}

/** Calls the planner (tier smart), validates, retries once with the errors, then fails. */
export async function proposePlan(deps: PlanDeps, weekPlanId: number): Promise<PlannedItem[]> {
  const ctx = loadContext(deps.db, weekPlanId);
  const pillarIds = ctx.pillars.map((p) => p.id);
  const basePrompt = buildPlanPrompt(ctx);
  let prompt = basePrompt;
  let lastErrors: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await generateText(
      { db: deps.db, workspaceId: ctx.plan.workspaceId, step: "plan.generate", jobId: deps.jobId, provider: deps.provider, signal: deps.signal },
      { tier: "smart", system: PLAN_SYSTEM, prompt, json: true },
    );
    const parsed = parseItems(r.text);
    lastErrors = parsed.items ? validatePlan(parsed.items, ctx.config, ctx.plan.weekStart, pillarIds) : [parsed.error ?? "Sai cấu trúc."];
    if (parsed.items && lastErrors.length === 0) return parsed.items;
    prompt = `${basePrompt}\n\n## Kết quả lần trước chưa đạt, hãy sửa các lỗi sau và trả lại toàn bộ kế hoạch\n${lastErrors.map((e) => `- ${e}`).join("\n")}`;
  }
  throw new PlanError(
    `AI chưa tạo được kế hoạch đúng yêu cầu sau 2 lần thử. Lỗi: ${lastErrors.slice(0, 4).join(" ")}${lastErrors.length > 4 ? " ..." : ""}`,
  );
}

/** plan.generate: replaces the week's items with a fresh proposal (only while the week is draft). */
export async function generateWeekPlan(deps: PlanDeps, weekPlanId: number) {
  const plan = deps.db.select().from(weekPlan).where(eq(weekPlan.id, weekPlanId)).get();
  if (!plan) throw new PlanError("Không tìm thấy kế hoạch tuần.");
  if (plan.status === "locked") throw new PlanError("Tuần đã chốt. Mở khoá trước khi tạo lại kế hoạch.");
  const items = await proposePlan(deps, weekPlanId);
  const seo = items.filter((i) => i.type === "seo");

  deps.db.transaction((tx) => {
    tx.delete(contentItem).where(eq(contentItem.weekPlanId, weekPlanId)).run();
    items.forEach((i, idx) => {
      const ref = i.type === "social" && i.social_format === "carousel" && i.seo_ref != null ? seo[i.seo_ref] : undefined;
      tx.insert(contentItem)
        .values({
          workspaceId: plan.workspaceId,
          weekPlanId,
          type: i.type,
          pillarId: ref?.pillar_id ?? i.pillar_id,
          topic: i.topic,
          mainKeyword: i.type === "seo" ? (i.main_keyword ?? null) : null,
          angle: i.angle,
          socialFormat: i.type === "social" ? (i.social_format ?? null) : null,
          publishDate: i.publish_date,
          status: "idea",
          reason: i.reason,
          sortOrder: idx,
        })
        .run();
    });
  });
  return { items: items.length };
}

/** Type, date and social format are kept from the existing card, so they are not read. */
const singleItemSchema = plannedItemSchema.pick({ pillar_id: true, topic: true, main_keyword: true, angle: true, reason: true });

export const REGENERATE_SYSTEM = `${PLAN_RULES}
Lần này chỉ đề xuất lại MỘT bài. Trả về JSON: {"item": {"pillar_id": number, "topic": string, "main_keyword": string|null, "angle": string, "reason": string}}`;

/** Accepts {"item": {...}}, {"items": [{...}]} or the bare object. */
export function parseSingleItem(text: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const o = raw as { item?: unknown; items?: unknown[] };
  const candidate = o?.item ?? (Array.isArray(o?.items) ? o.items[0] : raw);
  const r = singleItemSchema.safeParse(candidate);
  return r.success ? r.data : null;
}

/** plan.regenerate_item: a new topic for one card; keeps type, date, format and the other cards. */
export async function regenerateItem(deps: PlanDeps, itemId: number) {
  const item = deps.db.select().from(contentItem).where(eq(contentItem.id, itemId)).get();
  if (!item) throw new PlanError("Không tìm thấy bài này.");
  const ctx = loadContext(deps.db, item.weekPlanId);
  if (ctx.plan.status === "locked") throw new PlanError("Tuần đã chốt. Mở khoá trước khi đề xuất lại.");
  const others = deps.db
    .select()
    .from(contentItem)
    .where(and(eq(contentItem.weekPlanId, item.weekPlanId), ne(contentItem.id, itemId)))
    .all();
  const describe = (i: ContentItem) =>
    `- [${i.type}${i.socialFormat ? `/${i.socialFormat}` : ""}] ${i.publishDate}: ${i.topic}${i.mainKeyword ? ` (từ khoá: ${i.mainKeyword})` : ""}`;
  const seoTopics = others.filter((o) => o.type === "seo").map((o) => o.topic);
  const prompt = `${buildPlanPrompt(ctx)}

## Các bài khác trong tuần (giữ nguyên)
${others.map(describe).join("\n") || "- không có"}

## Bài cần đề xuất lại
${describe(item)}
Hãy đề xuất MỘT đề tài khác cho bài này: cùng loại (${item.type})${item.socialFormat ? `, cùng định dạng ${item.socialFormat}` : ""}, cùng ngày ${item.publishDate}. Không trùng đề tài cũ "${item.topic}" và không trùng các bài khác.${
    item.socialFormat === "carousel" ? ` Carousel phải dùng lại chủ đề của một bài SEO trong tuần: ${seoTopics.join("; ") || "(chưa có bài SEO)"}.` : ""
  }${item.type === "seo" ? " Cần main_keyword." : " main_keyword để null."}`;

  const r = await generateText(
    { db: deps.db, workspaceId: item.workspaceId, step: "plan.regenerate_item", jobId: deps.jobId, contentItemId: item.id, provider: deps.provider, signal: deps.signal },
    { tier: "smart", system: REGENERATE_SYSTEM, prompt, json: true },
  );
  const next = parseSingleItem(r.text);
  if (!next) throw new PlanError("AI trả về đề xuất không đúng cấu trúc. Hãy thử lại.");
  if (item.type === "seo" && !next.main_keyword) throw new PlanError("Đề xuất mới thiếu từ khoá chính. Hãy thử lại.");
  const pillarOk = ctx.pillars.some((p) => p.id === next.pillar_id);
  deps.db
    .update(contentItem)
    .set({
      topic: next.topic,
      mainKeyword: item.type === "seo" ? (next.main_keyword ?? null) : null,
      angle: next.angle,
      reason: next.reason,
      pillarId: item.type === "seo" ? item.pillarId : pillarOk ? next.pillar_id : item.pillarId,
      updatedAt: new Date(),
    })
    .where(eq(contentItem.id, itemId))
    .run();
  return { itemId, topic: next.topic };
}
