import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConversationStore } from "../../../src/server/chat/conversations.ts";
import { ConfigError, loadConfig } from "../../../src/server/config.ts";

const root = path.resolve(import.meta.dirname, "../../..");
/** A working directory without a real ./knowledge folder, like a fresh clone. */
const freshClone = path.join(root, "tests");

describe("loadConfig", () => {
  it("runs in mock mode on the example knowledge with no env at all", () => {
    const config = loadConfig({}, freshClone);
    expect(config.anthropicApiKey).toBeNull();
    expect(config.model).toBe("claude-haiku-5-5");
    expect(config.usingExampleKnowledge).toBe(true);
    expect(config.knowledgeDir).toBe(path.join(freshClone, "knowledge.example"));
    expect(config.sessionSecretIsEphemeral).toBe(true);
    expect(config.dailySpendCapUsd).toBe(1);
  });

  it("fails loudly on a mistyped knowledge directory", () => {
    expect(() => loadConfig({ KNOWLEDGE_DIR: "./does-not-exist" }, root)).toThrow(ConfigError);
  });

  it.each([
    [{ PORT: "abc" }],
    [{ RATE_LIMIT_PER_MINUTE: "0" }],
    [{ SESSION_SECRET: "too-short" }],
    [{ ACCESS_CODE_HASH: "plaintext-code" }],
    [{ ANTHROPIC_EFFORT: "max" }],
    [{ TRUST_PROXY: "vielleicht" }],
    [{ REQUIRE_ACCESS_CODE: "true" }],
  ])("rejects invalid values %j", (env) => {
    expect(() => loadConfig(env, root)).toThrow(ConfigError);
  });
});

describe("ConversationStore", () => {
  it("keeps whole question and answer pairs within the limit", () => {
    const store = new ConversationStore({ maxTurns: 4 });
    for (let i = 1; i <= 3; i++) store.append("c", `Frage ${i}`, `Antwort ${i}`);
    expect(store.history("c", "Frage 4").map((turn) => turn.content)).toEqual([
      "Frage 2",
      "Antwort 2",
      "Frage 3",
      "Antwort 3",
      "Frage 4",
    ]);
  });

  it("forgets old and surplus conversations", () => {
    let now = 0;
    const store = new ConversationStore({ maxConversations: 2, ttlMs: 1_000, now: () => now });
    store.append("a", "q", "a");
    store.append("b", "q", "a");
    store.append("c", "q", "a");
    expect(store.history("a", "x")).toHaveLength(1);
    expect(store.history("c", "x")).toHaveLength(3);
    now = 5_000;
    expect(store.history("c", "x")).toHaveLength(1);
  });
});
