import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { AnthropicProvider } from "./chat/anthropic-provider.ts";
import { ChatService } from "./chat/chat-service.ts";
import { ConversationStore } from "./chat/conversations.ts";
import { MockProvider } from "./chat/mock-provider.ts";
import type { ChatProvider } from "./chat/provider.ts";
import { ConfigError, loadConfig } from "./config.ts";
import { KnowledgeStore } from "./knowledge/store.ts";
import { createJsonLogger } from "./logger.ts";
import { RateLimiter } from "./security/rate-limiter.ts";
import { SpendTracker } from "./security/spend-tracker.ts";

const MINUTE = 60_000;
const logger = createJsonLogger();

async function main(): Promise<void> {
  const config = loadConfig(process.env);

  const knowledge = await KnowledgeStore.open(config.knowledgeDir, logger);
  knowledge.watch();

  const provider: ChatProvider = config.anthropicApiKey
    ? new AnthropicProvider({
        apiKey: config.anthropicApiKey,
        model: config.model,
        effort: config.effort,
        maxOutputTokens: config.maxOutputTokens,
        logger,
      })
    : new MockProvider({ delayMs: config.mockDelayMs });

  const spend = new SpendTracker({
    capUsd: config.dailySpendCapUsd,
    dataDir: config.dataDir,
    logger,
  });
  await spend.load();

  const chat = new ChatService({
    provider,
    knowledge,
    conversations: new ConversationStore(),
    spend,
    maxOutputTokens: config.maxOutputTokens,
    repoUrl: config.repoUrl,
    logger,
  });

  const app = createApp({
    config: { ...config, staticDir: existsSync(config.staticDir) ? config.staticDir : null },
    knowledge,
    chat,
    provider,
    limiters: {
      chat: new RateLimiter([
        { max: config.rateLimitPerMinute, windowMs: MINUTE },
        { max: config.rateLimitPerDay, windowMs: 24 * 60 * MINUTE },
      ]),
      unlockPerIp: new RateLimiter([
        { max: config.unlockMaxAttempts, windowMs: config.unlockWindowMinutes * MINUTE },
      ]),
      unlockGlobal: new RateLimiter([{ max: 200, windowMs: 60 * MINUTE }]),
    },
    logger,
  });

  const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
    logger.info("server.started", {
      url: `http://localhost:${info.port}`,
      mode: provider.mode,
      model: provider.model,
      knowledge: config.usingExampleKnowledge ? "example (fictional persona)" : config.knowledgeDir,
      sections: knowledge.current.sections.length,
      unlock: !config.accessCodeHash
        ? "disabled"
        : config.requireAccessCode
          ? "required for everything"
          : "private sections",
      dailySpendCapUsd: config.dailySpendCapUsd,
    });
    if (config.sessionSecretIsEphemeral && config.accessCodeHash) {
      logger.warn("config.ephemeral_session_secret", {
        hint: "Set SESSION_SECRET, otherwise unlocked sessions end on every restart.",
      });
    }
    if (!existsSync(config.staticDir)) {
      logger.warn("config.no_client_build", { hint: "Run `npm run build` to serve the UI." });
    }
  });

  const shutdown = () => {
    logger.info("server.stopping");
    knowledge.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    logger.error("config.invalid", { message: error.message });
  } else {
    logger.error("server.crashed", {
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    });
  }
  process.exit(1);
});
