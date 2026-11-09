"use client";

import { useActionState, useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addPillar, deletePillar, renamePillar } from "../actions";
import type { FormState } from "../schema";
import { FieldError } from "./form-bits";

type PillarRow = { id: number; name: string };

export function PillarsSection({ pillars }: { pillars: PillarRow[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addPillar, {});

  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-lg border">
        {pillars.length === 0 ? (
          <li className="px-3 py-3 text-sm text-muted-foreground">Chưa có chủ đề nào.</li>
        ) : (
          pillars.map((p) => <PillarItem key={p.id} pillar={p} />)
        )}
      </ul>
      <form action={action} className="flex items-start gap-2">
        <div className="flex-1">
          <Input name="name" placeholder="Tên chủ đề mới" aria-label="Tên chủ đề mới" />
          <FieldError message={state.errors?.name} />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          Thêm chủ đề
        </Button>
      </form>
    </div>
  );
}

function PillarItem({ pillar }: { pillar: PillarRow }) {
  const [editing, setEditing] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const r = await renamePillar(prev, fd);
    if (r.ok) setEditing(false);
    return r;
  }, {});

  if (editing) {
    return (
      <li className="px-3 py-2">
        <form action={action} className="flex items-start gap-2">
          <input type="hidden" name="id" value={pillar.id} />
          <div className="flex-1">
            <Input name="name" defaultValue={pillar.name} autoFocus aria-label="Tên chủ đề" />
            <FieldError message={state.errors?.name} />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            Lưu
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Huỷ
          </Button>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 px-3 py-2 text-sm">
      <span className="flex-1">{pillar.name}</span>
      <Button size="icon-sm" variant="ghost" aria-label={`Đổi tên ${pillar.name}`} onClick={() => setEditing(true)}>
        <Pencil />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Xoá ${pillar.name}`}
        disabled={deleting}
        onClick={() => {
          if (confirm(`Xoá chủ đề "${pillar.name}"?`)) startDelete(() => deletePillar(pillar.id));
        }}
      >
        <Trash2 />
      </Button>
    </li>
  );
}
