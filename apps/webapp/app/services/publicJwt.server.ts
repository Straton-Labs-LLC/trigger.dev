import { generateJWT, validateJWT } from "@trigger.dev/core/v3/jwt";

export const MAX_PUBLIC_JWT_TTL_SECONDS = 24 * 60 * 60;

type GenerateBoundedPublicJwtOptions = {
  secretKey: string;
  payload: Record<string, unknown>;
  requestedExpirationTime?: number | string;
  delegatedExpirationTime?: number;
};

export type GenerateBoundedPublicJwtResult =
  | { ok: true; token: string }
  | { ok: false; reason: "invalid_expiration" | "expiration_exceeds_limit" };

export async function generateBoundedPublicJwt({
  secretKey,
  payload,
  requestedExpirationTime,
  delegatedExpirationTime,
}: GenerateBoundedPublicJwtOptions): Promise<GenerateBoundedPublicJwtResult> {
  const expirationTime = requestedExpirationTime ?? delegatedExpirationTime ?? "1h";

  try {
    const token = await generateJWT({ secretKey, payload, expirationTime });
    const validation = await validateJWT(token, secretKey);
    if (
      !validation.ok ||
      typeof validation.payload.exp !== "number" ||
      typeof validation.payload.iat !== "number"
    ) {
      return { ok: false, reason: "invalid_expiration" };
    }

    const maximumExpirationTime =
      delegatedExpirationTime ?? validation.payload.iat + MAX_PUBLIC_JWT_TTL_SECONDS;

    // @crumbs The generated token is the source of truth for jose's duration grammar. Check its
    // absolute exp so duration strings and Unix timestamps share the same security ceiling.
    if (validation.payload.exp > maximumExpirationTime) {
      return { ok: false, reason: "expiration_exceeds_limit" };
    }

    return { ok: true, token };
  } catch {
    return { ok: false, reason: "invalid_expiration" };
  }
}
