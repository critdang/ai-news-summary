import { validateCredentials } from "../authValidation";

describe("validateCredentials", () => {
  it("normalizes valid usernames and accepts valid passwords", () => {
    expect(validateCredentials({ username: "  News_User ", password: "long-password" })).toEqual({
      ok: true,
      username: "news_user",
      password: "long-password",
    });
  });

  it("rejects malformed usernames and passwords outside the supported length", () => {
    expect(validateCredentials({ username: "x", password: "long-password" }).ok).toBe(false);
    expect(validateCredentials({ username: "valid_name", password: "short" }).ok).toBe(false);
    expect(validateCredentials({ username: "valid_name", password: "x".repeat(129) }).ok).toBe(false);
  });
});
