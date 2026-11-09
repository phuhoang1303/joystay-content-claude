import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, formatWeekVi, nextWeekStart, currentWeekStart } from "@/lib/calendar/week";
import { buttonVariants } from "@/components/ui/button";

/** Prev / next week links using ?week=YYYY-MM-DD on the given path. */
export function WeekPicker({ path, weekStart }: { path: string; weekStart: string }) {
  const label =
    weekStart === nextWeekStart() ? "Tuần sau" : weekStart === currentWeekStart() ? "Tuần này" : null;
  return (
    <div className="flex items-center gap-1">
      <Link href={`${path}?week=${addDays(weekStart, -7)}`} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Tuần trước">
        <ChevronLeft />
      </Link>
      <span className="min-w-44 text-center text-sm font-medium">
        {formatWeekVi(weekStart)}
        {label ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">({label})</span> : null}
      </span>
      <Link href={`${path}?week=${addDays(weekStart, 7)}`} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Tuần sau">
        <ChevronRight />
      </Link>
    </div>
  );
}

/** Reads ?week=, falls back to next week; snaps any date to its Monday. */
export function resolveWeek(param: string | string[] | undefined, snap: (d: string) => string): string {
  const v = Array.isArray(param) ? param[0] : param;
  try {
    return v ? snap(v) : nextWeekStart();
  } catch {
    return nextWeekStart();
  }
}
