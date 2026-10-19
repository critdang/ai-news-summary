import { prisma } from "../src/lib/prisma.ts";
import { expiredArticleWhere, parseRetentionDays, retentionCutoff } from "../src/lib/retention.ts";

export function cleanupMode(args: string[]): "preview" | "apply" {
  const unknown = args.filter((arg) => arg !== "--apply" && arg !== "--dry-run");
  if (unknown.length > 0) throw new Error(`Unknown cleanup argument: ${unknown.join(" ")}`);
  const flags = args.filter((arg) => arg === "--apply" || arg === "--dry-run");
  if (flags.length > 1) throw new Error("Choose only one of --apply or --dry-run");
  return flags[0] === "--apply" ? "apply" : "preview";
}

export async function runCleanup(args = process.argv.slice(2)): Promise<void> {
  const mode = cleanupMode(args);
  const preference = await prisma.userPreference.findFirst({
    select: { retentionDays: true },
  });
  const retentionDays = parseRetentionDays(
    preference?.retentionDays ?? process.env.RETENTION_DAYS
  );
  const cutoff = retentionCutoff(new Date(), retentionDays);
  const where = expiredArticleWhere(cutoff);
  const eligibleCount = await prisma.article.count({ where });

  if (mode === "preview") {
    console.log(
      `[cleanup] Preview only: ${eligibleCount} unbookmarked, note-free article(s) older than ${retentionDays} days qualify.`
    );
    return;
  }

  const result = await prisma.article.deleteMany({ where });
  console.log(
    `[cleanup] Deleted ${result.count} expired unbookmarked, note-free article(s) (retention=${retentionDays} days).`
  );
}

if (process.argv[1]?.endsWith("cleanup.ts")) {
  runCleanup()
    .catch((error) => {
      console.error(`[cleanup] Failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
