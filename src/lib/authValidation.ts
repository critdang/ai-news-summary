export function validateCredentials(input: Record<string, unknown>) {
  const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!/^[a-z0-9_]{3,30}$/.test(username)) return { ok: false as const, error: "Username must be 3–30 letters, numbers, or underscores" };
  if (password.length < 8 || password.length > 128) return { ok: false as const, error: "Password must be 8–128 characters" };
  return { ok: true as const, username, password };
}
