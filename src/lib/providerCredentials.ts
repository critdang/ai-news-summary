import { prisma } from "@/lib/prisma";
import { decryptProviderKey } from "@/lib/providerCredentialCrypto";

type Provider = "gemini" | "groq";

export { encryptProviderKey } from "@/lib/providerCredentialCrypto";

export async function getUserProviderKeys(userId: string): Promise<Record<Provider, string | undefined>> {
  const preference = await prisma.userPreference.findUnique({
    where: { userId },
    select: { geminiApiKeyEncrypted: true, groqApiKeyEncrypted: true },
  });
  return {
    gemini: decryptProviderKey(preference?.geminiApiKeyEncrypted) || process.env.GEMINI_API_KEY,
    groq: decryptProviderKey(preference?.groqApiKeyEncrypted) || process.env.GROQ_API_KEY,
  };
}
