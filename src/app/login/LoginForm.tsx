"use client";

// ------------------------------------------------------------------
// Sign-in, built to the supplied design reference.
//
// Layout: a light brand column on the left, a curved-edge artwork panel on the
// right, and the form floating over the artwork. The curve is a single
// elliptical arc produced by border-radius with a vertical radius of exactly
// 50% on both left corners — that leaves no straight segment between them, so
// the edge bulges left at mid-height instead of rounding two separate corners.
//
// Below `lg` the artwork panel and its labels are dropped and the page becomes
// a single column. A curved decorative panel on a phone would push the form
// under the fold to show marketing copy to somebody who has already decided to
// sign in.
//
// Two things in the reference are deliberately not reproduced; see the notes at
// "Forgot Password" and at the end of the form.
// ------------------------------------------------------------------

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Loader2,
  AlertCircle,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Check,
  Search,
  BarChart3,
  Users,
  BrainCircuit,
  Globe,
} from "lucide-react";

// Login-page palette, taken from the reference. Held here rather than promoted
// into globals.css because the app's --primary is indigo and the rest of the
// portal is built on it; this blue exists only on the front door.
const BLUE = "#1f63e0";
const BLUE_HOVER = "#1a55c4";

const FEATURES = [
  {
    icon: Search,
    title: "Discover",
    body: "Find relevant projects and opportunities with ease.",
  },
  {
    icon: BarChart3,
    title: "Analyze",
    // The reference read "AI-powered analytics". Fit scoring here is a rule
    // table (lib/scoring.ts) and the AI enrichment layer was removed, so the
    // claim is narrowed to what the portal actually does.
    body: "Leverage smart insights and capability-fit analytics.",
  },
  {
    icon: Users,
    title: "Connect",
    body: "Collaborate and connect with the right stakeholders.",
  },
];

const PANEL_LABELS = [
  { icon: BrainCircuit, lines: ["AI", "Powered"], top: "25%" },
  { icon: BarChart3, lines: ["Smart", "Insights"], top: "50%" },
  { icon: Globe, lines: ["Global", "Opportunities"], top: "71%" },
];

