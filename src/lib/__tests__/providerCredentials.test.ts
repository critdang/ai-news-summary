import { decryptProviderKey, encryptProviderKey } from "@/lib/providerCredentialCrypto";

describe("provider credential encryption", () => {
  const previousSecret = process.env.AUTH_SECRET;

  beforeEach(() => {
    process.env.AUTH_SECRET = "test-auth-secret-with-at-least-32-characters";
  });

  afterAll(() => {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousSecret;
  });

  it("encrypts and decrypts API keys without storing the plaintext", () => {
    const key = "provider-api-key-value";
    const encrypted = encryptProviderKey(key);
    expect(encrypted).not.toContain(key);
    expect(decryptProviderKey(encrypted)).toBe(key);
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptProviderKey("provider-api-key-value");
    const [version, iv, tag, ciphertext] = encrypted.split(".");
    expect(() => decryptProviderKey(`${version}.${iv}.${tag}.${ciphertext.slice(0, -1)}A`)).toThrow();
  });

  it("returns null for an unset credential", () => {
    expect(decryptProviderKey(null)).toBeNull();
  });
});
