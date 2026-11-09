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

export type Workspace = typeof workspace.$inferSelect;
export type BrandProfile = typeof brandProfile.$inferSelect;
export type ExamplePost = typeof examplePost.$inferSelect;
export type Pillar = typeof pillar.$inferSelect;
export type Job = typeof job.$inferSelect;
export type AiUsage = typeof aiUsage.$inferSelect;
