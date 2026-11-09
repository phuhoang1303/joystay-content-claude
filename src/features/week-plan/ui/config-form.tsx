"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SOCIAL_FORMATS } from "@/lib/db/schema";
import { saveWeekConfig } from "../actions";
import { SOCIAL_FORMAT_LABELS, type WeekConfig } from "../config";

type Pillar = { id: number; name: string };

export function ConfigForm({
  planId,
  pillars,
  initial,
  disabled,
  onSaved,
}: {
  planId: number;
  pillars: Pillar[];
  initial: WeekConfig;
  disabled: boolean;
  onSaved?: () => void;
}) {
  const [seo, setSeo] = useState<Record<number, number>>(() =>
    Object.fromEntries(initial.seo.map((s) => [s.pillarId, s.count])),
  );
  const [mix, setMix] = useState(initial.social.mix);
  const [keywords, setKeywords] = useState(initial.targetKeywords.join("\n"));
  const [notes, setNotes] = useState(initial.notes);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const socialCount = SOCIAL_FORMATS.reduce((s, f) => s + mix[f], 0);
  const seoCount = Object.values(seo).reduce((s, n) => s + n, 0);

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveWeekConfig(planId, {
        seo: Object.entries(seo)
          .filter(([, n]) => n > 0)
          .map(([id, count]) => ({ pillarId: Number(id), count })),
        social: { count: socialCount, mix },
        targetKeywords: keywords
          .split(/\r?\n/)
          .map((k) => k.trim())
          .filter(Boolean),
        notes,
      });
      setMsg({ ok: r.ok, text: r.message ?? (r.ok ? "Đã lưu." : "Lỗi.") });
      if (r.ok) onSaved?.();
    });
  }

  return (
    <fieldset disabled={disabled || pending} className="grid gap-6 md:grid-cols-2">
      <div>
        <p className="mb-2 text-sm font-medium">Bài SEO theo chủ đề ({seoCount} bài)</p>
        <ul className="space-y-1.5">
          {pillars.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                id={`seo-${p.id}`}
                checked={(seo[p.id] ?? 0) > 0}
                onChange={(e) => setSeo((s) => ({ ...s, [p.id]: e.target.checked ? 1 : 0 }))}
              />
              <label htmlFor={`seo-${p.id}`} className="flex-1">
                {p.name}
              </label>
              <Input
                type="number"
                min={0}
                max={7}
                aria-label={`Số bài SEO cho ${p.name}`}
                className="h-7 w-16"
                value={seo[p.id] ?? 0}
                onChange={(e) => setSeo((s) => ({ ...s, [p.id]: Math.max(0, Math.min(7, Number(e.target.value) || 0)) }))}
              />
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Bài Facebook ({socialCount} bài)</p>
        <ul className="space-y-1.5">
          {SOCIAL_FORMATS.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{SOCIAL_FORMAT_LABELS[f]}</span>
              <Input
                type="number"
                min={0}
                max={14}
                aria-label={`Số bài ${SOCIAL_FORMAT_LABELS[f]}`}
                className="h-7 w-16"
                value={mix[f]}
                onChange={(e) => setMix((m) => ({ ...m, [f]: Math.max(0, Math.min(14, Number(e.target.value) || 0)) }))}
              />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Carousel được cắt từ một bài SEO cùng tuần.</p>
      </div>
      <div>
        <Label htmlFor="cfg-kw" className="mb-1.5">
          Từ khoá muốn nhắm tới (tuỳ chọn, mỗi dòng một từ khoá)
        </Label>
        <Textarea id="cfg-kw" rows={3} value={keywords} onChange={(e) => setKeywords(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="cfg-notes" className="mb-1.5">
          Ghi chú tuần này (sự kiện, khuyến mãi...)
        </Label>
        <Textarea id="cfg-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {!disabled ? (
        <div className="flex items-center gap-3 md:col-span-2">
          <Button type="button" variant="outline" onClick={save} disabled={pending}>
            {pending ? "Đang lưu..." : "Lưu cấu hình"}
          </Button>
          {msg ? <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-destructive"}`}>{msg.text}</span> : null}
        </div>
      ) : null}
    </fieldset>
  );
}
