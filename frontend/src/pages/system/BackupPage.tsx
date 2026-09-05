import { useState } from "react";
import { DownloadCloud, UploadCloud, AlertTriangle } from "lucide-react";
import { downloadBackup, restoreBackup } from "../../services/system";
import { extractErrorMessage } from "../../lib/errors";
import { usePermissions } from "../../hooks/usePermissions";

const CONFIRM_PHRASE = "RESTORE";

export default function BackupPage() {
  const { isAdminOrSuper } = usePermissions();

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadBackup();
    } catch (err) {
      setDownloadError(extractErrorMessage(err, "Backup failed. Please try again."));
    } finally {
      setDownloading(false);
    }
  };

  const canRestore = Boolean(file) && password.length > 0 && confirmText === CONFIRM_PHRASE;

  const handleRestore = async () => {
    if (!file || !canRestore) return;
    setRestoring(true);
    setRestoreError(null);
    setRestoreSuccess(null);
    try {
      await restoreBackup(file, password);
      setRestoreSuccess("Restore complete. Other users will need to log in again.");
      setFile(null);
      setPassword("");
      setConfirmText("");
    } catch (err) {
      setRestoreError(extractErrorMessage(err, "Restore failed. Please try again."));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Backup & Restore</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Download a full copy of the system's data, or restore it from a previous backup.
        </p>
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-3 flex items-center gap-2">
          <DownloadCloud size={18} className="text-primary" />
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Download a backup</h2>
        </div>
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          Saves a file to your computer with everything currently in the system — stock, sales, returns,
          users, and settings. Keep it somewhere safe.
        </p>
        {downloadError ? <p className="mb-3 text-xs text-danger">{downloadError}</p> : null}
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="rounded-full bg-primary px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {downloading ? "Preparing download…" : "Download backup"}
        </button>
      </section>

      {isAdminOrSuper ? (
        <section className="rounded-2xl border border-danger/30 bg-white p-5 shadow-soft dark:border-danger/40 dark:bg-gray-900">
          <div className="mb-3 flex items-center gap-2">
            <UploadCloud size={18} className="text-danger" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Restore from a backup</h2>
          </div>
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-xs text-danger">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <p>
              This doesn't erase everything — it merges the backup in. Anything in the backup that
              matches something currently in the system (same record) gets <strong>overwritten</strong>{" "}
              with the backup's version. Anything added since the backup was made is left alone. Anything
              the backup has that's since been deleted gets added back. This cannot be undone.
            </p>
          </div>

          {restoreSuccess ? <p className="mb-3 text-xs text-success">{restoreSuccess}</p> : null}
          {restoreError ? <p className="mb-3 text-xs text-danger">{restoreError}</p> : null}

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Backup file (.json.gz)</label>
              <input
                type="file"
                accept=".gz"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Your password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Confirm it's you"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Type {CONFIRM_PHRASE} to confirm
              </label>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_PHRASE}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs outline-none focus:border-danger dark:border-gray-800 dark:bg-gray-950"
              />
            </div>
            <button
              type="button"
              onClick={handleRestore}
              disabled={!canRestore || restoring}
              className="rounded-full bg-danger px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {restoring ? "Restoring…" : "Restore and overwrite everything"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
