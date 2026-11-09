"use client";

import { useTransition } from "react";
import { switchWorkspace } from "./actions";

export function WorkspaceSwitcher({
  workspaces,
  currentId,
}: {
  workspaces: { id: number; name: string }[];
  currentId: number;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Workspace
      </span>
      <select
        className="h-9 w-full rounded-md border border-sidebar-border bg-background px-2 text-sm font-medium disabled:opacity-60"
        value={currentId}
        disabled={pending}
        onChange={(e) => {
          const id = Number(e.target.value);
          startTransition(() => switchWorkspace(id));
        }}
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </label>
  );
}
