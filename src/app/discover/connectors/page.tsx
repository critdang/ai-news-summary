import Link from "next/link";
import { ArrowLeft, Braces, Github, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";

export default function DiscoverConnectorsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-3 sm:px-5 py-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3"><Link href="/" className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Back to FastNews"><ArrowLeft size={18} /></Link><Breadcrumbs items={[{ label: "FastNews", href: "/" }, { label: "Discover", href: "/discover/projects" }, { label: "Connectors" }]} /></div>
          <nav className="flex flex-wrap items-center gap-1 sm:gap-2"><Link href="/discover/projects" className="rounded-lg px-2 sm:px-3 py-2 text-xs sm:text-sm text-muted-foreground hover:bg-muted">Projects</Link><Link href="/settings" className="rounded-lg px-2 sm:px-3 py-2 text-xs sm:text-sm text-muted-foreground hover:bg-muted">Settings</Link></nav>
        </div>
      </header>
      <div className="mx-auto max-w-5xl space-y-7 px-5 py-10">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Discover</p><h1 className="mt-1 text-3xl font-bold">Connectors</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Connect external data sources to the right Discover view. Each connector keeps its own configuration and maps data into a domain such as Projects.</p></div>
        <section aria-labelledby="available-connectors" className="space-y-3"><h2 id="available-connectors" className="text-lg font-semibold">Available</h2><article className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Github size={22} /></div><div><h3 className="font-semibold">GitHub repositories</h3><p className="mt-1 max-w-xl text-sm text-muted-foreground">Search public repositories by query, topic, language, and ranking. Results are saved as Projects with daily star and fork snapshots.</p><p className="mt-2 text-xs text-emerald-600">Available · GitHub REST Search API</p></div></div><Button render={<Link href="/discover/projects#add-connector" />}>Configure GitHub search</Button></article></section>
        <section aria-labelledby="planned-connectors" className="space-y-3"><h2 id="planned-connectors" className="text-lg font-semibold">Planned</h2><article className="flex flex-col gap-4 rounded-2xl border border-dashed border-border bg-card/50 p-5 sm:flex-row sm:items-start"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Braces size={22} /></div><div><div className="flex items-center gap-2"><h3 className="font-semibold">JSON / REST API</h3><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Planned</span></div><p className="mt-1 max-w-2xl text-sm text-muted-foreground">A future connector will support safe endpoint configuration, authentication, pagination, response field mapping, and validation before saving a source. Arbitrary URLs are not enabled yet.</p></div></article><p className="flex items-center gap-2 text-xs text-muted-foreground"><PlugZap size={14} />Additional connectors can provide Projects or new domain types without mixing their records into News Feed articles.</p></section>
      </div>
    </main>
  );
}