export function LoginForm() {
  const params = useSearchParams();
  // Where the middleware wanted to send them before the detour through here.
  const next = params.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [resetHint, setResetHint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, remember }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Sign-in failed");
        setBusy(false);
        return;
      }
      // Full navigation, not router.push: the layout above this page has to
      // re-render server-side to pick up the new session, and a client-side
      // transition would leave it showing the signed-out shell.
      window.location.assign(next);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  // Shift is held to type a capital deliberately, so the warning would be noise.
  const trackCaps = (e: React.KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(e.getModifierState?.("CapsLock") === true && !e.shiftKey);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-bg">
      {/* ---------- Curved artwork panel (lg and up) ---------- */}
      <div
        className="hidden lg:block absolute inset-y-0 right-0 w-[62%] overflow-hidden"
        style={{
          // Vertical radius of 50% on both left corners = one continuous arc.
          borderRadius: "18% 0 0 18% / 50% 0 0 50%",
          backgroundColor: "#0a1f3d", // painted before the SVG decodes
          backgroundImage: "url(/login-bg.svg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        {PANEL_LABELS.map(({ icon: Icon, lines, top }) => (
          <div
            key={lines.join("")}
            className="absolute left-[9%] flex items-center gap-3 text-white/95"
            style={{ top }}
          >
            <Icon size={31} strokeWidth={1.15} className="shrink-0 opacity-90" />
            <span className="text-[12.5px] font-medium uppercase tracking-[0.13em] leading-[1.3]">
              {lines[0]}
              <br />
              {lines[1]}
            </span>
          </div>
        ))}

        <p className="absolute bottom-8 right-10 text-[13px] text-white/75 tracking-wide">
          Empowering decisions.
          <span className="inline-block w-4" />
          Building tomorrow.
        </p>
      </div>

      {/* ---------- Content ---------- */}
      <div className="relative min-h-screen grid lg:grid-cols-[minmax(0,1fr)_clamp(392px,33vw,468px)]">
        {/* Brand column */}
        <div className="flex flex-col justify-between px-6 sm:px-10 lg:pl-[6.5%] lg:pr-8 pt-10 pb-8 lg:py-14">
          <div className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/jsan-logo.png"
              alt="JSAN Consulting"
              className="h-[46px] w-auto object-contain dark:brightness-0 dark:invert"
            />
          </div>

          <div className="max-w-[440px] my-10 lg:my-0">
            <h1 className="text-[34px] sm:text-[40px] font-bold tracking-tight leading-none">
              JSAN{" "}
              <span className="text-[#2563eb] dark:text-[#5b8ef5]">NexusAI</span>
            </h1>
            <p className="mt-3 text-[15px] sm:text-[17px] font-semibold uppercase tracking-[0.28em] text-[#2563eb] dark:text-[#5b8ef5]">
              Project Finders
            </p>

            <span className="block w-[68px] h-px bg-border-strong my-7" />

            <p className="text-[16px] leading-[1.65] text-text">
              Discover. Analyze. Connect.
              <br />
              Finding the right projects,
              <br />
              driving meaningful impact.
            </p>

            <ul className="mt-10 space-y-7">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex items-start gap-4">
                  <span
                    className="grid place-items-center w-11 h-11 rounded-full shrink-0"
                    style={{ background: "rgba(37,99,235,0.11)" }}
                  >
                    <Icon size={19} className="text-[#2563eb] dark:text-[#6f9df8]" />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <div className="text-[16px] font-semibold text-[#2563eb] dark:text-[#6f9df8]">
                      {title}
                    </div>
                    <p className="text-[13.5px] leading-[1.55] text-text-muted mt-0.5 max-w-[280px]">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[12.5px] text-text-faint">
            © {new Date().getFullYear()} JSAN Consulting Group. All rights reserved.
          </p>
        </div>

        {/* Form column */}
        <div className="flex items-center justify-center px-6 sm:px-10 lg:px-0 lg:pr-[7%] pb-12 lg:py-14">
          <div
            className="w-full max-w-[432px] rounded-2xl bg-bg-elev border border-border px-7 sm:px-9 py-9"
            style={{ boxShadow: "0 28px 64px -18px rgba(8,28,60,0.42)" }}
          >
            <div className="flex justify-center">
              <div className="grid place-items-center w-[68px] h-[68px] rounded-full bg-bg-elev ring-1 ring-border shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/jsan-mark.png" alt="" className="w-8 h-8 object-contain" />
              </div>
            </div>

            <h2 className="mt-5 text-center text-[27px] font-bold tracking-tight">
              Welcome Back
            </h2>
            <p className="mt-1.5 text-center text-[13.5px] text-text-muted">
              Sign in to continue to JSAN NexusAI
            </p>

            <form onSubmit={submit} className="mt-7 space-y-[18px]">
              <div>
                <label htmlFor="email" className="block text-[13px] font-semibold mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail
                    size={17}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-faint"
                  />
                  <input
                    id="email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="username"
                    spellCheck={false}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="input !h-[50px] !pl-11 !rounded-[10px]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-[13px] font-semibold mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock
                    size={17}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-faint"
                  />
                  <input
                    id="password"
                    type={reveal ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={trackCaps}
                    onKeyUp={trackCaps}
                    onBlur={() => setCapsLock(false)}
                    placeholder="Enter your password"
                    className="input !h-[50px] !pl-11 !pr-11 !rounded-[10px]"
                  />
                  <button
                    type="button"
                    onClick={() => setReveal((v) => !v)}
                    aria-label={reveal ? "Hide password" : "Show password"}
                    title={reveal ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-text-faint hover:text-text transition-colors"
                  >
                    {reveal ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {capsLock && (
                  <p className="flex items-center gap-1.5 mt-2 text-[11.5px] text-warning">
                    <AlertCircle size={12} />
                    Caps Lock is on
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span
                    className="grid place-items-center w-[19px] h-[19px] rounded-[5px] border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-1"
                    style={{
                      background: remember ? BLUE : "transparent",
                      borderColor: remember ? BLUE : "var(--border-strong)",
                    }}
                  >
                    {remember && <Check size={12} strokeWidth={3.5} className="text-white" />}
                  </span>
                  <span className="text-[13px] text-text-muted">Remember me</span>
                </label>

                {/* There is no password-reset flow — passwords are set by an
                    administrator through /api/admin/users. A link that opened
                    nothing would be worse than telling the truth here. */}
                <button
                  type="button"
                  onClick={() => setResetHint((v) => !v)}
                  aria-expanded={resetHint}
                  className="text-[13px] font-medium hover:underline text-[#2563eb] dark:text-[#6f9df8]"
                >
                  Forgot Password?
                </button>
              </div>

              {resetHint && (
                <p className="rounded-lg px-3 py-2.5 text-[12.5px] leading-relaxed bg-bg-subtle text-text-muted">
                  Passwords are reset by a portal administrator. Ask them to set a new one
                  for your account — there is no self-service reset.
                </p>
              )}

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-[13px]"
                  style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
                >
                  <AlertCircle size={15} className="shrink-0 mt-px" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full h-[50px] rounded-[10px] text-white font-semibold text-[15px] inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                style={{ background: busy ? BLUE_HOVER : BLUE }}
                onMouseEnter={(e) => (e.currentTarget.style.background = BLUE_HOVER)}
                onMouseLeave={(e) => (e.currentTarget.style.background = busy ? BLUE_HOVER : BLUE)}
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                {busy ? "Signing in…" : "Sign In"}
              </button>
            </form>

            {/* The reference also showed "or continue with → Sign in with Google".
                This portal has no OAuth provider wired up, and a sign-in button
                that cannot sign anyone in is the worst thing to put on a login
                page. Omitted until Google OAuth is actually configured. */}
            <p className="mt-6 text-center text-[12px] text-text-faint">
              Need access? Ask a portal administrator to create your account.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
