"use client";

/**
 * src/app/settings/page.tsx — Settings page.
 *
 * Add/edit RSS sources, view ingestion run status and feed health.
 * Single-user: no authentication required.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Rss,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Database,
  Settings as SettingsIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Source = {
  id: string;
  title: string;
  url: string;
  category: string;
  lastFetched: Date | null;
  errorCount: number;
  fetchError: string | null;
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
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // Data fetching on mount triggers state updates via the fetch helpers;
    // this is the standard React data-fetching pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.all([fetchSources(), fetchRuns()]);
  }, [fetchSources, fetchRuns]);

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
              </TabsList>
            </nav>
          </aside>

          <main className="flex flex-1 flex-col min-w-0 overflow-hidden">
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
                          value={newUrl}
                          onChange={(e) => setNewUrl(e.target.value)}
                          placeholder="https://example.com/feed.xml"
                          className="h-9 text-sm"
                        />
                        <Input
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          placeholder="Tên nguồn (tùy chọn)"
                          className="h-9 text-sm"
                        />
                        <Input
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
                      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
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
                          <div key={s.id} className="p-3 flex items-center justify-between gap-3 hover:bg-muted/50 transition-colors">
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
                              >
                                <Trash2 size={12} />
                              </Button>
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
                    <CardTitle className="text-sm">Lịch sử ingestion</CardTitle>
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
            </ScrollArea>
          </main>
        </Tabs>
      </div>
    </div>
  );
}
