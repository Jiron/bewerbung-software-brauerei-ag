import { randomBytes, type ScryptOptions, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Access codes are stored only as scrypt hashes ("scrypt:N:r:p:salt:hash", base64url).
 * No "$" on purpose: docker compose would try to interpolate it in .env files.
 * The code itself lives in the application email, never in env or repo.
 */

const PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;
const KEY_LENGTH = 32;

/** Codes are typed on a C64 screen: case and extra spaces must not matter. */
export function normalizeAccessCode(code: string): string {
  return code.trim().replace(/\s+/g, " ").toUpperCase();
}

export async function hashAccessCode(code: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(normalizeAccessCode(code), salt, PARAMS);
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join(":");
}

export async function verifyAccessCode(code: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, keyB64] = stored.split(":");
  if (scheme !== "scrypt" || !n || !r || !p || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64url");
  const actual = await derive(normalizeAccessCode(code), Buffer.from(saltB64, "base64url"), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function derive(code: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(code, salt, KEY_LENGTH, { ...options, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}
