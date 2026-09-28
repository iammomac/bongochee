import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIVE_REFRESH_MS, useLiveRefresh } from "./useLiveRefresh";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

describe("useLiveRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
    setVisibility("visible");
  });

  it("refreshes every interval while the tab is showing, and not before", () => {
    const refresh = vi.fn();
    renderHook(() => useLiveRefresh(refresh));

    vi.advanceTimersByTime(LIVE_REFRESH_MS - 1);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(LIVE_REFRESH_MS * 2);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("stays quiet while the tab is hidden", () => {
    const refresh = vi.fn();
    renderHook(() => useLiveRefresh(refresh));

    setVisibility("hidden");
    vi.advanceTimersByTime(LIVE_REFRESH_MS * 5);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes straight away when the person comes back to the tab", () => {
    const refresh = vi.fn();
    renderHook(() => useLiveRefresh(refresh));

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).not.toHaveBeenCalled(); // going away doesn't refresh

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes when the window is refocused or the connection comes back", () => {
    const refresh = vi.fn();
    renderHook(() => useLiveRefresh(refresh));

    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("always calls the latest function, without restarting the timer", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ fn }) => useLiveRefresh(fn), { initialProps: { fn: first } });

    vi.advanceTimersByTime(LIVE_REFRESH_MS - 1000);
    rerender({ fn: second });
    vi.advanceTimersByTime(1000); // the original timer still fires on schedule

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops everything when the screen goes away", () => {
    const refresh = vi.fn();
    const { unmount } = renderHook(() => useLiveRefresh(refresh));
    unmount();

    vi.advanceTimersByTime(LIVE_REFRESH_MS * 3);
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).not.toHaveBeenCalled();
  });
});
