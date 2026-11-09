"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DndContext, PointerSensor, KeyboardSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Loader2, Lock, Plus, Sparkles, Unlock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDayVi } from "@/lib/calendar/week";
import { useJobs, type JobState } from "@/features/jobs/use-job";
import { addItem, lockWeekAction, moveItem, regenerateItemAction, startGeneratePlan, topupAction, unlockWeekAction } from "../actions";
import type { WeekConfig } from "../config";
import type { BoardItem } from "../queries";
import { ConfigForm } from "./config-form";
import { ItemCard } from "./item-card";

type Props = {
  plan: { id: number; weekStart: string; status: "draft" | "locked" };
  config: WeekConfig;
  pillars: { id: number; name: string }[];
  days: string[];
  items: BoardItem[];
  packs: { id: number; pillarId: number; status: string }[];
  activeJobs: { id: number; type: string; payload: Record<string, number | string> }[];
};

export function WeekPlanClient({ plan, config, pillars, days, items, packs, activeJobs }: Props) {
  const router = useRouter();
  const locked = plan.status === "locked";
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [generateJob, setGenerateJob] = useState<number | undefined>(activeJobs.find((j) => j.type === "plan.generate")?.id);
  const [itemJobs, setItemJobs] = useState<Record<number, number>>(() =>
    Object.fromEntries(
      activeJobs
        .filter((j) => j.type === "plan.regenerate_item" || j.type === "research.topup")
        .map((j) => [Number(j.payload.itemId ?? 0), j.id]),
    ),
  );
  const [showConfig, setShowConfig] = useState(items.length === 0 && !locked);

  const { track, isBusy } = useJobs(
    (job: JobState) => {
      router.refresh();
      if (job.id === generateJob && job.status === "done") setShowConfig(false);
      if (job.status === "failed") setMessage({ ok: false, text: job.error ?? "Job thất bại." });
      else if (job.status === "done") setMessage({ ok: true, text: "Đã cập nhật." });
    },
    activeJobs.map((j) => j.id),
  );

  const [board, moveOptimistic] = useOptimistic(items, (state, m: { id: number; date: string }) =>
    state.map((i) => (i.id === m.id ? { ...i, publishDate: m.date } : i)),
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));
  const generating = isBusy(generateJob);
  const notify = (ok: boolean, text: string) => setMessage({ ok, text });

  function onDragEnd(e: DragEndEvent) {
    const id = Number(e.active.id);
    const date = e.over ? String(e.over.id) : null;
    const item = items.find((i) => i.id === id);
    if (!date || !item || item.publishDate === date) return;
    start(async () => {
      moveOptimistic({ id, date });
      const r = await moveItem(id, date);
      if (!r.ok) notify(false, r.message ?? "Không đổi được ngày.");
    });
  }

  function run(action: () => Promise<{ ok: boolean; message?: string; jobId?: number }>, after?: (jobId: number) => void) {
    setMessage(null);
    start(async () => {
      const r = await action();
      if (r.message) notify(r.ok, r.message);
      if (r.ok && r.jobId) {
        track(r.jobId);
        after?.(r.jobId);
      }
    });
  }

  const seoItems = board.filter((i) => i.type === "seo").length;
  const socialItems = board.length - seoItems;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={locked ? "default" : "secondary"}>{locked ? "Đã chốt" : "Bản nháp"}</Badge>
        <span className="text-sm text-muted-foreground">
          {seoItems} bài SEO · {socialItems} bài social
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {!locked ? (
            <>
              <Button variant="outline" onClick={() => setShowConfig((s) => !s)}>
                {showConfig ? "Ẩn cấu hình" : "Cấu hình tuần"}
              </Button>
              <Button
                variant={board.length ? "outline" : "default"}
                disabled={pending || generating}
                onClick={() => {
                  if (board.length && !confirm("Tạo lại kế hoạch sẽ thay toàn bộ các bài hiện có trong tuần. Tiếp tục?")) return;
                  run(() => startGeneratePlan(plan.id), (id) => setGenerateJob(id));
                }}
              >
                {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {generating ? "Đang tạo kế hoạch..." : board.length ? "Tạo lại kế hoạch" : "Tạo kế hoạch"}
              </Button>
              {board.length ? (
                <Button
                  disabled={pending || generating}
                  onClick={() => {
                    if (!confirm("Chốt tuần? Bảng sẽ khoá lại và hệ thống bắt đầu research cho các chủ đề SEO.")) return;
                    run(() => lockWeekAction(plan.id));
                  }}
                >
                  <Lock />
                  Chốt tuần
                </Button>
              ) : null}
            </>
          ) : (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                if (!confirm("Mở khoá tuần? Bạn có thể sửa bài, nhưng gói research đã tạo vẫn giữ nguyên. Khi chốt lại, chỉ chủ đề mới mới được research.")) return;
                run(() => unlockWeekAction(plan.id));
              }}
            >
              <Unlock />
              Mở khoá
            </Button>
          )}
        </div>
      </div>

      {message ? (
        <p role="status" className={`rounded-md border px-3 py-2 text-sm ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
          {message.text}
        </p>
      ) : null}

      {generating ? (
        <p className="text-sm text-muted-foreground">AI đang lập kế hoạch cho tuần này (thường mất 30-90 giây)...</p>
      ) : null}

      {showConfig && !locked ? (
        <Card>
          <CardHeader>
            <CardTitle>Cấu hình tuần</CardTitle>
          </CardHeader>
          <CardContent>
            <ConfigForm planId={plan.id} pillars={pillars} initial={config} disabled={locked || generating} onSaved={() => router.refresh()} />
          </CardContent>
        </Card>
      ) : null}

      {locked && packs.length ? (
        <p className="text-sm text-muted-foreground">
          Research: {packs.filter((p) => p.status === "done").length}/{packs.length} gói xong. Xem chi tiết ở tab Research.
        </p>
      ) : null}

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-[repeat(7,minmax(9.5rem,1fr))] gap-2 overflow-x-auto pb-2">
          {days.map((day) => (
            <DayColumn key={day} day={day} locked={locked}>
              {board
                .filter((i) => i.publishDate === day)
                .map((i) => (
                  <ItemCard
                    key={i.id}
                    item={i}
                    pillars={pillars}
                    locked={locked}
                    busy={isBusy(itemJobs[i.id])}
                    onMessage={notify}
                    onRegenerate={() => run(() => regenerateItemAction(i.id), (id) => setItemJobs((m) => ({ ...m, [i.id]: id })))}
                    onTopup={() => run(() => topupAction(i.id), (id) => setItemJobs((m) => ({ ...m, [i.id]: id })))}
                  />
                ))}
              {!locked ? <AddItem planId={plan.id} day={day} pillars={pillars} onMessage={notify} /> : null}
            </DayColumn>
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function DayColumn({ day, locked, children }: { day: string; locked: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: day, disabled: locked });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-48 flex-col gap-2 rounded-lg border p-1.5 transition-colors ${isOver ? "border-primary bg-primary/5" : "bg-muted/40"}`}
      data-day={day}
    >
      <p className="px-1 pt-0.5 text-xs font-medium text-muted-foreground">{formatDayVi(day)}</p>
      {children}
    </div>
  );
}

