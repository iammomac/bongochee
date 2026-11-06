import { useState } from "react";
import { Download, Plus, Share } from "lucide-react";
import { useInstall } from "../lib/device";

// "Install app": one click where the browser can install it directly, Share-menu
// steps on iPhone/iPad Safari (which has no one-click install API). Renders nothing
// once the app is already running standalone, or where installing isn't possible
// (e.g. desktop Firefox) -- see useInstall for how "mode" is decided.
export function InstallApp() {
  const { mode, install } = useInstall();
  const [showSteps, setShowSteps] = useState(false);

  if (!mode) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => (mode === "prompt" ? install() : setShowSteps(true))}
        title="Install Bongo Chee as an app on this device"
        className="flex h-10 items-center gap-2 rounded-full bg-white px-3 text-gray-400 shadow-neu hover:text-primary dark:bg-gray-900 dark:shadow-neu-dark"
      >
        <Download size={18} />
        <span className="hidden text-sm font-medium sm:inline">Install app</span>
      </button>

      {showSteps ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowSteps(false)}>
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Install Bongo Chee on this iPhone or iPad</h2>
            <ol className="mt-4 space-y-3 text-xs text-gray-600 dark:text-gray-300">
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
                  1
                </span>
                <span>
                  Open this page in <b>Safari</b> and tap <Share size={14} className="inline align-text-bottom" /> <b>Share</b>.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
                  2
                </span>
                <span>
                  Choose <Plus size={14} className="inline align-text-bottom" /> <b>Add to Home Screen</b>, then <b>Add</b>.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
                  3
                </span>
                <span>Open Bongo Chee from the home screen and sign in.</span>
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowSteps(false)}
              className="mt-5 w-full rounded-full bg-primary py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
