import Link from "next/link";
import { ChevronRight, Loader2 } from "lucide-react";

export type BreadcrumbItem = { label: string; href?: string };

export function Breadcrumbs({ items, loading = false, loadingText = "Loading data…" }: {
  items: BreadcrumbItem[];
  loading?: boolean;
  loadingText?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex min-w-0 items-center gap-1.5">
          {index > 0 && <ChevronRight size={12} aria-hidden="true" />}
          {item.href && index < items.length - 1
            ? <Link href={item.href} className="truncate hover:text-foreground">{item.label}</Link>
            : <span aria-current={index === items.length - 1 ? "page" : undefined} className="truncate font-medium text-foreground">{item.label}</span>}
        </span>
      ))}
      {loading && <span role="status" className="ml-1 inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />{loadingText}</span>}
    </nav>
  );
}
