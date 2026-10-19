"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleAlert, Clock3, ExternalLink, Loader2, Newspaper, Rss, Settings, ShieldAlert, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BriefingArticle = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  category: string;
  publishedAt: string | null;
  summary: string;
  relevanceScore: number;
  relevanceExplanation: string;
  impact: "critical" | "medium" | "low";
  tags: string[];
};
type Source = { category: string };

const RANGES = [
  { hours: 12, label: "12h" },
  { hours: 24, label: "24h" },
  { hours: 48, label: "48h" },
  { hours: 72, label: "3d" },
  { hours: 168, label: "7d" },
];
const IMPACTS = [
  { value: "critical", label: "Critical", Icon: CircleAlert, tone: "text-red-400 border-red-500/30 bg-red-500/10" },
  { value: "medium", label: "Medium", Icon: ShieldAlert, tone: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
  { value: "low", label: "Low", Icon: Zap, tone: "text-sky-400 border-sky-500/30 bg-sky-500/10" },
] as const;

export default function BriefingPage() {
  const [articles, setArticles] = useState<BriefingArticle[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedImpacts, setSelectedImpacts] = useState<string[]>(["critical", "medium", "low"]);
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(0);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    fetch("/api/sources")
      .then(async (response) => response.ok ? response.json() : { data: [] })
      .then((body) => {
        const unique = [...new Set<string>((body.data || []).map((source: Source) => source.category))];
        setCategories(unique.sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => setCategories([]));
  }, []);

  const visibleArticles = useMemo(
    () => articles.filter((article) => selectedImpacts.includes(article.impact)),
    [articles, selectedImpacts]
  );

  async function generateBriefing() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours, categories: selectedCategories }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Briefing generation failed");
      setArticles(body.data || []);
      setScanned(body.scanned || 0);
      setTruncated(Boolean(body.truncated));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Briefing generation failed");
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }

  function toggleItem(value: string, current: string[], set: (next: string[]) => void) {
    set(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  const counts = Object.fromEntries(IMPACTS.map(({ value }) => [
    value,
    articles.filter((article) => article.impact === value).length,
  ]));

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles size={18} /></div>
          <div><h1 className="text-base font-bold">Daily Briefing</h1><p className="text-xs text-muted-foreground">Recent stories scored by relevance and urgency</p></div>
        </div>
        <div className="flex gap-2">
          <Link href="/" className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-muted"><ArrowLeft size={14} className="mr-1.5" /><Rss size={14} className="mr-1.5" />All Feeds</Link>
          <Link href="/settings" className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-muted"><Settings size={14} className="mr-1.5" />Settings</Link>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-6 p-5 md:p-8">
          <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold"><Sparkles size={16} className="text-primary" />Generate an AI-powered briefing</div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 size={13} />Range</span>
              {RANGES.map((range) => <button key={range.hours} onClick={() => setHours(range.hours)} aria-pressed={hours === range.hours} className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium", hours === range.hours ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>{range.label}</button>)}
            </div>
            {categories.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2"><span className="mr-1 text-xs text-muted-foreground">Categories</span>{categories.map((category) => <button key={category} onClick={() => toggleItem(category, selectedCategories, setSelectedCategories)} aria-pressed={selectedCategories.includes(category)} className={cn("rounded-full border px-2.5 py-1 text-xs", selectedCategories.includes(category) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>{category}</button>)}</div>}
            <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
              <Button onClick={() => void generateBriefing()} disabled={loading} className="flex-1">
                {loading ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Sparkles size={15} className="mr-2" />}
                {loading ? "Generating briefing…" : "Generate Briefing"}
              </Button>
              <span className="hidden text-xs text-muted-foreground sm:inline">Summarizes up to 50 recent articles</span>
            </div>
          </section>

          <section aria-label="Briefing results" className="space-y-4">
            {articles.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2"><Newspaper size={18} className="text-primary" /><h2 className="font-semibold">Briefing results</h2><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{scanned} scanned · {articles.length} summarized</span></div>
              <div className="flex flex-wrap gap-2">{IMPACTS.map(({ value, label, Icon, tone }) => <button key={value} onClick={() => toggleItem(value, selectedImpacts, setSelectedImpacts)} aria-pressed={selectedImpacts.includes(value)} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", tone, !selectedImpacts.includes(value) && "opacity-45") }><Icon size={13} />{label}<span>{counts[value]}</span></button>)}</div>
            </div>}
            {truncated && <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-600 dark:text-amber-300"><AlertTriangle size={14} className="mr-2 inline" />Some articles exceeded the briefing batch limits and were left out.</p>}
            {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertTriangle size={15} className="mr-2 inline" />{error}</div>}
            {!loading && articles.length === 0 && !error && <div className="flex flex-col items-center rounded-2xl border border-dashed border-border py-16 text-center"><Newspaper size={32} className="mb-3 text-muted-foreground" /><h2 className="font-semibold">No briefing generated</h2><p className="mt-1 text-sm text-muted-foreground">Choose a time range and generate a briefing from your feeds.</p></div>}
            {!loading && articles.length > 0 && visibleArticles.length === 0 && <p className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">Turn on at least one impact filter to see matching stories.</p>}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {visibleArticles.map((article) => {
                const config = IMPACTS.find((item) => item.value === article.impact) ?? IMPACTS[2];
                const Icon = config.Icon;
                return <article key={article.id} className={cn("rounded-xl border border-l-4 border-border bg-card p-4 transition-colors hover:bg-muted/20", article.impact === "critical" ? "border-l-red-500" : article.impact === "medium" ? "border-l-amber-500" : "border-l-sky-500")}>
                  <div className="flex items-start gap-2.5"><Icon size={16} className={cn("mt-0.5 shrink-0", config.tone.split(" ")[0])} /><div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold leading-snug">{article.title}</h3><span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase", config.tone)}>{config.label}</span></div>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground"><span>{article.publisher}</span><span>·</span><span>{article.category}</span>{article.publishedAt && <><span>·</span><span>{new Date(article.publishedAt).toLocaleString()}</span></>}</div>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{article.summary}</p>
                    <p className="mt-2 text-xs text-foreground/80"><CheckCircle2 size={13} className="mr-1.5 inline text-primary" />{article.relevanceExplanation}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">{article.tags.slice(0, 5).map((tag) => <span key={tag} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">#{tag}</span>)}<a href={article.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><ExternalLink size={12} />Source</a></div>
                  </div></div>
                </article>;
              })}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
