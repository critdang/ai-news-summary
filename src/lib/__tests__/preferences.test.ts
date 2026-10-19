import { validatePreferencesInput } from "@/lib/preferences";

describe("validatePreferencesInput", () => {
  it("accepts supported language codes and bounded values", () => {
    expect(validatePreferencesInput({
      language: "vi",
      retentionDays: 45,
      maxArticlesPerRun: 50,
      ingestionIntervalHours: 12,
    })).toEqual({
      ok: true,
      value: { language: "vi", retentionDays: 45, maxArticlesPerRun: 50, ingestionIntervalHours: 12 },
    });
  });

  it("accepts a matching server-side AI provider and model selection", () => {
    expect(validatePreferencesInput({
      language: "en",
      retentionDays: 45,
      maxArticlesPerRun: 50,
      ingestionIntervalHours: 24,
      aiProvider: "gemini",
      aiModel: "gemini-2.5-flash",
    })).toEqual({
      ok: true,
      value: {
        language: "en",
        retentionDays: 45,
        maxArticlesPerRun: 50,
        ingestionIntervalHours: 24,
        aiProvider: "gemini",
        aiModel: "gemini-2.5-flash",
      },
    });
  });

  it("rejects models that do not match the selected provider", () => {
    expect(validatePreferencesInput({
      language: "en",
      retentionDays: 45,
      maxArticlesPerRun: 50,
      aiProvider: "groq",
      aiModel: "gemini-2.5-flash",
    }).ok).toBe(false);
  });

  it.each([
    { language: "", retentionDays: 45, maxArticlesPerRun: 50, ingestionIntervalHours: 12 },
    { language: "vi", retentionDays: 29, maxArticlesPerRun: 50, ingestionIntervalHours: 12 },
    { language: "vi", retentionDays: 61, maxArticlesPerRun: 50, ingestionIntervalHours: 12 },
    { language: "vi", retentionDays: 45.5, maxArticlesPerRun: 50, ingestionIntervalHours: 12 },
    { language: "vi", retentionDays: 45, maxArticlesPerRun: 0, ingestionIntervalHours: 12 },
    { language: "vi", retentionDays: 45, maxArticlesPerRun: 51, ingestionIntervalHours: 12 },
    { language: "vi", retentionDays: 45, maxArticlesPerRun: 50, ingestionIntervalHours: 6 },
  ])("rejects invalid preference values: %o", (value) => {
    expect(validatePreferencesInput(value).ok).toBe(false);
  });

  it("rejects non-object payloads", () => {
    expect(validatePreferencesInput(null)).toEqual({
      ok: false,
      error: "A preferences object is required",
    });
  });
});
