import { dbFilePath, getDb, runMigrations } from "@/lib/db/client";
import { requeueStale } from "@/lib/jobs/queue";
import { createRegistry } from "@/lib/jobs/registry";
import { runOnce } from "@/lib/jobs/runner";

const POLL_MS = 2_000;
const SHUTDOWN_GRACE_MS = 10_000;

const db = getDb();
runMigrations(db);
const registry = createRegistry();
const stale = requeueStale(db);

const abort = new AbortController();
let stopping = false;
let wake: (() => void) | null = null;

function log(msg: string) {
  console.log(`[worker ${new Date().toLocaleTimeString("vi-VN")}] ${msg}`);
}

async function loop() {
  log(`Bắt đầu. DB: ${dbFilePath()}. Loại job: ${Object.keys(registry).join(", ")}.`);
  if (stale) log(`Đưa lại ${stale} job đang chạy dở vào hàng đợi.`);
  while (!stopping) {
    const outcome = await runOnce(db, registry, { signal: abort.signal });
    if (outcome.kind === "done") log(`Job #${outcome.jobId} xong.`);
    else if (outcome.kind === "retry") log(`Job #${outcome.jobId} lỗi, sẽ thử lại: ${outcome.error}`);
    else if (outcome.kind === "failed") log(`Job #${outcome.jobId} thất bại: ${outcome.error}`);
    if (outcome.kind === "idle" && !stopping) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, POLL_MS);
        wake = () => {
          clearTimeout(t);
          resolve();
        };
      });
      wake = null;
    }
  }
}

const running = loop();

function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log(`Nhận ${signal}, đang dừng...`);
  wake?.();
  const force = setTimeout(() => {
    log("Job hiện tại chưa xong, huỷ và thoát.");
    abort.abort();
  }, SHUTDOWN_GRACE_MS);
  running
    .catch((err) => log(`Lỗi vòng lặp: ${err instanceof Error ? err.message : String(err)}`))
    .finally(() => {
      clearTimeout(force);
      db.$client.close();
      log("Đã dừng.");
      process.exit(0);
    });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
