/**
 * src/lib/__tests__/aiProvider.test.ts
 *
 * Unit tests for the AI provider abstraction: structured output validation,
 * provider fallback, retry-on-transient, and permanent-error handling.
 * fetch is mocked so no real API calls are made.
 */

import { summarizeArticle, resetProviderCacheForTests } from "@/lib/aiProvider";

// Helper to mock fetch with a given response.
function mockFetch(response: {
  ok: boolean;
  status: number;
  json: unknown;
  text?: string;
  headers?: Record<string, string>;
}) {
  const jsonPromise = Promise.resolve(response.json);
  const textPromise = Promise.resolve(response.text ?? JSON.stringify(response.json));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis.fetch as any) = jest.fn(() =>
    Promise.resolve({
      ok: response.ok,
      status: response.status,
      json: () => jsonPromise,
      text: () => textPromise,
      headers: new Headers(response.headers),
    } as Response)
  );
  return globalThis.fetch as jest.Mock;
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GROQ_API_KEY = "test-groq-key";
  process.env.AI_PROVIDER = "gemini";
  process.env.AI_MAX_RETRIES = "3";
  delete process.env.GROQ_MODEL;
  resetProviderCacheForTests();
});

describe("summarizeArticle — structured output", () => {
  it("uses the configured Groq model and honors Retry-After", async () => {
    process.env.AI_PROVIDER = "groq";
    process.env.GROQ_MODEL = "openai/gpt-oss-20b";
    process.env.AI_MAX_RETRIES = "2";
    const responses = [
      {
        ok: false,
        status: 429,
        json: { error: "rate limited" },
        text: "rate limited",
        headers: { "retry-after": "0.001" },
      },
      {
        ok: true,
        status: 200,
        json: {
          choices: [{ message: { content: '{"summary":"Ready","relevanceScore":6,"relevanceExplanation":"Useful","tags":["ai"]}' } }],
        },
      },
    ];
    let index = 0;
    const fetchMock = (globalThis.fetch as jest.Mock) = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe("https://api.groq.com/openai/v1/chat/completions");
      expect(init?.method).toBe("POST");
      const response = responses[index++];
      return {
        ok: response.ok,
        status: response.status,
        json: async () => response.json,
        text: async () => response.text ?? JSON.stringify(response.json),
        headers: new Headers(response.headers),
      } as Response;
    });

    const out = await summarizeArticle("Test title", "Excerpt", "en");

    expect(out?.provider).toBe("groq");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requestBody = fetchMock.mock.calls[0]?.[1]?.body;
    expect(JSON.parse(String(requestBody)).model).toBe("openai/gpt-oss-20b");
  });

  it("supports deterministic mock mode without provider credentials or network calls", async () => {
    process.env.AI_PROVIDER = "mock";
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    const fetchMock = (globalThis.fetch as jest.Mock) = jest.fn();

    const out = await summarizeArticle("A local test", "No network", "en");

    expect(out?.provider).toBe("mock");
    expect(out?.result.summary).toContain("A local test");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns validated AIResult from Gemini on success", async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: {
        candidates: [
          {
            content: {
              parts: [{ text: '{"summary":"Tóm tắt bài","relevanceScore":8,"relevanceExplanation":"Quan trọng","tags":["ai"]}' }],
            },
          },
        ],
      },
    });

    const out = await summarizeArticle("Tiêu đề", "Trích dẫn", "vi");
    expect(out).not.toBeNull();
    expect(out!.provider).toBe("gemini");
    expect(out!.result.summary).toBe("Tóm tắt bài");
    expect(out!.result.relevanceScore).toBe(8);
    expect(out!.result.tags).toContain("ai");
  });

  it("gracefully returns null when all providers reject invalid output", async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: {
        candidates: [{ content: { parts: [{ text: '{"summary":"x"}' }] } }],
      },
    });

    const out = await summarizeArticle("T", "E", "vi");
    expect(out).toBeNull();
  });

  it("falls back from Gemini to Groq when Gemini fails", async () => {
    const responses: Array<{ ok: boolean; status: number; json: unknown }> = [
      { ok: false, status: 503, json: { error: "overloaded" } },
      {
        ok: true,
        status: 200,
        json: {
          choices: [{ message: { content: '{"summary":"Tóm tắt","relevanceScore":5,"relevanceExplanation":"OK","tags":[]}' } }],
        },
      },
    ];
    let callIndex = 0;
    const fetchMock = (globalThis.fetch as jest.Mock) = jest.fn(() => {
      const r = responses[callIndex++] ?? responses[responses.length - 1];
      return Promise.resolve({
        ok: r.ok,
        status: r.status,
        json: () => Promise.resolve(r.json),
        text: () => Promise.resolve(JSON.stringify(r.json)),
      } as Response);
    });

    const out = await summarizeArticle("T", "E", "vi");
    expect(out).not.toBeNull();
    expect(out!.provider).toBe("groq");
    // Gemini retried (transient 503) then Groq succeeded: at least 2 calls.
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("returns null when all providers fail", async () => {
    mockFetch({ ok: false, status: 500, json: { error: "server error" } });
    const out = await summarizeArticle("T", "E", "vi");
    expect(out).toBeNull();
  });

  it("does not retry permanent errors (400)", async () => {
    const fetchMock = mockFetch({ ok: false, status: 400, json: { error: "bad request" } });
    const start = Date.now();
    const out = await summarizeArticle("T", "E", "vi");
    const elapsed = Date.now() - start;
    expect(out).toBeNull();
    // Each provider is tried exactly once (no retries on permanent errors).
    expect(elapsed).toBeLessThan(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws when no provider is configured", async () => {
    // Remove env keys so no providers are created.
    const origGemini = process.env.GEMINI_API_KEY;
    const origGroq = process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    resetProviderCacheForTests();

    await expect(summarizeArticle("T", "E", "vi")).rejects.toThrow(
      /No AI provider configured/
    );

    process.env.GEMINI_API_KEY = origGemini;
    process.env.GROQ_API_KEY = origGroq;
    resetProviderCacheForTests();
  });
});
