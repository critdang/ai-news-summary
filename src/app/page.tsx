"use client";

export const dynamic = "force-dynamic";

/**
 * src/app/page.tsx — Reader page (list view).
 *
 * Displays articles with pagination, search, category and bookmark filters,
 * empty/loading states, and a reading panel for the selected article.
 * Single-user: no authentication required.
 */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  memo,
} from "react";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  BookmarkCheck,
  Clock,
  ExternalLink,
  Rss,
  Search,
  X,
  RefreshCw,
  Loader2,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Article = {
  id: string;
  title: string;
  url: string;
  canonicalUrl: string;
  excerpt: string | null;
  summary: string | null;
  aiSummary: string | null;
  relevanceScore: number | null;
  relevanceExplanation: string | null;
  processingStatus: string;
  publishedAt: Date | null;
  firstSeenAt: Date;
  source: { id: string; title: string; url: string; category: string } | null;
  tags: string[];
  bookmarked: boolean;
  bookmarkNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type Source = {
  id: string;
  title: string;
  url: string;
  category: string;
  _count: { articles: number };
  health: { consecutiveFailures: number; lastSuccess: Date | null } | null;
};

type CategoryOption = { value: string; label: string; count: number };

const PAGE_SIZE = 20;

function formatRelative(date: Date | null): string | null {
  if (!date) return null;
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

const ArticleItem = memo(function ArticleItem({
  article,
  isSelected,
  onSelect,
  onBookmark,
}: {
  article: Article;
  isSelected: boolean;
  onSelect: (a: Article) => void;
  onBookmark: (id: string) => void;
}) {
  const handleBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    onBookmark(article.id);
  };

  return (
    <button
      onClick={() => onSelect(article)}
      className={cn(
        "w-full flex items-start gap-3 rounded-xl border border-transparent p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isSelected ? "bg-primary/5 border-primary/30" : "border-l-2 border-l-transparent",
        article.bookmarked && "border-l-primary"
      )}
      aria-pressed={isSelected}
    >
      <div className="flex-shrink-0 mt-1">
        {!article.bookmarked ? (
          <Bookmark size={14} className="text-muted-foreground" />
        ) : (
          <BookmarkCheck size={14} className="text-primary" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {article.source?.category && (
            <Badge variant="outline" className="px-1.5 py-0.5">
              {article.source.category}
            </Badge>
          )}
          {article.publishedAt && (
            <span>
              <Clock size={10} /> {formatRelative(article.publishedAt)}
            </span>
          )}
          {article.processingStatus === "failed" && (
            <span className="text-destructive">Lỗi AI</span>
          )}
        </div>
        <h3 className="mt-1 text-sm font-semibold text-foreground leading-snug">
          {article.title}
        </h3>
        {article.aiSummary || article.summary || article.excerpt && (
          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
            {article.aiSummary || article.summary || article.excerpt}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="truncate max-w-[140px]">
            {article.source?.title || "Nguồn không xác định"}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleBookmark}
              className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted transition-colors"
              title={article.bookmarked ? "Bỏ lưu" : "Lưu bài viết"}
              aria-label={article.bookmarked ? "Bỏ lưu" : "Lưu bài viết"}
            >
              {article.bookmarked ? (
                <BookmarkCheck size={13} className="text-primary" />
              ) : (
                <Bookmark size={13} className="text-muted-foreground" />
              )}
            </button>
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted transition-colors"
              title="Mở bài gốc"
              aria-label="Mở bài gốc"
            >
              <ExternalLink size={13} className="text-muted-foreground" />
            </a>
          </div>
        </div>
      </div>
    </button>
  );
});

ArticleItem.displayName = "ArticleItem";

export default function ReaderPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [bookmarkFilter, setBookmarkFilter] = useState("all"); // all | bookmarked | unbookmarked
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const router = useRouter();

  const requestIdRef = useRef(0);

  // Build category options from sources.
  const categories = useMemo<CategoryOption[]>(() => {
    const counts: Record<string, number> = {};
    for (const s of sources) {
      counts[s.category] = (counts[s.category] || 0) + s._count.articles;
    }
    return Object.entries(counts).map(([value, count]) => ({
      value,
      label: value,
      count,
    }));
  }, [sources]);

  const fetchArticles = useCallback(
    async (p: number) => {
      const reqId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(p),
          limit: String(PAGE_SIZE),
        });
        if (search) params.set("q", search);
        if (categoryFilter) params.set("category", categoryFilter);
        if (bookmarkFilter === "bookmarked") params.set("bookmarked", "1");
        else if (bookmarkFilter === "unbookmarked") params.set("bookmarked", "0");

        const res = await fetch(`/api/articles?${params}`);
        if (!res.ok) throw new Error("Failed to load articles");
        const data = await res.json();
        if (requestIdRef.current !== reqId) return;
        setArticles(data.data);
        setTotal(data.pagination.total);
        setTotalPages(data.pagination.totalPages);
      } catch (err) {
        if (requestIdRef.current !== reqId) return;
        setError(err instanceof Error ? err.message : "Không tải được bài viết");
      } finally {
        if (requestIdRef.current === reqId) setLoading(false);
      }
    },
    [search, categoryFilter, bookmarkFilter]
  );

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch("/api/sources");
      if (!res.ok) throw new Error("Failed to load sources");
      const data = await res.json();
      setSources(data.data);
    } catch {
      /* sources optional — reader still works */
    }
  }, []);

  useEffect(() => {
    // Both helpers begin asynchronous requests and update state after awaiting them.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSources();
    fetchArticles(1);
  }, [fetchSources, fetchArticles]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchArticles(1);
  }, [search, categoryFilter, bookmarkFilter, fetchArticles]);

  const toggleBookmark = useCallback(async (id: string) => {
    const rollback = (bookmarked: boolean) => {
      setArticles((prev) =>
        prev.map((a) => (a.id === id ? { ...a, bookmarked } : a))
      );
      setSelectedArticle((current) =>
        current?.id === id ? { ...current, bookmarked } : current
      );
    };

    setArticles((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, bookmarked: !a.bookmarked } : a
      )
    );
    setSelectedArticle((current) =>
      current?.id === id ? { ...current, bookmarked: !current.bookmarked } : current
    );
    try {
      const response = await fetch("/api/articles/bookmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: id }),
      });
      if (!response.ok) throw new Error("Failed to update bookmark");
    } catch {
      const original = articles.find((article) => article.id === id)?.bookmarked ?? false;
      rollback(original);
    }
  }, [articles]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleRefresh = useCallback(() => {
    fetchArticles(page);
  }, [fetchArticles, page]);

  const canGoBack = page > 1;
  const canGoForward = page < totalPages;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border bg-background/50 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Rss size={16} />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground leading-none">AI News Summary</h1>
            <p className="text-[11px] text-muted-foreground leading-none">
              Software Engineering · AI/LLM · Data Science · 3D Printing · Maker
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="h-7 px-2"
          >
            {loading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/settings")}
            className="h-7 px-2"
          >
            Cài đặt
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: categories */}
        <aside className="hidden md:flex md:w-[240px] flex-col border-r border-border bg-muted/30">
          <div className="p-3 space-y-1">
            <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold px-2 mb-1">
              Danh mục
            </h2>
            <div className="space-y-0.5">
              <button
                onClick={() => setCategoryFilter("")}
                className={cn(
                  "w-full text-left rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                  !categoryFilter ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                Tất cả
              </button>
              {categories.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setCategoryFilter(c.value)}
                  className={cn(
                    "w-full text-left rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                    categoryFilter === c.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {c.label} <span className="ml-auto text-[11px]">{c.count}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="p-3 space-y-1 border-t border-border mt-auto">
            <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold px-2 mb-1">
              Nguồn
            </h2>
            <ScrollArea className="h-48">
              <div className="space-y-0.5">
                {sources.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setCategoryFilter(s.category)}
                    className={cn(
                      "w-full text-left rounded-lg px-2.5 py-1 text-sm transition-colors hover:bg-muted",
                      categoryFilter === s.category
                        ? "bg-primary/10 text-primary border-l-2 border-l-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    <span className="truncate inline-block max-w-[150px]">{s.title}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground/60">
                      {s._count.articles}
                    </span>
                  </button>
                ))}
                {sources.length === 0 && (
                  <p className="text-[11px] text-muted-foreground/60 px-2 py-1">
                    Chưa có nguồn
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex flex-1 flex-col min-w-0">
          {/* Controls */}
          <div className="flex-shrink-0 border-b border-border bg-background px-5 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="relative flex-1 min-w-0">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <Input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Tìm kiếm bài viết…"
                className="pl-9 pr-7 h-9 text-sm"
              />
              {search && (
                <button
                  onClick={() => handleSearchChange("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Xóa tìm kiếm"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Tabs defaultValue="all" className="text-[12px]">
                <TabsList className="gap-1">
                  <TabsTrigger
                    value="all"
                    onClick={() => setBookmarkFilter("all")}
                    className={cn(
                      "px-2 py-1 rounded-md transition-colors",
                      bookmarkFilter === "all"
                        ? "bg-primary text-primary-foreground"
                        : "data-[state=active]:bg-muted data-[state=active]:text-muted-foreground"
                    )}
                  >
                    Tất cả
                  </TabsTrigger>
                  <TabsTrigger
                    value="bookmarked"
                    onClick={() => setBookmarkFilter("bookmarked")}
                    className={cn(
                      "px-2 py-1 rounded-md transition-colors",
                      bookmarkFilter === "bookmarked"
                        ? "bg-primary text-primary-foreground"
                        : "data-[state=active]:bg-muted data-[state=active]:text-muted-foreground"
                    )}
                  >
                    <Bookmark size={12} /> Lưu
                  </TabsTrigger>
                  <TabsTrigger
                    value="unbookmarked"
                    onClick={() => setBookmarkFilter("unbookmarked")}
                    className={cn(
                      "px-2 py-1 rounded-md transition-colors",
                      bookmarkFilter === "unbookmarked"
                        ? "bg-primary text-primary-foreground"
                        : "data-[state=active]:bg-muted data-[state=active]:text-muted-foreground"
                    )}
                  >
                    Chưa lưu
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-medium">{total}</span> bài viết
              </div>
              <div className="flex items-center justify-between border-l border-border pl-2">
                <span className="text-[11px]">{page} / {totalPages}</span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!canGoBack}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-6 w-6 p-0"
                  >
                    <ChevronLeft size={12} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!canGoForward}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="h-6 w-6 p-0"
                  >
                    <span className="rot-180">←</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Article list */}
          <div className="flex-1 overflow-y-auto bg-background">
            {loading && articles.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                <p className="text-sm text-muted-foreground">Đang tải bài viết…</p>
              </div>
            ) : error && articles.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16 rounded-2xl border border-destructive/20 bg-destructive/5">
                <p className="text-sm text-destructive">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  className="mt-3"
                >
                  Thử lại
                </Button>
              </div>
            ) : articles.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16 rounded-2xl">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                  <Rss size={20} className="text-primary" />
                </div>
                <h3 className="text-base font-bold text-foreground">Không có bài viết</h3>
                <p className="mt-1 text-sm text-muted-foreground text-center max-w-xs">
                  {search || categoryFilter || bookmarkFilter !== "all"
                    ? "Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm."
                    : "Chưa có bài viết nào. Hãy thêm nguồn RSS trong Cài đặt rồi chạy ingestion."}
                </p>
                {sources.length === 0 && (
                  <div className="mt-6">
                    <Button
                      size="sm"
                      onClick={() => router.push("/settings")}
                      className="bg-primary text-primary-foreground"
                    >
                      Thêm nguồn RSS
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div className="p-3 space-y-1">
                  {articles.map((article) => (
                    <ArticleItem
                      key={article.id}
                      article={article}
                      isSelected={selectedArticle?.id === article.id}
                      onSelect={(a) => {
                        setSelectedArticle(a);
                        setSheetOpen(true);
                      }}
                      onBookmark={toggleBookmark}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </main>
      </div>

      {/* Reading panel (sheet) */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger render={() => <button /> } />
        <SheetContent className="p-0 h-full w-full md:w-[560px]">
          <div className="flex h-full flex-col border-l border-border bg-background">
            <div className="flex-shrink-0 border-b border-border px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSheetOpen(false)}
                  aria-label="Đóng bài viết"
                >
                  <ChevronLeft size={16} />
                </Button>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    {selectedArticle?.source?.title || "Bài viết"}
                  </h2>
                  <p className="text-[11px] text-muted-foreground leading-none">
                    {selectedArticle?.source?.category || ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {selectedArticle && (
                  <>
                    <button
                      onClick={() => toggleBookmark(selectedArticle.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted transition-colors"
                      title={selectedArticle.bookmarked ? "Bỏ lưu" : "Lưu bài viết"}
                      aria-label={selectedArticle.bookmarked ? "Bỏ lưu" : "Lưu bài viết"}
                    >
                      {selectedArticle.bookmarked ? (
                        <BookmarkCheck size={14} className="text-primary" />
                      ) : (
                        <Bookmark size={14} className="text-muted-foreground" />
                      )}
                    </button>
                    <a
                      href={selectedArticle.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted transition-colors"
                      title="Mở bài gốc"
                      aria-label="Mở bài gốc"
                    >
                      <ExternalLink size={14} className="text-muted-foreground" />
                    </a>
                  </>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {selectedArticle ? (
                <article className="space-y-5">
                  <h1 className="text-xl font-bold text-foreground leading-snug md:text-2xl">
                    {selectedArticle.title}
                  </h1>
                  <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                    <Badge variant="outline">
                      {selectedArticle.source?.category || "Khác"}
                    </Badge>
                    {selectedArticle.publishedAt && (
                      <>
                        <span>·</span>
                        <span>{formatRelative(selectedArticle.publishedAt)}</span>
                      </>
                    )}
                    {selectedArticle.firstSeenAt && (
                      <>
                        <span>·</span>
                        <span>Lưu lần đầu: {formatRelative(selectedArticle.firstSeenAt)}</span>
                      </>
                    )}
                    {selectedArticle.relevanceScore != null && (
                      <>
                        <span>·</span>
                        <span className="text-primary/70 font-medium">
                          Điểm liên quan: {selectedArticle.relevanceScore}/10
                        </span>
                      </>
                    )}
                  </div>
                  {selectedArticle.relevanceExplanation && (
                    <div className="rounded-lg border border-muted/50 bg-muted/30 p-3 text-sm text-muted-foreground">
                      <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground/70">
                        Tại sao quan trọng
                      </span>
                      <p className="mt-1">{selectedArticle.relevanceExplanation}</p>
                    </div>
                  )}
                  {selectedArticle.summary || selectedArticle.excerpt && (
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      <p className="mb-3">
                        {selectedArticle.summary || selectedArticle.excerpt}
                      </p>
                      {selectedArticle.aiSummary && (
                        <>
                          <Separator />
                          <p className="mb-2">
                            <span className="font-semibold text-xs text-muted-foreground/70">
                              Tóm tắt AI
                            </span>
                          </p>
                          <p className="text-sm text-foreground leading-relaxed">
                            {selectedArticle.aiSummary}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground/60">
                            Tóm tắt được tạo bởi AI — kiểm tra bài gốc để xác nhận sự thật.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                  <div className="pt-3 border-t border-border text-xs text-muted-foreground">
                    Nguồn:{" "}
                    <a
                      href={selectedArticle.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline hover:text-primary/80"
                    >
                      {selectedArticle.source?.title || selectedArticle.url}
                    </a>
                  </div>
                </article>
              ) : null}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
