import { NextRequest, NextResponse } from "next/server";
import { authenticatedUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { checkProviderAvailability } from "@/lib/providerAvailability";
import { encryptProviderKey } from "@/lib/providerCredentials";

const fieldFor = { gemini: "geminiApiKeyEncrypted", groq: "groqApiKeyEncrypted" } as const;

export async function GET(): Promise<NextResponse> {
  const { userId, response } = await authenticatedUser();
  if (!userId) return response!;
  try {
    const saved = await prisma.userPreference.findUnique({ where: { userId }, select: { geminiApiKeyEncrypted: true, groqApiKeyEncrypted: true } });
    return NextResponse.json({ configured: { gemini: Boolean(saved?.geminiApiKeyEncrypted), groq: Boolean(saved?.groqApiKeyEncrypted) } });
  } catch {
    return NextResponse.json({ error: "Could not load provider credential status" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const { userId, response } = await authenticatedUser();
  if (!userId) return response!;
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid credential request" }, { status: 400 });
  }
  const { provider, apiKey, clear } = body as { provider?: unknown; apiKey?: unknown; clear?: unknown };
  if (provider !== "gemini" && provider !== "groq") {
    return NextResponse.json({ error: "Choose Gemini or Groq" }, { status: 400 });
  }
  if (clear === true) {
    await prisma.userPreference.upsert({
      where: { userId }, create: { userId, [fieldFor[provider]]: null },
      update: { [fieldFor[provider]]: null },
    });
    return NextResponse.json({ configured: false });
  }
  if (typeof apiKey !== "string" || apiKey.trim().length < 8 || apiKey.length > 500) {
    return NextResponse.json({ error: "Enter a valid API key (8–500 characters)" }, { status: 400 });
  }
  const key = apiKey.trim();
  try {
    const status = await checkProviderAvailability(provider, key);
    if (status.state === "invalid_key") {
      return NextResponse.json({ error: "The provider rejected this API key" }, { status: 400 });
    }
    const encrypted = encryptProviderKey(key);
    await prisma.userPreference.upsert({
      where: { userId }, create: { userId, [fieldFor[provider]]: encrypted },
      update: { [fieldFor[provider]]: encrypted },
    });
    return NextResponse.json({ configured: true, status: status.state });
  } catch {
    return NextResponse.json({ error: "Could not save provider credential" }, { status: 500 });
  }
}
