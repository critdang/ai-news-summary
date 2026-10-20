"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Github, Loader2, RefreshCw, Settings, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Connector = {
  id: string;
  name: string;
  enabled: boolean;
  type: string;
  lastRun: { status: string; startedAt: string; fetchedCount: number; errorMessage: string | null } | null;
};

export function ConnectorSourceManager() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/connectors");
      const payload = await response.json() as { data?: Connector[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load connectors.");
      setConnectors(payload.data ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load connectors.")), 0); return () => clearTimeout(timer); }, [load]);

  const updateEnabled = async (connector: Connector) => {
    setBusy(connector.id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/connectors/${connector.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !connector.enabled }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not update connector.");
      await load();
      toast.success(`Connector ${connector.enabled ? "disabled" : "enabled"}`);
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Could not update connector."; setError(message); toast.error(message); }
    finally { setBusy(null); }
  };
  const sync = async (connector: Connector) => {
    setBusy(connector.id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/connectors/${connector.id}/sync`, { method: "POST" });
      const payload = await response.json() as { data?: { fetched: number }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Sync failed.");
      setMessage(`${connector.name}: synced ${payload.data?.fetched ?? 0} projects.`);
      toast.success(`${connector.name} synced`);
      await load();
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Sync failed."; setError(message); toast.error(message); await load(); }
    finally { setBusy(null); }
  };
  const remove = async (connector: Connector) => {
    if (!window.confirm(`Remove ${connector.name} and its saved projects?`)) return;
    setBusy(connector.id); setError("");
    try {
      const response = await fetch(`/api/connectors/${connector.id}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not remove connector.");
      await load();
      toast.success(`Connector “${connector.name}” removed`);
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Could not remove connector."; setError(message); toast.error(message); }
    finally { setBusy(null); }
  };

  return <section className="mb-4 rounded-xl border border-border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-sm font-semibold"><Github size={16} />Discovery connectors</h2><p className="mt-1 text-xs text-muted-foreground">Manage project sources and sync status here. Their data appears in Discover → Projects.</p></div><Button size="sm" variant="outline" render={<Link href="/discover/projects" />}><Settings size={14} className="mr-1.5" />Configure searches</Button></div>
    {error && <p className="mt-3 rounded-md bg-destructive/5 p-2 text-xs text-destructive" role="alert">{error}</p>}{message && <p className="mt-3 text-xs text-emerald-600" role="status">{message}</p>}
    {loading && connectors.length === 0 ? <p role="status" className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={13} className="animate-spin" />Loading connector data…</p> : connectors.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">No discovery connectors configured yet.</p> : <div className="mt-3 divide-y divide-border">{connectors.map((connector) => <div key={connector.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{connector.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{connector.type === "github-repositories" ? "GitHub · Projects" : connector.type}{connector.lastRun ? ` · ${connector.lastRun.status} · ${new Date(connector.lastRun.startedAt).toLocaleString()}` : " · not synced"}</p>{connector.lastRun?.status === "failed" && <p className="mt-1 text-xs text-destructive">{connector.lastRun.errorMessage}</p>}</div><div className="flex items-center gap-2"><Button size="sm" variant="ghost" disabled={busy === connector.id} onClick={() => void updateEnabled(connector)}>{busy === connector.id ? <Loader2 size={14} className="animate-spin" /> : connector.enabled ? "Enabled" : "Disabled"}</Button><Button size="sm" variant="outline" disabled={!connector.enabled || busy === connector.id} onClick={() => void sync(connector)}><RefreshCw size={13} className="mr-1" />Sync</Button><Button size="icon" variant="ghost" disabled={busy === connector.id} onClick={() => void remove(connector)} aria-label={`Remove ${connector.name}`}><Trash2 size={14} /></Button></div></div>)}</div>}
  </section>;
}
