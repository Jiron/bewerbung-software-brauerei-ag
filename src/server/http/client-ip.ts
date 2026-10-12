import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

/**
 * The address used for rate limiting.
 *
 * Behind exactly one reverse proxy (TRUST_PROXY=true) the proxy appends the real
 * client to X-Forwarded-For, so the rightmost entry is the trustworthy one;
 * everything left of it could have been sent by the client itself.
 */
export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim();
    if (forwarded) return rateLimitKey(forwarded);
  }
  try {
    return rateLimitKey(getConnInfo(c).remote.address ?? "unknown");
  } catch {
    // app.request() in tests has no socket.
    return "unknown";
  }
}

/** IPv6 users usually own a whole /64, so limit the prefix instead of single addresses. */
export function rateLimitKey(address: string): string {
  const ip = address.replace(/^::ffff:/, "");
  if (!ip.includes(":")) return ip;
  const groups = expandIpv6(ip);
  return groups ? `${groups.slice(0, 4).join(":")}::/64` : ip;
}

function expandIpv6(ip: string): string[] | null {
  const [head = "", tail] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (tail === undefined && missing !== 0)) return null;
  return [...left, ...Array<string>(missing).fill("0"), ...right].map((group) =>
    group.toLowerCase().replace(/^0+(?=.)/, ""),
  );
}
