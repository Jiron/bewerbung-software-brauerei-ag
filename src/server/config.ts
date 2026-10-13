import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

export interface Config {
  port: number;
  host: string;
  /** Empty means mock mode: no API calls, canned answers built from the knowledge. */
  anthropicApiKey: string | null;
  model: string;
  effort: "low" | "medium" | "high";
  maxOutputTokens: number;
  knowledgeDir: string;
  /** True when knowledgeDir fell back to the bundled fictional persona. */
  usingExampleKnowledge: boolean;
  accessCodeHash: string | null;
  /** True: without the code nothing works, not even the public sections or the chat. */
  requireAccessCode: boolean;
  sessionSecret: string;
  sessionSecretIsEphemeral: boolean;
  sessionTtlHours: number;
  maxMessageLength: number;
  rateLimitPerMinute: number;
  rateLimitPerDay: number;
  unlockMaxAttempts: number;
  unlockWindowMinutes: number;
  dailySpendCapUsd: number;
  dataDir: string | null;
  trustProxy: boolean;
  repoUrl: string | null;
  mockDelayMs: number;
  staticDir: string;
  isProduction: boolean;
}

type Env = Record<string, string | undefined>;

export class ConfigError extends Error {}

export function loadConfig(env: Env, cwd: string = process.cwd()): Config {
  const knowledgeFromEnv = optionalString(env, "KNOWLEDGE_DIR");
  const preferredKnowledge = path.resolve(cwd, knowledgeFromEnv ?? "knowledge");
  const exampleKnowledge = path.resolve(cwd, "knowledge.example");
  // Fall back to the fictional example only when nothing was configured explicitly,
  // so a typo in KNOWLEDGE_DIR fails loudly instead of silently serving Max Muster.
  const usingExampleKnowledge = !knowledgeFromEnv && !existsSync(preferredKnowledge);
  if (knowledgeFromEnv && !existsSync(preferredKnowledge)) {
    throw new ConfigError(`KNOWLEDGE_DIR does not exist: ${preferredKnowledge}`);
  }

  const sessionSecret = optionalString(env, "SESSION_SECRET");
  if (sessionSecret !== null && sessionSecret.length < 32) {
    throw new ConfigError("SESSION_SECRET must be at least 32 characters long.");
  }

  const accessCodeHash = optionalString(env, "ACCESS_CODE_HASH");
  if (accessCodeHash !== null && !accessCodeHash.startsWith("scrypt:")) {
    throw new ConfigError("ACCESS_CODE_HASH must be created with `npm run hash-code`.");
  }
  const requireAccessCode = boolean(env, "REQUIRE_ACCESS_CODE", false);
  if (requireAccessCode && accessCodeHash === null) {
    throw new ConfigError("REQUIRE_ACCESS_CODE needs an ACCESS_CODE_HASH, or nobody gets in.");
  }

  const dataDir = optionalString(env, "DATA_DIR");

  return {
    port: integer(env, "PORT", 3000, { min: 1, max: 65535 }),
    host: optionalString(env, "HOST") ?? "0.0.0.0",
    anthropicApiKey: optionalString(env, "ANTHROPIC_API_KEY"),
    model: optionalString(env, "ANTHROPIC_MODEL") ?? "claude-haiku-5-5",
    effort: oneOf(env, "ANTHROPIC_EFFORT", ["low", "medium", "high"] as const, "low"),
    // Hidden thinking shares this budget with the visible answer. At 1024 a
    // thoughtful run occasionally cut a 100-word answer off mid-sentence.
    maxOutputTokens: integer(env, "MAX_OUTPUT_TOKENS", 2048, { min: 256, max: 8192 }),
    knowledgeDir: usingExampleKnowledge ? exampleKnowledge : preferredKnowledge,
    usingExampleKnowledge,
    accessCodeHash,
    requireAccessCode,
    sessionSecret: sessionSecret ?? randomSecret(),
    sessionSecretIsEphemeral: sessionSecret === null,
    sessionTtlHours: integer(env, "SESSION_TTL_HOURS", 168, { min: 1, max: 24 * 90 }),
    maxMessageLength: integer(env, "MAX_MESSAGE_LENGTH", 500, { min: 20, max: 4000 }),
    rateLimitPerMinute: integer(env, "RATE_LIMIT_PER_MINUTE", 6, { min: 1, max: 1000 }),
    rateLimitPerDay: integer(env, "RATE_LIMIT_PER_DAY", 120, { min: 1, max: 100_000 }),
    unlockMaxAttempts: integer(env, "UNLOCK_MAX_ATTEMPTS", 5, { min: 1, max: 100 }),
    unlockWindowMinutes: integer(env, "UNLOCK_WINDOW_MINUTES", 15, { min: 1, max: 24 * 60 }),
    dailySpendCapUsd: decimal(env, "DAILY_SPEND_CAP_USD", 1, { min: 0, max: 1000 }),
    dataDir: dataDir === null ? null : path.resolve(cwd, dataDir),
    trustProxy: boolean(env, "TRUST_PROXY", false),
    repoUrl: optionalString(env, "PUBLIC_REPO_URL"),
    mockDelayMs: integer(env, "MOCK_DELAY_MS", 12, { min: 0, max: 1000 }),
    staticDir: path.resolve(cwd, optionalString(env, "STATIC_DIR") ?? "dist/client"),
    isProduction: env.NODE_ENV === "production",
  };
}

function optionalString(env: Env, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

function integer(env: Env, key: string, fallback: number, range: Range): number {
  const raw = optionalString(env, key);
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) throw new ConfigError(`${key} must be a whole number, got "${raw}".`);
  return inRange(key, Number(raw), range);
}

function decimal(env: Env, key: string, fallback: number, range: Range): number {
  const raw = optionalString(env, key);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new ConfigError(`${key} must be a number, got "${raw}".`);
  return inRange(key, value, range);
}

function boolean(env: Env, key: string, fallback: boolean): boolean {
  const raw = optionalString(env, key)?.toLowerCase();
  if (raw === undefined || raw === null) return fallback;
  if (["1", "true", "yes"].includes(raw)) return true;
  if (["0", "false", "no"].includes(raw)) return false;
  throw new ConfigError(`${key} must be true or false, got "${raw}".`);
}

function oneOf<const T extends string>(
  env: Env,
  key: string,
  options: readonly T[],
  fallback: T,
): T {
  const raw = optionalString(env, key);
  if (raw === null) return fallback;
  const match = options.find((option) => option === raw);
  if (!match) throw new ConfigError(`${key} must be one of ${options.join(", ")}, got "${raw}".`);
  return match;
}

interface Range {
  min: number;
  max: number;
}

function inRange(key: string, value: number, { min, max }: Range): number {
  if (value < min || value > max) {
    throw new ConfigError(`${key} must be between ${min} and ${max}, got ${value}.`);
  }
  return value;
}

function randomSecret(): string {
  return randomBytes(32).toString("base64url");
}
