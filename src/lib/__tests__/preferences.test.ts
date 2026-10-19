import { validatePreferencesInput } from "@/lib/preferences";

describe("validatePreferencesInput", () => {
  it("accepts supported language codes and bounded values", () => {
    expect(validatePreferencesInput({
      language: "vi",
      retentionDays: 45,
      maxArticlesPerSource: 20,
    })).toEqual({
      ok: true,
      value: { language: "vi", retentionDays: 45, maxArticlesPerSource: 20 },
    });
  });

  it.each([
    { language: "", retentionDays: 45, maxArticlesPerSource: 20 },
    { language: "vi", retentionDays: 29, maxArticlesPerSource: 20 },
    { language: "vi", retentionDays: 61, maxArticlesPerSource: 20 },
    { language: "vi", retentionDays: 45.5, maxArticlesPerSource: 20 },
    { language: "vi", retentionDays: 45, maxArticlesPerSource: 0 },
    { language: "vi", retentionDays: 45, maxArticlesPerSource: 51 },
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
