export type ProviderAvailabilityState = "available" | "missing_key" | "invalid_key" | "unreachable";
export type ProviderAvailability = {
  state: ProviderAvailabilityState;
  models: string[];
};

const MODEL_LIST_TIMEOUT_MS = 5_000;

export async function checkProviderAvailability(
  provider: "gemini" | "groq",
  apiKey: string | undefined,
): Promise<ProviderAvailability> {
  if (!apiKey) return { state: "missing_key", models: [] };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_LIST_TIMEOUT_MS);
  try {
    const response = await fetch(
      provider === "gemini"
        ? "https://generativelanguage.googleapis.com/v1beta/models"
        : "https://api.groq.com/openai/v1/models",
      {
        headers: provider === "gemini"
          ? { "x-goog-api-key": apiKey }
          : { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        cache: "no-store",
      },
    );
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      return { state: "invalid_key", models: [] };
    }
    if (!response.ok) return { state: "unreachable", models: [] };

    const body = await response.json() as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
      data?: Array<{ id?: string; active?: boolean }>;
    };
    const models = provider === "gemini"
      ? (body.models ?? [])
        .filter((model) => model.name && model.supportedGenerationMethods?.includes("generateContent"))
        .map((model) => model.name!.replace(/^models\//, ""))
      : (body.data ?? [])
        .filter((model) => model.id && model.active !== false)
        .map((model) => model.id!);

    return { state: "available", models };
  } catch {
    return { state: "unreachable", models: [] };
  } finally {
    clearTimeout(timeout);
  }
}
