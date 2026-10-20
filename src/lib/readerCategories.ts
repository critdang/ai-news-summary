export type CategorizedSource = {
  category?: string | null;
  categoryColor?: string | null;
  _count: { articles: number };
};

export type CategoryGroup<TSource extends CategorizedSource> = {
  value: string;
  label: string;
  count: number;
  color: string | null;
  sources: TSource[];
};

export function groupSourcesByCategory<TSource extends CategorizedSource>(
  sources: TSource[]
): CategoryGroup<TSource>[] {
  const groups = new Map<string, CategoryGroup<TSource>>();

  for (const source of sources) {
    const name = source.category?.trim() || "Uncategorized";
    const group = groups.get(name) ?? {
      value: name,
      label: name,
      count: 0,
      color: source.categoryColor || null,
      sources: [],
    };
    group.count += source._count.articles;
    group.color ||= source.categoryColor || null;
    group.sources.push(source);
    groups.set(name, group);
  }

  return [...groups.values()];
}
