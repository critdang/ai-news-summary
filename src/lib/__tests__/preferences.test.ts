import { validatePreferencesInput } from "@/lib/preferences";

describe("validatePreferencesInput", () => {
  it("accepts supported language codes and bounded values", () => {
    expect(validatePreferencesInput({
      language: "vi",
      retentionDays: 45,
      maxArticlesPerRun: 50,
    })).toEqual({
      ok: true,
      value: { language: "vi", retentionDays: 45, maxArticlesPerRun: 50 },
    });
  });

  it.each([
    { language: "", retentionDays: 45, maxArticlesPerRun: 50 },
    { language: "vi", retentionDays: 29, maxArticlesPerRun: 50 },
    { language: "vi", retentionDays: 61, maxArticlesPerRun: 50 },
    { language: "vi", retentionDays: 45.5, maxArticlesPerRun: 50 },
    { language: "vi", retentionDays: 45, maxArticlesPerRun: 0 },
    { language: "vi", retentionDays: 45, maxArticlesPerRun: 51 },
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
