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
  const users = await prisma.user.findMany({ select: { id: true } });
  let eligibleTotal = 0;
  let deletedTotal = 0;
  for (const user of users) {
    const preference = await prisma.userPreference.findUnique({ where: { userId: user.id }, select: { retentionDays: true } });
    const retentionDays = parseRetentionDays(preference?.retentionDays ?? process.env.RETENTION_DAYS);
    const where = { ...expiredArticleWhere(retentionCutoff(new Date(), retentionDays)), source: { userId: user.id } };
    eligibleTotal += await prisma.article.count({ where });
    if (mode === "apply") deletedTotal += (await prisma.article.deleteMany({ where })).count;
  }
  if (mode === "preview") console.log(`[cleanup] Preview only: ${eligibleTotal} unbookmarked, note-free article(s) qualify across ${users.length} user(s).`);
  else console.log(`[cleanup] Deleted ${deletedTotal} expired unbookmarked, note-free article(s) across ${users.length} user(s).`);
}

if (process.argv[1]?.endsWith("cleanup.ts")) {
  runCleanup()
    .catch((error) => {
      console.error(`[cleanup] Failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
