"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, ExternalLink, Loader2, RotateCcw, Undo2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { FactCardKind } from "@/lib/db/schema";
import { dropSource, pasteUrl, restoreSource, retryPack } from "../actions";
import type { SourceView } from "../queries";

type Pack = {
  id: number;
  pillarName: string;
  status: "queued" | "running" | "done" | "failed";
  error: string | null;
  queries: string[];
  credits: number;
  topics: { topic: string; type: "seo" | "social"; keyword: string | null }[];
  activeJob: { id: number; type: string } | null;
  activeSources: number;
  activeCards: number;
  sources: SourceView[];
};

const STATUS: Record<Pack["status"], { label: string; variant: "default" | "secondary" | "destructive" }> = {
  queued: { label: "Đang chờ", variant: "secondary" },
  running: { label: "Đang chạy", variant: "secondary" },
  done: { label: "Xong", variant: "default" },
  failed: { label: "Thất bại", variant: "destructive" },
};

const KIND_LABELS: Record<FactCardKind, string> = {
  fact: "Dữ kiện",
  question: "Câu hỏi người đọc",
  outline: "Dàn ý trang",
  gap: "Khoảng trống",
};

const JOB_LABELS: Record<string, string> = {
  "research.pack": "Đang research",
  "research.source": "Đang xử lý URL dán vào",
  "research.topup": "Đang tìm bổ sung",
};

/** Polls the pack snapshot while anything runs and refreshes the page when it changes. */
function useLiveRefresh(weekPlanId: number, active: boolean) {
  const router = useRouter();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!active) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await fetch(`/api/research/${weekPlanId}`, { cache: "no-store" });
        const text = await res.text();
        if (last.current !== null && text !== last.current) router.refresh();
        last.current = text;
      } catch {
        /* retry next tick */
      }
      if (!stop) timer = setTimeout(tick, 2000);
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [weekPlanId, active, router]);
}

export function ResearchClient({ weekPlanId, packs }: { weekPlanId: number; packs: Pack[] }) {
  const [kick, setKick] = useState(0);
  const anyActive = kick > 0 || packs.some((p) => p.status === "queued" || p.status === "running" || p.activeJob);
  useLiveRefresh(weekPlanId, anyActive);

  return (
    <div className="space-y-4">
      {packs.map((p) => (
        <PackPanel key={p.id} pack={p} onStarted={() => setKick((k) => k + 1)} />
      ))}
    </div>
  );
}

function PackPanel({ pack, onStarted }: { pack: Pack; onStarted: () => void }) {
  const [pending, start] = useTransition();
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showDropped, setShowDropped] = useState(false);
  const running = pack.status === "queued" || pack.status === "running" || Boolean(pack.activeJob);
  const needsCheck = pack.sources.filter((s) => s.status === "active").reduce((n, s) => n + s.cards.filter((c) => c.needsCheck).length, 0);
  const dropped = pack.sources.filter((s) => s.status === "dropped");
  const visible = pack.sources.filter((s) => s.status === "active" || showDropped);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{pack.pillarName}</CardTitle>
          <Badge variant={STATUS[pack.status].variant}>{STATUS[pack.status].label}</Badge>
          {running ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              {pack.activeJob ? JOB_LABELS[pack.activeJob.type] : "Đang chờ worker"}
            </span>
          ) : null}
          <span className="ml-auto text-xs text-muted-foreground">
            {pack.activeSources} nguồn · {pack.activeCards} thẻ · {needsCheck} cần kiểm tra · {pack.credits} credit Tavily
          </span>
        </div>
        <CardDescription>
          {pack.topics.map((t) => `${t.type === "seo" ? "SEO" : "Social"}: ${t.topic}${t.keyword ? ` (${t.keyword})` : ""}`).join(" · ")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {pack.queries.length ? (
          <p className="text-xs text-muted-foreground">Truy vấn: {pack.queries.map((q) => `"${q}"`).join(", ")}</p>
        ) : null}
        {pack.error ? <p className="rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive">{pack.error}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setMsg(null);
              start(async () => {
                const r = await pasteUrl(pack.id, url);
                setMsg({ ok: r.ok, text: r.message ?? "" });
                if (r.ok) {
                  setUrl("");
                  onStarted();
                }
              });
            }}
          >
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Dán URL để thêm nguồn ưu tiên" aria-label={`Dán URL cho gói ${pack.pillarName}`} className="max-w-md" />
            <Button type="submit" variant="outline" disabled={pending || !url.trim()}>
              Thêm URL
            </Button>
          </form>
          {pack.status === "failed" ? (
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await retryPack(pack.id);
                  if (r.ok) onStarted();
                  else setMsg({ ok: false, text: r.message ?? "" });
                })
              }
            >
              <RotateCcw />
              Chạy lại
            </Button>
          ) : null}
        </div>
        {msg?.text ? <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-destructive"}`}>{msg.text}</p> : null}

        {pack.sources.length ? (
          <ul className="divide-y rounded-lg border">
            {visible.map((s) => (
              <SourceRow key={s.id} s={s} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Chưa có nguồn nào.</p>
        )}
        {dropped.length ? (
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setShowDropped((v) => !v)}>
            {showDropped ? "Ẩn" : "Hiện"} {dropped.length} nguồn đã bỏ
          </button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SourceRow({ s }: { s: SourceView }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const dropped = s.status === "dropped";
  const needsCheck = s.cards.filter((c) => c.needsCheck).length;
  const kinds: FactCardKind[] = ["fact", "question", "outline", "gap"];

  return (
    <li className={`px-3 py-2 text-sm ${dropped ? "bg-muted/40 text-muted-foreground" : ""}`} data-source-id={s.id}>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-muted-foreground" aria-label={open ? "Thu gọn" : "Mở thẻ dữ kiện"}>
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={`truncate font-medium ${dropped ? "line-through" : ""}`}>{s.title || s.url}</p>
          <p className="truncate text-xs text-muted-foreground">
            {s.domain} · {s.origin === "pasted" ? "dán vào" : "tự tìm"}
            {s.fetchedAt ? ` · ${new Date(s.fetchedAt).toLocaleDateString("vi-VN")}` : ""} · {s.cards.length} thẻ
            {needsCheck ? ` · ${needsCheck} cần kiểm tra` : ""}
          </p>
        </div>
        {s.origin === "pasted" ? <Badge variant="outline">Dán vào</Badge> : null}
        <a href={s.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Mở trang nguồn">
          <ExternalLink className="size-4" />
        </a>
        <Button
          size="xs"
          variant="ghost"
          disabled={pending}
          onClick={() => start(async () => void (dropped ? await restoreSource(s.id) : await dropSource(s.id)))}
        >
          {dropped ? <Undo2 /> : <X />}
          {dropped ? "Khôi phục" : "Bỏ nguồn"}
        </Button>
      </div>
      {open ? (
        <div className="mt-2 space-y-3 pl-6">
          {s.summary ? <p className="text-sm">{s.summary}</p> : null}
          {kinds.map((k) => {
            const cards = s.cards.filter((c) => c.kind === k);
            if (!cards.length) return null;
            return (
              <div key={k}>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{KIND_LABELS[k]}</p>
                <ul className="space-y-1">
                  {cards.map((c) => (
                    <li key={c.id} className="flex items-start gap-2">
                      <span className="whitespace-pre-line">{c.text}</span>
                      {c.needsCheck ? (
                        <Badge variant="outline" className="shrink-0 border-amber-300 text-amber-800">
                          Cần kiểm tra
                        </Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}
    </li>
  );
}
