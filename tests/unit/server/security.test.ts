import { describe, expect, it } from "vitest";
import { rateLimitKey } from "../../../src/server/http/client-ip.ts";
import { silentLogger } from "../../../src/server/logger.ts";
import { hashAccessCode, verifyAccessCode } from "../../../src/server/security/access-code.ts";
import { costUsd, worstCaseCostUsd } from "../../../src/server/security/pricing.ts";
import { RateLimiter } from "../../../src/server/security/rate-limiter.ts";
import { signSession, verifySession } from "../../../src/server/security/session.ts";
import { SpendTracker } from "../../../src/server/security/spend-tracker.ts";

describe("RateLimiter", () => {
  it("enforces every window and reports when to retry", () => {
    let now = 0;
    const limiter = new RateLimiter(
      [
        { max: 2, windowMs: 1_000 },
        { max: 3, windowMs: 10_000 },
      ],
      { now: () => now },
    );
    expect(limiter.take("a").allowed).toBe(true);
    expect(limiter.take("a").allowed).toBe(true);
    expect(limiter.take("a")).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(limiter.take("b").allowed).toBe(true);

    now = 1_000;
    expect(limiter.take("a").allowed).toBe(true);
    expect(limiter.take("a")).toEqual({ allowed: false, retryAfterSeconds: 9 });
  });

  it("can check without counting and reset a key", () => {
    const limiter = new RateLimiter([{ max: 1, windowMs: 1_000 }]);
    expect(limiter.check("a").allowed).toBe(true);
    limiter.hit("a");
    expect(limiter.remaining("a")).toBe(0);
    limiter.reset("a");
    expect(limiter.remaining("a")).toBe(1);
  });

  it("stays bounded in memory", () => {
    const limiter = new RateLimiter([{ max: 1, windowMs: 60_000 }], { maxKeys: 10 });
    for (let i = 0; i < 100; i++) limiter.take(`ip-${i}`);
    expect(limiter.take("ip-99").allowed).toBe(false);
  });
});

describe("SpendTracker", () => {
  it("reserves the worst case and settles the real cost", () => {
    const spend = new SpendTracker({ capUsd: 1, dataDir: null, logger: silentLogger });
    const first = spend.reserve(0.6);
    expect(first).not.toBeNull();
    expect(spend.reserve(0.6)).toBeNull();
    first?.settle(0.1);
    expect(spend.spentTodayUsd).toBeCloseTo(0.1);
    expect(spend.reserve(0.6)).not.toBeNull();
  });

  it("refills at midnight Swiss time", () => {
    let now = new Date("2026-10-12T21:30:00Z"); // 23:30 in Zurich
    const spend = new SpendTracker({
      capUsd: 1,
      dataDir: null,
      logger: silentLogger,
      now: () => now,
    });
    spend.reserve(1)?.settle(1);
    expect(spend.reserve(0.01)).toBeNull();
    now = new Date("2026-10-12T22:05:00Z"); // 00:05 in Zurich
    expect(spend.reserve(0.01)).not.toBeNull();
  });
});

describe("pricing", () => {
  it("prices Haiku 5.5 usage including cache reads", () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 0,
    };
    expect(costUsd("claude-haiku-5-5", usage)).toBeCloseTo(0.1 + 0.5 + 0.01);
  });

  it("prices unknown models conservatively", () => {
    expect(worstCaseCostUsd("claude-unknown", 1000, 1000)).toBeGreaterThan(
      worstCaseCostUsd("claude-haiku-5-5", 1000, 1000),
    );
  });
});

describe("access codes", () => {
  it("verifies case- and whitespace-insensitively and rejects others", async () => {
    const hash = await hashAccessCode("Kicker Sturm 42");
    // No "$" anywhere: docker compose would interpolate it.
    expect(hash).toMatch(/^scrypt:32768:8:1:[\w-]+:[\w-]+$/);
    expect(hash).not.toContain("Kicker");
    expect(await verifyAccessCode("  kicker   STURM 42 ", hash)).toBe(true);
    expect(await verifyAccessCode("Kicker Sturm 43", hash)).toBe(false);
    expect(await verifyAccessCode("Kicker Sturm 42", "scrypt:broken")).toBe(false);
  });
});

describe("session tokens", () => {
  const secret = "x".repeat(32);

  it("round-trips and expires", () => {
    const token = signSession({ tier: "private", exp: 2_000 }, secret);
    expect(verifySession(token, secret, 1_000)).toEqual({ tier: "private", exp: 2_000 });
    expect(verifySession(token, secret, 3_000)).toBeNull();
  });

  it("rejects tampering and foreign secrets", () => {
    const token = signSession({ tier: "public", exp: 2_000 }, secret);
    const [, signature] = token.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ tier: "private", exp: 2_000 })).toString(
      "base64url",
    );
    expect(verifySession(`${forgedBody}.${signature}`, secret, 1_000)).toBeNull();
    expect(verifySession(token, "y".repeat(32), 1_000)).toBeNull();
    expect(verifySession("garbage", secret, 1_000)).toBeNull();
    expect(verifySession(undefined, secret, 1_000)).toBeNull();
  });
});

describe("rateLimitKey", () => {
  it.each([
    ["203.0.113.7", "203.0.113.7"],
    ["::ffff:203.0.113.7", "203.0.113.7"],
    ["2001:db8:abcd:12:1:2:3:4", "2001:db8:abcd:12::/64"],
    ["2001:db8:abcd:12::99", "2001:db8:abcd:12::/64"],
    ["2001:0db8::1", "2001:db8:0:0::/64"],
  ])("maps %s to %s", (address, key) => {
    expect(rateLimitKey(address)).toBe(key);
  });
});
