import { describe, expect, it } from "vitest";
import { getTaskReminderClock, isTaskReminderTimeDue } from "../lib/reminder-scheduler";

describe("isTaskReminderTimeDue", () => {
  it("waits until the selected task reminder time", () => {
    expect(isTaskReminderTimeDue("14:30", 14, 29, 7)).toBe(false);
    expect(isTaskReminderTimeDue("14:30", 14, 30, 7)).toBe(true);
  });

  it("allows a same-day catch-up after a missed minute", () => {
    expect(isTaskReminderTimeDue("14:30", 15, 5, 7)).toBe(true);
  });

  it("uses the global reminder hour for existing tasks without a time", () => {
    expect(isTaskReminderTimeDue(null, 6, 59, 7)).toBe(false);
    expect(isTaskReminderTimeDue(undefined, 7, 0, 7)).toBe(true);
  });

  it("falls back safely when a stored time is invalid", () => {
    expect(isTaskReminderTimeDue("25:99", 8, 0, 9)).toBe(false);
    expect(isTaskReminderTimeDue("25:99", 9, 0, 9)).toBe(true);
  });
});

describe("getTaskReminderClock", () => {
  it("evaluates the same instant in each task's selected timezone", () => {
    const now = new Date("2026-09-09T03:30:00.000Z");
    const ist = getTaskReminderClock(now, "Asia/Kolkata", "Europe/London");
    const newYork = getTaskReminderClock(now, "America/New_York", "Europe/London");

    expect([ist.getHours(), ist.getMinutes()]).toEqual([9, 0]);
    expect([newYork.getHours(), newYork.getMinutes()]).toEqual([23, 30]);
    expect(newYork.getDate()).toBe(8);
  });

  it("uses the configured fallback timezone for older tasks", () => {
    const now = new Date("2026-09-09T03:30:00.000Z");
    const fallback = getTaskReminderClock(now, null, "Asia/Kolkata");
    expect([fallback.getHours(), fallback.getMinutes()]).toEqual([9, 0]);
  });
});