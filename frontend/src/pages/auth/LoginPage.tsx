import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { extractErrorMessage } from "../../lib/errors";
import logoBadge from "../../assets/logo-badge.png";

const schema = z.object({
  username: z.string().min(1, "Required"),
  password: z.string().min(1, "Required"),
});
type FormValues = z.infer<typeof schema>;

// Cloudflare Turnstile (bot protection). Empty until VITE_TURNSTILE_SITE_KEY is set —
// see backend/accounts/captcha.py, which no-ops server-side until TURNSTILE_SECRET_KEY
// is configured too, so login isn't broken for deployments that haven't set this up.
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

declare global {
  interface Window {
    onTurnstileVerify?: (token: string) => void;
  }
}

// No extra CSS ring here — the badge artwork already carries its own two rings,
// and wrapping it in another circle would make it three. The card's own size
// (identical on both faces, since they're just the two sides of one rotating
// box) is what stays constant through the flip, not a drawn border.
const CIRCLE_SIZE = "clamp(280px, 82vw, 380px)";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [flipped, setFlipped] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (flipped) usernameRef.current?.focus();
  }, [flipped]);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    window.onTurnstileVerify = (token: string) => setCaptchaToken(token);
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
      delete window.onTurnstileVerify;
    };
  }, []);

  const { ref: usernameFormRef, ...usernameField } = register("username");

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      if (captchaToken) {
        await login(values.username, values.password, captchaToken);
      } else {
        await login(values.username, values.password);
      }
      navigate("/", { replace: true });
    } catch (err) {
      setServerError(extractErrorMessage(err, "Unable to sign in. Please try again."));
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-primary/10 via-background to-secondary/10 dark:from-primary/10 dark:via-gray-950 dark:to-secondary/5">
      {/* Soft sparkle — a few blurred brand-color glows, kept subtle. */}
      <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-primary/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-secondary/25 blur-3xl" />
      <div className="pointer-events-none absolute right-1/4 top-1/5 h-36 w-36 rounded-full bg-primary/15 blur-2xl" />

      <div className="relative" style={{ width: CIRCLE_SIZE, height: CIRCLE_SIZE, perspective: "1600px" }}>
        {/* Card — this is what actually flips. */}
        <div
          className={`relative h-full w-full rounded-full transition-transform duration-700 ease-in-out [transform-style:preserve-3d] ${
            flipped ? "[transform:rotateY(180deg)]" : ""
          }`}
        >
          {/* Front — the real logo, exactly as designed (its own two rings). Press it to flip. */}
          <button
            type="button"
            onClick={() => setFlipped(true)}
            aria-label="Open sign in"
            aria-hidden={flipped}
            tabIndex={flipped ? -1 : 0}
            className={`absolute inset-0 rounded-full drop-shadow-xl transition-transform [backface-visibility:hidden] ${
              flipped ? "pointer-events-none" : "hover:scale-[1.03]"
            }`}
          >
            <img src={logoBadge} alt="Bongo Chee" className="h-full w-full rounded-full object-contain" />
          </button>

          {/* Back — glass panel with the login form. Pre-rotated so it reads upright once flipped. */}
          <div
            aria-hidden={!flipped}
            className={`absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-full border border-white/60 bg-white/70 p-8 shadow-2xl backdrop-blur-xl [backface-visibility:hidden] [transform:rotateY(180deg)] dark:border-gray-700/50 dark:bg-gray-900/70 ${
              flipped ? "" : "pointer-events-none"
            }`}
          >
            {/* Pressing the logo here is how you go back — no separate back button. */}
            <button
              type="button"
              onClick={() => setFlipped(false)}
              tabIndex={flipped ? 0 : -1}
              aria-label="Back to logo"
              className="transition-transform hover:scale-105"
            >
              <img src={logoBadge} alt="Bongo Chee" className="h-14 w-14" />
            </button>

            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Welcome back</p>
              <p className="text-[11px] text-gray-400">Sign in to continue</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-[190px] space-y-2">
              {serverError ? (
                <p className="rounded-lg bg-danger/10 px-2 py-1.5 text-center text-[11px] text-danger">
                  {serverError}
                </p>
              ) : null}

              <div>
                <input
                  {...usernameField}
                  ref={(el) => {
                    usernameFormRef(el);
                    usernameRef.current = el;
                  }}
                  tabIndex={flipped ? 0 : -1}
                  placeholder="Username"
                  className="w-full rounded-full border border-gray-200 bg-white/80 px-3 py-1.5 text-center text-xs outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-950/80"
                />
                {errors.username ? <p className="mt-0.5 text-center text-[10px] text-danger">{errors.username.message}</p> : null}
              </div>

              <div>
                <input
                  type="password"
                  {...register("password")}
                  tabIndex={flipped ? 0 : -1}
                  placeholder="Password"
                  className="w-full rounded-full border border-gray-200 bg-white/80 px-3 py-1.5 text-center text-xs outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-950/80"
                />
                {errors.password ? <p className="mt-0.5 text-center text-[10px] text-danger">{errors.password.message}</p> : null}
              </div>

              {TURNSTILE_SITE_KEY ? (
                <div className="flex justify-center">
                  <div className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} data-callback="onTurnstileVerify" />
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                tabIndex={flipped ? 0 : -1}
                className="w-full rounded-full bg-primary py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isSubmitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
