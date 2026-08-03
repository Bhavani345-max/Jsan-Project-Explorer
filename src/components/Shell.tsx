"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Compass,
  PlugZap,
  BarChart3,
  Bell,
  Search,
  Sun,
  Moon,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { GTranslate } from "./GTranslate";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/explorer", label: "Project Explorer", icon: Compass },
  { href: "/connectors", label: "API Connectors", icon: PlugZap },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

const ROLES = ["Administrator", "Business Development", "Sales Team", "Manager", "Read Only"];

interface Suggestion {
  type: string;
  value: string;
  sub?: string;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [role, setRole] = useState(ROLES[0]);
  const [roleOpen, setRoleOpen] = useState(false);
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [liveData, setLiveData] = useState<boolean | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((s) => setLiveData(Boolean(s.live)))
      .catch(() => setLiveData(false));
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSuggestions(data.suggestions);
      setOpen(true);
    }, 120);
    return () => clearTimeout(t);
  }, [q]);

  const submitSearch = (term: string) => {
    setOpen(false);
    setQ("");
    router.push(`/explorer?q=${encodeURIComponent(term)}`);
  };

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-bg-elev sticky top-0 h-screen">
        <div className="brand-band h-16 flex items-center gap-2.5 px-5">
          <div className="grid place-items-center w-9 h-9 rounded-xl bg-white shadow-sm overflow-hidden shrink-0">
            {/* Real JSAN brand mark */}
            <img src="/jsan-mark.png" alt="JSAN Consulting logo" className="w-6 h-6 object-contain" />
          </div>
          <div className="leading-tight">
            <div className="font-bold text-[15px] tracking-tight text-white">JSAN</div>
            <div className="text-[11px] text-white/70">Opportunity Finder</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-faint">
            Workspace
          </p>
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary-soft text-primary"
                    : "text-text-muted hover:bg-bg-subtle hover:text-text"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border space-y-2">
          <div className="flex items-center gap-2 rounded-lg bg-bg-subtle px-3 py-2.5">
            <ShieldCheck size={16} className="text-success" />
            <div className="text-[11px] leading-tight">
              <div className="font-semibold text-text">Public sources only</div>
              <div className="text-text-faint">APIs · RSS · Open Data</div>
            </div>
          </div>
          {liveData ? (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: "var(--success-soft, rgba(34,197,94,.12))" }}
              title="Live data connected — real opportunities ingested daily from public government & multilateral APIs (UK Contracts Finder, EU TED, World Bank)."
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--success)" }} />
              <div className="text-[11px] leading-tight">
                <div className="font-semibold" style={{ color: "var(--success)" }}>Live data connected</div>
                <div className="text-text-faint">UK · EU TED · World Bank · refreshed daily</div>
              </div>
            </div>
          ) : (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: "var(--warning-soft)" }}
              title="This build runs on an illustrative sample dataset. Connect a live public API to ingest real tenders."
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--warning)" }} />
              <div className="text-[11px] leading-tight">
                <div className="font-semibold" style={{ color: "var(--warning)" }}>Sample dataset</div>
                <div className="text-text-faint">Demo data — not live tenders</div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="brand-band h-16 sticky top-0 z-30 flex items-center gap-3 px-4 md:px-6 shadow-sm">
          <div ref={boxRef} className="relative flex-1 max-w-xl">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "#8593a2" }}
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => q && setOpen(true)}
              onKeyDown={(e) => e.key === "Enter" && q.trim() && submitSearch(q)}
              placeholder="Search projects, technologies, organizations…"
              className="input search-brand pl-9"
            />
            {open && suggestions.length > 0 && (
              <div className="absolute mt-2 w-full card p-1.5 z-40 animate-in">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => submitSearch(s.value)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-bg-subtle transition-colors"
                  >
                    <span className="chip shrink-0">{s.type}</span>
                    <span className="text-sm truncate">{s.value}</span>
                    {s.sub && <span className="ml-auto text-[11px] text-text-faint shrink-0">{s.sub}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Sticky with the topbar itself, which is `sticky top-0 z-30`. */}
            <GTranslate />

            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="btn btn-on-brand !px-2.5"
              title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <button className="btn btn-on-brand !px-2.5 relative" aria-label="Notifications">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger" />
            </button>

            {/* Role switcher */}
            <div className="relative">
              <button
                onClick={() => setRoleOpen((v) => !v)}
                className="flex items-center gap-2 pl-1.5 pr-2 py-1.5 rounded-lg hover:bg-white/15 transition-colors"
              >
                <span className="grid place-items-center w-8 h-8 rounded-full bg-white text-primary text-xs font-bold ring-2 ring-white/40">
                  BD
                </span>
                <div className="hidden sm:block text-left leading-tight">
                  <div className="text-[13px] font-semibold text-white">Alex Morgan</div>
                  <div className="text-[10px] text-white/70">{role}</div>
                </div>
                <ChevronDown size={14} className="text-white/70" />
              </button>
              {roleOpen && (
                <div className="absolute right-0 mt-2 w-56 card p-1.5 z-40 animate-in">
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                    Switch role (RBAC)
                  </p>
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        setRole(r);
                        setRoleOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-bg-subtle transition-colors ${
                        r === role ? "text-primary font-semibold" : "text-text-muted"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1500px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
