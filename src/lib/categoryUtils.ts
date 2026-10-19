/** Convert a category label into a stable ASCII slug for its unique key. */
export function categorySlug(name: string): string {
  return (
    name
      .trim()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "uncategorized"
  );
}
