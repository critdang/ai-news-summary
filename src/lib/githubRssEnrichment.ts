export type GitHubRepositoryMetadata = {
  fullName: string;
  stars: number;
  forks: number;
  topics: string[];
};

type GitHubRepositoryPayload = {
  full_name?: unknown;
  stargazers_count?: unknown;
  forks_count?: unknown;
  topics?: unknown;
};

const REPOSITORY_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const RESERVED_PATHS = new Set(["about", "collections", "events", "explore", "features", "login", "marketplace", "new", "organizations", "pricing", "settings", "sponsors", "topics", "trending"]);

/** Finds the first public GitHub owner/repository reference in an RSS item. */
export function extractGitHubRepository(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (!value) continue;
    const urlMatch = value.match(/(?:https?:)?\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:[/?#\s"'<]|$)/i);
    // Do not fall through to shorthand parsing for navigation URLs such as
    // github.com/trending, which would otherwise be treated as a repository.
    if (!urlMatch && /(?:https?:)?\/\/github\.com\//i.test(value)) continue;
    const shorthandMatch = urlMatch ?? value.match(/(?:^|[^A-Za-z0-9_.-])([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:$|[^A-Za-z0-9_.-])/);
    if (!shorthandMatch) continue;
    const owner = shorthandMatch[1];
    const repository = shorthandMatch[2].replace(/\.git$/i, "");
    const fullName = `${owner}/${repository}`;
    if (!RESERVED_PATHS.has(owner.toLowerCase()) && REPOSITORY_NAME.test(fullName)) return fullName;
  }
  return null;
}

/** Reads public repository counters without allowing arbitrary outbound URLs. */
export async function fetchGitHubRepositoryMetadata(fullName: string): Promise<GitHubRepositoryMetadata | null> {
  if (!REPOSITORY_NAME.test(fullName)) return null;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "FastNews-RSS-Enrichment",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  try {
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(fullName)}`, {
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 500_000) return null;
    const payload = await response.json() as GitHubRepositoryPayload;
    if (typeof payload.full_name !== "string" || !REPOSITORY_NAME.test(payload.full_name)) return null;
    return {
      fullName: payload.full_name,
      stars: Math.max(0, Number.isSafeInteger(payload.stargazers_count) ? payload.stargazers_count as number : 0),
      forks: Math.max(0, Number.isSafeInteger(payload.forks_count) ? payload.forks_count as number : 0),
      topics: Array.isArray(payload.topics) ? payload.topics.filter((topic): topic is string => typeof topic === "string").slice(0, 12) : [],
    };
  } catch {
    // Metadata is optional. An API failure must never fail RSS ingestion.
    return null;
  }
}
