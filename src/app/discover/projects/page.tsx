"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownWideNarrow, ArrowLeft, ExternalLink, Github, Loader2, Plus, RefreshCw, Search, Settings, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { toast } from "sonner";

type ConnectorConfig = {
  id: string;
  name: string;
  enabled: boolean;
  config: { query: string; topic: string; language: string; sort: "stars" | "forks" | "updated"; resultLimit: number };
  lastSyncedAt: string | null;
  lastRun: { status: string; startedAt: string; fetchedCount: number; errorMessage: string | null } | null;
};
type Project = {
  id: string; fullName: string; canonicalUrl: string; description: string | null; language: string | null;
  stars: number; forks: number; topics: string[]; upstreamUpdatedAt: string | null; lastSyncedAt: string;
};
type ProjectResponse = { data: Project[]; languages: string[] };

type SearchConfig = ConnectorConfig["config"];
const EMPTY_CONFIG: SearchConfig = { query: "", topic: "", language: "", sort: "stars", resultLimit: 30 };
const formatCount = (count: number) => new Intl.NumberFormat(undefined, { notation: count >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(count);

export default function ProjectsPage() {
  const [connectors, setConnectors] = useState<ConnectorConfig[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [name, setName] = useState("GitHub discovery");
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [search, setSearch] = useState("");
  const [language, setLanguage] = useState("");
  const [sort, setSort] = useState("stars");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadProjects = useCallback(async (filters = { search, language, sort }) => {
    const params = new URLSearchParams();
    if (filters.search) params.set("q", filters.search);
    if (filters.language) params.set("language", filters.language);
    params.set("sort", filters.sort);
    const response = await fetch(`/api/projects?${params}`);
    const payload = await response.json() as ProjectResponse & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Could not load projects.");
    setProjects(payload.data);
    setLanguages(payload.languages);
  }, [search, language, sort]);

  const loadConnectors = useCallback(async () => {
    const response = await fetch("/api/connectors");
    const payload = await response.json() as { data?: ConnectorConfig[]; error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Could not load connectors.");
    setConnectors(payload.data ?? []);
  }, []);

  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try { await Promise.all([loadProjects(), loadConnectors()]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load Discover."); }
    finally { setLoading(false); }
  }, [loadConnectors, loadProjects]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const saveConnector = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(editingId ? `/api/connectors/${editingId}` : "/api/connectors", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, config }) });
      const payload = await response.json() as { data?: ConnectorConfig; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not save connector.");
      if (editingId) setConnectors((current) => current.map((item) => item.id === editingId ? { ...item, name, config } : item));
      else setConnectors((current) => [...current, payload.data!]);
      setEditingId(null);
      setName("GitHub discovery");
      setConfig(EMPTY_CONFIG);
      setMessage(editingId ? "GitHub search updated." : "GitHub search saved. Start a sync to load projects.");
      toast.success(editingId ? "GitHub search updated" : "GitHub search saved");
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Could not save connector."; setError(message); toast.error(message); }
    finally { setSaving(false); }
  };

  const editConnector = (connector: ConnectorConfig) => {
    setEditingId(connector.id);
    setName(connector.name);
    setConfig({ ...EMPTY_CONFIG, ...connector.config });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const syncConnector = async (connectorId: string) => {
    setSyncing(connectorId); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/connectors/${connectorId}/sync`, { method: "POST" });
      const payload = await response.json() as { data?: { fetched: number; inserted: number; updated: number }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "GitHub sync failed.");
      setMessage(`GitHub sync complete: ${payload.data?.fetched ?? 0} repositories · ${payload.data?.inserted ?? 0} new · ${payload.data?.updated ?? 0} updated.`);
      toast.success("GitHub sync completed");
      await Promise.all([loadProjects(), loadConnectors()]);
    } catch (cause) { const message = cause instanceof Error ? cause.message : "GitHub sync failed."; setError(message); toast.error(message); await loadConnectors(); }
    finally { setSyncing(null); }
  };

  const toggleConnector = async (connector: ConnectorConfig) => {
    try {
      const response = await fetch(`/api/connectors/${connector.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !connector.enabled }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not update connector.");
      await loadConnectors();
      toast.success(`Search ${connector.enabled ? "disabled" : "enabled"}`);
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Could not update connector."; setError(message); toast.error(message); }
  };

  const deleteConnector = async (connector: ConnectorConfig) => {
    if (!window.confirm(`Remove “${connector.name}” and its saved projects?`)) return;
    try {
      const response = await fetch(`/api/connectors/${connector.id}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not remove connector.");
      await Promise.all([loadConnectors(), loadProjects()]);
      toast.success(`Search “${connector.name}” removed`);
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Could not remove connector."; setError(message); toast.error(message); }
  };

  const activeFilters = useMemo(() => [search, language, sort].join("|"), [search, language, sort]);
  useEffect(() => {
    const timer = setTimeout(() => { if (!loading) void loadProjects().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load projects.")); }, 250);
    return () => clearTimeout(timer);
  }, [activeFilters]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-3 sm:px-5 py-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3"><Link href="/" className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Back to FastNews"><ArrowLeft size={18} /></Link><div className="min-w-0"><Breadcrumbs items={[{ label: "FastNews", href: "/" }, { label: "Discover", href: "/discover/connectors" }, { label: "Projects" }]} loading={loading} /></div></div>
          <nav className="flex flex-wrap items-center gap-1 sm:gap-2"><Link href="/discover/connectors" className="rounded-lg px-2 sm:px-3 py-2 text-xs sm:text-sm text-muted-foreground hover:bg-muted">Connectors</Link><Link href="/" className="rounded-lg px-2 sm:px-3 py-2 text-xs sm:text-sm text-muted-foreground hover:bg-muted">News Feed</Link><Link href="/settings" className="rounded-lg px-2 sm:px-3 py-2 text-xs sm:text-sm text-muted-foreground hover:bg-muted">Settings</Link></nav>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-3 py-5 sm:gap-8 sm:px-5 sm:py-8 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-5">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Discover</p><h1 className="mt-1 text-2xl font-bold">Projects</h1><p className="mt-2 text-sm text-muted-foreground">Find public GitHub repositories and follow their metadata over time.</p></div>
          <section id="add-connector" className="rounded-2xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 font-semibold"><Github size={17} />Add GitHub search</h2>
            <p className="mt-1 text-xs text-muted-foreground">Searches public repositories only. Up to 50 results are saved per sync.</p>
            <form ref={formRef} className="mt-4 space-y-3" onSubmit={(event) => void saveConnector(event)}>
              <label className="block text-xs font-medium">Search name<Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required /></label>
              <label className="block text-xs font-medium">GitHub query<Input className="mt-1" placeholder="e.g. stars:>1000" value={config.query} onChange={(event) => setConfig((current) => ({ ...current, query: event.target.value }))} maxLength={180} /></label>
              <div className="grid grid-cols-2 gap-2"><label className="block text-xs font-medium">Topic<Input className="mt-1" placeholder="machine-learning" value={config.topic} onChange={(event) => setConfig((current) => ({ ...current, topic: event.target.value }))} maxLength={50} /></label><label className="block text-xs font-medium">Language<Input className="mt-1" placeholder="Python" value={config.language} onChange={(event) => setConfig((current) => ({ ...current, language: event.target.value }))} maxLength={40} /></label></div>
              <div className="grid grid-cols-2 gap-2"><label className="block text-xs font-medium">Rank by<select value={config.sort} onChange={(event) => setConfig((current) => ({ ...current, sort: event.target.value as typeof current.sort }))} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="stars">Stars</option><option value="forks">Forks</option><option value="updated">Recently updated</option></select></label><label className="block text-xs font-medium">Result count<select value={config.resultLimit} onChange={(event) => setConfig((current) => ({ ...current, resultLimit: Number(event.target.value) }))} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm">{[10, 20, 30, 50].map((count) => <option key={count} value={count}>{count}</option>)}</select></label></div>
              <Button type="submit" disabled={saving} className="w-full">{saving ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Plus size={15} className="mr-2" />}{editingId ? "Update search" : "Save search"}</Button>
              {editingId && <Button type="button" variant="ghost" className="w-full" onClick={() => { setEditingId(null); setName("GitHub discovery"); setConfig(EMPTY_CONFIG); }}>Cancel editing</Button>}
            </form>
          </section>
          <section className="space-y-2">
            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Saved searches</h2><Button variant="ghost" size="icon" aria-label="Refresh projects" onClick={() => void refresh()}><RefreshCw size={15} /></Button></div>
            {connectors.length === 0 ? <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">Save a search above to get started.</p> : connectors.map((connector) => <div key={connector.id} className="rounded-xl border border-border bg-card p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{connector.name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{connector.config.query || "All public repos"}{connector.config.topic && ` · topic:${connector.config.topic}`}{connector.config.language && ` · ${connector.config.language}`}</p></div><div className="flex"><button onClick={() => editConnector(connector)} aria-label={`Edit ${connector.name}`} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Settings size={14} /></button><button onClick={() => void deleteConnector(connector)} aria-label={`Remove ${connector.name}`} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 size={14} /></button></div></div><div className="mt-3 flex items-center justify-between gap-2"><button onClick={() => void toggleConnector(connector)} className={`text-xs ${connector.enabled ? "text-emerald-600" : "text-muted-foreground"}`}>{connector.enabled ? "Enabled" : "Disabled"}</button><Button size="sm" variant="outline" disabled={!connector.enabled || syncing === connector.id} onClick={() => void syncConnector(connector.id)}>{syncing === connector.id ? <Loader2 size={13} className="mr-1 animate-spin" /> : <RefreshCw size={13} className="mr-1" />}Sync</Button></div><p className="mt-2 text-[11px] text-muted-foreground">{connector.lastRun ? `${connector.lastRun.status} · ${new Date(connector.lastRun.startedAt).toLocaleString()}` : "Not synced yet"}</p>{connector.lastRun?.status === "failed" && <p className="mt-1 text-xs text-destructive">{connector.lastRun.errorMessage}</p>}</div>)}
          </section>
        </aside>
        <section className="min-w-0">
          <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-bold">Repository discovery</h2><p className="mt-1 text-sm text-muted-foreground">GitHub Search results are ranked by the selected criterion, not a trending feed.</p></div><div className="text-xs text-muted-foreground">{projects.length} saved projects</div></div>
          <div className="grid gap-2 py-4 sm:grid-cols-[1fr_180px_180px]"><div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" aria-label="Search saved projects" placeholder="Search repositories" value={search} onChange={(event) => setSearch(event.target.value)} /></div><select aria-label="Filter by language" value={language} onChange={(event) => setLanguage(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">All languages</option>{languages.map((item) => <option key={item} value={item}>{item}</option>)}</select><select aria-label="Sort projects" value={sort} onChange={(event) => setSort(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="stars">Most stars</option><option value="updated">Recently updated</option><option value="name">Name A–Z</option></select></div>
          {message && <p className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700" role="status">{message}</p>}{error && <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
          {loading ? <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-40 animate-pulse rounded-2xl border border-border bg-muted/40" />)}</div> : projects.length === 0 ? <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center"><Github className="mx-auto text-muted-foreground" size={30} /><h3 className="mt-3 font-semibold">No projects saved yet</h3><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Add a GitHub search and sync it to discover repositories. Search the saved projects here after the first sync.</p></div> : <div className="grid gap-3 md:grid-cols-2">{projects.map((project) => <article key={project.id} className="flex min-h-40 flex-col rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-md"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><a href={project.canonicalUrl} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 font-semibold text-primary hover:underline"><span className="truncate">{project.fullName}</span><ExternalLink size={13} className="shrink-0" /></a><p className="mt-2 line-clamp-2 min-h-10 text-sm text-muted-foreground">{project.description || "No description provided."}</p></div></div><div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><Star size={13} className="text-amber-500" />{formatCount(project.stars)}</span><span className="inline-flex items-center gap-1"><ArrowDownWideNarrow size={13} />{formatCount(project.forks)} forks</span>{project.language && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />{project.language}</span>}{project.upstreamUpdatedAt && <span>Updated {new Date(project.upstreamUpdatedAt).toLocaleDateString()}</span>}</div>{project.topics.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{project.topics.slice(0, 5).map((topic) => <span key={topic} className="rounded-full bg-primary/8 px-2 py-0.5 text-[10px] text-primary">{topic}</span>)}</div>}</article>)}</div>}
        </section>
      </div>
    </main>
  );
}
