import { useEffect, useRef } from "react";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // matches SESSION_COOKIE_AGE in backend/config/settings.py
const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;

// Forces a logout after a period of no user activity, independent of whether the
// access/refresh tokens are still valid — a stolen or left-open session shouldn't
// stay usable indefinitely just because the tab keeps silently refreshing tokens.
export function useIdleLogout(active: boolean, onIdle: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) return;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(onIdle, IDLE_TIMEOUT_MS);
    };

    resetTimer();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [active, onIdle]);
}
