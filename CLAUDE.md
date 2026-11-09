# Joystay Content Platform

Local web app (localhost) that plans content weekly, researches each week's themes once, writes Vietnamese SEO articles for joystay.vn and human-sounding Facebook posts, and prepares images. Joystay is the first workspace; other brands are added as new workspaces, not new code.

## Read first
- `docs/PLAN.md` - the spec. Single source of truth. If code and plan disagree, ask; do not invent.
- `docs/STATUS.md` - which phase we are in, what is done, open items.
- `docs/briefs/phase-N.md` - the brief for the current phase. Work only on that phase.
- `docs/brand/joystay.md`, `docs/style/*.md` - brand facts and writing style (used as seed data and prompts).

## Hard rules (never break)
1. **Humans approve, AI never does.** Only a user action moves an item to `approved`, `scheduled` or `published`. No code path auto-approves or auto-publishes.
2. **Secrets:** never read, print or log `.env*` values. Keys come from `process.env` on the server only; nothing secret reaches the browser bundle.
3. **Research sources:** Tavily API and URLs the user pastes. No scraping Facebook, TikTok or other social networks.
4. **No copying:** sources give facts and angles. Writers work from briefs and fact cards, never from raw source text. Every number, price, address and opening hour in an article must link to a fact card with a source URL.
5. **Images:** never use AI to depict or edit Joystay's real rooms. Text on real photos is rendered by our code, not by an AI model. No random web images - stock only from Pexels/Unsplash with attribution saved.
6. **AI calls go through the provider layer** (`claude-cli` default, `anthropic-api`, `manual`). `claude -p` runs with all tools disabled and returns JSON. Every external call (AI, Tavily, image APIs) writes one `ai_usage` row.
7. **Paid-API cap:** block paid calls when the month reaches `MONTHLY_PAID_CAP_USD`; warn at 80%.
8. **Scope discipline:** build only what the current phase brief lists. Propose extras in `docs/STATUS.md` under "Ideas", do not build them. Ask before adding a dependency not in the stack below.

## Stack
- Next.js (App Router) + TypeScript strict, Tailwind, shadcn/ui
- SQLite via Drizzle ORM (better-sqlite3); DB file in `DATA_DIR` (default `.data/`, gitignored)
- Background worker: separate Node process (`tsx`) polling the `job` table
- Editor: TipTap. Drag and drop: dnd-kit. Images: sharp. Tests: Vitest.
- Integrations (later phases): Tavily, Claude CLI, Gemini API / OpenAI images, Pexels/Unsplash, Google Drive (googleapis), Sanity client

## Conventions
- Code, identifiers, commits in English. **All UI text in Vietnamese.**
- Small modules by feature: `src/features/<feature>/` (ui, server actions, services, schema). Shared code in `src/lib/`.
- Server-only code (DB, secrets, AI) never imported from client components.
- Every external integration sits behind an interface with a fake implementation for tests.
- Windows machine, project path contains spaces: always quote paths in scripts.

## Workflow per task
1. Start in Plan mode: restate the goal, list files to touch, wait for approval.
2. Implement in small steps; run `npm run lint`, `npm run typecheck`, `npm test` before saying done.
3. Check the phase gate (acceptance criteria) in the brief, item by item, with evidence.
4. Update `docs/STATUS.md`. Commit with message `phase-N: <what>`. Never push unless asked.

## Commands
Fill in during Phase 0 (expected: `npm run dev` starts web + worker, `npm run db:migrate`, `npm run db:seed`, `npm run lint`, `npm run typecheck`, `npm test`).
