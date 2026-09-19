import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDateRange } from "./DateRangeControls";

describe("useDateRange", () => {
  beforeEach(() => {
    // Saturday 19 Sep 2026, 01:30 in the machine's own timezone -- shortly after local
    // midnight, when the UTC date is still "yesterday" for anyone ahead of UTC (Tanzania).
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 19, 1, 30));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts on the viewer's own calendar day", () => {
    const { result } = renderHook(() => useDateRange("today"));
    expect(result.current.from).toBe("2026-09-19");
    expect(result.current.to).toBe("2026-09-19");
  });

  it.each([
    ["week", "2026-09-13"], // the Sunday before
    ["month", "2026-09-01"],
    ["last30", "2026-08-21"], // 30 days including today
    ["last90", "2026-06-22"], // 90 days including today
  ] as const)("the %s preset runs from %s through today", (preset, from) => {
    const { result } = renderHook(() => useDateRange(preset));
    expect(result.current.from).toBe(from);
    expect(result.current.to).toBe("2026-09-19");
  });

  it("follows a preset change, but leaves a custom range alone", () => {
    const { result } = renderHook(() => useDateRange("today"));

    act(() => result.current.setPreset("month"));
    expect(result.current.from).toBe("2026-09-01");

    act(() => result.current.setPreset("custom"));
    act(() => {
      result.current.setFrom("2026-01-05");
      result.current.setTo("2026-01-20");
    });
    expect(result.current.from).toBe("2026-01-05");
    expect(result.current.to).toBe("2026-01-20");
  });

  it("two ranges are independent of each other", () => {
    const { result } = renderHook(() => ({ a: useDateRange("today"), b: useDateRange("month") }));
    act(() => result.current.b.setPreset("last90"));
    expect(result.current.a.from).toBe("2026-09-19");
    expect(result.current.b.from).toBe("2026-06-22");
  });
});
