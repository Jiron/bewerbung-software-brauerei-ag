import { readFile } from "node:fs/promises";
import path from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { secureHeaders } from "hono/secure-headers";
import { streamSSE } from "hono/streaming";
import type {
  ApiError,
  ApiErrorCode,
  KnowledgeIndex,
  SectionDetail,
  SessionInfo,
  Tier,
  UnlockResponse,
} from "../shared/api.ts";
import type { ChatService } from "./chat/chat-service.ts";
import type { ChatProvider } from "./chat/provider.ts";
import type { Config } from "./config.ts";
import { clientIp } from "./http/client-ip.ts";
import { displayTitle } from "./knowledge/parse.ts";
import { type KnowledgeStore, lockedSectionCount, visibleSections } from "./knowledge/store.ts";
import type { Logger } from "./logger.ts";
import { verifyAccessCode } from "./security/access-code.ts";
import type { RateLimiter } from "./security/rate-limiter.ts";
import { signSession, verifySession } from "./security/session.ts";

export type AppConfig = Pick<
  Config,
  | "accessCodeHash"
  | "sessionSecret"
  | "sessionTtlHours"
  | "maxMessageLength"
  | "trustProxy"
  | "repoUrl"
  | "isProduction"
> & { staticDir: string | null };

export interface AppDeps {
  config: AppConfig;
  knowledge: KnowledgeStore;
  chat: ChatService;
  provider: Pick<ChatProvider, "mode">;
  limiters: {
    chat: RateLimiter;
    unlockPerIp: RateLimiter;
    /** Failed codes across all visitors: a safety net against distributed guessing. */
    unlockGlobal: RateLimiter;
  };
  logger: Logger;
}

type AppEnv = { Variables: { tier: Tier; ip: string } };

const SESSION_COOKIE = "lm_session";
const CONVERSATION_ID = /^[A-Za-z0-9-]{8,64}$/;

