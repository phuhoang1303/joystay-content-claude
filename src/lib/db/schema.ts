import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(unixepoch('subsec') * 1000 as integer))`);

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(unixepoch('subsec') * 1000 as integer))`);

export const workspace = sqliteTable("workspace", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const brandProfile = sqliteTable("brand_profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id")
    .notNull()
    .unique()
    .references(() => workspace.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  tagline: text("tagline").notNull().default(""),
  website: text("website").notNull().default(""),
  location: text("location").notNull().default(""),
  description: text("description").notNull().default(""),
  targetGuests: text("target_guests").notNull().default(""),
  rooms: text("rooms").notNull().default(""),
  contact: text("contact").notNull().default(""),
  seoStyleRules: text("seo_style_rules").notNull().default(""),
  socialStyleRules: text("social_style_rules").notNull().default(""),
  /** One phrase per line. */
  bannedPhrases: text("banned_phrases").notNull().default(""),
  updatedAt: updatedAt(),
});

export const EXAMPLE_POST_TYPES = ["social", "seo"] as const;
export type ExamplePostType = (typeof EXAMPLE_POST_TYPES)[number];

export const examplePost = sqliteTable(
  "example_post",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    type: text("type", { enum: EXAMPLE_POST_TYPES }).notNull(),
    title: text("title").notNull(),
    format: text("format"),
    body: text("body"),
    url: text("url"),
    /** Stable key for seeded rows so the seed can upsert; null for user-added rows. */
    seedKey: text("seed_key"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("example_post_ws_seed_key").on(t.workspaceId, t.seedKey)],
);

export const pillar = sqliteTable(
  "pillar",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("pillar_ws_name").on(t.workspaceId, t.name)],
);

