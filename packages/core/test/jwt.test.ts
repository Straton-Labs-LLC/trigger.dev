import { describe, expect, it } from "vitest";
import { generateJWT, validateJWTWithFallbackKeys } from "../src/v3/jwt.js";

const TOKEN_PAYLOAD = { sub: "env_123", pub: true };

describe("validateJWTWithFallbackKeys", () => {
  it("does not load fallback keys when the current key validates", async () => {
    const token = await generateJWT({
      secretKey: "current-key",
      payload: TOKEN_PAYLOAD,
      expirationTime: "1h",
    });
    let loadedFallbackKeys = false;

    const result = await validateJWTWithFallbackKeys(token, "current-key", async () => {
      loadedFallbackKeys = true;
      return ["revoked-key"];
    });

    expect(result.ok).toBe(true);
    expect(loadedFallbackKeys).toBe(false);
  });

  it("accepts a token signed by an unexpired fallback key", async () => {
    const token = await generateJWT({
      secretKey: "recently-revoked-key",
      payload: TOKEN_PAYLOAD,
      expirationTime: "1h",
    });

    const result = await validateJWTWithFallbackKeys(token, "current-key", async () => [
      "older-revoked-key",
      "recently-revoked-key",
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sub).toBe(TOKEN_PAYLOAD.sub);
    }
  });

  it("returns the current-key error when no fallback key validates", async () => {
    const token = await generateJWT({
      secretKey: "unknown-key",
      payload: TOKEN_PAYLOAD,
      expirationTime: "1h",
    });

    const result = await validateJWTWithFallbackKeys(token, "current-key", async () => [
      "revoked-key",
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("ERR_JWS_SIGNATURE_VERIFICATION_FAILED");
    }
  });
});
