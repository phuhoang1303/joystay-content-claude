import { describe, expect, it } from "vitest";
import {
  addDays,
  currentWeekStart,
  formatDayVi,
  formatWeekVi,
  isDateString,
  isInWeek,
  isWeekStart,
  nextWeekStart,
  todayVn,
  weekDays,
  weekStartOf,
} from "@/lib/calendar/week";
import { allEvents, eventsInWeek } from "@/lib/calendar/vn-events";

describe("week utils (Asia/Ho_Chi_Minh)", () => {
  it("uses Vietnam's date, not UTC, around midnight", () => {
    // 2026-11-15 17:30 UTC = 2026-11-16 00:30 in Vietnam (Monday)
    const now = new Date("2026-11-15T17:30:00Z");
    expect(todayVn(now)).toBe("2026-11-16");
    expect(currentWeekStart(now)).toBe("2026-11-16");
    // One hour earlier it is still Sunday in Vietnam
    expect(currentWeekStart(new Date("2026-11-15T16:30:00Z"))).toBe("2026-11-09");
  });

  it("defaults to next week", () => {
    expect(nextWeekStart(new Date("2026-11-09T03:00:00Z"))).toBe("2026-11-16");
    expect(nextWeekStart(new Date("2026-11-15T10:00:00Z"))).toBe("2026-11-16");
  });

  it("weeks run Monday to Sunday, across the year boundary", () => {
    expect(weekStartOf("2027-01-01")).toBe("2026-12-28");
    expect(weekDays("2026-12-28")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
    expect(isWeekStart("2026-11-16")).toBe(true);
    expect(isWeekStart("2026-11-17")).toBe(false);
    expect(isInWeek("2026-11-22", "2026-11-16")).toBe(true);
    expect(isInWeek("2026-11-23", "2026-11-16")).toBe(false);
  });

  it("validates date strings", () => {
    expect(isDateString("2026-02-30")).toBe(false);
    expect(isDateString("2026-2-3")).toBe(false);
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("formats in Vietnamese", () => {
    expect(formatDayVi("2026-11-16")).toBe("Thứ Hai 16/11");
    expect(formatDayVi("2026-11-22")).toBe("Chủ Nhật 22/11");
    expect(formatWeekVi("2026-12-28")).toBe("28/12 – 3/1/2027");
  });
});

describe("vn-events", () => {
  it("finds events inside a week", () => {
    expect(eventsInWeek("2026-11-16").map((e) => e.name)).toEqual(["Ngày Nhà giáo Việt Nam 20/11"]);
    expect(eventsInWeek("2026-12-21").map((e) => e.date)).toEqual(["2026-12-24", "2026-12-25"]);
  });

  it("has lunar dates for 2026 and 2027 on valid dates", () => {
    const all = allEvents();
    expect(all.find((e) => e.date === "2026-02-17")?.name).toContain("Tết");
    expect(all.find((e) => e.date === "2027-09-15")?.name).toContain("Trung thu");
    expect(all.every((e) => isDateString(e.date))).toBe(true);
  });
});
