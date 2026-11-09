# Phase 1 - Weekly plan + research

**Goal:** the owner plans a real week in the app (topics for 2 SEO + 4 social posts), locks it, and the worker builds one research pack per SEO theme from Tavily and pasted URLs, turned into fact cards ready for Phase 2 writing. No drafting yet.

Read `CLAUDE.md`, `docs/PLAN.md` sections 4-5 and 10, and `docs/STATUS.md` (Phase 0 notes). Start in Plan mode and get approval before writing code. Build on the Phase 0 structure (`src/features/*`, `src/lib/jobs`, `src/lib/ai`, Drizzle schema) - do not restructure it.

## Scope

### 1. Data (new migration)
- `week_plan`: workspace, `week_start` (Monday, date string `YYYY-MM-DD`, Asia/Ho_Chi_Minh), `status` (`draft` | `locked`), `config` JSON (SEO count per pillar, social count + format mix, target keywords, owner notes for the week), timestamps. Unique (workspace, week_start).
- `content_item`: workspace, week_plan, `type` (`seo` | `social`), pillar, `topic`, `main_keyword` (SEO), `angle`, `social_format` (`khoanh_khac` | `goc_nhin` | `carousel`, social only), `publish_date`, `status` (start at `idea`; full flow from PLAN section 3 as enum), `reason` (why AI proposed it), `sort_order`, `research_pack_id` nullable, timestamps. Later phases add brief/body/meta columns.
- `research_pack`: workspace, week_plan, pillar, `status` (`queued` | `running` | `done` | `failed`), `queries` JSON, `error`, timestamps. Unique (week_plan, pillar).
- `source`: workspace, research_pack, `url`, `title`, `domain`, `origin` (`auto` | `pasted`), `priority`, `status` (`active` | `dropped`), `summary`, `excerpt` (max ~500 chars), `fetched_at`. Unique (research_pack, url). **Do not store full page text.**
- `fact_card`: workspace, research_pack, source, `kind` (`fact` | `question` | `outline` | `gap`), `text`, `needs_check` boolean, timestamps.
- `ai_usage`: add nullable `credits` integer (Tavily credits per call).

### 2. Week utilities
- `src/lib/calendar/`: week start/end (Mon-Sun) in Asia/Ho_Chi_Minh, list of days, format in Vietnamese ("Thứ Hai 16/11").
- `vn-events.ts`: Vietnamese holidays and content occasions for 2026-2027. Fixed solar dates (1/1, 14/2, 8/3, 30/4, 1/5, 2/9, 20/10, 31/10, 20/11, 24-25/12) are fine as constants. **Lunar-based dates (Tết, Giỗ Tổ Hùng Vương, Trung thu, Vu Lan) must be verified from a reliable source before hard-coding**, with the source noted in a comment. Owner can extend this file.

### 3. Kế hoạch tuần tab
- Week picker (prev/next, defaults to next week). One plan per week; creating it uses pillars from Settings.
- Config form: choose SEO themes (pillars) with a count each (default: 2 SEO across 2 pillars, 1 each); social count (default 4) with format mix (default 2 khoảnh khắc, 1 góc nhìn, 1 carousel); optional target keywords; notes (events, promotions that week).
- **"Tạo kế hoạch"** enqueues `plan.generate` (tier `smart`, JSON). Inputs: brand profile, pillars, config, the week's dates, `vn-events` falling in that week, topics of `content_item` from the last 90 days (avoid repeats), social format definitions from `docs/style/social-style.md` (already in brand profile). Output per item: type, pillar, topic, main_keyword (SEO), angle, social_format (social), publish_date, reason. Validate with zod: counts match config, dates inside the week, formats valid, at most one post per channel per day unless counts force it. On invalid output retry once with the validation errors, then fail with a Vietnamese message.
- Carousel posts should reuse a topic from that week's SEO items (PLAN 6b).
- Board view: 7 day columns; cards show type badge, pillar, topic, keyword/format. Drag between days (dnd-kit) updates `publish_date`. Inline edit all fields, delete, add a manual item, **"Đề xuất lại"** on one card (`plan.regenerate_item`, keeps the rest).
- **"Chốt tuần"**: plan -> `locked`, board becomes read-only, then enqueue one `research.pack` job per distinct pillar used by SEO items, and link each social item to the pack of its pillar if one exists. "Mở khóa" is allowed with a warning; re-locking only enqueues packs that do not exist yet.

