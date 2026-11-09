# Joystay Content Platform - Plan (v2, agreed 2026-11-09)

Human-readable version with diagrams: Claude Doc "Content Platform - Plan build" (claude.ai artifact). This file is the build spec for Claude Code.

## 1. Goal and MVP
- Local web app for one user (owner), Vietnamese UI, admin layout like WordPress/Shopify.
- **MVP done when** the platform runs 4 consecutive real weeks for Joystay: each week has a plan, SEO and social posts approved by the user and published, and paid-API spend stays under the cap.
- Default weekly volume: **2 SEO articles + 4 Facebook posts** (configurable per week).
- Not in MVP: monthly plans, Instagram/TikTok, video, analytics, multi-user, access from outside the PC, auto-publishing to Facebook via API.

## 2. Architecture
- One Next.js app (UI + server actions/API routes) + one worker process, both on the owner's PC.
- SQLite file in `DATA_DIR`. Secrets in `.env.local`.
- Worker picks jobs from `job` table: research, writing, image fetch/render, publish.
- External: Tavily (research), Claude via `claude -p` (text), Google Drive (real photos), Gemini API / OpenAI (AI images), Pexels/Unsplash (stock), Sanity (joystay.vn blog), Facebook (manual scheduling in MVP).

## 3. UI - left sidebar tabs
| Tab (VI) | Purpose | Primary action |
| --- | --- | --- |
| Tổng quan | This week: posts to write / to review / published; usage and paid spend this month | - |
| Kế hoạch tuần | Pick week, set post counts per theme, AI proposes topics, drag to reschedule | Tạo kế hoạch / Chốt tuần |
| Research | Research pack per theme of the week; view, drop sources, paste URLs | Research tuần này |
| Bài SEO | SEO articles by status; editor + SEO score panel | Viết bài / Xuất bản |
| Bài Social | Facebook captions; preview like a real FB post with images | Viết caption / Đánh dấu đã lên lịch |
| Ảnh | Images for a post: AI prompt/auto, Drive photo (+ optional headline), stock | Tạo ảnh |
| Thư viện ảnh | Synced Drive photos + generated images, filter by folder/tag | Đồng bộ Drive |
| Cài đặt | Brand Profile, example posts, pillars, connections, API keys status, AI provider, cost cap | Lưu |

Workspace switcher at the top. One primary action per screen. Hide model/prompt/token details from main screens.

**Status flow (every post):** `idea -> draft -> in_review -> approved -> scheduled -> published`. Only the user moves to `approved` and beyond.

## 4. Weekly planning
1. User picks a week and sets counts per theme (e.g. 2 SEO split across "ăn uống" and "du lịch"; 4 social).
2. "Tạo kế hoạch": AI returns per post: topic, main keyword (SEO), angle, social format, publish date, reason.
3. Inputs: brand profile, pillars, holidays/seasons that week, topics used in the last 90 days (avoid repeats), keywords the user wants.
4. User edits/deletes/drags, then "Chốt tuần" -> enqueue research jobs, then drafting jobs.
- Default pillars for Joystay: ăn uống địa phương; du lịch & lịch trình Sài Gòn; mẹo đặt phòng & chuẩn bị chuyến đi; trải nghiệm ở Joystay; ưu đãi theo mùa.

## 5. Research (hybrid, once per theme per week)
1. On "Chốt tuần", per theme: AI writes 3-4 search queries from that theme's topics/keywords -> Tavily search -> extract the 10-15 best pages.
2. Each page -> **fact card(s)** via cheap model (Haiku): fact + source URL, reader questions, outline of top-ranking article, gaps.
3. User-pasted URLs processed the same way with high priority.
4. User may drop weak sources in the Research tab.
5. Before writing each article: if the pack has fewer than 5 relevant cards for its keyword -> one extra query, 5 pages.
- Social reuses the week's packs + brand profile; no separate research.
- Store URL, fetched date, summary, fact cards. Never store or republish full source text. Volatile facts (prices, hours) flagged `needs_check`.
- Tavily free tier: 1,000 credits/month; expected usage ~60-100/month.

## 6. Writing
Principle: sources give facts and angles; writers work from brief + fact cards only.

### 6a. SEO (Vietnamese)
1. SEO brief: intent, main/secondary keywords, H2/H3 outline from top-ranking pages, reader questions, gaps, Joystay-specific details to include.
2. Draft; each fact references its card.
3. **Code-based checks** (no AI cost), shown as a score panel: title <= 60 chars, meta 140-160 chars, short ASCII slug, one H1, keyword in title + first 100 words + at least one H2, no stuffing, internal links, alt text on all images, FAQ + FAQ/Article schema, overlap with sources under threshold, every number/price/hour has a source.
4. One AI revision pass fixing reported issues -> `in_review`.
- Style rules: `docs/style/seo-style.md`.

