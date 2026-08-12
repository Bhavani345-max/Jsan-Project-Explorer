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
// Below `lg` the page becomes a single column and the artwork stops being a
// panel and becomes the background of the whole screen. The curve goes with it:
// a 50%-vertical-radius arc on a 360px-wide box bulges across most of the
// screen and eats the form. The panel's own labels and tagline are positioned
// against the desktop panel's box and are dropped with it.
//
// A phone keeping the flat page background was the thing that made the app
// look like a different product on Android than on a laptop.
//
// Two things in the reference are deliberately not reproduced; see the notes at
// "Forgot Password" and at the end of the form.
// ------------------------------------------------------------------

import { useState } from "react";
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

// One line each, deliberately. Two-line bodies made this column tall enough
// that it had to be hidden on ordinary laptop windows to keep the page on one
// screen — which meant the pitch vanished exactly where it was needed. Short
// enough to always fit is worth more than a fuller sentence nobody sees.
const FEATURES = [
  {
    icon: Search,
    title: "Discover",
    body: "Relevant projects and opportunities, fast.",
  },
  {
    icon: BarChart3,
    title: "Analyze",
    // The reference read "AI-powered analytics". Fit scoring here is a rule
    // table (lib/scoring.ts) and the AI enrichment layer was removed, so the
    // claim is narrowed to what the portal actually does.
    body: "Smart insights and capability-fit scoring.",
  },
  {
    icon: Users,
    title: "Connect",
    body: "Route them to the right stakeholders.",
  },
];

// The artwork, as a background. `backgroundColor` is painted before the SVG
// decodes so the white text over it is never white-on-white.
const ARTWORK: React.CSSProperties = {
  backgroundColor: "#0a1f3d",
  backgroundImage: "url(/login-bg.svg)",
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
};

// The phone gets the same artwork under a scrim. The desktop panel carries only
// three short labels, all in its darker lower half; a phone puts the wordmark
// and the whole pitch over the dusk sky at the top, which is light enough that
// white text on it fails contrast. The scrim is heaviest exactly there.
const ARTWORK_PHONE: React.CSSProperties = {
  ...ARTWORK,
  backgroundImage:
    "linear-gradient(180deg, rgba(7,22,47,0.80) 0%, rgba(7,22,47,0.52) 34%," +
    " rgba(7,22,47,0.30) 60%, rgba(7,22,47,0.52) 100%), url(/login-bg.svg)",
  backgroundSize: "auto, cover",
  backgroundPosition: "center, center",
  backgroundRepeat: "no-repeat, no-repeat",
};

const PANEL_LABELS = [
  { icon: BrainCircuit, lines: ["AI", "Powered"], top: "25%" },
  { icon: BarChart3, lines: ["Smart", "Insights"], top: "50%" },
  { icon: Globe, lines: ["Global", "Opportunities"], top: "71%" },
];

/**
 * @param next Where the middleware wanted to send them before the detour
 *   through here. Resolved and validated server-side in page.tsx — never read
 *   from the URL here, so this component cannot be handed an off-site
 *   destination to navigate to.
 */
