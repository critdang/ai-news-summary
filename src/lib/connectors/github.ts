import { z } from "zod";
import type { ConnectorDefinition, GitHubProject } from "./types";

export const githubConfigSchema = z.object({
  query: z.string().trim().max(180).default(""),
  topic: z.string().trim().max(50).optional().default(""),
  language: z.string().trim().max(40).optional().default(""),
  sort: z.enum(["stars", "forks", "updated"]).default("stars"),
  resultLimit: z.number().int().min(1).max(50).default(30),
});

export type GitHubConnectorConfig = z.infer<typeof githubConfigSchema>;

type GitHubRepositoryPayload = {
  id: number;
  html_url: string;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  topics?: string[];
  created_at: string;
  updated_at: string;
  owner?: { login?: string };
};

function normalizeRepository(repository: GitHubRepositoryPayload): GitHubProject | null {
  const owner = repository.owner?.login;
  if (!owner || !Number.isSafeInteger(repository.id) || !repository.full_name || !repository.html_url) return null;
  const canonical = new URL(repository.html_url);
  if (canonical.protocol !== "https:" || canonical.hostname !== "github.com") return null;
  return {
    externalId: String(repository.id),
    canonicalUrl: canonical.toString(),
    owner,
    name: repository.name,
    fullName: repository.full_name,
    description: repository.description,
    language: repository.language,
    stars: Math.max(0, repository.stargazers_count || 0),
    forks: Math.max(0, repository.forks_count || 0),
    topics: Array.isArray(repository.topics) ? repository.topics.filter((topic) => typeof topic === "string").slice(0, 20) : [],
    upstreamCreatedAt: repository.created_at ? new Date(repository.created_at) : null,
    upstreamUpdatedAt: repository.updated_at ? new Date(repository.updated_at) : null,
  };
}

async function requestRepositories(config: GitHubConnectorConfig, signal?: AbortSignal): Promise<GitHubProject[]> {
  const terms = [config.query, config.topic ? `topic:${config.topic}` : "", config.language ? `language:${config.language}` : "", "is:public"]
    .filter(Boolean).join(" ");
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", terms);
  url.searchParams.set("sort", config.sort);
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(config.resultLimit));

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "FastNews-Discover",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url, { headers, signal: signal ?? AbortSignal.timeout(10_000), cache: "no-store", redirect: "error" });
    if (response.ok) {
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > 2_000_000) throw new Error("GitHub response exceeded the 2 MB limit.");
      const payload = await response.json() as { items?: GitHubRepositoryPayload[] };
      return (payload.items ?? []).slice(0, config.resultLimit).map(normalizeRepository).filter((item): item is GitHubProject => item !== null);
    }
    if (attempt === 0 && [429, 502, 503, 504].includes(response.status)) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 1_000) : 350;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }
    if (response.status === 403 || response.status === 429) throw new Error("GitHub rate limit reached. Wait a little, then try again.");
    if (response.status === 422) throw new Error("GitHub rejected this search. Try a simpler query.");
    throw new Error(`GitHub request failed (${response.status}).`);
  }
  throw new Error("GitHub request failed after a retry.");
}

export const githubConnector: ConnectorDefinition<GitHubConnectorConfig, GitHubProject> = {
  type: "github-repositories",
  version: 1,
  displayName: "GitHub repositories",
  description: "Search public GitHub repositories and keep their metadata in Discover → Projects.",
  capabilities: ["project"],
  validateConfig(value) {
    return githubConfigSchema.parse(value);
  },
  fetch: requestRepositories,
};
