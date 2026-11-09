"use client";

import { CheckCircle2, AlertCircle } from "lucide-react";
import type { FormState } from "../schema";

export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  const Icon = state.ok ? CheckCircle2 : AlertCircle;
  return (
    <p
      role="status"
      className={`flex items-center gap-1.5 text-sm ${state.ok ? "text-emerald-700" : "text-destructive"}`}
    >
      <Icon className="size-4" aria-hidden />
      {state.message}
    </p>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

export const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
