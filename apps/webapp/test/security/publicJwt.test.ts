import { validateJWT } from "@trigger.dev/core/v3/jwt";
import { signUserActorToken, verifyUserActorToken } from "@trigger.dev/plugins";
import { describe, expect, it } from "vitest";
import {
  generateBoundedPublicJwt,
  MAX_PUBLIC_JWT_TTL_SECONDS,
} from "~/services/publicJwt.server";

const SECRET = "test-secret";
const PAYLOAD = { sub: "env_123", pub: true };

describe("delegated user actor tokens", () => {
  it("retains the signed expiration when verified", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60;
    const token = await signUserActorToken(SECRET, {
      userId: "user_123",
      client: "dashboard-agent",
      expirationTime: expiresAt,
    });

    const claims = await verifyUserActorToken(SECRET, token);

    expect(claims?.exp).toBe(expiresAt);
  });
});

describe("generateBoundedPublicJwt", () => {
  it("defaults a delegated JWT to the source token expiration", async () => {
    const delegatedExpirationTime = Math.floor(Date.now() / 1000) + 10 * 60;

    const result = await generateBoundedPublicJwt({
      secretKey: SECRET,
      payload: PAYLOAD,
      delegatedExpirationTime,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const validation = await validateJWT(result.token, SECRET);
      expect(validation.ok && validation.payload.exp).toBe(delegatedExpirationTime);
    }
  });

  it("rejects an explicit expiration beyond the delegated token", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const result = await generateBoundedPublicJwt({
      secretKey: SECRET,
      payload: PAYLOAD,
      delegatedExpirationTime: nowSeconds + 10 * 60,
      requestedExpirationTime: "1h",
    });

    expect(result).toEqual({ ok: false, reason: "expiration_exceeds_limit" });
  });

  it("rejects non-delegated expirations beyond the hard maximum", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const result = await generateBoundedPublicJwt({
      secretKey: SECRET,
      payload: PAYLOAD,
      requestedExpirationTime: nowSeconds + MAX_PUBLIC_JWT_TTL_SECONDS + 60,
    });

    expect(result).toEqual({ ok: false, reason: "expiration_exceeds_limit" });
  });

  it("rejects duration strings beyond the non-delegated hard maximum", async () => {
    const result = await generateBoundedPublicJwt({
      secretKey: SECRET,
      payload: PAYLOAD,
      requestedExpirationTime: "2d",
    });

    expect(result).toEqual({ ok: false, reason: "expiration_exceeds_limit" });
  });

  it("accepts an expiration at the non-delegated hard maximum", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + MAX_PUBLIC_JWT_TTL_SECONDS;
    const result = await generateBoundedPublicJwt({
      secretKey: SECRET,
      payload: PAYLOAD,
      requestedExpirationTime: expiresAt,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects invalid expiration strings", async () => {
    const result = await generateBoundedPublicJwt({
      secretKey: SECRET,
      payload: PAYLOAD,
      requestedExpirationTime: "forever",
    });

    expect(result).toEqual({ ok: false, reason: "invalid_expiration" });
  });
});
