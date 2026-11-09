"use client";

import { useState, useTransition } from "react";
import { useDraggable } from "@dnd-kit/core";
import { GripVertical, Loader2, Pencil, RefreshCw, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SOCIAL_FORMATS } from "@/lib/db/schema";
import { deleteItem, updateItem } from "../actions";
import { SOCIAL_FORMAT_LABELS } from "../config";
import type { BoardItem } from "../queries";

const MIN_COVERAGE = 5;

export function ItemCard({
  item,
  pillars,
  locked,
  busy,
  onRegenerate,
  onTopup,
  onMessage,
}: {
  item: BoardItem;
  pillars: { id: number; name: string }[];
  locked: boolean;
  busy: boolean;
  onRegenerate: () => void;
  onTopup: () => void;
  onMessage: (ok: boolean, text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled: locked || editing || busy,
  });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const pillarName = pillars.find((p) => p.id === item.pillarId)?.name ?? "Chưa chọn chủ đề";

  if (editing) return <EditForm item={item} pillars={pillars} onClose={() => setEditing(false)} onMessage={onMessage} />;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group rounded-lg border bg-background p-2.5 text-sm shadow-xs ${isDragging ? "z-10 opacity-80 shadow-md" : ""}`}
      data-testid={`item-${item.id}`}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        {!locked ? (
          <button
            type="button"
            className="-ml-1 cursor-grab touch-none text-muted-foreground hover:text-foreground"
            aria-label={`Kéo để đổi ngày: ${item.topic}`}
            {...listeners}
            {...attributes}
          >
            <GripVertical className="size-4" />
          </button>
        ) : null}
        <Badge variant={item.type === "seo" ? "default" : "secondary"}>{item.type === "seo" ? "SEO" : "Social"}</Badge>
        {item.socialFormat ? <span className="truncate text-xs text-muted-foreground">{SOCIAL_FORMAT_LABELS[item.socialFormat]}</span> : null}
      </div>
      <p className="font-medium leading-snug">{busy ? <span className="text-muted-foreground">Đang đề xuất lại...</span> : item.topic}</p>
      {item.mainKeyword ? <p className="mt-1 text-xs text-muted-foreground">Từ khoá: {item.mainKeyword}</p> : null}
      <p className="mt-1 truncate text-xs text-muted-foreground" title={pillarName}>
        {pillarName}
      </p>
      {item.angle ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">Góc: {item.angle}</p> : null}
      {item.reason ? (
        <p className="mt-1 line-clamp-2 text-xs italic text-muted-foreground" title={item.reason}>
          {item.reason}
        </p>
      ) : null}
      {item.coverage !== null ? (
        <p className={`mt-1.5 text-xs ${item.coverage >= MIN_COVERAGE ? "text-emerald-700" : "text-amber-700"}`}>
          {item.coverage} thẻ dữ kiện liên quan
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1">
        {!locked ? (
          <>
            <Button size="icon-xs" variant="ghost" aria-label="Sửa" title="Sửa" onClick={() => setEditing(true)} disabled={busy}>
              <Pencil />
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label="Đề xuất lại" title="Đề xuất lại" onClick={onRegenerate} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Xoá"
              title="Xoá"
              disabled={pending || busy}
              onClick={() => {
                if (!confirm(`Xoá "${item.topic}"?`)) return;
                start(async () => {
                  const r = await deleteItem(item.id);
                  if (!r.ok) onMessage(false, r.message ?? "Không xoá được.");
                });
              }}
            >
              <Trash2 />
            </Button>
          </>
        ) : null}
        {locked && item.coverage !== null && item.coverage < MIN_COVERAGE ? (
          <Button size="xs" variant="outline" onClick={onTopup} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Search />}
            Tìm bổ sung
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function EditForm({
  item,
  pillars,
  onClose,
  onMessage,
}: {
  item: BoardItem;
  pillars: { id: number; name: string }[];
  onClose: () => void;
  onMessage: (ok: boolean, text: string) => void;
}) {
  const [topic, setTopic] = useState(item.topic);
  const [keyword, setKeyword] = useState(item.mainKeyword ?? "");
  const [angle, setAngle] = useState(item.angle);
  const [pillarId, setPillarId] = useState<number | null>(item.pillarId);
  const [format, setFormat] = useState(item.socialFormat ?? "khoanh_khac");
  const [pending, start] = useTransition();
  const select = "h-7 w-full rounded-md border border-input bg-transparent px-1.5 text-xs";

  return (
    <div className="space-y-1.5 rounded-lg border bg-background p-2.5 text-sm shadow-sm">
      <Textarea aria-label="Đề tài" rows={2} value={topic} onChange={(e) => setTopic(e.target.value)} className="text-sm" />
      {item.type === "seo" ? (
        <Input aria-label="Từ khoá chính" placeholder="Từ khoá chính" value={keyword} onChange={(e) => setKeyword(e.target.value)} className="h-7 text-xs" />
      ) : (
        <select aria-label="Định dạng" className={select} value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
          {SOCIAL_FORMATS.map((f) => (
            <option key={f} value={f}>
              {SOCIAL_FORMAT_LABELS[f]}
            </option>
          ))}
        </select>
      )}
      <select
        aria-label="Chủ đề"
        className={select}
        value={pillarId ?? ""}
        onChange={(e) => setPillarId(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">(không chọn)</option>
        {pillars.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <Textarea aria-label="Góc tiếp cận" placeholder="Góc tiếp cận" rows={2} value={angle} onChange={(e) => setAngle(e.target.value)} className="text-xs" />
      <div className="flex gap-1">
        <Button
          size="xs"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await updateItem(item.id, { topic, mainKeyword: keyword, angle, pillarId, socialFormat: item.type === "social" ? format : null });
              if (r.ok) onClose();
              else onMessage(false, r.message ?? "Không lưu được.");
            })
          }
        >
          Lưu
        </Button>
        <Button size="xs" variant="ghost" onClick={onClose}>
          Huỷ
        </Button>
      </div>
    </div>
  );
}
