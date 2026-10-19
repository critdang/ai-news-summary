import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const GITHUB_API = "https://api.github.com";
const WORKFLOW = "ingest.yml";
const recentDispatches = new Map<string, number>();

function configuration() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) return null;
  return { token, repository };
}

function originIsSameSite(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

async function githubRequest(url: string, token: string, init?: RequestInit) {
  return fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers,
    },
    cache: "no-store",
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!originIsSameSite(request)) {
    return NextResponse.json({ error: "Request must come from this site" }, { status: 403 });
  }
  const config = configuration();
  if (!config) {
    return NextResponse.json({ error: "Configure server-only GITHUB_TOKEN and GITHUB_REPOSITORY to enable manual RSS updates." }, { status: 503 });
  }

  const now = Date.now();
  const previous = recentDispatches.get(config.repository) ?? 0;
  if (now - previous < 60_000) {
    return NextResponse.json({ error: "Please wait a minute before starting another RSS update." }, { status: 429 });
  }

  const response = await githubRequest(
    `${GITHUB_API}/repos/${config.repository}/actions/workflows/${WORKFLOW}/dispatches`,
    config.token,
    { method: "POST", body: JSON.stringify({ ref: "main" }), headers: { "Content-Type": "application/json" } },
  ).catch(() => null);
  if (!response) return NextResponse.json({ error: "Could not reach GitHub Actions" }, { status: 502 });
  if (response.status === 204) {
    recentDispatches.set(config.repository, now);
    // GitHub timestamps are second-granular, so send a matching threshold.
    return NextResponse.json({ requestedAt: new Date(Math.floor(now / 1000) * 1000).toISOString(), status: "queued" });
  }
  const detail = response.status === 401 || response.status === 403
    ? "GitHub rejected the token. Give it Actions: write permission and access to this repository."
    : response.status === 404
      ? "GitHub could not find the repository or ingestion workflow. Check GITHUB_REPOSITORY and the workflow file on main."
      : "GitHub could not start RSS ingestion.";
  return NextResponse.json({ error: detail }, { status: 502 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = configuration();
  if (!config) {
    return NextResponse.json({ error: "Manual RSS update is not configured on the server." }, { status: 503 });
  }
  const since = request.nextUrl.searchParams.get("since");
  const requestedAt = since ? Date.parse(since) : Number.NaN;
  if (!Number.isFinite(requestedAt) || Math.abs(Date.now() - requestedAt) > 15 * 60_000) {
    return NextResponse.json({ error: "A recent ingestion request timestamp is required." }, { status: 400 });
  }

  const url = new URL(`${GITHUB_API}/repos/${config.repository}/actions/workflows/${WORKFLOW}/runs`);
  url.searchParams.set("event", "workflow_dispatch");
  url.searchParams.set("per_page", "10");
  const response = await githubRequest(url.toString(), config.token).catch(() => null);
  if (!response?.ok) return NextResponse.json({ error: "Could not read the GitHub Actions run status." }, { status: 502 });
  const body = await response.json() as { workflow_runs?: Array<{ created_at?: string; status?: string; conclusion?: string | null; html_url?: string }> };
  const run = body.workflow_runs?.find((item) => {
    const createdAt = Date.parse(item.created_at || "");
    return Number.isFinite(createdAt) && createdAt >= requestedAt;
  });
  if (!run) return NextResponse.json({ status: "queued" });
  return NextResponse.json({
    status: run.status === "completed" ? "completed" : run.status || "queued",
    conclusion: run.conclusion,
    url: run.html_url,
  });
}
