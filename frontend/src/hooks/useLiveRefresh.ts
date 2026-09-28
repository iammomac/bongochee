import { useEffect, useRef } from "react";

export const LIVE_REFRESH_MS = 15_000;

// Keeps a screen's numbers current without anyone pressing refresh: calls `refresh` every
// few seconds while the tab is showing, and straight away when the person comes back to the
// tab, refocuses the window, or the connection returns -- so an edit made on another
// computer (or in another tab) shows up on its own. The first load is the caller's own.
export function useLiveRefresh(refresh: () => void, intervalMs = LIVE_REFRESH_MS) {
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  });

  useEffect(() => {
    const run = () => {
      if (document.visibilityState === "visible") latest.current();
    };
    const timer = setInterval(run, intervalMs);
    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);
    window.addEventListener("online", run);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
      window.removeEventListener("online", run);
    };
  }, [intervalMs]);
}
