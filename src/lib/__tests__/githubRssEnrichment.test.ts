import { extractGitHubRepository } from "../githubRssEnrichment";

describe("extractGitHubRepository", () => {
  it("uses a repository URL from an RSS item", () => {
    expect(extractGitHubRepository("https://github.com/vercel/next.js/releases/tag/v16.0.0")).toBe("vercel/next.js");
  });

  it("finds a repository URL embedded in RSS HTML", () => {
    expect(extractGitHubRepository('<a href="https://github.com/openai/openai-node">OpenAI Node</a>')).toBe("openai/openai-node");
  });

  it("does not treat GitHub navigation pages as repositories", () => {
    expect(extractGitHubRepository("https://github.com/trending")).toBeNull();
  });
});
