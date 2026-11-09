import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardData } from "@/features/dashboard/queries";
import { getCurrentWorkspace } from "@/features/workspace/server";

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  queued: { label: "Đang chờ", variant: "secondary" },
  running: { label: "Đang chạy", variant: "secondary" },
  done: { label: "Xong", variant: "default" },
  failed: { label: "Thất bại", variant: "destructive" },
};

const JOB_LABELS: Record<string, string> = { ai_test: "Kiểm tra kết nối Claude" };

const fmtTime = (d: Date) =>
  d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

export default async function DashboardPage() {
  const ws = await getCurrentWorkspace();
  const d = getDashboardData(ws.id);
  const pct = Math.min(100, Math.round(d.cap.ratio * 100));

  return (
    <>
      <PageHeader title="Tổng quan" description={`${ws.name} · ${d.monthLabel}`} />

      <div className="grid gap-4 md:grid-cols-2">
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
                  <span className="text-xs text-muted-foreground">{fmtTime(j.createdAt)}</span>
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
