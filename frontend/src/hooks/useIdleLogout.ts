import { useEffect, useRef } from "react";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // matches SESSION_COOKIE_AGE in backend/config/settings.py
const WARNING_BEFORE_MS = 5 * 60 * 1000; // show a "still there?" prompt this long before logging out
const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;

interface UseIdleLogoutOptions {
  onWarn: () => void;
  onIdle: () => void;
  onActive: () => void;
}

// Forces a logout after a period of no user activity, independent of whether the
// access/refresh tokens are still valid -- a stolen or left-open session shouldn't
// stay usable indefinitely just because the tab keeps silently refreshing tokens.
// A warning fires first (onWarn) so someone genuinely still working -- long sales
// entry has real-world pauses: serving a customer, counting phones, a phone call --
// gets a chance to stay signed in instead of being silently logged out mid-form.
export function useIdleLogout(active: boolean, { onWarn, onIdle, onActive }: UseIdleLogoutOptions) {
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) return;

    const resetTimers = () => {
      if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      onActive();
      warnTimerRef.current = setTimeout(onWarn, IDLE_TIMEOUT_MS - WARNING_BEFORE_MS);
      idleTimerRef.current = setTimeout(onIdle, IDLE_TIMEOUT_MS);
    };

    resetTimers();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, resetTimers, { passive: true }));

    return () => {
      if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimers));
    };
  }, [active, onWarn, onIdle, onActive]);
}
