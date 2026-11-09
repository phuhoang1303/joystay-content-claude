import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardData } from "@/features/dashboard/queries";
import { getCurrentWorkspace } from "@/features/workspace/server";
import { formatWeekVi } from "@/lib/calendar/week";

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  queued: { label: "Đang chờ", variant: "secondary" },
  running: { label: "Đang chạy", variant: "secondary" },
  done: { label: "Xong", variant: "default" },
  failed: { label: "Thất bại", variant: "destructive" },
};

const JOB_LABELS: Record<string, string> = {
  ai_test: "Kiểm tra kết nối Claude",
  "plan.generate": "Tạo kế hoạch tuần",
  "plan.regenerate_item": "Đề xuất lại một bài",
  "research.pack": "Research gói chủ đề",
  "research.source": "Xử lý URL dán vào",
  "research.topup": "Tìm bổ sung",
};

const PACK_LABELS: Record<string, string> = { queued: "chờ", running: "đang chạy", done: "xong", failed: "lỗi" };

const fmtTime = (d: Date) =>
  d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

export default async function DashboardPage() {
  const ws = await getCurrentWorkspace();
  const d = getDashboardData(ws.id);
  const pct = Math.min(100, Math.round(d.cap.ratio * 100));

  return (
    <>
      <PageHeader title="Tổng quan" description={`${ws.name} · ${d.monthLabel}`} />

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        {d.weeks.map((w, i) => (
          <Card key={w.weekStart}>
            <CardHeader>
              <CardTitle>
                {i === 0 ? "Tuần này" : "Tuần sau"} · {formatWeekVi(w.weekStart)}
              </CardTitle>
              <CardDescription>
                {w.status === null ? "Chưa có kế hoạch" : w.status === "locked" ? "Đã chốt" : "Bản nháp"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {w.status === null ? (
                <Link href={`/ke-hoach-tuan?week=${w.weekStart}`} className="underline">
                  Lập kế hoạch
                </Link>
              ) : (
                <>
                  <p>
                    {w.seo} bài SEO · {w.social} bài social
                  </p>
                  <p className="text-muted-foreground">
                    Gói research:{" "}
                    {Object.keys(w.packs).length
                      ? Object.entries(w.packs)
                          .map(([s, n]) => `${n} ${PACK_LABELS[s] ?? s}`)
                          .join(", ")
                      : "chưa có"}
                  </p>
                  <Link href={`/ke-hoach-tuan?week=${w.weekStart}`} className="text-xs underline">
                    Mở kế hoạch
                  </Link>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Lượt gọi AI tháng này</CardTitle>
            <CardDescription>{d.totalCalls} lượt</CardDescription>
          </CardHeader>
          <CardContent>
            {d.byProvider.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có lượt gọi nào.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {d.byProvider.map((r) => (
                  <li key={r.provider} className="flex items-center justify-between">
                    <code className="text-xs">{r.provider}</code>
                    <span>
                      {r.calls} lượt
                      {Number(r.failed) > 0 ? (
                        <span className="ml-1 text-xs text-destructive">({r.failed} lỗi)</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chi phí API trả phí</CardTitle>
            <CardDescription>
              ${d.cap.spendUsd.toFixed(2)} / ${d.cap.capUsd.toFixed(2)} hạn mức
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div
                className={`h-full rounded-full ${d.cap.level === "blocked" ? "bg-destructive" : d.cap.level === "warn" ? "bg-amber-500" : "bg-primary"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {d.cap.level === "blocked"
                ? "Đã chạm hạn mức: các lệnh gọi API trả phí đang bị chặn."
                : d.cap.level === "warn"
                  ? "Đã dùng trên 80% hạn mức tháng này."
                  : "claude-cli dùng gói Claude sẵn có nên không tính vào hạn mức."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Credit Tavily tháng này</CardTitle>
            <CardDescription>
              {d.tavily.used} / {d.tavily.free.toLocaleString("vi-VN")} credit miễn phí
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={d.tavily.used} aria-valuemin={0} aria-valuemax={d.tavily.free}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (d.tavily.used / d.tavily.free) * 100)}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">Vượt 1.000 credit sẽ tính phí và áp dụng hạn mức chi phí.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Job gần đây</CardTitle>
        </CardHeader>
        <CardContent>
          {d.jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Chưa có job nào. Thử nút &quot;Kiểm tra kết nối Claude&quot; trong{" "}
              <Link href="/cai-dat#ai" className="underline">
                Cài đặt
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {d.jobs.map((j) => (
                <li key={j.id} className="flex items-center gap-3 py-2">
                  <span className="w-12 text-xs text-muted-foreground">#{j.id}</span>
                  <span className="flex-1">
                    {JOB_LABELS[j.type] ?? j.type}
                    {j.status === "failed" && j.error ? (
                      <span className="block truncate text-xs text-destructive">{j.error}</span>
                    ) : null}
                  </span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{fmtTime(j.createdAt)}</span>
                  <Badge variant={STATUS[j.status].variant}>{STATUS[j.status].label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