export function LoginForm({ next }: { next: string }) {
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
    <div className="screen-fixed relative w-full bg-bg">
      {/* ---------- Artwork as the whole background (below lg) ---------- */}
      {/* Its own element rather than a responsive variant of the panel below,
          because the two differ in the one property that cannot be written
          responsively here: the panel's curve lives in an inline style, and
          inline styles have no breakpoints. Same URL, so it is one fetch. */}
      <div className="lg:hidden absolute inset-0" style={ARTWORK_PHONE} />

      {/* ---------- Curved artwork panel (lg and up) ---------- */}
      <div
        className="hidden lg:block absolute inset-y-0 right-0 w-[62%] overflow-hidden"
        style={{
          // Vertical radius of 50% on both left corners = one continuous arc.
          borderRadius: "18% 0 0 18% / 50% 0 0 50%",
          ...ARTWORK,
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
      {/* Rows on a phone (brand takes what it needs, the card centres in the
          rest); columns from lg. h-full everywhere so nothing can push the
          page past one screen. */}
      <div className="relative h-full grid grid-rows-[auto_1fr] lg:grid-rows-1 lg:grid-cols-[minmax(0,1fr)_clamp(392px,33vw,468px)]">
        {/* Brand column */}
        <div className="flex flex-col justify-between min-h-0 overflow-hidden px-6 sm:px-10 lg:pl-[6.5%] lg:pr-8 pt-[clamp(1.5rem,4vh,3.5rem)] pb-[clamp(1rem,3vh,3.5rem)]">
          <div className="flex items-center">
            {/* The wordmark is a PNG with an opaque white plate behind it, not a
                transparent one — so it cannot be recoloured. `brightness-0
                invert`, the usual way to force a logo white on a dark ground,
                turns the plate white too and leaves a blank rectangle.

                So the plate is made deliberate instead of fought: the logo sits
                on its own white chip, which is how a logo lockup on photography
                is normally handled anyway.

                The chip is on wherever the ground is dark — the artwork below
                lg, and the dark theme at lg. Desktop dark mode was already
                rendering this logo as a blank white rectangle for exactly this
                reason; it is the same bug, so it is fixed the same way. Only
                the light desktop column, where the plate is invisible against
                the page anyway, is left as it was. */}
            <span className="inline-flex rounded-xl bg-white px-3 py-2 shadow-sm lg:bg-transparent lg:p-0 lg:shadow-none lg:dark:bg-white lg:dark:px-3 lg:dark:py-2 lg:dark:shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/jsan-logo.png"
                alt="JSAN Consulting"
                className="h-[46px] w-auto object-contain"
              />
            </span>
          </div>

          <div className="max-w-[440px] my-[clamp(1.5rem,4vh,2.5rem)] lg:my-0">
            {/* Type scales with viewport height as well as width, so a short
                laptop window shrinks the headline instead of overflowing. */}
            {/* Below lg this copy sits on the artwork, so it inverts: white
                ink, and a blue light enough to hold contrast on navy — #2563eb
                on that background is barely legible. */}
            <h1 className="text-[clamp(1.75rem,3.4vh+0.9rem,2.5rem)] font-bold tracking-tight leading-none text-white lg:text-text">
              JSAN{" "}
              <span className="text-[#7fb2ff] lg:text-[#2563eb] lg:dark:text-[#5b8ef5]">NexusAI</span>
            </h1>
            <p className="mt-2.5 text-[clamp(0.8rem,1vh+0.5rem,1.0625rem)] font-semibold uppercase tracking-[0.28em] text-[#8ec0ff] lg:text-[#2563eb] lg:dark:text-[#5b8ef5]">
              Project Finders
            </p>

            <span className="block w-[68px] h-px bg-white/35 lg:bg-border-strong my-[clamp(1rem,2.6vh,1.75rem)]" />

            {/* Two lines rather than three — the third was a wrap, not a
                thought, and it cost 24px on every screen. */}
            <p className="text-[15px] leading-[1.6] text-white/85 lg:text-text">
              Discover. Analyze. Connect.
              <br />
              Finding the right projects, driving meaningful impact.
            </p>

            {/* Below lg the form has to come first; the pitch is not worth
                pushing it under the fold. */}
            <ul className="hidden lg:block mt-[clamp(1.25rem,4vh,2.5rem)] space-y-[clamp(0.875rem,2.6vh,1.75rem)]">
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
                    {/* 330px, not 280px: the longest body is ~42 characters,
                        which needs ~283px at this size. At 280px every one of
                        them wrapped to a second line and the column grew back
                        to the height that forced the hiding in the first
                        place. The column has 380px to give. */}
                    <p className="text-[13.5px] leading-[1.55] text-text-muted mt-0.5 max-w-[330px]">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* On a phone this sits in the auto-height brand row, directly under
              the wordmark, where a copyright line reads as an orphan. */}
          <p className="hidden lg:block text-[12.5px] text-text-faint">
            © {new Date().getFullYear()} JSAN Consulting Group. All rights reserved.
          </p>
        </div>

        {/* Form column */}
        {/* overflow-y-auto, not hidden: the card grows when an error, a Caps
            Lock warning and the reset hint are all showing at once, and on a
            short window that growth would otherwise be clipped by the page's
            overflow:hidden — putting the Sign In button somewhere unreachable.
            This way the page still never scrolls; at worst this one column
            does. */}
        {/* Centred with an auto margin on the card rather than `items-center`
            here, and the difference is not cosmetic.

            `align-items: center` centres UNSAFELY: when the card is taller than
            this column the overflow is split across both ends, and the half
            above the scroll origin can never be reached, because scrollTop
            cannot go negative. On a 360×640 Android screen that hid 93px of the
            card — the JSAN mark and the top of "Welcome Back" were simply gone,
            with no way to scroll up to them. An auto margin resolves to zero
            when there is no free space, so the card falls back to the top of the
            column and stays fully scrollable. */}
        <div className="flex min-h-0 overflow-y-auto overflow-x-hidden px-6 sm:px-10 lg:px-0 lg:pr-[7%] pb-[clamp(1.5rem,4vh,3.5rem)] lg:py-[clamp(1.5rem,4vh,3.5rem)]">
          <div
            className="w-full max-w-[432px] m-auto rounded-2xl bg-bg-elev border border-border px-7 sm:px-9 py-[clamp(1.375rem,3.4vh,2.25rem)]"
            style={{ boxShadow: "0 28px 64px -18px rgba(8,28,60,0.42)" }}
          >
            <div className="flex justify-center">
              <div className="grid place-items-center w-[clamp(52px,7vh,68px)] h-[clamp(52px,7vh,68px)] rounded-full bg-bg-elev ring-1 ring-border shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/jsan-mark.png" alt="" className="w-[55%] h-[55%] object-contain" />
              </div>
            </div>

            <h2 className="mt-[clamp(0.75rem,2vh,1.25rem)] text-center text-[clamp(1.35rem,2.6vh+0.5rem,1.6875rem)] font-bold tracking-tight">
              Welcome Back
            </h2>
            <p className="mt-1.5 text-center text-[13.5px] text-text-muted">
              Sign in to continue to JSAN NexusAI
            </p>

            <form onSubmit={submit} className="mt-[clamp(1.125rem,2.8vh,1.75rem)] space-y-[clamp(0.75rem,1.9vh,1.125rem)]">
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
                    className="input !h-[clamp(44px,5.6vh,50px)] !pl-11 !rounded-[10px]"
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
                    className="input !h-[clamp(44px,5.6vh,50px)] !pl-11 !pr-11 !rounded-[10px]"
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
                {/* `relative` so the sr-only input below is positioned against
                    this label. Without it the nearest positioned ancestor is
                    the page grid, three levels outside the scrolling column —
                    and an absolutely positioned box whose containing block sits
                    outside a scroll container is not clipped by it. On a
                    360×640 phone the real checkbox lands ~23px past the bottom
                    of the screen, so those 23px became scrollable overflow on
                    the page itself: focusing Sign In would slide the whole
                    layout up and cut the JSAN logo off the top. */}
                <label className="relative flex items-center gap-2.5 cursor-pointer select-none group">
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
                className="w-full h-[clamp(44px,5.6vh,50px)] rounded-[10px] text-white font-semibold text-[15px] inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
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
            <p className="mt-[clamp(0.875rem,2.2vh,1.5rem)] text-center text-[12px] text-text-faint">
              Need access? Ask a portal administrator to create your account.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
