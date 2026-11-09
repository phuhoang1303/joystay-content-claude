# Joystay Content Platform

Web app chạy trên máy (localhost): lên kế hoạch nội dung theo tuần, research, viết bài SEO tiếng Việt cho joystay.vn và bài Facebook, chuẩn bị ảnh. Joystay là workspace đầu tiên.

- Spec: [docs/PLAN.md](docs/PLAN.md) · Tiến độ: [docs/STATUS.md](docs/STATUS.md) · Quy tắc làm việc: [CLAUDE.md](CLAUDE.md)

## Yêu cầu

- **Node.js 22 LTS** (xem `.nvmrc`). `better-sqlite3` là module native, được build cho đúng phiên bản Node lúc `npm install`. Nếu đổi phiên bản Node, chạy lại `npm install` (hoặc `npm rebuild better-sqlite3`).
  - Dùng nvm-windows: `nvm install 22` rồi `nvm use 22` (lệnh này đổi Node mặc định của cả máy).
- **Claude Code CLI** đã cài và đã đăng nhập: chạy `claude` một lần trong terminal để đăng nhập. App gọi `claude -p` bằng gói Claude sẵn có của bạn.
- Windows: đường dẫn dự án có dấu cách, luôn để đường dẫn trong ngoặc kép khi viết script.

## Cài đặt lần đầu

```bash
npm install
```

```bash
cp .env.example .env.local
```

Mở `.env.local` và điền khoá cần dùng (Phase 0 không cần khoá nào).

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Mở http://localhost:3000. `npm run dev` chạy cùng lúc web (Next.js) và worker (xử lý job nền).

## Lệnh

| Lệnh | Việc |
| --- | --- |
| `npm run dev` | Web (http://localhost:3000, chỉ nghe trên 127.0.0.1) + worker, tự tải lại khi sửa code |
| `npm run dev:web` / `npm run dev:worker` | Chạy riêng từng phần |
| `npm run worker` | Worker không watch |
| `npm run db:generate` | Sinh migration mới từ `src/lib/db/schema.ts` (commit thư mục `drizzle/`) |
| `npm run db:migrate` | Áp migration vào `${DATA_DIR}/app.db` |
| `npm run db:seed` | Seed workspace Joystay từ `docs/` (chạy lại an toàn: chỉ thêm phần còn thiếu, không ghi đè chỉnh sửa) |
| `npm run lint` · `npm run typecheck` · `npm test` | Kiểm tra trước khi commit |
| `npm run format` | Prettier |

## Dữ liệu và bí mật

- Database SQLite: `${DATA_DIR}/app.db` (mặc định `.data/app.db`, đã gitignore). Muốn làm lại từ đầu: xoá thư mục `.data/` rồi migrate + seed.
- Khoá API chỉ nằm trong `.env.local`, chỉ đọc ở server. Trang Cài đặt › Kết nối chỉ hiện "Đã có / Chưa có".
- Biến môi trường tuỳ chọn cho Phase 0: `DATA_DIR`, `MONTHLY_PAID_CAP_USD` (hạn mức mặc định, Cài đặt có thể ghi đè), `CLAUDE_CLI_PATH` (nếu `claude` không nằm trong PATH).

## AI provider

Mọi lệnh gọi AI đi qua `src/lib/ai` (`generateText({ tier, system, prompt, json })`). Mỗi lệnh gọi ghi đúng một dòng `ai_usage`, kể cả khi lỗi.

| Provider | Trạng thái |
| --- | --- |
| `claude-cli` (mặc định) | Hoạt động. Không tính vào hạn mức trả phí (cost = 0). |
| `anthropic-api` | Stub, sẽ hoàn thiện sau. Là provider trả phí, bị chặn khi chạm hạn mức. |
| `manual` | Stub: trả về trạng thái "chờ dán kết quả". |

Lệnh chính xác mà `claude-cli` chạy (đã kiểm tra với Claude Code 2.1.310):

```text
claude -p --output-format json --model <haiku|sonnet> --tools "" --strict-mcp-config \
       --disable-slash-commands --no-session-persistence --system-prompt-file <file tạm>
```

- `fast` → `haiku`, `smart` → `sonnet`. Prompt gửi qua stdin, system prompt ghi vào file tạm (tránh giới hạn độ dài dòng lệnh của Windows).
- `--tools ""` tắt toàn bộ tool. Lệnh chạy trong thư mục trống `%TEMP%\joystay-claude-cli`, nên không đọc `CLAUDE.md` hay settings của dự án.
- `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` bị loại khỏi môi trường của tiến trình con. Nếu không loại, CLI sẽ tính tiền theo API thay vì theo gói subscription.
- Timeout 180 giây. Thiếu lệnh `claude` → job thất bại ngay (không thử lại) với thông báo tiếng Việt.

## Worker

`scripts/worker.ts`: kiểm tra bảng `job` mỗi 2 giây, nhận job theo kiểu atomic, mỗi lần chạy một job.

- Trạng thái job: `queued → running → done | failed`.
- Lỗi thử lại được thì thử lại tối đa 3 lần, chờ 2 giây rồi 8 giây.
- Khi khởi động, job còn kẹt ở `running` (do lần trước bị dừng đột ngột) được đưa lại vào hàng đợi.
- Ctrl+C: dừng nhận job mới và đợi job đang chạy tối đa 10 giây.
- Thêm loại job mới trong `src/lib/jobs/registry.ts`.

## Cấu trúc

```text
scripts/            worker.ts, migrate.ts, seed.ts
drizzle/            migration đã commit
src/app/(admin)/    các trang (sidebar tiếng Việt)
src/app/api/jobs/   trạng thái job cho UI polling
src/features/       settings, dashboard, workspace (UI + server actions + queries)
src/lib/ai/         provider layer (claude-cli, stubs, fake)
src/lib/jobs/       hàng đợi, runner, handlers
src/lib/db/         schema, client, seed
src/lib/cost/       hạn mức chi phí trả phí
tests/              Vitest
```