function AddItem({
  planId,
  day,
  pillars,
  onMessage,
}: {
  planId: number;
  day: string;
  pillars: { id: number; name: string }[];
  onMessage: (ok: boolean, text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"seo" | "social">("social");
  const [topic, setTopic] = useState("");
  const [keyword, setKeyword] = useState("");
  const [pillarId, setPillarId] = useState<number | null>(pillars[0]?.id ?? null);
  const [pending, start] = useTransition();
  const select = "h-7 w-full rounded-md border border-input bg-transparent px-1.5 text-xs";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-auto flex items-center justify-center gap-1 rounded-md py-1 text-xs text-muted-foreground opacity-60 hover:bg-background hover:opacity-100"
        aria-label={`Thêm bài ${formatDayVi(day)}`}
      >
        <Plus className="size-3" /> Thêm
      </button>
    );
  }
  return (
    <div className="space-y-1.5 rounded-lg border bg-background p-2 text-xs">
      <select aria-label="Loại bài" className={select} value={type} onChange={(e) => setType(e.target.value as "seo" | "social")}>
        <option value="social">Social</option>
        <option value="seo">SEO</option>
      </select>
      <Input aria-label="Đề tài" placeholder="Đề tài" value={topic} onChange={(e) => setTopic(e.target.value)} className="h-7 text-xs" />
      {type === "seo" ? (
        <Input aria-label="Từ khoá chính" placeholder="Từ khoá chính" value={keyword} onChange={(e) => setKeyword(e.target.value)} className="h-7 text-xs" />
      ) : null}
      <select aria-label="Chủ đề" className={select} value={pillarId ?? ""} onChange={(e) => setPillarId(e.target.value ? Number(e.target.value) : null)}>
        {pillars.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <div className="flex gap-1">
        <Button
          size="xs"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await addItem(planId, { type, publishDate: day, topic, pillarId, mainKeyword: keyword || undefined });
              if (r.ok) {
                setOpen(false);
                setTopic("");
                setKeyword("");
              } else onMessage(false, r.message ?? "Không thêm được.");
            })
          }
        >
          Thêm
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setOpen(false)}>
          Huỷ
        </Button>
      </div>
    </div>
  );
}