### 4. Tavily client
- `src/lib/research/tavily.ts` behind an interface with a fake. Use Tavily's current REST API for search and extract (check the official docs for endpoints, auth header and parameters before coding; note them in a comment). Basic search depth; Vietnamese-language results preferred.
- Credits: basic search = 1 credit; extract = 1 credit per 5 successful URLs. Log each call to `ai_usage` (provider `tavily`, model `search`/`extract`, `credits`, `is_paid` false while the month's total is within 1,000, otherwise true with cost 0.008 USD/credit so the paid cap applies).
- Missing `TAVILY_API_KEY` -> clear Vietnamese error, job fails without retries. HTTP 429/5xx -> retryable.

### 5. Research pipeline (worker jobs)
- `research.pack` (packId):
  1. Tier `fast`: write 3-4 Vietnamese search queries covering that pillar's SEO topics and keywords for the week.
  2. Search each query (about 8 results each), normalise and dedupe URLs, skip obvious junk (social networks, video sites, PDFs, the owner's own domain), rank, keep the 10-15 best.
  3. Extract in batches of 5. For each page, trim text to ~12k characters and call tier `fast` (JSON) -> summary, facts (each with `needs_check` for prices, hours, addresses, phone numbers), reader questions, outline of the page's headings, gaps. Save `source` + `fact_card` rows. Raw text is discarded after this step.
  4. Pack `done` when at least 8 sources succeeded; otherwise `failed` with how many succeeded.
- `research.source` (packId, url): same extract + summarise for one pasted URL, `origin` = pasted, high priority. Allowed for social-network URLs only if extract returns readable text; never scrape them another way.
- `research.topup` (packId, keyword): one extra query + up to 5 pages. Plus `packCoverage(packId, keyword)`: counts active fact cards relevant to the keyword (Vietnamese-diacritic-insensitive match on keyword tokens). Phase 2 calls this before writing; in Phase 1 expose a "Tìm bổ sung" button on SEO cards that runs topup when coverage < 5.

### 6. Research tab
- Pick week -> one panel per pack: status, queries used, credits used, list of sources (title, domain, origin, fetched date, number of cards, `needs_check` count), expand to read cards grouped by kind.
- Drop / restore a source (dropped sources' cards are excluded everywhere). Paste URL -> `research.source`. Retry a failed pack.
- Live status while jobs run (reuse the Phase 0 job polling).

### 7. Tổng quan + Cài đặt
- Tổng quan: this week's plan status, items by type, packs by status, Tavily credits used this month / 1,000.
- Cài đặt › Kết nối: Tavily key present/missing and this month's credits.

## Out of scope
Briefs and drafts, editor, SEO scoring, images, Drive, Sanity, Facebook, monthly plans.

## Before the gate (owner)
The owner adds `TAVILY_API_KEY` to `.env.local` (Claude Code cannot read or write `.env*`).

## Gate (show evidence for each)
- [ ] Next real week planned in the UI: 2 SEO items on 2 pillars + 4 social items with the default format mix; at least one card dragged to another day, one edited, one regenerated.
- [ ] Week locked -> 2 research packs reach `done`, each with >= 10 active sources and fact cards; volatile facts flagged `needs_check`.
- [ ] A pasted URL is processed into the right pack with origin `pasted`.
- [ ] Dropping a source removes its cards from the pack view and from `packCoverage`.
- [ ] Tavily credits for the week logged in `ai_usage` and shown on Tổng quan; total for the test week under 40 credits.
- [ ] Missing Tavily key -> clear Vietnamese error, no crash.
- [ ] No full page text stored in the DB (show a query proving `excerpt` <= 500 chars and no raw-text column).
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass. Tests cover: plan validation + retry, week/timezone utils, Tavily client with fake fetch (credit math, errors), research pipeline with fake Tavily + fake AI (dedupe, batching, done/failed threshold, drop), `packCoverage` with diacritics.
- [ ] `docs/STATUS.md` updated with gate evidence; commits `phase-1: ...`; nothing pushed.
