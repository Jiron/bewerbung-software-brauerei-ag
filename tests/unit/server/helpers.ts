import path from "node:path";
import { type AppConfig, createApp } from "../../../src/server/app.ts";
import { ChatService } from "../../../src/server/chat/chat-service.ts";
import {
  type ConversationOptions,
  ConversationStore,
} from "../../../src/server/chat/conversations.ts";
import { MockProvider } from "../../../src/server/chat/mock-provider.ts";
import type { ChatProvider } from "../../../src/server/chat/provider.ts";
import { KnowledgeStore, loadKnowledge } from "../../../src/server/knowledge/store.ts";
import { type Logger, silentLogger } from "../../../src/server/logger.ts";
import { hashAccessCode } from "../../../src/server/security/access-code.ts";
import { RateLimiter } from "../../../src/server/security/rate-limiter.ts";
import { SpendTracker } from "../../../src/server/security/spend-tracker.ts";
import type { ChatEvent } from "../../../src/shared/api.ts";
import { SseParser, toChatEvent } from "../../../src/shared/sse.ts";

export const EXAMPLE_KNOWLEDGE = path.resolve(import.meta.dirname, "../../../knowledge.example");
export const TEST_CODE = "Zapfhahn 64 Kicker";

let cachedHash: Promise<string> | null = null;
const testHash = () => {
  cachedHash ??= hashAccessCode(TEST_CODE);
  return cachedHash;
};

export interface TestAppOptions {
  provider?: ChatProvider;
  spendCapUsd?: number;
  chatPerMinute?: number;
  unlockMaxAttempts?: number;
  withAccessCode?: boolean;
  config?: Partial<AppConfig>;
  conversations?: ConversationOptions;
  logger?: Logger;
}

export async function createTestApp(options: TestAppOptions = {}) {
  const knowledge = KnowledgeStore.fromKnowledge(
    await loadKnowledge(EXAMPLE_KNOWLEDGE),
    silentLogger,
  );
  const provider = options.provider ?? new MockProvider({ delayMs: 0 });
  const spend = new SpendTracker({
    capUsd: options.spendCapUsd ?? 1,
    dataDir: null,
    logger: silentLogger,
  });
  const chat = new ChatService({
    provider,
    knowledge,
    conversations: new ConversationStore(options.conversations),
    spend,
    maxOutputTokens: 1024,
    repoUrl: "https://github.com/example/load-manasses",
    logger: silentLogger,
  });
  const app = createApp({
    config: {
      accessCodeHash: options.withAccessCode === false ? null : await testHash(),
      requireAccessCode: false,
      sessionSecret: "test-secret-that-is-long-enough-for-hmac",
      sessionTtlHours: 1,
      maxMessageLength: 500,
      trustProxy: false,
      repoUrl: null,
      isProduction: false,
      staticDir: null,
      ...options.config,
    },
    knowledge,
    chat,
    provider,
    limiters: {
      chat: new RateLimiter([{ max: options.chatPerMinute ?? 100, windowMs: 60_000 }]),
      unlockPerIp: new RateLimiter([{ max: options.unlockMaxAttempts ?? 5, windowMs: 60_000 }]),
      unlockGlobal: new RateLimiter([{ max: 1000, windowMs: 60_000 }]),
    },
    logger: options.logger ?? silentLogger,
  });
  return { app, knowledge, spend };
}

export function postJson(body: unknown, cookie?: string): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  };
}

export async function readChatEvents(response: Response): Promise<ChatEvent[]> {
  const parser = new SseParser();
  return parser
    .push(`${await response.text()}\n\n`)
    .map(toChatEvent)
    .filter((event): event is ChatEvent => event !== null);
}

export function answerText(events: ChatEvent[]): string {
  return events.map((event) => (event.type === "delta" ? event.text : "")).join("");
}

export function sessionCookie(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  return header.split(";")[0] ?? "";
}
