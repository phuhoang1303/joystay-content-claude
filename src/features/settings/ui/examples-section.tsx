"use client";

import { useActionState, useState, useTransition } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addExamplePost, deleteExamplePost } from "../actions";
import type { FormState } from "../schema";
import { FieldError, FormMessage, selectClass } from "./form-bits";

type ExampleRow = {
  id: number;
  type: "social" | "seo";
  title: string;
  format: string | null;
  body: string | null;
  url: string | null;
};

export function ExamplesSection({ examples }: { examples: ExampleRow[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const r = await addExamplePost(prev, fd);
    if (r.ok) setOpen(false);
    return r;
  }, {});

  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-lg border">
        {examples.length === 0 ? (
          <li className="px-3 py-3 text-sm text-muted-foreground">Chưa có bài mẫu nào.</li>
        ) : (
          examples.map((e) => <ExampleItem key={e.id} example={e} />)
        )}
      </ul>
      {open ? (
        <form action={action} className="space-y-3 rounded-lg border bg-muted/30 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="ex-type" className="mb-1.5">
                Loại
              </Label>
              <select id="ex-type" name="type" className={selectClass} defaultValue="social">
                <option value="social">Social</option>
                <option value="seo">SEO</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ex-format" className="mb-1.5">
                Định dạng (tuỳ chọn)
              </Label>
              <Input id="ex-format" name="format" placeholder="VD: Khoảnh khắc ở Joystay" />
            </div>
          </div>
          <div>
            <Label htmlFor="ex-title" className="mb-1.5">
              Tiêu đề (tuỳ chọn)
            </Label>
            <Input id="ex-title" name="title" />
          </div>
          <div>
            <Label htmlFor="ex-url" className="mb-1.5">
              URL (tuỳ chọn)
            </Label>
            <Input id="ex-url" name="url" placeholder="https://..." />
            <FieldError message={state.errors?.url} />
          </div>
          <div>
            <Label htmlFor="ex-body" className="mb-1.5">
              Nội dung
            </Label>
            <Textarea id="ex-body" name="body" rows={6} />
            <FieldError message={state.errors?.body} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              Lưu bài mẫu
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setOpen(true)}>
            Thêm bài mẫu
          </Button>
          <FormMessage state={state} />
        </div>
      )}
    </div>
  );
}

function ExampleItem({ example }: { example: ExampleRow }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex items-start gap-3 px-3 py-2.5 text-sm">
      <Badge variant={example.type === "seo" ? "outline" : "secondary"} className="mt-0.5 shrink-0">
        {example.type === "seo" ? "SEO" : "Social"}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{example.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {example.format ? `${example.format} · ` : ""}
          {example.url ? (
            <a href={example.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
              {example.url} <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : (
            example.body?.replace(/\s+/g, " ").slice(0, 140)
          )}
        </p>
      </div>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Xoá bài mẫu ${example.title}`}
        disabled={pending}
        onClick={() => {
          if (confirm("Xoá bài mẫu này?")) start(() => deleteExamplePost(example.id));
        }}
      >
        <Trash2 />
      </Button>
    </li>
  );
}
