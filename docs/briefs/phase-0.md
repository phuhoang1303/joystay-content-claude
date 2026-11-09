# Phase 0 - Foundation

**Goal:** a running local app skeleton that every later phase builds on: admin layout, database, background worker, Settings with Brand Profile, and a working AI provider layer that logs usage. No content features yet.

Read `CLAUDE.md` and `docs/PLAN.md` first. Start in Plan mode and get approval before writing code.

## Scope
1. **Scaffold** in this folder (it already contains docs; keep them): Next.js App Router, TypeScript strict, Tailwind, shadcn/ui, ESLint + Prettier, Vitest. Node 22 LTS. `git init` with the existing `.gitignore`.
2. **Admin layout** (Vietnamese UI): fixed left sidebar with Tổng quan, Kế hoạch tuần, Research, Bài SEO, Bài Social, Ảnh, Thư viện ảnh, Cài đặt; workspace switcher at the top. Pages other than Tổng quan and Cài đặt show a clean "Sắp có" placeholder naming their phase. Calm, clean admin look; light theme first.
3. **Database:** SQLite via Drizzle + better-sqlite3, file at `${DATA_DIR}/app.db`. Migrations committed. Phase 0 tables: `workspace`, `brand_profile`, `example_post`, `pillar`, `job`, `ai_usage`, `setting`. (Other tables from PLAN section 10 come in their phases.)
4. **Seed** (`npm run db:seed`, idempotent): workspace "Joystay"; brand profile from `docs/brand/joystay.md`; default pillars from PLAN section 4; example posts from `docs/style/social-examples.md` (type `social`) and the reference URLs in `docs/style/seo-style.md` (type `seo`, URL only); SEO and social style rules from `docs/style/*.md` stored as brand-profile text fields.
5. **Cài đặt page** with sections:
   - Brand Profile form: name, tagline, website, location, description, target guests, rooms/products (free text), contact, SEO style rules, social style rules, banned phrases (one per line). Save + persisted.
   - Pillars: list, add, rename, delete.
   - Example posts: list, add, delete.
   - AI: provider select (`claude-cli` / `anthropic-api` / `manual`), monthly paid cap (USD), and a "Kiểm tra kết nối Claude" button.
   - Connections: show which env keys are present (present/missing only, never values).
6. **Worker:** `scripts/worker.ts` run with tsx; polls `job` every 2 s; job-type registry; statuses `queued/running/done/failed`; retries with backoff (max 3); stores result/error; graceful shutdown. `npm run dev` starts Next.js and the worker together (e.g. concurrently).
7. **AI provider layer** (`src/lib/ai/`): interface `generateText({ tier: 'fast' | 'smart', system, prompt, json?: boolean })` -> `{ text, usage, provider, model }`, where `fast` = Haiku and `smart` = Sonnet.
   - `claude-cli`: spawns `claude -p` with JSON output, model chosen by tier, **all tools disabled**, prompt via stdin, timeout. Check the real flags with `claude --help` on this machine before relying on them; document the exact command in README.
   - `anthropic-api` and `manual`: interface-complete stubs (manual returns a "waiting for paste" state) to be finished later.
   - Every call writes an `ai_usage` row (step, provider, model, input/output characters or tokens if reported, cost_usd = 0 for claude-cli, related ids).
   - Fake provider for tests.
8. **Test job:** the Settings button enqueues an `ai_test` job; worker calls the provider with a short Vietnamese prompt; UI shows the reply and the new usage row.
9. **Tổng quan page:** counts for this month: AI calls by provider, paid spend vs cap (0 for now), last 5 jobs with status.
10. **README.md:** prerequisites (Node 22, Claude Code CLI installed and logged in), setup (`npm install`, copy `.env.example` to `.env.local`, migrate, seed, dev), commands. Fill the Commands section of `CLAUDE.md`.

## Out of scope
Research, Tavily, writing, editor, images, Drive, Sanity, Facebook, auth/multi-user.

## Gate (show evidence for each before calling Phase 0 done)
- [ ] Fresh clone: `npm install`, migrate, seed, `npm run dev` -> http://localhost:3000 opens with the sidebar; every tab navigates.
- [ ] Brand Profile edit saves and survives a restart.
- [ ] "Kiểm tra kết nối Claude" -> job goes `queued -> running -> done`, a Vietnamese reply is shown, an `ai_usage` row exists.
- [ ] With `claude` missing from PATH, the job fails with a clear Vietnamese error, not a crash.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass; tests cover the job runner and provider layer with the fake provider.
- [ ] No secret value appears in the browser bundle, logs or the Connections section.
- [ ] `docs/STATUS.md` updated; one commit per logical step, messages `phase-0: ...`; nothing pushed.
