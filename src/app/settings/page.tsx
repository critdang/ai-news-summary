"use client";

/**
 * src/app/settings/page.tsx — Settings page.
 *
 * Add/edit RSS sources, view ingestion run status and feed health.
 * Single-user: no authentication required.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Rss,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Database,
  RefreshCw,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Sparkles,
  Cpu,
  Bot,
  Laptop,
  FolderOpen,
  Pencil,
  KeyRound,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { allocateSourceArticleLimits } from "@/lib/sourceLimits";
import { AI_MODELS } from "@/lib/preferences";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ConnectorSourceManager } from "@/components/settings/ConnectorSourceManager";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { toast } from "sonner";

type Source = {
  id: string;
  title: string;
  url: string;
  category: string;
  categoryId: string;
  categoryColor?: string | null;
  lastFetched: Date | null;
  errorCount: number;
  fetchError: string | null;
  maxArticlesPerRun: number | null;
  _count: { articles: number };
  health: { consecutiveFailures: number; lastSuccess: Date | null; lastError: string | null } | null;
};

type Run = {
  id: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  articleCount: number;
  newCount: number;
  errorCount: number;
  errorMessage: string | null;
  sourcesProcessed: number;
};

type Preferences = {
  language: string;
  retentionDays: number;
  maxArticlesPerRun: number;
  ingestionIntervalHours: 12 | 24;
  aiProvider: "gemini" | "groq" | "mock";
  aiModel: string;
  githubEnrichmentEnabled: boolean;
};

type ProviderStatus = {
  state: "available" | "missing_key" | "invalid_key" | "unreachable";
  models: string[];
};

type ProviderStatuses = Record<"gemini" | "groq" | "mock", ProviderStatus>;
type ProviderCredentialState = Record<"gemini" | "groq", boolean>;
type Folder = { id: string; name: string; slug: string; color: string | null; _count?: { sources: number } };

const INITIAL_PROVIDER_STATUSES: ProviderStatuses = {
  gemini: { state: "unreachable", models: [] },
  groq: { state: "unreachable", models: [] },
  mock: { state: "available", models: ["mock"] },
};

function providerStatusLabel(status: ProviderStatus): string {
  if (status.state === "available") return "Connected";
  if (status.state === "missing_key") return "Unavailable · API key missing";
  if (status.state === "invalid_key") return "Unavailable · API key rejected";
  return "Could not check connection";
}

function formatRelative(date: Date | null): string | null {
  if (!date) return "—";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "vừa xong";
  if (diffMins < 60) return `${diffMins} phút trước`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} ngày trước`;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("sources");
  const [sources, setSources] = useState<Source[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("#6366f1");
  const [savingFolder, setSavingFolder] = useState(false);
  const [savingFolderId, setSavingFolderId] = useState<string | null>(null);
  const [folderDrafts, setFolderDrafts] = useState<Record<string, { name: string; color: string }>>({});
  const [runs, setRuns] = useState<Run[]>([]);
  const [lastSuccessfulUpdate, setLastSuccessfulUpdate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Preferences>({
    language: "vi",
    retentionDays: 45,
    maxArticlesPerRun: 20,
    ingestionIntervalHours: 12,
    aiProvider: "groq",
    aiModel: "openai/gpt-oss-20b",
    githubEnrichmentEnabled: true,
  });
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatuses>(INITIAL_PROVIDER_STATUSES);
  const [providerCredentials, setProviderCredentials] = useState<ProviderCredentialState>({ gemini: false, groq: false });
  const [providerKeyDrafts, setProviderKeyDrafts] = useState({ gemini: "", groq: "" });
  const [showProviderKey, setShowProviderKey] = useState(false);
  const [savingProviderKey, setSavingProviderKey] = useState<"gemini" | "groq" | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [providerKeyMessage, setProviderKeyMessage] = useState<string | null>(null);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preferencesMessage, setPreferencesMessage] = useState<string | null>(null);
  const [refreshingPreferences, setRefreshingPreferences] = useState(false);
  const [sourceLimitDrafts, setSourceLimitDrafts] = useState<Record<string, string>>({});
  const [savingSourceLimit, setSavingSourceLimit] = useState<string | null>(null);
  const [sourceLimitMessages, setSourceLimitMessages] = useState<Record<string, string>>({});
  const router = useRouter();
  const sourceAllocations = useMemo(
    () => allocateSourceArticleLimits(sources, preferences.maxArticlesPerRun),
    [sources, preferences.maxArticlesPerRun]
  );
  const selectedProviderStatus = providerStatuses[preferences.aiProvider];
  const selectedCredentialProvider = preferences.aiProvider === "gemini" ? "gemini" : "groq";
  const selectedModelAvailable = selectedProviderStatus.state === "available"
    && selectedProviderStatus.models.includes(preferences.aiModel);
  const fallbackProvider = preferences.aiProvider === "groq" ? "gemini" : "groq";
  const fallbackModel = preferences.aiProvider === "mock"
    ? undefined
    : AI_MODELS[fallbackProvider].find((model) => providerStatuses[fallbackProvider].models.includes(model));

  // Add source form
  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch("/api/sources");
      if (!res.ok) throw new Error("Failed to load sources");
      const data = await res.json();
      setSources(data.data);
      setSourceLimitDrafts(Object.fromEntries(
        data.data.map((source: Source) => [source.id, source.maxArticlesPerRun == null ? "" : String(source.maxArticlesPerRun)])
      ));
    } catch {
      /* ignore */
    }
  }, []);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/categories");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load folders");
      const nextFolders = data.data as Folder[];
      setFolders(nextFolders);
      setFolderDrafts(Object.fromEntries(nextFolders.map((folder) => [folder.id, {
        name: folder.name,
        color: folder.color || "#6366f1",
      }])));
      if (nextFolders.length) setNewCategory((current) => current || nextFolders[0].name);
    } catch {
      /* Keep source management available if folder loading fails. */
    }
  }, []);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/runs");
      if (!res.ok) throw new Error("Failed to load runs");
      const data = await res.json();
      setRuns(data.data);
      setLastSuccessfulUpdate(data.lastSuccessfulUpdate);
    } catch {
      setError("Không tải được lịch sử ingestion. Hãy thử tải lại trang.");
    }
  }, []);

  const fetchPreferences = useCallback(async (): Promise<Preferences | null> => {
    try {
      const res = await fetch("/api/preferences", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load preferences");
      const data = await res.json();
      setProviderStatuses(data.providerStatus ?? INITIAL_PROVIDER_STATUSES);
      setProviderCredentials(data.providerCredentials ?? { gemini: false, groq: false });
      const loaded = data.data as Preferences;
      const statuses = data.providerStatus ?? INITIAL_PROVIDER_STATUSES;
      const providerUnavailable = statuses[loaded.aiProvider].state !== "available";
      const configuredFallback: "gemini" | "groq" = loaded.aiProvider === "groq" ? "gemini" : "groq";
      const fallbackAvailable = statuses[configuredFallback].state === "available";
      const effective = providerUnavailable && fallbackAvailable
        ? {
            ...loaded,
            aiProvider: configuredFallback,
            aiModel: AI_MODELS[configuredFallback][0],
          }
        : loaded;
      setPreferences(effective);
      return effective;
    } catch {
      setError("Không tải được cài đặt. Hãy thử tải lại trang.");
      return null;
    }
  }, []);

  useEffect(() => {
    // Data fetching on mount triggers state updates via the fetch helpers;
    // this is the standard React data-fetching pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.all([fetchSources(), fetchRuns(), fetchPreferences(), fetchFolders()]).finally(() => setInitialLoading(false));
  }, [fetchSources, fetchRuns, fetchPreferences, fetchFolders]);

  const handleCreateFolder = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingFolder(true);
    setError(null);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName, color: newFolderColor }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create folder");
      setNewCategory(data.data.name);
      setNewFolderName("");
      await fetchFolders();
      toast.success(`Folder “${data.data.name}” created`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not create folder";
      setError(message);
      toast.error(message);
    } finally {
      setSavingFolder(false);
    }
  };

  const handleSaveFolder = async (folder: Folder) => {
    const draft = folderDrafts[folder.id];
    if (!draft) return;
    setSavingFolderId(folder.id);
    setError(null);
    try {
      const res = await fetch(`/api/categories/${folder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update folder");
      if (newCategory === folder.name) setNewCategory(data.data.name);
      await fetchFolders();
      await fetchSources();
      toast.success(`Folder “${data.data.name}” updated`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not update folder";
      setError(message);
      toast.error(message);
    } finally {
      setSavingFolderId(null);
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPreferencesMessage(null);
    setSavingPreferences(true);
    try {
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể lưu cài đặt");
      setPreferences(data.data);
      setPreferencesMessage("Settings saved. RSS scheduling and future ingestion runs will use these preferences.");
      toast.success("Settings saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể lưu cài đặt";
      setError(message);
      toast.error(message);
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleToggleGitHubEnrichment = async () => {
    const nextPreferences = { ...preferences, githubEnrichmentEnabled: !preferences.githubEnrichmentEnabled };
    setPreferences(nextPreferences);
    setError(null);
    setSavingPreferences(true);
    try {
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextPreferences),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update GitHub enrichment");
      setPreferences(data.data);
      toast.success(`GitHub enrichment ${data.data.githubEnrichmentEnabled ? "enabled" : "disabled"}`);
    } catch (cause) {
      setPreferences(preferences);
      const message = cause instanceof Error ? cause.message : "Could not update GitHub enrichment";
      setError(message);
      toast.error(message);
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleSaveProviderKey = async (provider: "gemini" | "groq", clear = false) => {
    setError(null);
    setProviderKeyMessage(null);
    setSavingProviderKey(provider);
    try {
      const res = await fetch("/api/provider-credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clear ? { provider, clear: true } : { provider, apiKey: providerKeyDrafts[provider] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save API key");
      setProviderKeyDrafts((current) => ({ ...current, [provider]: "" }));
      setProviderCredentials((current) => ({ ...current, [provider]: data.configured }));
      setProviderKeyMessage(`${provider === "groq" ? "Groq" : "Gemini"} key ${clear ? "removed" : "saved"}.`);
      await fetchPreferences();
      toast.success(`${provider === "groq" ? "Groq" : "Gemini"} API key ${clear ? "removed" : "saved"}`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not save API key";
      setError(message);
      toast.error(message);
    } finally {
      setSavingProviderKey(null);
    }
  };

  const handleRefreshPreferences = async () => {
    setError(null);
    setPreferencesMessage(null);
    setRefreshingPreferences(true);
    const saved = await fetchPreferences();
    if (saved) {
      setPreferencesMessage(`Đã tải cài đặt đã lưu. Ngân sách: ${saved.maxArticlesPerRun} bài mỗi lần chạy · RSS mỗi ${saved.ingestionIntervalHours} giờ.`);
    }
    setRefreshingPreferences(false);
  };

  const handleSaveSourceLimit = async (source: Source) => {
    const draft = sourceLimitDrafts[source.id] ?? "";
    const value = draft.trim() === "" ? null : Number(draft);
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 50)) {
      setError("Giới hạn mỗi nguồn phải từ 1 đến 50, hoặc để trống để dùng giới hạn chung.");
      return;
    }

    setError(null);
    setSavingSourceLimit(source.id);
    setSourceLimitMessages((current) => ({ ...current, [source.id]: "" }));
    try {
      const res = await fetch(`/api/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxArticlesPerRun: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể lưu giới hạn nguồn");
      setSources((current) => current.map((item) => item.id === source.id
        ? { ...item, maxArticlesPerRun: data.data.maxArticlesPerRun }
        : item));
      setSourceLimitMessages((current) => ({ ...current, [source.id]: value === null ? "Dùng giới hạn chung" : "Đã lưu" }));
      toast.success(`Article limit saved for “${source.title}”`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể lưu giới hạn nguồn";
      setError(message);
      toast.error(message);
    } finally {
      setSavingSourceLimit(null);
    }
  };

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAdding(true);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: newUrl.trim(),
          title: newTitle.trim() || undefined,
          category: newCategory.trim() || "Uncategorized",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add source");
      setNewUrl("");
      setNewTitle("");
      setNewCategory("");
      await fetchSources();
      toast.success(`Source “${data.data.title}” added`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add source";
      setError(message);
      toast.error(message);
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteSource = async () => {
    if (
      !window.confirm(
        "Xóa nguồn này sẽ xóa các bài viết liên quan. Bạn chắc chắn?"
      )
    )
      return;
    // No DELETE route yet; show informative error.
    setError("Xóa nguồn chưa được hỗ trợ trong MVP (sẽ thêm ở Phase 3).");
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-green-500/10 text-green-500 border-green-500/20";
      case "partial": return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "failed": return "bg-destructive/10 text-destructive border-destructive/20";
      default: return "bg-muted text-muted-foreground border-muted/30";
    }
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex-shrink-0 border-b border-border bg-background/50 backdrop-blur px-3 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <SettingsIcon size={16} />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground leading-none">Cài đặt</h1>
            <p className="text-[11px] text-muted-foreground leading-none">
              Quản lý nguồn RSS, lịch sử ingestion và sức khỏe nguồn
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle compact />
          <Button variant="outline" size="sm" onClick={() => router.push("/")}>Về trang đọc</Button>
        </div>
      </header>

      <div className="shrink-0 border-b border-border px-4 py-2 sm:px-6">
        <Breadcrumbs items={[{ label: "FastNews", href: "/" }, { label: "Settings" }]} loading={initialLoading} loadingText="Đang tải dữ liệu cài đặt…" />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          orientation="vertical"
          className="flex flex-1 overflow-hidden gap-0"
        >
          {/* Nav */}
          <aside className="hidden md:flex md:w-[200px] flex-col border-r border-border bg-muted/30">
            <nav className="p-4 space-y-1">
              <TabsList className="flex-col w-full gap-1">
                <TabsTrigger value="sources" className="w-full text-left">
                  <div className="flex items-center gap-2">
                    <Rss size={14} />
                    Nguồn RSS
                  </div>
                </TabsTrigger>
                <TabsTrigger value="runs" className="w-full text-left">
                  <div className="flex items-center gap-2">
                    <Database size={14} />
                    Lịch sử ingestion
                  </div>
                </TabsTrigger>
                <TabsTrigger value="ai" className="w-full text-left">
                  <div className="flex items-center gap-2"><Sparkles size={14} />AI Provider</div>
                </TabsTrigger>
                <TabsTrigger value="preferences" className="w-full text-left">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal size={14} />
                    Tuỳ chọn
                  </div>
                </TabsTrigger>
              </TabsList>
            </nav>
          </aside>

          <main className="flex flex-1 flex-col min-w-0 overflow-hidden">
            <nav aria-label="Mục cài đặt" className="border-b border-border px-3 py-2 md:hidden">
              <div role="tablist" aria-label="Mục cài đặt" className="grid w-full grid-cols-4 gap-1 rounded-lg bg-muted p-1">
                {[
                  ["sources", "Nguồn"],
                  ["runs", "Lịch sử"],
                  ["ai", "AI"],
                  ["preferences", "Tuỳ chọn"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === value}
                    onClick={() => setActiveTab(value)}
                    className={`rounded-md px-2 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeTab === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </nav>
            <ScrollArea className="h-full p-4">
            <TabsContent value="sources">
              <div className="space-y-4">
                <ConnectorSourceManager />
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">GitHub RSS enrichment</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">Add stars, forks, and repository topics to GitHub RSS articles when a specific repository can be identified. Changes apply to future ingestion runs.</p>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-0">
                    <span className="text-sm">Enable GitHub enrichment</span>
                    <Button
                      type="button"
                      variant={preferences.githubEnrichmentEnabled ? "default" : "outline"}
                      aria-pressed={preferences.githubEnrichmentEnabled}
                      disabled={savingPreferences}
                      onClick={() => void handleToggleGitHubEnrichment()}
                    >
                      {preferences.githubEnrichmentEnabled ? "Enabled" : "Disabled"}
                    </Button>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between py-2">
                    <CardTitle className="text-sm">Thêm nguồn RSS</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <form onSubmit={handleAddSource} className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Input
                          aria-label="URL nguồn RSS"
                          value={newUrl}
                          onChange={(e) => setNewUrl(e.target.value)}
                          placeholder="https://example.com/feed.xml"
                          className="h-9 text-sm"
                        />
                        <Input
                          aria-label="Tên nguồn RSS (tuỳ chọn)"
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          placeholder="Tên nguồn (tùy chọn)"
                          className="h-9 text-sm"
                        />
                        <Button type="button" variant="outline" className="h-9 justify-start gap-2 text-sm font-normal" onClick={() => setFolderDialogOpen(true)}>
                          <FolderOpen size={14} />
                          {newCategory || "Chọn thư mục"}
                          <Pencil size={12} className="ml-auto text-muted-foreground" />
                        </Button>
                      </div>
                      <Button
                        type="submit"
                        disabled={adding || !newUrl.trim()}
                        className="w-full"
                      >
                        {adding ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Plus size={14} />}
                        Thêm nguồn
                      </Button>
                    </form>
                    <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
                      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                        <DialogHeader>
                          <DialogTitle>Chọn hoặc quản lý thư mục</DialogTitle>
                          <DialogDescription>Chọn nơi lưu nguồn này, hoặc thêm thư mục và chỉnh tên, màu sắc.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2">
                          {folders.map((folder) => {
                            const draft = folderDrafts[folder.id] || { name: folder.name, color: folder.color || "#6366f1" };
                            return (
                              <div key={folder.id} className={`rounded-lg border p-3 ${newCategory === folder.name ? "border-primary bg-primary/5" : "border-border"}`}>
                                <button type="button" onClick={() => setNewCategory(folder.name)} className="flex w-full items-center gap-2 text-left text-sm font-medium">
                                  <FolderOpen size={15} style={{ color: folder.color || "#6366f1" }} />
                                  <span className="flex-1">{folder.name}</span>
                                  <span className="text-xs text-muted-foreground">{folder._count?.sources ?? 0} nguồn</span>
                                </button>
                                <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
                                  <Input aria-label={`Tên thư mục ${folder.name}`} value={draft.name} onChange={(event) => setFolderDrafts((current) => ({ ...current, [folder.id]: { ...draft, name: event.target.value } }))} className="h-8 text-xs" />
                                  <input aria-label={`Màu thư mục ${folder.name}`} type="color" value={draft.color} onChange={(event) => setFolderDrafts((current) => ({ ...current, [folder.id]: { ...draft, color: event.target.value } }))} className="h-8 w-10 cursor-pointer rounded border border-input bg-background p-1" />
                                  <Button type="button" size="sm" variant="outline" disabled={savingFolderId === folder.id} onClick={() => void handleSaveFolder(folder)}>
                                    {savingFolderId === folder.id ? <Loader2 size={13} className="animate-spin" /> : "Lưu"}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <form onSubmit={handleCreateFolder} className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                          <Input aria-label="Tên thư mục mới" value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} placeholder="Tên thư mục mới" className="h-9 min-w-36 flex-1" required />
                          <input aria-label="Màu thư mục mới" type="color" value={newFolderColor} onChange={(event) => setNewFolderColor(event.target.value)} className="h-9 w-11 cursor-pointer rounded border border-input bg-background p-1" />
                          <Button type="submit" disabled={savingFolder || !newFolderName.trim()}>
                            {savingFolder ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Thêm
                          </Button>
                        </form>
                        <Button type="button" onClick={() => setFolderDialogOpen(false)}>Xong</Button>
                      </DialogContent>
                    </Dialog>
                    {error && (
                      <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between py-2">
                    <CardTitle className="text-sm">Danh sách nguồn ({sources.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="border-t border-border divide-y divide-border">
                      {sources.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          Chưa có nguồn RSS. Thêm nguồn ở trên rồi chạy ingestion.
                        </div>
                      ) : (
                        folders.map((folder) => {
                          const categorySources = sources.filter((source) => source.categoryId === folder.id);
                          if (!categorySources.length) return null;
                          return <section key={folder.id} aria-label={`${folder.name} sources`}>
                            <h3 className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold" style={{ color: folder.color || undefined }}>
                              <FolderOpen size={14} />{folder.name}<span className="text-muted-foreground">{categorySources.length}</span>
                            </h3>
                            {categorySources.map((s) => (
                          <div key={s.id} className="p-3 flex flex-wrap items-center justify-between gap-3 hover:bg-muted/50 transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-semibold text-foreground truncate">
                                  {s.title}
                                </h3>
                                <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-current/25" style={{ color: s.categoryColor || undefined }}>
                                  {s.category}
                                </Badge>
                              </div>
                              <a
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] text-primary underline truncate block mb-1"
                              >
                                {s.url}
                              </a>
                              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                <span>{s._count.articles} bài viết</span>
                                {s.lastFetched && (
                                  <span>· Lần cuối: {formatRelative(s.lastFetched)}</span>
                                )}
                                {s.errorCount > 0 && (
                                  <span className="text-destructive">{s.errorCount} lỗi</span>
                                )}
                              </div>
                            </div>
                            <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:flex-nowrap">
                              <label className="sr-only" htmlFor={`source-category-${s.id}`}>Thư mục của {s.title}</label>
                              <select
                                id={`source-category-${s.id}`}
                                value={s.categoryId}
                                onChange={(event) => {
                                  const categoryId = event.target.value;
                                  const folder = folders.find((item) => item.id === categoryId);
                                  if (!folder) return;
                                  void (async () => {
                                    setSavingSourceLimit(s.id);
                                    setError(null);
                                    try {
                                      const res = await fetch(`/api/sources/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoryId }) });
                                      const data = await res.json();
                                      if (!res.ok) throw new Error(data.error || "Could not move source");
                                      setSources((current) => current.map((item) => item.id === s.id ? { ...item, categoryId, category: folder.name, categoryColor: folder.color } : item));
                                      setSourceLimitMessages((current) => ({ ...current, [s.id]: `Moved to ${folder.name}` }));
                                      toast.success(`“${s.title}” moved to ${folder.name}`);
                                    } catch (cause) {
                                      const message = cause instanceof Error ? cause.message : "Could not move source";
                                      setError(message);
                                      toast.error(message);
                                    } finally {
                                      setSavingSourceLimit(null);
                                    }
                                  })();
                                }}
                                className="h-8 min-w-0 max-w-full flex-1 rounded-md border border-input bg-background px-2 text-xs sm:max-w-36 sm:flex-none"
                              >
                                {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                              </select>
                              <label className="sr-only" htmlFor={`source-limit-${s.id}`}>Giới hạn bài viết cho {s.title}</label>
                              <Input
                                id={`source-limit-${s.id}`}
                                type="number"
                                min={1}
                                max={50}
                                step={1}
                                placeholder={String(sourceAllocations.get(s.id) ?? 0)}
                                value={sourceLimitDrafts[s.id] ?? ""}
                                onChange={(event) => setSourceLimitDrafts((current) => ({ ...current, [s.id]: event.target.value }))}
                                className="h-8 w-20 text-xs"
                                aria-describedby={`source-limit-help-${s.id}`}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void handleSaveSourceLimit(s)}
                                disabled={savingSourceLimit === s.id}
                                className="h-8 px-2 text-xs"
                              >
                                {savingSourceLimit === s.id ? <Loader2 size={12} className="animate-spin" /> : "Lưu"}
                              </Button>
                              {s.health && s.health.consecutiveFailures > 0 && (
                                <AlertTriangle size={12} className="text-destructive" />
                              )}
                              {s.health && s.health.consecutiveFailures === 0 && (
                                <CheckCircle2 size={12} className="text-green-500" />
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteSource()}
                                className="h-7 px-1.5 p-0"
                                title="Xóa nguồn"
                                aria-label={`Xóa nguồn ${s.title}`}
                              >
                                <Trash2 size={12} />
                              </Button>
                            </div>
                            <div className="w-full text-[10px] text-muted-foreground" id={`source-limit-help-${s.id}`}>
                              {sourceLimitDrafts[s.id] === "" ? `Tự chia: ${sourceAllocations.get(s.id) ?? 0} bài` : `Phân bổ riêng: ${sourceLimitDrafts[s.id]} bài`}
                              {sourceLimitMessages[s.id] ? ` · ${sourceLimitMessages[s.id]}` : ""}
                            </div>
                          </div>
                            ))}
                          </section>;
                        })
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            <TabsContent value="runs">
              <div className="space-y-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between py-2">
                    <div>
                      <CardTitle className="text-sm">Lịch sử ingestion</CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
                        Cập nhật thành công gần nhất: {formatRelative(lastSuccessfulUpdate ? new Date(lastSuccessfulUpdate) : null)}
                      </p>
                      <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
                        Ingestion chỉ tải RSS và không gọi AI. Trạng thái partial nghĩa là một số nguồn RSS lỗi; lỗi tạo AI summary được hiển thị riêng trên từng bài viết.
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="border-t border-border divide-y divide-border">
                      {runs.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          Chưa có lần ingestion nào.
                        </div>
                      ) : (
                        runs.map((r) => (
                          <div key={r.id} className="p-3 flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className={`px-2 py-1 text-xs ${statusColor(r.status)}`}>
                                  {r.status === "partial" ? "Partial · một số nguồn lỗi" : r.status === "completed" ? "Completed" : r.status === "failed" ? "Failed" : r.status}
                                </Badge>
                                <span className="ml-auto text-[11px] text-muted-foreground">
                                  {formatRelative(r.completedAt || r.startedAt)}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                                <span>{r.newCount} mới / {r.articleCount} tổng</span>
                                <span>·</span>
                                <span>{r.sourcesProcessed} nguồn</span>
                                {r.errorCount > 0 && (
                                  <span className="text-destructive">{r.errorCount} lỗi</span>
                                )}
                              </div>
                              {r.errorMessage && (
                                <p className="mt-1 text-[10px] text-destructive/70" title={r.errorMessage}>
                                  {r.errorMessage}
                                </p>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            <TabsContent value="ai">
              <Card className="mx-auto max-w-3xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm"><Cpu size={16} className="text-primary" />AI Provider</CardTitle>
                  <p className="text-xs text-muted-foreground">Choose the provider and model here, then save. Your choice is stored in Supabase for your account, so you do not need to edit .env. Provider credentials stay on the server. RSS ingestion stores articles without calling AI.</p>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSavePreferences} className="space-y-5">
                    <div className="grid gap-3 sm:grid-cols-3">
                      {([
                        { value: "groq", label: "Groq", description: "Hosted · fast inference", Icon: Sparkles },
                        { value: "gemini", label: "Gemini", description: "Google AI hosted models", Icon: Bot },
                        { value: "mock", label: "Mock", description: "Local deterministic preview", Icon: Laptop },
                      ] as const).map(({ value, label, description, Icon }) => (
                        <button key={value} type="button" onClick={() => setPreferences((current) => ({ ...current, aiProvider: value, aiModel: AI_MODELS[value][0] }))} aria-pressed={preferences.aiProvider === value} className={`rounded-xl border p-4 text-left transition-colors ${preferences.aiProvider === value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                          <Icon size={18} className={preferences.aiProvider === value ? "text-primary" : "text-muted-foreground"} />
                        <span className="mt-2 flex items-center gap-2 text-sm font-semibold">{label}{preferences.aiProvider === value && <Badge variant="outline" className="px-1.5 py-0 text-[9px]">Selected</Badge>}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
                          <span className={`mt-3 inline-flex items-center gap-1 text-[11px] ${providerStatuses[value].state === "available" ? "text-emerald-500" : "text-amber-500"}`}>{providerStatusLabel(providerStatuses[value])}</span>
                        </button>
                      ))}
                    </div>
                    {preferences.aiProvider !== "mock" && (
                      <section className="space-y-3 rounded-xl border border-border p-4" aria-labelledby="provider-key-heading">
                        <div>
                          <h3 id="provider-key-heading" className="flex items-center gap-2 text-sm font-semibold"><KeyRound size={15} />{preferences.aiProvider === "groq" ? "Groq" : "Gemini"} API key</h3>
                          <p className="mt-1 text-xs text-muted-foreground">Enter your key here. It is encrypted on the server and never shown again. Leave blank until you are ready to save a new key.</p>
                        </div>
                        <label className="sr-only" htmlFor="provider-api-key">{preferences.aiProvider} API key</label>
                        <div className="relative">
                          <Input
                            id="provider-api-key"
                            type={showProviderKey ? "text" : "password"}
                            autoComplete="new-password"
                            value={providerKeyDrafts[selectedCredentialProvider]}
                            onChange={(event) => setProviderKeyDrafts((current) => ({ ...current, [selectedCredentialProvider]: event.target.value }))}
                            placeholder={providerCredentials[selectedCredentialProvider] ? "Key saved · enter a new key to replace" : "Paste your API key"}
                            className="pr-10 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setShowProviderKey((visible) => !visible)}
                            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                            aria-label={showProviderKey ? "Hide API key" : "Show API key"}
                            title={showProviderKey ? "Hide API key" : "Show API key"}
                          >
                            {showProviderKey ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="button" variant="outline" disabled={savingProviderKey === selectedCredentialProvider || providerKeyDrafts[selectedCredentialProvider].trim().length < 8} onClick={() => void handleSaveProviderKey(selectedCredentialProvider)}>
                            {savingProviderKey === selectedCredentialProvider && <Loader2 size={13} className="mr-2 animate-spin" />}Save API key
                          </Button>
                          {providerCredentials[selectedCredentialProvider] && <Button type="button" variant="ghost" disabled={savingProviderKey === selectedCredentialProvider} onClick={() => void handleSaveProviderKey(selectedCredentialProvider, true)}>Remove saved key</Button>}
                          <span className="text-xs text-muted-foreground">{providerCredentials[selectedCredentialProvider] ? "A key is configured" : "No personal key saved"}</span>
                        </div>
                        {providerKeyMessage && <p role="status" className="text-sm text-green-700 dark:text-green-400">{providerKeyMessage}</p>}
                      </section>
                    )}
                    <div className="space-y-2">
                      <label htmlFor="ai-model" className="text-sm font-medium">Model</label>
                      <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm">
                        <span className="text-muted-foreground">Currently selected: </span>
                        <strong>{preferences.aiProvider === "gemini" ? "Gemini" : preferences.aiProvider === "groq" ? "Groq" : "Mock"} · {preferences.aiModel}</strong>
                      </div>
                      {selectedProviderStatus.state !== "available" || !selectedModelAvailable ? <p className="text-xs text-amber-600 dark:text-amber-400">
                        {selectedProviderStatus.state === "invalid_key"
                          ? "The selected provider rejected its API key."
                          : selectedProviderStatus.state === "missing_key"
                            ? "The selected provider API key is not configured."
                            : selectedProviderStatus.state === "unreachable"
                              ? "The selected provider could not be checked right now."
                              : "The selected model is unavailable to this provider account."}
                        {fallbackModel && providerStatuses[fallbackProvider].state === "available" && <> Requests may fall back to {fallbackProvider === "groq" ? "Groq" : "Gemini"} · {fallbackModel}.</>}
                      </p> : <p className="text-xs text-emerald-600 dark:text-emerald-400">This model is available and will be preferred for new AI requests.</p>}
                      <select id="ai-model" value={preferences.aiModel} onChange={(event) => setPreferences((current) => ({ ...current, aiModel: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {AI_MODELS[preferences.aiProvider].map((model) => {
                          const status = providerStatuses[preferences.aiProvider];
                          const modelAvailable = status.state === "available" && status.models.includes(model);
                          const availability = status.state === "available"
                            ? modelAvailable ? " (available)" : " (unavailable for this account)"
                            : status.state === "invalid_key"
                              ? " (provider unavailable · API key rejected)"
                              : status.state === "missing_key"
                                ? " (provider unavailable · API key missing)"
                                : " (availability unknown)";
                          return <option key={model} value={model} disabled={status.state === "available" && !modelAvailable}>{model}{preferences.aiProvider === "mock" ? " (available)" : availability}</option>;
                        })}
                      </select>
                      <p className="text-xs text-muted-foreground">Connection and model availability are checked against the provider API. Credentials stay on the server. If the selected provider fails during a request, a configured fallback may be tried.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button type="submit" disabled={savingPreferences}>{savingPreferences && <Loader2 size={14} className="mr-2 animate-spin" />}Save AI settings</Button>
                      {preferencesMessage && <p role="status" className="text-sm text-green-700 dark:text-green-400">{preferencesMessage}</p>}
                    </div>
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="preferences">
              <Card className="mx-auto max-w-2xl">
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm">Tuỳ chọn đọc và ingestion</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Thay đổi và lưu tại đây — các giá trị được lưu trong Supabase và áp dụng cho worker tiếp theo. Không cần chỉnh sửa file .env.
                  </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => void handleRefreshPreferences()} disabled={refreshingPreferences}>
                    {refreshingPreferences ? <Loader2 size={14} className="mr-2 animate-spin" /> : <RefreshCw size={14} className="mr-2" />}
                    Tải cài đặt đã lưu
                  </Button>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSavePreferences} className="space-y-5">
                    <div className="space-y-2">
                      <label htmlFor="summary-language" className="text-sm font-medium">Ngôn ngữ tóm tắt</label>
                      <select
                        id="summary-language"
                        value={preferences.language}
                        onChange={(e) => setPreferences((current) => ({ ...current, language: e.target.value }))}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="vi">Tiếng Việt</option>
                        <option value="en">English</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="retention-days" className="text-sm font-medium">Thời gian lưu bài viết (30–60 ngày)</label>
                      <Input
                        id="retention-days"
                        type="number"
                        min={30}
                        max={60}
                        step={1}
                        required
                        value={preferences.retentionDays}
                        onChange={(e) => setPreferences((current) => ({ ...current, retentionDays: Number(e.target.value) }))}
                      />
                      <p className="text-xs text-muted-foreground">Bài đã lưu và bài có ghi chú sẽ được giữ lại.</p>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="rss-schedule" className="text-sm font-medium">Scheduled RSS update</label>
                      <select
                        id="rss-schedule"
                        value={preferences.ingestionIntervalHours}
                        onChange={(e) => setPreferences((current) => ({ ...current, ingestionIntervalHours: Number(e.target.value) as 12 | 24 }))}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value={12}>Twice daily (about every 12 hours)</option>
                        <option value={24}>Daily (about every 24 hours)</option>
                      </select>
                      <p className="text-xs text-muted-foreground">Vercel Hobby Cron checks once daily at 07:00 UTC. Manual refresh runs immediately.</p>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="article-limit" className="text-sm font-medium">Tổng bài viết mỗi lần ingestion (1–50)</label>
                      <Input
                        id="article-limit"
                        type="number"
                        min={1}
                        max={50}
                        step={1}
                        required
                        value={preferences.maxArticlesPerRun}
                        onChange={(e) => setPreferences((current) => ({ ...current, maxArticlesPerRun: Number(e.target.value) }))}
                      />
                      <p className="text-xs text-muted-foreground">Đây là tổng ngân sách cho mọi nguồn. Nguồn chưa đặt phân bổ riêng sẽ được chia đều phần còn lại.</p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <Button type="submit" disabled={savingPreferences}>
                        {savingPreferences && <Loader2 size={14} className="mr-2 animate-spin" />}
                        Lưu tuỳ chọn
                      </Button>
                      {preferencesMessage && <p role="status" className="text-sm text-green-700 dark:text-green-400">{preferencesMessage}</p>}
                    </div>
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
            </ScrollArea>
          </main>
        </Tabs>
      </div>
    </div>
  );
}
