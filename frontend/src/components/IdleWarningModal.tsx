import { Clock } from "lucide-react";

interface IdleWarningModalProps {
  onStay: () => void;
}

// Shown 5 minutes before the idle-logout fires (see useIdleLogout) -- gives someone
// genuinely still working a visible chance to stay signed in instead of being
// silently logged out mid-form. Any activity anywhere on the page already dismisses
// this (useIdleLogout's onActive), so the button is a clear, obvious thing to click
// rather than the only way out.
export function IdleWarningModal({ onStay }: IdleWarningModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl dark:bg-gray-900">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
          <Clock size={22} className="text-warning" />
        </div>
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Still there?</h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          You've been inactive for a while. You'll be signed out soon unless you stay signed in — anything you
          haven't saved yet will be lost.
        </p>
        <button
          type="button"
          onClick={onStay}
          className="mt-4 w-full rounded-full bg-primary py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          Stay signed in
        </button>
      </div>
    </div>
  );
}
