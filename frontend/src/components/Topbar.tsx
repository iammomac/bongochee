import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, KeyRound, Menu, Moon, Sun } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import { requestPasswordChange } from "../services/passwordRequests";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../services/notifications";
import type { Notification } from "../types";

const POLL_INTERVAL_MS = 60_000;
const RECENT_LIMIT = 20;

function timeAgo(iso: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const refresh = () => {
    listNotifications()
      .then((all) => setNotifications(all.slice(0, RECENT_LIMIT)))
      .catch(() => {});
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSelect = async (notification: Notification) => {
    setOpen(false);
    if (!notification.isRead) {
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)));
      markNotificationRead(notification.id).catch(() => {});
    }
    if (notification.link) navigate(notification.link);
  };

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await markAllNotificationsRead();
    } catch {
      refresh();
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full bg-white p-2.5 text-gray-400 shadow-neu hover:text-primary dark:bg-gray-900 dark:shadow-neu-dark"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-2xl border border-gray-100 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <p className="text-sm font-medium">Notifications</p>
            {unreadCount > 0 ? (
              <button onClick={() => void handleMarkAllRead()} className="text-xs text-primary hover:underline">
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-gray-400">No notifications yet</p>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => void handleSelect(notification)}
                  className={`block w-full border-b border-gray-50 px-4 py-3 text-left text-sm last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800 ${
                    notification.isRead ? "" : "bg-primary/5"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!notification.isRead ? <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /> : null}
                    <div className="min-w-0 flex-1">
                      <p className={`truncate ${notification.isRead ? "font-normal text-gray-600 dark:text-gray-300" : "font-medium"}`}>
                        {notification.title}
                      </p>
                      {notification.message ? (
                        <p className="mt-0.5 truncate text-xs text-gray-400">{notification.message}</p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-gray-400">{timeAgo(notification.createdAt)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PasswordRequestButton() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");

  const submit = async () => {
    setStatus("submitting");
    try {
      await requestPasswordChange(reason || undefined);
      setStatus("sent");
      setReason("");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-white p-2.5 text-gray-400 shadow-neu hover:text-primary dark:bg-gray-900 dark:shadow-neu-dark"
        aria-label="Request password change"
      >
        <KeyRound size={18} />
      </button>
      {open ? (
        <div className="absolute right-0 z-10 mt-2 w-72 rounded-2xl border border-gray-100 bg-white p-4 shadow-lg dark:border-gray-800 dark:bg-gray-900">
          <p className="text-sm font-medium">Request password change</p>
          <p className="mt-1 text-xs text-gray-400">
            An admin will review this and issue a temporary password.
          </p>
          {status === "sent" ? (
            <p className="mt-3 rounded-xl bg-success/10 px-3 py-2 text-xs text-success">
              Request sent. An admin will contact you.
            </p>
          ) : (
            <>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional)"
                rows={3}
                className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none dark:border-gray-700 dark:bg-gray-950"
              />
              {status === "error" ? (
                <p className="mt-2 text-xs text-danger">Couldn't send the request. Try again.</p>
              ) : null}
              <button
                onClick={() => void submit()}
                disabled={status === "submitting"}
                className="mt-3 w-full rounded-xl bg-primary py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {status === "submitting" ? "Sending…" : "Send request"}
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

const CLOCK_TICK_MS = 30_000;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function greetingFor(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(interval);
  }, []);
  return now;
}

interface TopbarProps {
  onMenuClick: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const now = useClock();
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const date = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${pad(now.getFullYear() % 100)}`;
  return (
    <header className="flex items-center justify-between px-6 py-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="rounded-full bg-white p-2.5 text-gray-400 shadow-neu hover:text-primary dark:bg-gray-900 dark:shadow-neu-dark md:hidden"
        >
          <Menu size={18} />
        </button>
        <div className="rounded-2xl bg-white px-4 py-2 shadow-neu dark:bg-gray-900 dark:shadow-neu-dark">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {/* fullName is "" (not null) for accounts with no first/last name set,
                e.g. the seeded super/admin accounts -- "??" only falls back on
                null/undefined, so username is the real fallback here. */}
            {greetingFor(now.getHours())}, {user?.fullName || user?.username || "—"}
          </p>
          <p className="text-xs text-gray-400">
            {time} &middot; {date}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <NotificationBell />
        <PasswordRequestButton />
        <button
          onClick={toggleTheme}
          className="rounded-full bg-white p-2.5 text-gray-400 shadow-neu hover:text-primary dark:bg-gray-900 dark:shadow-neu-dark"
          aria-label="Toggle dark mode"
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button
          onClick={() => void logout()}
          className="rounded-full bg-white px-4 py-2.5 text-sm text-gray-400 shadow-neu hover:text-danger dark:bg-gray-900 dark:shadow-neu-dark"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
