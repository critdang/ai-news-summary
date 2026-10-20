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
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
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
  ChevronRight,
  Sparkles,
  BookOpen,
  Newspaper,
  Settings as SettingsIcon,
  FolderOpen,
  Github,
  Compass,
  ChevronDown,
  FileText,
} from "lucide-react";
import { cn, formatPublishedDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import { nextArticleIndex } from "@/lib/readerNavigation";
import { groupSourcesByCategory, type CategoryGroup } from "@/lib/readerCategories";
import { rssPlainText, sanitizeRssHtml } from "@/lib/rss/displayContent";
import BriefingPage from "@/app/briefing/page";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { toast } from "sonner";

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
  source: { id: string; title: string; url: string; category: string; categoryColor: string | null } | null;
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
  categoryColor?: string | null;
  _count: { articles: number };
  health: { consecutiveFailures: number; lastSuccess: Date | null } | null;
};

type CategoryOption = CategoryGroup<Source>;

const PAGE_SIZE = 20;

function folderColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0;
  }
  return `hsl(${Math.abs(hash) % 360} 58% 45%)`;
}

function ArticleReaderPanel({
  article,
  summaryLoading,
  summaryError,
  onSummarize,
}: {
  article: Article | null;
  summaryLoading: boolean;
  summaryError: string | null;
  onSummarize: () => void;
}) {
  const [fullText, setFullText] = useState<string | null>(null);
  const [loadingFullText, setLoadingFullText] = useState(false);
  const loadFullText = async () => {
    if (!article || loadingFullText) return;
    setLoadingFullText(true);
    try {
      const response = await fetch(`/api/articles/${article.id}/content`, { cache: "no-store" });
      const body = await response.json() as { data?: { content?: string | null }; error?: string };
      if (!response.ok) throw new Error(body.error || "Could not load full article");
      if (!body.data?.content) {
        toast.error("This publisher did not provide readable full text. Open the original article instead.");
        return;
      }
      setFullText(body.data.content);
      toast.success("Full article loaded");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not load full article");
    } finally {
      setLoadingFullText(false);
    }
  };
  if (!article) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <BookOpen size={30} className="mb-3 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Choose an article to read</h2>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">Select a story from All Feeds. Generate an AI summary only when you need one.</p>
      </div>
    );
  }
  return (
    <article className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-xs text-muted-foreground">{article.source?.title || "Unknown source"}</p><h1 className="mt-1 text-lg font-bold leading-snug">{article.title}</h1></div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground"><BookOpen size={11} />Reading</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="gap-1 border-current/25" style={{ color: article.source?.categoryColor || folderColor(article.source?.category || "Other") }}>
              <FolderOpen size={11} />{article.source?.category || "Other"}
            </Badge>
        <span className="inline-flex items-center gap-1" title={`Published: ${formatDateTime(article.publishedAt)}`}><Clock size={11} />Published {formatDateTime(article.publishedAt)}</span>
        <span className="inline-flex items-center gap-1" title={`Received: ${formatDateTime(article.firstSeenAt)}`}><Rss size={11} />Received {formatDateTime(article.firstSeenAt)}</span>
        {article.relevanceScore != null && <span>Relevance {article.relevanceScore}/10</span>}
      </div>
      <Button onClick={onSummarize} disabled={summaryLoading || Boolean(article.aiSummary)} className="w-full">
        {summaryLoading ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Sparkles size={14} className="mr-2" />}
        {article.aiSummary ? "AI summary ready" : summaryLoading ? "Generating summary…" : "Generate AI summary"}
      </Button>
      {summaryError && <p role="alert" className="text-xs text-destructive">{summaryError}</p>}
      {article.aiSummary && <section className="rounded-xl border border-primary/30 bg-primary/5 p-4"><h2 className="flex items-center gap-2 text-sm font-semibold text-primary"><Sparkles size={14} />AI Summary</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{article.aiSummary}</p>{article.relevanceExplanation && <p className="mt-3 border-t border-primary/10 pt-3 text-xs text-muted-foreground">{article.relevanceExplanation}</p>}</section>}
      {(article.summary || article.excerpt) && <section><h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Newspaper size={13} />RSS preview</h2><div className="rss-content text-sm leading-relaxed text-foreground/85 [&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg [&_p]:my-3 [&_a]:text-primary [&_a]:underline" dangerouslySetInnerHTML={{ __html: sanitizeRssHtml(article.excerpt || article.summary) }} /></section>}
      <section className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">Some GitHub and RSS sources publish only a short preview. Load the publisher page text when available.</p>
          <Button size="sm" variant="outline" onClick={() => void loadFullText()} disabled={loadingFullText} className="shrink-0">
            {loadingFullText ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <FileText size={14} className="mr-1.5" />}
            {loadingFullText ? "Loading article…" : fullText ? "Reload full article" : "Load full article"}
          </Button>
        </div>
        {fullText && <div><h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Full article</h2><div className="rss-content max-w-full overflow-x-auto text-sm leading-relaxed text-foreground/85 [&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg [&_p]:my-3 [&_a]:text-primary [&_a]:underline" dangerouslySetInnerHTML={{ __html: sanitizeRssHtml(fullText) }} /></div>}
      </section>
      <a href={article.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-primary hover:bg-muted"><ExternalLink size={13} />Read full article at {article.source?.title || "source"}</a>
    </article>
  );
}

