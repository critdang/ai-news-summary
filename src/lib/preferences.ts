export type PreferencesInput = {
  language: string;
  retentionDays: number;
  maxArticlesPerRun: number;
  maxArticlesPerSource?: number;
  ingestionIntervalHours?: 12 | 24;
  aiProvider?: "gemini" | "groq" | "mock";
  aiModel?: string;
  githubEnrichmentEnabled?: boolean;
};

export const AI_MODELS = {
  gemini: ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"],
  groq: ["openai/gpt-oss-20b", "llama-3.3-70b-versatile"],
  mock: ["mock"],
} as const;

export function resolveAIModel(provider: "gemini" | "groq" | "mock", preferred?: string): string {
  const models = AI_MODELS[provider] as readonly string[];
  return preferred && models.includes(preferred) ? preferred : models[0];
}

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

  // Determine effective max articles per run, accepting both new and legacy field names.
  const effectiveMax = input.maxArticlesPerRun !== undefined ? Number(input.maxArticlesPerRun) : Number(input.maxArticlesPerSource);
  if (!Number.isInteger(effectiveMax) || effectiveMax < 1 || effectiveMax > 50) {
    return { ok: false, error: "The total article limit must be a whole number from 1 to 50" };
  }

  if (input.ingestionIntervalHours !== 12 && input.ingestionIntervalHours !== 24) {
    return { ok: false, error: "RSS schedule must be twice daily (12 hours) or daily (24 hours)" };
  }

  let aiProvider: PreferencesInput["aiProvider"];
  if (input.aiProvider !== undefined) {
    if (input.aiProvider !== "gemini" && input.aiProvider !== "groq" && input.aiProvider !== "mock") {
      return { ok: false, error: "AI provider must be Gemini, Groq, or Mock" };
    }
    aiProvider = input.aiProvider;
  }

  let aiModel: string | undefined;
  if (input.aiModel !== undefined) {
    if (typeof input.aiModel !== "string" || input.aiModel.length > 100) {
      return { ok: false, error: "AI model is invalid" };
    }
    aiModel = input.aiModel.trim();
    const modelProvider = aiProvider || (input.aiModel === "mock" ? "mock" : undefined);
    if (!modelProvider || !(AI_MODELS[modelProvider] as readonly string[]).includes(aiModel)) {
      return { ok: false, error: "Choose a supported model for the selected provider" };
    }
  }

  if (input.githubEnrichmentEnabled !== undefined && typeof input.githubEnrichmentEnabled !== "boolean") {
    return { ok: false, error: "GitHub enrichment must be enabled or disabled" };
  }

  return {
    ok: true,
    value: {
      language,
      retentionDays: Number(input.retentionDays),
      maxArticlesPerRun: Number(input.maxArticlesPerRun),
      ingestionIntervalHours: input.ingestionIntervalHours,
      ...(aiProvider ? { aiProvider } : {}),
      ...(aiModel ? { aiModel } : {}),
      ...(typeof input.githubEnrichmentEnabled === "boolean" ? { githubEnrichmentEnabled: input.githubEnrichmentEnabled } : {}),
    },
  };
}
