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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { allocateSourceArticleLimits } from "@/lib/sourceLimits";

type Source = {
  id: string;
  title: string;
  url: string;
  category: string;
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
};

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
  const [runs, setRuns] = useState<Run[]>([]);
  const [lastSuccessfulUpdate, setLastSuccessfulUpdate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Preferences>({
    language: "vi",
    retentionDays: 45,
    maxArticlesPerRun: 20,
  });
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
      setPreferences(data.data);
      return data.data as Preferences;
    } catch {
      setError("Không tải được cài đặt. Hãy thử tải lại trang.");
      return null;
    }
  }, []);

  useEffect(() => {
    // Data fetching on mount triggers state updates via the fetch helpers;
    // this is the standard React data-fetching pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.all([fetchSources(), fetchRuns(), fetchPreferences()]);
  }, [fetchSources, fetchRuns, fetchPreferences]);

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
      setPreferencesMessage("Đã lưu cài đặt. Worker sẽ dùng chúng ở lần chạy tiếp theo.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu cài đặt");
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleRefreshPreferences = async () => {
    setError(null);
    setPreferencesMessage(null);
    setRefreshingPreferences(true);
    const saved = await fetchPreferences();
    if (saved) {
      setPreferencesMessage(`Đã tải cài đặt đã lưu. Tổng ngân sách: ${saved.maxArticlesPerRun} bài mỗi lần chạy.`);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu giới hạn nguồn");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add source");
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
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex-shrink-0 border-b border-border bg-background/50 backdrop-blur px-6 py-3 flex items-center justify-between">
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/")}
        >
          Về trang đọc
        </Button>
      </header>

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
              <div role="tablist" aria-label="Mục cài đặt" className="grid w-full grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                {[
                  ["sources", "Nguồn"],
                  ["runs", "Lịch sử"],
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
                        <Input
                          aria-label="Danh mục nguồn RSS"
                          value={newCategory}
                          onChange={(e) => setNewCategory(e.target.value)}
                          placeholder="Danh mục (mặc định: Uncategorized)"
                          className="h-9 text-sm"
                        />
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
                        sources.map((s) => (
                          <div key={s.id} className="p-3 flex flex-wrap items-center justify-between gap-3 hover:bg-muted/50 transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-semibold text-foreground truncate">
                                  {s.title}
                                </h3>
                                <Badge variant="outline" className="text-[10px] px-2 py-0.5">
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
                            <div className="flex items-center gap-1.5">
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
                        ))
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
                                <Badge variant="secondary" className={statusColor(r.status)} text-xs px-2 py-1>
                                  {r.status}
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
                                <p className="mt-1 text-[10px] text-destructive/70 truncate">
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
            <TabsContent value="preferences">
              <Card className="mx-auto max-w-2xl">
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm">Tuỳ chọn đọc và ingestion</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Các giá trị này được lưu trong Supabase và áp dụng cho những lần worker tiếp theo.
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
