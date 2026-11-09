"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveBrandProfile } from "../actions";
import { BRAND_FIELDS, type BrandProfileInput, type FormState } from "../schema";
import { FieldError, FormMessage } from "./form-bits";

export function BrandProfileForm({ initial }: { initial: BrandProfileInput }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveBrandProfile, {});

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {BRAND_FIELDS.filter((f) => !f.multiline).map((f) => (
          <div key={f.name}>
            <Label htmlFor={`bp-${f.name}`} className="mb-1.5">
              {f.label}
            </Label>
            <Input
              id={`bp-${f.name}`}
              name={f.name}
              defaultValue={initial[f.name]}
              aria-invalid={Boolean(state.errors?.[f.name])}
            />
            <FieldError message={state.errors?.[f.name]} />
          </div>
        ))}
      </div>
      {BRAND_FIELDS.filter((f) => f.multiline).map((f) => (
        <div key={f.name}>
          <Label htmlFor={`bp-${f.name}`} className="mb-1.5">
            {f.label}
          </Label>
          <Textarea
            id={`bp-${f.name}`}
            name={f.name}
            rows={f.rows}
            defaultValue={initial[f.name]}
            aria-invalid={Boolean(state.errors?.[f.name])}
            className="font-[inherit]"
          />
          {f.hint ? <p className="mt-1 text-xs text-muted-foreground">{f.hint}</p> : null}
          <FieldError message={state.errors?.[f.name]} />
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu..." : "Lưu Brand Profile"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
