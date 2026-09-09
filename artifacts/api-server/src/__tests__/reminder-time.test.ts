import { describe, expect, it } from "vitest";
import { isTaskReminderTimeDue } from "../lib/reminder-scheduler";

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