function formatDateTime(date: Date | null): string {
  if (!date) return "date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function formatDate(date: Date | null): string {
  if (!date) return "date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(date));
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
    <div
      role="button"
      tabIndex={0}
      id={`article-${article.id}`}
      onClick={() => onSelect(article)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(article);
        }
      }}
      className={cn(
        "w-full flex items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/30 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isSelected ? "bg-primary/5 border-primary/50" : "border-l-2 border-l-border",
        article.bookmarked && "border-l-primary"
      )}
      aria-pressed={isSelected}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {article.source?.category && (
              <Badge variant="outline" className="gap-1 px-1.5 py-0.5 border-current/25" style={{ color: article.source.categoryColor || folderColor(article.source.category) }}>
                <FolderOpen size={10} style={{ color: article.source.categoryColor || folderColor(article.source.category) }} />
              {article.source.category}
            </Badge>
          )}
          <span className="inline-flex items-center gap-1" title={`Published ${formatPublishedDate(article.publishedAt)}`}>
            <Clock size={10} /> Published {formatPublishedDate(article.publishedAt)}
          </span>
          {article.processingStatus === "failed" && (
            <span className="text-destructive">Lỗi AI</span>
          )}
        </div>
        <h3 className="mt-1 text-sm font-semibold text-foreground leading-snug">
          {article.title}
        </h3>
        {(article.summary || article.excerpt) && (
          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
            {rssPlainText(article.excerpt || article.summary)}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="min-w-0 truncate max-w-[145px]">{article.source?.title || "Nguồn không xác định"}</span>
          <span className="shrink-0" title={`Received ${formatDateTime(article.firstSeenAt)}`}>Received {formatDate(article.firstSeenAt)}</span>
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
    </div>
  );
});

ArticleItem.displayName = "ArticleItem";

