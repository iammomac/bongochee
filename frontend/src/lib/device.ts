/* The app as an installed app on this device (home screen, taskbar, Start menu). */
import { useEffect, useState } from "react";

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: window-controls-overlay)").matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    // Fails quietly in contexts where it can't run (e.g. a private window) -- the
    // app still works without it, just without offline-shell/installability.
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferred = e as BeforeInstallPromptEvent;
  listeners.forEach((f) => f());
});
window.addEventListener("appinstalled", () => {
  deferred = null;
  listeners.forEach((f) => f());
});

/**
 * "prompt": the browser can install the app with one click.
 * "ios": Safari on iPhone/iPad, installed via the Share menu instead.
 * null: already installed, or installing isn't possible here.
 */
export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((x) => x + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);

  const mode: "prompt" | "ios" | null = isStandalone() ? null : deferred ? "prompt" : isIOS() ? "ios" : null;

  const install = async () => {
    if (!deferred) return false;
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    deferred = null;
    listeners.forEach((f) => f());
    return choice?.outcome === "accepted";
  };

  return { mode, install };
}