export function createApp(deps: AppDeps): Hono<AppEnv> {
  const { config, knowledge, chat, limiters, logger } = deps;
  const app = new Hono<AppEnv>();

  app.use(
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        fontSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
      permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
    }),
  );

  app.use("/api/*", async (c, next) => {
    c.set("ip", clientIp(c, config.trustProxy));
    c.set(
      "tier",
      verifySession(getCookie(c, SESSION_COOKIE), config.sessionSecret)?.tier ?? "public",
    );
    c.header("Cache-Control", "no-store");
    // JSON only: cross-site forms cannot send it without a CORS preflight, which we never allow.
    if (c.req.method === "POST" && !c.req.header("content-type")?.startsWith("application/json")) {
      return apiError(c, 415, "invalid_request", "Bitte JSON senden.");
    }
    await next();
  });
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (c) => apiError(c, 413, "invalid_request", "Zu gross."),
    }),
  );

  app.get("/api/health", (c) => c.json({ status: "ok" }));

  app.get("/api/session", (c) => {
    const tier = c.get("tier");
    const current = knowledge.current;
    const body: SessionInfo = {
      tier,
      mode: deps.provider.mode,
      demo: current.demo,
      persona: current.persona,
      limits: { maxMessageLength: config.maxMessageLength },
      lockedSectionCount: lockedSectionCount(current, tier),
      unlockAvailable: config.accessCodeHash !== null,
      repoUrl: config.repoUrl,
    };
    return c.json(body);
  });

  app.post("/api/unlock", async (c) => {
    if (!config.accessCodeHash) {
      return apiError(
        c,
        404,
        "unlock_unavailable",
        "Auf diesem Server gibt es keinen privaten Bereich.",
      );
    }
    const ip = c.get("ip");
    const blocked = [limiters.unlockPerIp.check(ip), limiters.unlockGlobal.check("all")].find(
      (result) => !result.allowed,
    );
    if (blocked && !blocked.allowed) {
      return apiError(c, 429, "locked_out", "Zu viele falsche Codes. Kurze Pause.", {
        retryAfterSeconds: blocked.retryAfterSeconds,
      });
    }

    const body = await readJson(c);
    const code = typeof body?.code === "string" ? body.code.slice(0, 200) : "";
    if (!code.trim() || !(await verifyAccessCode(code, config.accessCodeHash))) {
      limiters.unlockPerIp.hit(ip);
      limiters.unlockGlobal.hit("all");
      logger.warn("unlock.failed", { ip });
      return apiError(c, 401, "wrong_code", "Falscher Code.", {
        attemptsLeft: Math.max(0, limiters.unlockPerIp.remaining(ip)),
      });
    }

    limiters.unlockPerIp.reset(ip);
    const ttlSeconds = config.sessionTtlHours * 3600;
    setCookie(
      c,
      SESSION_COOKIE,
      signSession({ tier: "private", exp: Date.now() + ttlSeconds * 1000 }, config.sessionSecret),
      {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: "Strict",
        path: "/api",
        maxAge: ttlSeconds,
      },
    );
    logger.info("unlock.succeeded", { ip });
    return c.json({ tier: "private" } satisfies UnlockResponse);
  });

  app.post("/api/lock", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/api", secure: config.isProduction });
    return c.json({ tier: "public" } satisfies UnlockResponse);
  });

  app.get("/api/knowledge", (c) => {
    const tier = c.get("tier");
    const current = knowledge.current;
    const body: KnowledgeIndex = {
      sections: visibleSections(current, tier).map((section) => ({
        id: section.id,
        title: displayTitle(section),
        fileTitle: section.fileTitle,
        tier: section.tier,
        chars: section.content.length,
      })),
      lockedSectionCount: lockedSectionCount(current, tier),
    };
    return c.json(body);
  });

  app.get("/api/knowledge/*", (c) => {
    const id = decodeURIComponent(c.req.path.slice("/api/knowledge/".length));
    // Private sections answer 404 while locked: not even their existence leaks.
    const section = visibleSections(knowledge.current, c.get("tier")).find((s) => s.id === id);
    if (!section) return apiError(c, 404, "not_found", "Diesen Abschnitt gibt es nicht.");
    const body: SectionDetail = {
      id: section.id,
      title: displayTitle(section),
      fileTitle: section.fileTitle,
      tier: section.tier,
      chars: section.content.length,
      content: section.content,
    };
    return c.json(body);
  });

  app.post("/api/chat", async (c) => {
    const body = await readJson(c);
    const conversationId = body?.conversationId;
    const rawMessage = body?.message;
    if (
      typeof conversationId !== "string" ||
      !CONVERSATION_ID.test(conversationId) ||
      typeof rawMessage !== "string"
    ) {
      return apiError(c, 400, "invalid_request", "Ungültige Anfrage.");
    }

    const question = cleanQuestion(rawMessage);
    if (!question) return apiError(c, 400, "invalid_request", "Leere Frage.");
    if ([...question].length > config.maxMessageLength) {
      return apiError(c, 413, "message_too_long", `Höchstens ${config.maxMessageLength} Zeichen.`);
    }

    const limit = limiters.chat.take(c.get("ip"));
    if (!limit.allowed) {
      return apiError(c, 429, "rate_limited", "Hey, nicht so hastig!", {
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }

    const tier = c.get("tier");
    return streamSSE(c, async (stream) => {
      const abort = new AbortController();
      stream.onAbort(() => abort.abort());
      for await (const event of chat.answer({
        conversationId,
        question,
        tier,
        signal: abort.signal,
      })) {
        if (stream.aborted) break;
        await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
      }
    });
  });

  app.all("/api/*", (c) => apiError(c, 404, "not_found", "?FILE NOT FOUND ERROR"));

  if (config.staticDir) mountStatic(app, config.staticDir);

  app.onError((error, c) => {
    logger.error("http.unhandled", { path: c.req.path, error: String(error) });
    return apiError(c, 500, "internal", "Da ist etwas schiefgelaufen.");
  });

  return app;
}

function mountStatic(app: Hono<AppEnv>, root: string): void {
  app.use(
    "/assets/*",
    serveStatic({
      root,
      onFound: (_path, c) => {
        // Vite puts a content hash into every asset name.
        c.header("Cache-Control", "public, max-age=31536000, immutable");
      },
    }),
  );
  app.use(
    "*",
    serveStatic({
      root,
      onFound: (_path, c) => {
        c.header("Cache-Control", "no-cache");
      },
    }),
  );

  let notFoundPage: string | null = null;
  app.notFound(async (c) => {
    notFoundPage ??= await readFile(path.join(root, "404.html"), "utf8").catch(
      () => "?FILE NOT FOUND ERROR",
    );
    return c.html(notFoundPage, 404);
  });
}

async function readJson(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await c.req.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Trims, removes control characters and defuses our own marker syntax, so a
 * visitor cannot paste "[[QUELLEN: ...]]" and have the model echo it back.
 */
export function cleanQuestion(raw: string): string {
  return (
    raw
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point.
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
      .replace(/\[\[/g, "[ [")
      .replace(/\]\]/g, "] ]")
      .trim()
  );
}

function apiError(
  c: Context,
  status: 400 | 401 | 404 | 413 | 415 | 429 | 500,
  error: ApiErrorCode,
  message: string,
  extra: Pick<ApiError, "retryAfterSeconds" | "attemptsLeft"> = {},
) {
  if (extra.retryAfterSeconds) c.header("Retry-After", String(extra.retryAfterSeconds));
  return c.json({ error, message, ...extra } satisfies ApiError, status);
}