### 6b. Social (Facebook, human voice)
- Three formats: Khoảnh khắc ở Joystay (2/week), Góc nhìn / kiến thức (1/week), Carousel chủ đề (1/week, cut from that week's SEO article). Details: `docs/style/social-style.md`.
- Process: 3 variants (different hook/length) -> AI-tell checker (regex ban list + one AI "does this sound human" pass) -> rewrite flagged parts -> user picks one.
- Learn from the user: edited final versions saved as new `example_post`; phrases the user deletes repeatedly are proposed for the ban list.

## 7. Images
| Source | Use | How |
| --- | --- | --- |
| A. AI image (default for non-room posts) | Inspiration, food, travel; SEO illustrations | Platform writes the prompt -> user copies to ChatGPT/Gemini/Flow/Grok and saves into the post's Drive folder `AI-generated/<post-id>/`; or "Tạo tự động" via Gemini API (Google AI Pro includes $10 Cloud credit/month); OpenAI $5 credit as fallback |
| B. Real photo from Drive | Rooms, amenities, area. Only source for posts about rooms | Suggested by folder (Drive already organised by room/area); optional code-rendered headline |
| C. Stock | SEO illustrations (dishes, landmarks) | Pexels/Unsplash API by keyword; save author + license for attribution |
- Prompts default to **no text in AI images**; if text requested, review step reminds to check Vietnamese spelling.
- **Headline on Drive photo** (in MVP): headline suggested from post (<= ~8 words, editable); 3 layouts (top corner, bottom band, centre on blurred band); optional Joystay logo; dark gradient for contrast; brand font/colours; drag to adjust; export PNG. Rendered by code, never by AI image editing.
- Sizes: 1080x1350 (4:5 single), 1080x1080 (1:1 carousel, 3-4 images), 1200x630 (SEO cover). Auto crop + compress with sharp. Approved images are locked.
- Google Drive: OAuth once; read source folders; write access to `AI-generated/`. Store file list + thumbnails locally; download originals only when used. Tags from folder names.

## 8. Publishing
- **SEO -> joystay.vn:** site is Next.js on Vercel with `/blog` backed by **Sanity CMS**. Adapter `sanity` creates the article as a **draft** document via Sanity API; user publishes. Fallback adapter `export-file` (Markdown/HTML + meta JSON + images). Needs: project ID, dataset, API version, write token, `post` schema field names (from website repo).
- Website-side fixes to do alongside (in the website repo, not here): JSON-LD Article/FAQ on post pages; Open Graph type `article` with the post's own title/image.
- **Social -> Facebook (MVP):** "Tải gói bài" = caption copied + images named in order; user schedules in Meta Business Suite and marks the post `scheduled`. Graph API scheduling is after MVP.
- Adapter interface: `publish(post) -> { externalId, url }`.

## 9. AI and cost
- Text: Claude via `claude -p` using the owner's existing subscription (counts toward plan usage limits). Haiku for summarising sources, Sonnet for planning and writing. All tools disabled; JSON output.
- Provider layer modes: `claude-cli` (default), `anthropic-api`, `manual` (show prompt, paste result). Switching modes needs no change to writing logic.
- Paid cap applies to paid APIs only (Gemini beyond credit, OpenAI, Tavily beyond free tier). Every call logs to `ai_usage` (step, provider, model, input/output size, cost USD, related post).
- Risk: `claude -p` with a subscription is not an official app path and may change; keep `anthropic-api` and `manual` working.

## 10. Data model (columns finalised during build)
workspace, brand_profile, example_post, pillar, week_plan, content_item, content_version, research_pack, source, fact_card, drive_file, image, job, ai_usage, publish_log, setting. Every table except setting carries `workspace_id`.

## 11. Roadmap and gates
| Phase | Scope | Gate (must be shown working) |
| --- | --- | --- |
| 0 Foundation (~1 wk) | Repo, admin layout, SQLite + Drizzle, worker + job table, Settings + Brand Profile, provider layer + usage logging | localhost opens, Brand Profile saves, test AI job returns a Claude response and logs usage |
| 1 Weekly plan + research (~1-2 wk) | Week plan, drag/drop, lock week; Tavily packs, pasted URLs, fact cards | One real week locked with research packs for 2 themes |
| 2 SEO (~2 wk) | SEO brief, draft, TipTap editor, code-based SEO score, Sanity draft publish + export fallback | 2 SEO articles approved and live on joystay.vn |
| 3 Social (~1 wk) | 3 formats, 3 variants, AI-tell checker, FB preview, learn from edits | 4 captions approved with only light edits |
| 4 Drive + images (~2 wk) | Drive OAuth + sync, AI prompt/auto images, stock search, headline on Drive photo, export package | One week posted with images produced by the tool |
| MVP | - | 4 consecutive real weeks |
| 5 After MVP | FB Graph API scheduling, team access, monthly plan, second workspace | - |

## 12. Risks
- Repeating the old project's mess -> this plan + phase gates + CLAUDE.md rules.
- Social still sounds like AI -> examples, ban list, checker pass, learning from edits.
- Wrong facts -> Joystay facts only from Brand Profile; volatile facts flagged.
- Claude subscription limits/policy -> provider fallbacks.
- Google OAuth testing-mode re-auth -> document setup; handle expired tokens gracefully.