export default function ReaderPage() {
  const [activeView, setActiveView] = useState<"feeds" | "briefing">("feeds");
  const [discoverOpen, setDiscoverOpen] = useState(true);
  const [articles, setArticles] = useState<Article[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sourceFilterId, setSourceFilterId] = useState("");
  const [bookmarkFilter, setBookmarkFilter] = useState("all"); // all | bookmarked | unbookmarked
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState("publishedAt:desc");
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const requestIdRef = useRef(0);

  const categories = useMemo<CategoryOption[]>(() => groupSourcesByCategory(sources), [sources]);

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
        if (sourceFilterId) params.set("sourceId", sourceFilterId);
        if (bookmarkFilter === "bookmarked") params.set("bookmarked", "1");
        else if (bookmarkFilter === "unbookmarked") params.set("bookmarked", "0");
        if (statusFilter) params.set("status", statusFilter);
        const [sortField, sortOrder] = sort.split(":");
        params.set("sort", sortField);
        params.set("order", sortOrder);

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
    [search, categoryFilter, sourceFilterId, bookmarkFilter, statusFilter, sort]
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
    // Source data is independent of the article query.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSources();
  }, [fetchSources]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchArticles(page);
  }, [page, search, categoryFilter, sourceFilterId, bookmarkFilter, statusFilter, sort, fetchArticles]);

  const handleCategoryChange = useCallback((value: string) => {
    setCategoryFilter(value);
    setSourceFilterId("");
    setPage(1);
  }, []);

  const handleSourceChange = useCallback((source: Source) => {
    setCategoryFilter("");
    setSourceFilterId(source.id);
    setPage(1);
  }, []);

  const toggleCategoryExpanded = useCallback((category: string) => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value);
    setPage(1);
  }, []);

  const handleSortChange = useCallback((value: string) => {
    setSort(value);
    setPage(1);
  }, []);

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
      toast.success("Bookmark updated");
    } catch {
      const original = articles.find((article) => article.id === id)?.bookmarked ?? false;
      rollback(original);
      toast.error("Could not update bookmark");
    }
  }, [articles]);

  const summarizeSelectedArticle = useCallback(async () => {
    if (!selectedArticle || selectedArticle.aiSummary || summaryLoading) return;
    setSummaryError(null);
    setSummaryLoading(true);
    try {
      const response = await fetch(`/api/articles/${selectedArticle.id}/summarize`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not summarize article");
      const data = body.data;
      setSelectedArticle((current) => current?.id === selectedArticle.id
        ? { ...current, aiSummary: data.summary, relevanceScore: data.relevanceScore ?? current.relevanceScore, relevanceExplanation: data.relevanceExplanation ?? current.relevanceExplanation, processingStatus: "completed" }
        : current);
      setArticles((current) => current.map((article) => article.id === selectedArticle.id
        ? { ...article, aiSummary: data.summary, relevanceScore: data.relevanceScore ?? article.relevanceScore, relevanceExplanation: data.relevanceExplanation ?? article.relevanceExplanation, processingStatus: "completed" }
        : article));
    } catch (cause) {
      setSummaryError(cause instanceof Error ? cause.message : "Could not summarize article");
    } finally {
      setSummaryLoading(false);
    }
  }, [selectedArticle, summaryLoading]);

  const selectRelativeArticle = useCallback((direction: -1 | 1) => {
    if (articles.length === 0) return;
    const currentIndex = selectedArticle
      ? articles.findIndex((article) => article.id === selectedArticle.id)
      : -1;
    const next = articles[nextArticleIndex(currentIndex, articles.length, direction)];
    setSelectedArticle(next);
    setSheetOpen(window.innerWidth < 1024);
    requestAnimationFrame(() => {
      document.getElementById(`article-${next.id}`)?.scrollIntoView({ block: "nearest" });
    });
  }, [articles, selectedArticle]);

  const shortcuts = useMemo(() => ({
    j: () => selectRelativeArticle(1),
    k: () => selectRelativeArticle(-1),
    "/": () => searchInputRef.current?.focus(),
    b: () => { if (selectedArticle) void toggleBookmark(selectedArticle.id); },
    Escape: () => {
      setSheetOpen(false);
      setSelectedArticle(null);
    },
  }), [selectRelativeArticle, selectedArticle, toggleBookmark]);
  useKeyboardShortcuts(shortcuts);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const [refreshingFeeds, setRefreshingFeeds] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const handleRefresh = useCallback(async () => {
    if (refreshingFeeds) return;
    setRefreshingFeeds(true);
    setRefreshMessage("Starting RSS ingestion…");
    try {
      const response = await fetch("/api/ingestion/refresh", { method: "POST" });
      const started = await response.json();
      if (!response.ok) throw new Error(started.error || "Could not start RSS ingestion");
      setRefreshMessage("RSS ingestion is running. Waiting for new articles…");
      const deadline = Date.now() + 10 * 60 * 1000;
      let complete = false;
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        const statusResponse = await fetch(`/api/ingestion/refresh?since=${encodeURIComponent(started.requestedAt)}`);
        const status = await statusResponse.json();
        if (!statusResponse.ok) throw new Error(status.error || "Could not check ingestion status");
        if (status.status === "completed") {
          if (status.conclusion !== "success") throw new Error(`RSS ingestion ${status.conclusion || "failed"}. Check the Vercel function logs for details.`);
          complete = true;
          break;
        }
        setRefreshMessage(status.status === "queued" ? "RSS ingestion is queued…" : "RSS ingestion is running…");
      }
      if (!complete) throw new Error("Ingestion is taking longer than expected. Check the Vercel function logs; refresh the feed after it finishes.");
      await Promise.all([fetchSources(), fetchArticles(page)]);
      setRefreshMessage("Feeds updated with the latest RSS articles.");
      window.setTimeout(() => setRefreshMessage(null), 8000);
    } catch (cause) {
      setRefreshMessage(cause instanceof Error ? cause.message : "Could not refresh RSS feeds");
    } finally {
      setRefreshingFeeds(false);
    }
  }, [fetchArticles, fetchSources, page, refreshingFeeds]);

  const canGoBack = page > 1;
  const canGoForward = page < totalPages;

  return (
      <div className="flex h-dvh flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border bg-background/50 backdrop-blur px-3 sm:px-6 py-3 flex items-center justify-between gap-2">
        <Link href="/" aria-label="Go to FastNews homepage" className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Rss size={16} />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground leading-none">FastNews</h1>
            <p className="hidden sm:block text-[11px] text-muted-foreground leading-none">
              Software Engineering · AI/LLM · Data Science · 3D Printing · Maker
            </p>
          </div>
        </Link>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <ThemeToggle compact />
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/discover/projects")}
            aria-label="Discover"
            className="h-7 px-2"
          >
            <Compass size={13} className="sm:mr-1.5" /><span className="hidden sm:inline">Discover</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleRefresh()}
            disabled={loading || refreshingFeeds}
            aria-label="Fetch new articles from all RSS feeds"
            title="Rebuild articles from saved RSS feeds. Existing articles are kept."
            className="h-7 px-2"
          >
            {refreshingFeeds ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveView("briefing")}
            aria-label="Daily Briefing"
            className="h-7 px-2"
          >
            <Sparkles size={13} className="sm:mr-1.5" /><span className="hidden sm:inline">Daily Briefing</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/settings")}
            aria-label="AI Settings"
            className="h-7 px-2"
          >
            <SettingsIcon size={13} className="sm:mr-1.5" /><span className="hidden sm:inline">AI Settings</span>
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: categories */}
        <aside className="hidden md:flex md:w-[240px] flex-col border-r border-border bg-muted/30">
          <nav aria-label="Main navigation" className="space-y-1 border-b border-border p-3">
            <button aria-current={activeView === "feeds" ? "page" : undefined} onClick={() => setActiveView("feeds")} className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm", activeView === "feeds" ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Rss size={15} />All Feeds</button>
            <button aria-current={activeView === "briefing" ? "page" : undefined} onClick={() => setActiveView("briefing")} className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm", activeView === "briefing" ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Sparkles size={15} />Daily Briefing</button>
            <div>
              <div className="flex items-center">
                <Link href="/discover/projects" className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm", pathname.startsWith("/discover") ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Compass size={15} />Discover</Link>
                <button type="button" aria-label={discoverOpen ? "Collapse Discover" : "Expand Discover"} aria-expanded={discoverOpen} onClick={() => setDiscoverOpen((open) => !open)} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><ChevronDown size={14} className={cn("transition-transform", !discoverOpen && "-rotate-90")} /></button>
              </div>
              {discoverOpen && <div className="ml-4 space-y-0.5 border-l border-border pl-2">
                <Link href="/discover/projects" aria-current={pathname === "/discover/projects" ? "page" : undefined} className={cn("flex items-center gap-2 rounded-md px-3 py-1.5 text-xs", pathname === "/discover/projects" ? "font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Github size={13} />Projects</Link>
                <Link href="/discover/connectors" aria-current={pathname === "/discover/connectors" ? "page" : undefined} className={cn("flex items-center gap-2 rounded-md px-3 py-1.5 text-xs", pathname === "/discover/connectors" ? "font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><SettingsIcon size={13} />Connectors</Link>
              </div>}
            </div>
            <button onClick={() => router.push("/settings")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"><SettingsIcon size={15} />AI Settings</button>
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-1">
            <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold px-2 mb-1">
              Danh mục
            </h2>
            <div className="space-y-0.5">
              <button
                onClick={() => handleCategoryChange("")}
                aria-pressed={!categoryFilter && !sourceFilterId}
                className={cn(
                  "w-full text-left rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                  !categoryFilter && !sourceFilterId ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                Tất cả
              </button>
              {categories.map((c) => (
                <div key={c.value}>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => handleCategoryChange(c.value)}
                      aria-pressed={categoryFilter === c.value && !sourceFilterId}
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                        categoryFilter === c.value && !sourceFilterId
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <FolderOpen size={13} className="shrink-0" style={{ color: c.color || folderColor(c.label) }} />
                      <span className="min-w-0 flex-1 truncate" style={{ color: c.color || folderColor(c.label) }}>{c.label}</span>
                      <span className="shrink-0 text-[11px]">{c.count}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleCategoryExpanded(c.value)}
                      aria-label={`${expandedCategories.has(c.value) ? "Hide" : "Show"} sources in ${c.label}`}
                      aria-expanded={expandedCategories.has(c.value)}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <ChevronRight size={14} className={cn("transition-transform", expandedCategories.has(c.value) && "rotate-90")} />
                    </button>
                  </div>
                  {expandedCategories.has(c.value) && (
                    <div className="ml-4 space-y-0.5 border-l border-border/70 py-0.5 pl-2">
                      {c.sources.map((source) => (
                        <button
                          key={source.id}
                          onClick={() => handleSourceChange(source)}
                          aria-pressed={sourceFilterId === source.id}
                          title={source.title}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors",
                            sourceFilterId === source.id
                              ? "bg-primary/10 font-medium text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          <Rss size={11} className="shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{source.title}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground/60">{source._count.articles}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {sources.length === 0 && (
                <p className="px-2 py-1 text-[11px] text-muted-foreground/60">Chưa có nguồn</p>
              )}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex flex-1 flex-col min-w-0">
          {activeView === "briefing" ? <BriefingPage embedded /> : <>
          <div className="shrink-0 border-b border-border px-4 py-2 sm:px-5">
            <Breadcrumbs items={[{ label: "FastNews", href: "/" }, { label: "All Feeds" }]} loading={loading} loadingText="Đang tải dữ liệu bài viết…" />
          </div>
          {refreshMessage && <p role="status" className="border-b border-border bg-muted/40 px-5 py-2 text-xs text-muted-foreground">{refreshMessage}</p>}
          {/* Controls */}
          <div className="flex-shrink-0 border-b border-border bg-background px-5 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="relative flex-1 min-w-0">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <Input
                ref={searchInputRef}
                data-reader-search
                aria-label="Search articles"
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
            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center">
              <label className="sr-only" htmlFor="mobile-category-filter">Filter by category</label>
              <select
                id="mobile-category-filter"
                aria-label="Filter by category"
                value={categoryFilter}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="h-10 min-w-0 rounded-md border border-input bg-background px-2 text-xs md:hidden"
              >
                <option value="">All categories</option>
                {categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
              </select>
              <Tabs defaultValue="all" className="col-span-2 text-[12px] sm:col-span-1">
                <TabsList className="w-full gap-1 sm:w-auto">
                  <TabsTrigger
                    value="all"
                    onClick={() => { setBookmarkFilter("all"); setPage(1); }}
                    className={cn(
                      "min-h-9 flex-1 px-2 py-1 rounded-md transition-colors sm:flex-none",
                      bookmarkFilter === "all"
                        ? "bg-primary text-primary-foreground"
                        : "data-[state=active]:bg-muted data-[state=active]:text-muted-foreground"
                    )}
                  >
                    Tất cả
                  </TabsTrigger>
                  <TabsTrigger
                    value="bookmarked"
                    onClick={() => { setBookmarkFilter("bookmarked"); setPage(1); }}
                    className={cn(
                      "min-h-9 flex-1 px-2 py-1 rounded-md transition-colors sm:flex-none",
                      bookmarkFilter === "bookmarked"
                        ? "bg-primary text-primary-foreground"
                        : "data-[state=active]:bg-muted data-[state=active]:text-muted-foreground"
                    )}
                  >
                    <Bookmark size={12} /> Lưu
                  </TabsTrigger>
                  <TabsTrigger
                    value="unbookmarked"
                    onClick={() => { setBookmarkFilter("unbookmarked"); setPage(1); }}
                    className={cn(
                      "min-h-9 flex-1 px-2 py-1 rounded-md transition-colors sm:flex-none",
                      bookmarkFilter === "unbookmarked"
                        ? "bg-primary text-primary-foreground"
                        : "data-[state=active]:bg-muted data-[state=active]:text-muted-foreground"
                    )}
                  >
                    Chưa lưu
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <label className="sr-only" htmlFor="status-filter">Filter by summary status</label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="h-10 min-w-0 rounded-md border border-input bg-background px-2 text-xs sm:h-8"
              >
                <option value="">All statuses</option>
                <option value="completed">Summarized</option>
                <option value="pending">Pending</option>
                <option value="failed">Summary failed</option>
              </select>
              <label className="sr-only" htmlFor="sort-articles">Sort articles</label>
              <select
                id="sort-articles"
                value={sort}
                onChange={(e) => handleSortChange(e.target.value)}
                className="h-10 min-w-0 rounded-md border border-input bg-background px-2 text-xs sm:h-8"
              >
                <option value="publishedAt:desc">Newest published</option>
                <option value="publishedAt:asc">Oldest published</option>
                <option value="createdAt:desc">Recently added</option>
                <option value="relevanceScore:desc">Most relevant</option>
                <option value="title:asc">Title A–Z</option>
              </select>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-medium" aria-live="polite">{total}</span> bài viết
              </div>
              <div className="col-span-2 flex items-center justify-between border-t border-border pt-2 sm:col-span-1 sm:border-l sm:border-t-0 sm:pl-2 sm:pt-0">
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
          <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-y-auto bg-background lg:flex-none lg:w-[min(38vw,440px)] lg:border-r lg:border-border">
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
                  {search || categoryFilter || sourceFilterId || bookmarkFilter !== "all"
                    ? "Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm."
                    : sources.length === 0
                      ? "Chưa có nguồn RSS. Hãy thêm nguồn trong Cài đặt rồi chạy ingestion."
                      : "Đã có nguồn RSS nhưng chưa có bài viết đã lưu. Hãy chạy cập nhật RSS để tải bài từ các nguồn hiện có."}
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
                {sources.length > 0 && !search && !categoryFilter && !sourceFilterId && bookmarkFilter === "all" && (
                  <div className="mt-6">
                    <Button size="sm" onClick={() => void handleRefresh()} disabled={refreshingFeeds}>
                      {refreshingFeeds ? <Loader2 size={14} className="mr-2 animate-spin" /> : <RefreshCw size={14} className="mr-2" />}
                      Rebuild articles from saved RSS feeds
                    </Button>
                    <p className="mt-2 max-w-sm text-center text-xs text-muted-foreground">Re-fetches your saved sources and restores available articles. Existing articles are kept; items no longer present in a source cannot be recovered.</p>
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
                        setSummaryError(null);
                        setSheetOpen(window.innerWidth < 1024);
                      }}
                      onBookmark={toggleBookmark}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
          <aside aria-label="Article reader" className="hidden min-w-0 flex-1 overflow-y-auto bg-background lg:block">
            <ArticleReaderPanel key={selectedArticle?.id ?? "empty-desktop"} article={selectedArticle} summaryLoading={summaryLoading} summaryError={summaryError} onSummarize={() => void summarizeSelectedArticle()} />
          </aside>
          </div>
          <p className="sr-only">Keyboard shortcuts: J and K move between articles, slash focuses search, B toggles the selected bookmark, and Escape closes the article panel.</p>
          </>}
        </main>
      </div>

      {/* Reading panel (sheet) */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent showCloseButton={false} className="!w-full p-0 h-full lg:hidden">
          <div className="flex h-full flex-col border-l border-border bg-background">
            <div className="flex-shrink-0 border-b border-border px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSheetOpen(false)}
                  aria-label="Đóng bài viết"
                >
                  <ChevronLeft size={16} />
                </Button>
                <div>
                  <h2 className="truncate text-sm font-semibold text-foreground">
                    {selectedArticle?.source?.title || "Bài viết"}
                  </h2>
                  <p className="text-[11px] text-muted-foreground leading-none">
                    {selectedArticle?.source?.category || ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {selectedArticle && (
                  <>
                    <button
                      onClick={() => toggleBookmark(selectedArticle.id)}
                      className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-muted transition-colors"
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
                      className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-muted transition-colors"
                      title="Mở bài gốc"
                      aria-label="Mở bài gốc"
                    >
                      <ExternalLink size={14} className="text-muted-foreground" />
                    </a>
                  </>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ArticleReaderPanel key={selectedArticle?.id ?? "empty-mobile"} article={selectedArticle} summaryLoading={summaryLoading} summaryError={summaryError} onSummarize={() => void summarizeSelectedArticle()} />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
