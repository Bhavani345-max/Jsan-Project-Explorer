"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn, Loader2, AlertCircle } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Where the middleware wanted to send them before the detour through here.
  const next = params.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        body: JSON.stringify({ email, password }),
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

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10 bg-bg">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jsan-mark.png" alt="" className="w-10 h-10 object-contain" />
          <div className="leading-tight">
            <h1 className="text-lg font-bold tracking-tight">JSAN NexusAI</h1>
            <p className="text-[12px] text-text-muted">Opportunity Intelligence</p>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="font-semibold mb-1">Sign in</h2>
          <p className="text-[13px] text-text-muted mb-5">
            This portal is restricted to JSAN staff.
          </p>

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">
                Email
              </span>
              <input
                type="email"
                required
                autoFocus
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input mt-1.5"
                placeholder="you@jsanconsulting.com"
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">
                Password
              </span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input mt-1.5"
                placeholder="••••••••••••"
              />
            </label>

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

            <button type="submit" disabled={busy} className="btn btn-primary w-full justify-center">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-[12px] text-text-faint mt-4 text-center">
          Need access? Ask a portal administrator to create your account.
        </p>
      </div>
    </div>
  );
}
