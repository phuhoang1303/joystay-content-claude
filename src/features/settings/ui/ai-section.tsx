"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveAiSettings, startClaudeTest } from "../actions";
import type { FormState } from "../schema";
import { FieldError, FormMessage, selectClass } from "./form-bits";

const PROVIDER_LABELS: Record<string, string> = {
  "claude-cli": "claude-cli (mặc định, dùng gói Claude trên máy)",
  "anthropic-api": "anthropic-api (trả phí theo lượt, chưa hoàn thiện)",
  manual: "manual (copy prompt, dán kết quả – chưa hoàn thiện)",
};

const STATUS_LABELS: Record<string, string> = {
  queued: "Đang chờ",
  running: "Đang chạy",
  done: "Xong",
  failed: "Thất bại",
};

type JobView = {
  id: number;
  status: "queued" | "running" | "done" | "failed";
  attempts: number;
  maxAttempts: number;
  result: { reply?: string; model?: string; provider?: string } | null;
  error: string | null;
  usage: {
    id: number;
    provider: string;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number;
    ok: boolean;
    durationMs: number | null;
  }[];
};

export function AiSection({ provider, monthlyPaidCapUsd }: { provider: string; monthlyPaidCapUsd: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAiSettings, {});

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ai-provider" className="mb-1.5">
              Nhà cung cấp AI
            </Label>
            <select id="ai-provider" name="provider" defaultValue={provider} className={selectClass}>
              {Object.entries(PROVIDER_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="ai-cap" className="mb-1.5">
              Hạn mức chi phí API trả phí mỗi tháng (USD)
            </Label>
            <Input
              id="ai-cap"
              name="monthlyPaidCapUsd"
              type="number"
              min={0}
              step="0.5"
              defaultValue={monthlyPaidCapUsd}
              aria-invalid={Boolean(state.errors?.monthlyPaidCapUsd)}
            />
            <FieldError message={state.errors?.monthlyPaidCapUsd} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Đang lưu..." : "Lưu cài đặt AI"}
          </Button>
          <FormMessage state={state} />
        </div>
      </form>
      <ClaudeTest />
    </div>
  );
}

function ClaudeTest() {
  const [job, setJob] = useState<JobView | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function poll(id: number) {
    try {
      const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as JobView;
      setJob(data);
      if (data.status === "queued" || data.status === "running") {
        timer.current = setTimeout(() => poll(id), 1000);
      }
    } catch {
      setError("Không đọc được trạng thái job.");
    }
  }

  async function start() {
    setError(null);
    setJob(null);
    setStarting(true);
    try {
      const { jobId } = await startClaudeTest();
      await poll(jobId);
    } finally {
      setStarting(false);
    }
  }

  const busy = starting || job?.status === "queued" || job?.status === "running";
  const usage = job?.usage.at(-1);

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={start} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Kiểm tra kết nối Claude
        </Button>
        {job ? (
          <span className="flex items-center gap-2 text-sm">
            Job #{job.id}
            <Badge
              variant={job.status === "failed" ? "destructive" : job.status === "done" ? "default" : "secondary"}
            >
              {STATUS_LABELS[job.status]}
            </Badge>
            {job.attempts > 1 ? (
              <span className="text-xs text-muted-foreground">
                lần thử {job.attempts}/{job.maxAttempts}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
      {job?.status === "queued" ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Nếu job đứng ở &quot;Đang chờ&quot; lâu, hãy kiểm tra worker đang chạy (lệnh npm run dev).
        </p>
      ) : null}
      {job?.status === "done" && job.result?.reply ? (
        <blockquote className="mt-3 rounded-md border-l-2 border-primary bg-background px-3 py-2 text-sm">
          {job.result.reply}
        </blockquote>
      ) : null}
      {job?.error && job.status !== "done" ? (
        <p className="mt-3 text-sm text-destructive">{job.error}</p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {usage ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Đã ghi usage #{usage.id}: {usage.provider} · {usage.model}
          {usage.inputTokens != null ? ` · ${usage.inputTokens} token vào / ${usage.outputTokens} token ra` : ""}
          {usage.durationMs != null ? ` · ${(usage.durationMs / 1000).toFixed(1)} giây` : ""} · chi phí $
          {usage.costUsd.toFixed(2)}
        </p>
      ) : null}
    </div>
  );
}
