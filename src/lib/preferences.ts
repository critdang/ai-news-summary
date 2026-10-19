export type PreferencesInput = {
  language: string;
  retentionDays: number;
  maxArticlesPerRun: number;
};

export type PreferencesValidation =
  | { ok: true; value: PreferencesInput }
  | { ok: false; error: string };

export function validatePreferencesInput(value: unknown): PreferencesValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "A preferences object is required" };
  }

  const input = value as Record<string, unknown>;
  const language = typeof input.language === "string" ? input.language.trim() : "";
  if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(language)) {
    return { ok: false, error: "Language must be a valid code such as vi or en" };
  }

  if (!Number.isInteger(input.retentionDays) || Number(input.retentionDays) < 30 || Number(input.retentionDays) > 60) {
    return { ok: false, error: "Retention must be a whole number from 30 to 60 days" };
  }

  if (!Number.isInteger(input.maxArticlesPerRun) || Number(input.maxArticlesPerRun) < 1 || Number(input.maxArticlesPerRun) > 50) {
    return { ok: false, error: "The total article limit must be a whole number from 1 to 50" };
  }

  return {
    ok: true,
    value: {
      language,
      retentionDays: Number(input.retentionDays),
      maxArticlesPerRun: Number(input.maxArticlesPerRun),
    },
  };
}
