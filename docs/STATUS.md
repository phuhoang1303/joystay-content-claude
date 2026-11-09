# Status

**Current phase:** 1 - Weekly plan + research (waiting for brief `docs/briefs/phase-1.md`)
**Last updated:** 2026-11-09

## Phases
| Phase | Name | State |
| --- | --- | --- |
| 0 | Foundation | done, approved by owner 2026-11-09 |
| 1 | Weekly plan + research | - |
| 2 | SEO writing + Sanity publish | - |
| 3 | Social writing | - |
| 4 | Drive + images | - |
| MVP gate | 4 consecutive real weeks | - |

## Phase 0 gate evidence (2026-11-09)
- [x] **Fresh clone:** `git clone` into an empty folder (path with spaces) -> `npm install` -> `npm run db:migrate` -> `npm run db:seed` ("5 chủ đề, 6 bài mẫu") -> `npm run dev`. All 8 tabs return 200 and the worker starts. Copying `.env.example` was skipped in this check (Phase 0 needs no keys).
- [x] **Brand Profile persists:** edited Tagline and Khách mục tiêu in the UI. The save message showed, the values were in `brand_profile`, and they were still in the form after stopping and restarting `npm run dev`.
- [x] **Claude test:** "Kiểm tra kết nối Claude" -> job #1 `queued -> running -> done`. Reply: "Chào chủ Joystay! Kết nối đã hoạt động ổn định...". Usage row #1: claude-cli, claude-haiku-5-5, 990 tokens in / 69 out, cost $0.
- [x] **claude missing:** restarted `npm run dev` with `claude` removed from PATH -> job #2 `failed` with "Không tìm thấy lệnh "claude" trên máy..." (no retries). The `ai_usage` row was saved with ok=false. The worker kept running.
- [x] **Checks:** `npm run lint`, `npm run typecheck`, `npm test` pass (28 tests: job queue/runner/retry/backoff, ai_test job with the fake provider, claude-cli with a fake spawn, paid cap, seed idempotency, env status).
- [x] **No secrets exposed:** with a temporary `.env.local` holding a canary key, the canary appeared 0 times in `.next/` (client and server), dev logs, the DB and the served HTML/API. Connections showed only "Đã có". The canary file was deleted afterwards. `claude-cli` removes `ANTHROPIC_API_KEY` from the CLI's environment.
- [x] **Commits:** one per step, `phase-0: ...`. Nothing pushed.

## Phase 0 notes
- Node 22.23.4 was installed with nvm-windows. The machine's default Node is still 26.8.2, and the project needs 22 (`.nvmrc`, `engines`). Run `nvm use 22` before `npm install` / `npm run dev`.
- `better-sqlite3` is pinned to v12. v13 builds from source (needs Visual Studio C++) when installed from the lockfile.
- Dependencies added beyond the stack (approved: concurrently, zod): `server-only` (Next.js guard against importing server code into client components), `cn` (added by the shadcn CLI, shadcn's own class merger). Plus `drizzle-kit`, `tsx`, `prettier`, `eslint-config-prettier`.
- The dev server binds to 127.0.0.1 (no LAN access). Next.js ignores `.data/` so SQLite writes don't trigger Fast Refresh.
- Timestamps are stored as integer ms. The initial migration was regenerated once during Phase 0, before any DB was shared.

## Open items (from user)
- [ ] Check that the key names in Settings › Kết nối (`src/features/settings/env-status.ts`) match `.env.example`. Claude cannot read `.env*` files.
- [ ] Sanity project ID, dataset, `post` schema from the website repo; Sanity write token (needed before Phase 2)
- [ ] Confirm joystay.vn blog renders Vietnamese posts at their own URLs (before Phase 2)
- [ ] Google Cloud project with billing enabled + Developer Program credits activated (before Phase 4 auto image generation)
- [ ] Brand Profile items marked (verify): exact address, room list/names, current prices, contact numbers

## Ideas (not scheduled)
- Disable Next.js anonymous telemetry (`NEXT_TELEMETRY_DISABLED=1`) since this is a private tool.
- On Windows, `concurrently -k` force-kills the worker, so the 10 s graceful shutdown only applies to Ctrl+C in a standalone `npm run worker`. Jobs left `running` are re-queued on the next start. Could add a shutdown endpoint or file flag if this matters.
- Manual provider: a paste-back screen for "chờ dán kết quả" jobs.
- Show the 80% paid-cap warning as a banner on every page, not only on Tổng quan.
