import { githubConfigSchema, githubConnector } from "../github";

describe("GitHub connector", () => {
  afterEach(() => jest.restoreAllMocks());

  it("validates bounded search configuration and fills defaults", () => {
    expect(githubConfigSchema.parse({})).toEqual({ query: "", topic: "", language: "", sort: "stars", resultLimit: 30 });
    expect(githubConfigSchema.safeParse({ resultLimit: 1000 }).success).toBe(false);
  });

  it("searches public repositories and maps the result to the Project domain", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ items: [{
      id: 123, html_url: "https://github.com/octo/project", name: "project", full_name: "octo/project",
      description: "An example", language: "TypeScript", stargazers_count: 42, forks_count: 8,
      topics: ["ai", "news"], created_at: "2025-01-01T00:00:00Z", updated_at: "2026-02-01T00:00:00Z", owner: { login: "octo" },
    }] }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await githubConnector.fetch(githubConnector.validateConfig({ topic: "ai", language: "TypeScript" }));

    expect(result).toEqual([expect.objectContaining({
      externalId: "123", fullName: "octo/project", canonicalUrl: "https://github.com/octo/project",
      owner: "octo", stars: 42, forks: 8, topics: ["ai", "news"],
    })]);
    const requested = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requested.origin).toBe("https://api.github.com");
    expect(requested.pathname).toBe("/search/repositories");
    expect(requested.searchParams.get("q")).toContain("is:public");
    expect(requested.searchParams.get("q")).toContain("topic:ai");
    expect(requested.searchParams.get("q")).toContain("language:TypeScript");
  });

  it("reports a clear rate limit message without leaking provider details", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response("{\"message\":\"private upstream response\"}", { status: 403 }));
    await expect(githubConnector.fetch(githubConnector.validateConfig({}))).rejects.toThrow("GitHub rate limit reached");
  });
});
