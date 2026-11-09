"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createWeekPlan } from "../actions";

export function CreatePlanButton({ weekStart }: { weekStart: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await createWeekPlan(weekStart);
            if (!r.ok) setError(r.message ?? "Không tạo được.");
          })
        }
      >
        {pending ? "Đang tạo..." : "Lập kế hoạch tuần này"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