export const JOB_STATUSES = ["queued", "running", "done", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const job = sqliteTable(
  "job",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status", { enum: JOB_STATUSES }).notNull().default("queued"),
    /** JSON */
    payload: text("payload").notNull().default("{}"),
    /** JSON */
    result: text("result"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAfter: integer("run_after", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast(unixepoch('subsec') * 1000 as integer))`),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("job_status_run_after").on(t.status, t.runAfter),
    index("job_ws_created").on(t.workspaceId, t.createdAt),
  ],
);

export const aiUsage = sqliteTable(
  "ai_usage",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    /** What the call was for, e.g. "ai_test", "research.summarise". */
    step: text("step").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputChars: integer("input_chars").notNull().default(0),
    outputChars: integer("output_chars").notNull().default(0),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: real("cost_usd").notNull().default(0),
    /** Tavily credits used by this call (null for AI calls). */
    credits: integer("credits"),
    /** True when the call is billed outside a subscription/free tier and counts toward the cap. */
    isPaid: integer("is_paid", { mode: "boolean" }).notNull().default(false),
    ok: integer("ok", { mode: "boolean" }).notNull().default(true),
    error: text("error"),
    durationMs: integer("duration_ms"),
    jobId: integer("job_id").references(() => job.id, { onDelete: "set null" }),
    /** Related content item (table arrives in a later phase). */
    contentItemId: integer("content_item_id"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_ws_created").on(t.workspaceId, t.createdAt)],
);

/** Global key/value settings (JSON values). The only table without workspace_id. */
export const setting = sqliteTable("setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Phase 1: weekly plan + research
// ---------------------------------------------------------------------------

export const WEEK_PLAN_STATUSES = ["draft", "locked"] as const;
export type WeekPlanStatus = (typeof WEEK_PLAN_STATUSES)[number];

export const weekPlan = sqliteTable(
  "week_plan",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    /** Monday of the week, YYYY-MM-DD in Asia/Ho_Chi_Minh. */
    weekStart: text("week_start").notNull(),
    status: text("status", { enum: WEEK_PLAN_STATUSES }).notNull().default("draft"),
    /** JSON, see WeekConfig in src/features/week-plan/config.ts */
    config: text("config").notNull().default("{}"),
    lockedAt: integer("locked_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("week_plan_ws_week").on(t.workspaceId, t.weekStart)],
);

export const CONTENT_TYPES = ["seo", "social"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const SOCIAL_FORMATS = ["khoanh_khac", "goc_nhin", "carousel"] as const;
export type SocialFormat = (typeof SOCIAL_FORMATS)[number];

/** PLAN section 3. Only a user action moves an item to approved and beyond. */
export const CONTENT_STATUSES = [
  "idea",
  "draft",
  "in_review",
  "approved",
  "scheduled",
  "published",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const RESEARCH_PACK_STATUSES = ["queued", "running", "done", "failed"] as const;
export type ResearchPackStatus = (typeof RESEARCH_PACK_STATUSES)[number];

export const researchPack = sqliteTable(
  "research_pack",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    weekPlanId: integer("week_plan_id")
      .notNull()
      .references(() => weekPlan.id, { onDelete: "cascade" }),
    pillarId: integer("pillar_id")
      .notNull()
      .references(() => pillar.id, { onDelete: "restrict" }),
    status: text("status", { enum: RESEARCH_PACK_STATUSES }).notNull().default("queued"),
    /** JSON string[] */
    queries: text("queries").notNull().default("[]"),
    /**
     * JSON Candidate[] (url, title, score, state pending/done/failed). Lets a retried job resume
     * without paying for the searches again.
     */
    candidates: text("candidates").notNull().default("[]"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("research_pack_week_pillar").on(t.weekPlanId, t.pillarId)],
);

export const contentItem = sqliteTable(
  "content_item",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    weekPlanId: integer("week_plan_id")
      .notNull()
      .references(() => weekPlan.id, { onDelete: "cascade" }),
    type: text("type", { enum: CONTENT_TYPES }).notNull(),
    pillarId: integer("pillar_id").references(() => pillar.id, { onDelete: "set null" }),
    topic: text("topic").notNull().default(""),
    mainKeyword: text("main_keyword"),
    angle: text("angle").notNull().default(""),
    socialFormat: text("social_format", { enum: SOCIAL_FORMATS }),
    /** YYYY-MM-DD */
    publishDate: text("publish_date").notNull(),
    status: text("status", { enum: CONTENT_STATUSES }).notNull().default("idea"),
    reason: text("reason").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    researchPackId: integer("research_pack_id").references(() => researchPack.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("content_item_week").on(t.weekPlanId, t.publishDate),
    index("content_item_ws_created").on(t.workspaceId, t.createdAt),
  ],
);

export const SOURCE_ORIGINS = ["auto", "pasted"] as const;
export const SOURCE_STATUSES = ["active", "dropped"] as const;
export const EXCERPT_MAX = 500;

/** Never stores full page text: only summary + a short excerpt. */
export const source = sqliteTable(
  "source",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    researchPackId: integer("research_pack_id")
      .notNull()
      .references(() => researchPack.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title").notNull().default(""),
    domain: text("domain").notNull().default(""),
    origin: text("origin", { enum: SOURCE_ORIGINS }).notNull().default("auto"),
    /** Higher = more important. Pasted URLs get a high priority. */
    priority: integer("priority").notNull().default(0),
    status: text("status", { enum: SOURCE_STATUSES }).notNull().default("active"),
    summary: text("summary").notNull().default(""),
    /** At most EXCERPT_MAX characters. */
    excerpt: text("excerpt").notNull().default(""),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("source_pack_url").on(t.researchPackId, t.url)],
);

export const FACT_CARD_KINDS = ["fact", "question", "outline", "gap"] as const;
export type FactCardKind = (typeof FACT_CARD_KINDS)[number];

export const factCard = sqliteTable(
  "fact_card",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    researchPackId: integer("research_pack_id")
      .notNull()
      .references(() => researchPack.id, { onDelete: "cascade" }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => source.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: FACT_CARD_KINDS }).notNull(),
    text: text("text").notNull(),
    needsCheck: integer("needs_check", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("fact_card_pack").on(t.researchPackId), index("fact_card_source").on(t.sourceId)],
);

export type Workspace = typeof workspace.$inferSelect;
export type BrandProfile = typeof brandProfile.$inferSelect;
export type ExamplePost = typeof examplePost.$inferSelect;
export type Pillar = typeof pillar.$inferSelect;
export type Job = typeof job.$inferSelect;
export type AiUsage = typeof aiUsage.$inferSelect;
export type WeekPlan = typeof weekPlan.$inferSelect;
export type ContentItem = typeof contentItem.$inferSelect;
export type ResearchPack = typeof researchPack.$inferSelect;
export type Source = typeof source.$inferSelect;
export type FactCard = typeof factCard.$inferSelect;
