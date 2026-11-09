/**
 * Week and date helpers for Asia/Ho_Chi_Minh. Vietnam is UTC+7 all year (no DST), so a fixed
 * offset is exact. Dates are plain `YYYY-MM-DD` strings; weeks run Monday to Sunday.
 */

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function toUtcMs(date: string): number {
  if (!isDateString(date)) throw new Error(`Ngày không hợp lệ: ${date}`);
  return Date.parse(`${date}T00:00:00Z`);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Today's date in Vietnam. */
export function todayVn(now: Date = new Date()): string {
  return fromUtcMs(now.getTime() + VN_OFFSET_MS);
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** 0 = Monday ... 6 = Sunday */
export function weekdayIndex(date: string): number {
  return (new Date(toUtcMs(date)).getUTCDay() + 6) % 7;
}

export function weekStartOf(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

export function isWeekStart(date: string): boolean {
  return isDateString(date) && weekdayIndex(date) === 0;
}

export function currentWeekStart(now: Date = new Date()): string {
  return weekStartOf(todayVn(now));
}

/** Default week for planning: next week. */
export function nextWeekStart(now: Date = new Date()): string {
  return addDays(currentWeekStart(now), 7);
}

export function weekEnd(weekStart: string): string {
  return addDays(weekStart, 6);
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function isInWeek(date: string, weekStart: string): boolean {
  return isDateString(date) && date >= weekStart && date <= weekEnd(weekStart);
}

const WEEKDAY_VI = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];

export function weekdayVi(date: string): string {
  return WEEKDAY_VI[weekdayIndex(date)];
}

/** "16/11" */
export function shortDateVi(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(d)}/${Number(m)}`;
}

/** "Thứ Hai 16/11" */
export function formatDayVi(date: string): string {
  return `${weekdayVi(date)} ${shortDateVi(date)}`;
}

/** "16/11 – 22/11/2026" */
export function formatWeekVi(weekStart: string): string {
  const end = weekEnd(weekStart);
  return `${shortDateVi(weekStart)} – ${shortDateVi(end)}/${end.slice(0, 4)}`;
}
