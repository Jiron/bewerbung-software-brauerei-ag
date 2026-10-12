import { createHmac, timingSafeEqual } from "node:crypto";
import type { Tier } from "../../shared/api.ts";

/**
 * Stateless session tokens: base64url(JSON payload) + "." + HMAC-SHA256.
 * They live in an httpOnly cookie, so page scripts never see them, and they
 * only ever say one thing: "this browser may read the private tier until exp".
 */

export interface SessionPayload {
  tier: Tier;
  /** Expiry, milliseconds since epoch. */
  exp: number;
}

export function signSession(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function verifySession(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;
    if (
      (payload.tier !== "public" && payload.tier !== "private") ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    return payload.exp > now ? { tier: payload.tier, exp: payload.exp } : null;
  } catch {
    return null;
  }
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}
