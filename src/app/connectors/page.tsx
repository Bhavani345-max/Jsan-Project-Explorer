"use client";

import { useEffect, useState } from "react";
import {
  PlugZap, Plus, Clock, ShieldCheck, RefreshCw, Activity, X, CheckCircle2,
  AlertTriangle, XCircle, PauseCircle, KeyRound, RadioTower,
} from "lucide-react";
import type { APIConnector, ConnectorLog } from "@/lib/types";
import { Breadcrumbs, SectionCard } from "@/components/ui";
import { relTime } from "@/lib/format";

const STATUS_STYLE: Record<APIConnector["status"], { icon: any; color: string; bg: string }> = {
  Healthy: { icon: CheckCircle2, color: "var(--success)", bg: "var(--success-soft)" },
  Degraded: { icon: AlertTriangle, color: "var(--warning)", bg: "var(--warning-soft)" },
  Error: { icon: XCircle, color: "var(--danger)", bg: "var(--danger-soft)" },
  Idle: { icon: PauseCircle, color: "var(--text-faint)", bg: "var(--bg-subtle)" },
};

const LOG_COLOR: Record<ConnectorLog["level"], string> = {
  INFO: "var(--accent)",
  WARN: "var(--warning)",
  ERROR: "var(--danger)",
};

export default function ConnectorsPage() {
  const [connectors, setConnectors] = useState<APIConnector[]>([]);
  const [logs, setLogs] = useState<ConnectorLog[]>([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetch("/api/connectors")
      .then((r) => r.json())
      .then((d) => {
        setConnectors(d.connectors);
        setLogs(d.logs);
      });
  }, []);

  const healthy = connectors.filter((c) => c.status === "Healthy").length;
  const totalCollected = connectors.reduce((s, c) => s + c.projectsCollected, 0);

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "API Connectors" }]} />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">API Connector Framework</h1>
            <p className="text-text-muted text-sm mt-1">
              Configure public data sources. Only APIs, RSS, and open-data portals — no restricted scraping.
            </p>
          </div>
          <button onClick={() => setShowModal(true)} className="btn btn-primary">
            <Plus size={16} /> Add Connector
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          [PlugZap, "Configured", String(connectors.length), "var(--primary)"],
          [CheckCircle2, "Healthy", String(healthy), "var(--success)"],
          [Activity, "Collected (24h)", String(totalCollected), "var(--accent)"],
          [ShieldCheck, "Public sources", "100%", "var(--success)"],
        ].map(([Icon, label, value, color]: any) => (
          <div key={label} className="card p-4 flex items-center gap-3">
            <span className="grid place-items-center w-10 h-10 rounded-xl" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
              <Icon size={20} />
            </span>
            <div>
              <div className="text-xl font-bold tabular-nums">{value}</div>
              <div className="text-[12px] text-text-muted">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Connector cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {connectors.map((c) => {
          const st = STATUS_STYLE[c.status];
          const StIcon = st.icon;
          return (
            <div key={c.id} className="card p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm truncate">{c.name}</h3>
                  <p className="text-[11px] text-text-faint mt-0.5">{c.sourceType}</p>
                </div>
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: st.bg, color: st.color }}
                >
                  <StIcon size={12} /> {c.status}
                </span>
              </div>

              <code className="text-[11px] text-text-faint bg-bg-subtle rounded-md px-2 py-1.5 truncate block">
                {c.baseUrl}
              </code>

              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <Meta icon={KeyRound} label="Auth" value={c.authType} />
                <Meta icon={Clock} label="Schedule" value={c.schedule} />
                <Meta icon={RadioTower} label="Rate limit" value={`${c.rateLimitPerMin}/min`} />
                <Meta icon={RefreshCw} label="Pagination" value={c.pagination} />
              </div>

              <div className="flex items-center justify-between text-[11px] text-text-faint pt-3 border-t border-border">
                <span>Last run {relTime(c.lastRun)}</span>
                <span className="font-semibold text-text">{c.projectsCollected} collected</span>
              </div>

              <label className="flex items-center justify-between text-[12px] mt-1">
                <span className="text-text-muted">{c.enabled ? "Enabled" : "Disabled"}</span>
                <span
                  className={`relative inline-block w-9 h-5 rounded-full transition-colors ${
                    c.enabled ? "bg-primary" : "bg-border-strong"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${
                      c.enabled ? "left-4.5" : "left-0.5"
                    }`}
                    style={{ left: c.enabled ? "18px" : "2px" }}
                  />
                </span>
              </label>
            </div>
          );
        })}
      </div>

      {/* Scheduler + Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Data Collection Scheduler" subtitle="Automated ingestion cadence">
          <div className="space-y-3">
            {[
              ["Every 15 minutes", "RSS / high-frequency feeds", "var(--accent)"],
              ["Hourly", "Government & tender APIs", "var(--primary)"],
              ["Daily", "Open data portal bulk sync", "var(--success)"],
            ].map(([t, d, color]) => (
              <div key={t} className="flex items-center gap-3 rounded-xl bg-bg-subtle p-3">
                <span className="w-2 h-2 rounded-full" style={{ background: color as string }} />
                <div className="flex-1">
                  <p className="font-semibold text-[13px]">{t}</p>
                  <p className="text-[11px] text-text-faint">{d}</p>
                </div>
                <Clock size={15} className="text-text-faint" />
              </div>
            ))}
            <div className="rounded-xl border border-dashed border-border p-3 text-[12px] text-text-muted leading-relaxed">
              <strong className="text-text">De-duplication:</strong> incoming records are matched by reference number
              + source hash. Changed fields update the existing project and append a <em>ProjectHistory</em> row.
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Connector Logs" subtitle="Recent collection activity" className="lg:col-span-2">
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
                  <th className="px-2 py-2 font-semibold">Time</th>
                  <th className="px-2 py-2 font-semibold">Connector</th>
                  <th className="px-2 py-2 font-semibold">Level</th>
                  <th className="px-2 py-2 font-semibold">Message</th>
                  <th className="px-2 py-2 font-semibold text-right">Items</th>
                  <th className="px-2 py-2 font-semibold text-right">Duration</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0">
                    <td className="px-2 py-2.5 text-text-faint whitespace-nowrap">{relTime(l.timestamp)}</td>
                    <td className="px-2 py-2.5 font-mono text-[11px]">{l.connectorId}</td>
                    <td className="px-2 py-2.5">
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: `color-mix(in srgb, ${LOG_COLOR[l.level]} 15%, transparent)`, color: LOG_COLOR[l.level] }}
                      >
                        {l.level}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-text-muted">{l.message}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{l.itemsFetched}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-text-faint">{l.durationMs}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      {showModal && <AddConnectorModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

function Meta({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon size={13} className="text-text-faint shrink-0" />
      <span className="text-text-faint">{label}:</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  );
}

function AddConnectorModal({ onClose }: { onClose: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40 backdrop-blur-sm animate-in" onClick={onClose}>
      <div className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <PlugZap size={18} className="text-primary" /> New Data Connector
          </h2>
          <button onClick={onClose} className="btn btn-ghost !px-2" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="text-[13px] text-text-faint mb-5">Register a public API, RSS, or open-data source.</p>

        {saved ? (
          <div className="text-center py-10">
            <CheckCircle2 size={44} className="mx-auto text-success mb-3" />
            <p className="font-semibold">Connector queued</p>
            <p className="text-[13px] text-text-faint mt-1">The scheduler will validate and run it on the next cycle.</p>
            <button onClick={onClose} className="btn btn-primary mt-5 mx-auto">Done</button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setSaved(true);
            }}
          >
            <Field label="Connector name">
              <input required className="input" placeholder="e.g. SAM.gov Contract Opportunities" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Source type">
                <select className="input cursor-pointer">
                  {["Government Procurement API", "Public Tender API", "RSS Feed", "Open Data Portal", "JSON Endpoint", "XML Feed"].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </Field>
              <Field label="Authentication">
                <select className="input cursor-pointer">
                  {["None", "API Key", "OAuth", "Bearer Token"].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Base URL">
              <input required className="input" placeholder="https://api.example.gov/opportunities/v2/search" />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Schedule">
                <select className="input cursor-pointer">
                  {["Every 15 minutes", "Hourly", "Daily"].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </Field>
              <Field label="Rate / min">
                <input type="number" defaultValue={60} className="input" />
              </Field>
              <Field label="Pagination">
                <select className="input cursor-pointer">
                  {["Offset", "Cursor", "Page", "None"].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-[13px] text-text-muted">
              <input type="checkbox" defaultChecked className="accent-[var(--primary)]" />
              Enable automatic retry with exponential backoff
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
              <button type="submit" className="btn btn-primary">Create Connector</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
