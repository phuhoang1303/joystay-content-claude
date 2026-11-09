/**
 * Vietnamese holidays and content occasions used when planning a week. The owner can extend
 * this file (add rows to FIXED_SOLAR or LUNAR_BASED).
 */
import { isInWeek } from "./week";

export type VnEvent = {
  /** YYYY-MM-DD */
  date: string;
  name: string;
  /** Short hint for the planner. */
  note?: string;
};

/** Same solar date every year (month, day). */
const FIXED_SOLAR: { month: number; day: number; name: string; note?: string }[] = [
  { month: 1, day: 1, name: "Tết Dương lịch", note: "nghỉ lễ, du lịch ngắn ngày" },
  { month: 2, day: 14, name: "Lễ Tình nhân (Valentine)", note: "cặp đôi, staycation; không phải ngày nghỉ lễ" },
  { month: 3, day: 8, name: "Quốc tế Phụ nữ 8/3", note: "không phải ngày nghỉ lễ" },
  { month: 4, day: 30, name: "Ngày Giải phóng miền Nam 30/4", note: "kỳ nghỉ lễ dài, cao điểm du lịch" },
  { month: 5, day: 1, name: "Quốc tế Lao động 1/5", note: "nối kỳ nghỉ 30/4" },
  { month: 9, day: 2, name: "Quốc khánh 2/9", note: "kỳ nghỉ lễ" },
  { month: 10, day: 20, name: "Ngày Phụ nữ Việt Nam 20/10", note: "không phải ngày nghỉ lễ" },
  { month: 10, day: 31, name: "Halloween", note: "không phải ngày nghỉ lễ" },
  { month: 11, day: 20, name: "Ngày Nhà giáo Việt Nam 20/11", note: "tri ân thầy cô; không phải ngày nghỉ lễ" },
  { month: 12, day: 24, name: "Đêm Giáng sinh", note: "Sài Gòn trang trí, đi chơi đêm; không phải ngày nghỉ lễ" },
  { month: 12, day: 25, name: "Lễ Giáng sinh", note: "không phải ngày nghỉ lễ" },
];

/**
 * Lunar-based dates converted to the solar calendar, verified on 2026-11-09:
 * - 2026 (all four): xemlicham.com/am-lich/nam/2026 ("1/1: Tết Nguyên Đán", "10/3: Giỗ Tổ Hùng
 *   Vương", "15/7: Lễ Vu Lan", "15/8: Tết Trung Thu") and dienmaycholon.com/kien-thuc/lich-am-2026
 *   (+ related dienmaycholon lunar pages): both give 17/02, 26/04, 27/08, 25/09/2026.
 * - Tết 2027 = 06/02/2027: xemlicham.com/am-lich/nam/2027, thuvienphapluat.vn
 *   ("Tết âm lịch 2027 là ngày mấy dương lịch?"), viettelstore.vn countdown article.
 * - Giỗ Tổ 2027 = 16/04/2027: xemlicham.com/am-lich/nam/2027; Phú Thọ's 2027 festival plan
 *   (vietnamplus.vn) ends its main phase on 16/04/2027.
 * - Vu Lan 2027 = 16/08/2027 and Trung thu 2027 = 15/09/2027: xemlicham.com/am-lich/nam/2027 only;
 *   consistent with a 30-day 7th lunar month (15/7 -> 15/8). Re-check before relying on them.
 */
const LUNAR_BASED: VnEvent[] = [
  { date: "2026-02-17", name: "Mùng 1 Tết Nguyên Đán Bính Ngọ", note: "kỳ nghỉ Tết" },
  { date: "2026-04-26", name: "Giỗ Tổ Hùng Vương (10/3 âm lịch)", note: "nghỉ lễ" },
  { date: "2026-08-27", name: "Lễ Vu Lan (rằm tháng 7)" },
  { date: "2026-09-25", name: "Tết Trung thu (rằm tháng 8)", note: "phố lồng đèn, bánh trung thu" },
  { date: "2027-02-06", name: "Mùng 1 Tết Nguyên Đán Đinh Mùi", note: "kỳ nghỉ Tết" },
  { date: "2027-04-16", name: "Giỗ Tổ Hùng Vương (10/3 âm lịch)", note: "nghỉ lễ" },
  { date: "2027-08-16", name: "Lễ Vu Lan (rằm tháng 7)" },
  { date: "2027-09-15", name: "Tết Trung thu (rằm tháng 8)", note: "phố lồng đèn, bánh trung thu" },
];

const YEARS = [2026, 2027];

export function allEvents(): VnEvent[] {
  const solar = YEARS.flatMap((y) =>
    FIXED_SOLAR.map((e) => ({
      date: `${y}-${String(e.month).padStart(2, "0")}-${String(e.day).padStart(2, "0")}`,
      name: e.name,
      note: e.note,
    })),
  );
  return [...solar, ...LUNAR_BASED].sort((a, b) => a.date.localeCompare(b.date));
}

export function eventsInWeek(weekStart: string): VnEvent[] {
  return allEvents().filter((e) => isInWeek(e.date, weekStart));
}
