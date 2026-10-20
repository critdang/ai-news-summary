"use client";

import { cn } from "@/lib/utils";
import {
  LayoutList,
  LayoutGrid,
  Newspaper,
} from "lucide-react";
import type { ViewMode } from "@/types";
import { VIEW_MODES } from "@/types";

type HeaderProps = {
  title: string;
  subtitle?: string;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  actions?: React.ReactNode;
};

const VIEW_OPTIONS = [
  { mode: VIEW_MODES.List, icon: LayoutList, label: "List" },
  { mode: VIEW_MODES.Card, icon: LayoutGrid, label: "Card" },
  { mode: VIEW_MODES.Magazine, icon: Newspaper, label: "Magazine" },
] as const;

export function Header({
  title,
  subtitle,
  viewMode = "list",
  onViewModeChange,
  actions,
}: HeaderProps) {
  return (
    <header className="flex min-h-[72px] h-auto flex-wrap items-center justify-between gap-3 border-b border-border bg-card/80 backdrop-blur-sm px-4 py-3 sm:px-8">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold text-foreground tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2.5">
        {onViewModeChange && (
          <div className="mr-1 flex items-center rounded-lg border border-border bg-muted/50 p-0.5">
            {VIEW_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.mode}
                  onClick={() => onViewModeChange(option.mode)}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-md transition-all",
                    viewMode === option.mode
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title={option.label}
                  aria-label={`${option.label} view`}
                >
                  <Icon size={18} />
                </button>
              );
            })}
          </div>
        )}

        {actions}
      </div>
    </header>
  );
}
