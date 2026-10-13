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
  it("keeps whole question and answer pairs within the hard limit", () => {
    const store = new ConversationStore({ maxTurns: 4 });
    for (let i = 1; i <= 3; i++) store.append("c", `Frage ${i}`, `Antwort ${i}`);
    expect(store.history("c", "Frage 4").turns.map((turn) => turn.content)).toEqual([
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
    expect(store.history("a", "x").turns).toHaveLength(1);
    expect(store.history("c", "x").turns).toHaveLength(3);
    now = 5_000;
    expect(store.history("c", "x").turns).toHaveLength(1);
  });

  it("asks for compaction once a conversation gets long, keeping the newest turns", () => {
    const store = new ConversationStore({ compactAfterTurns: 6, keepTurns: 2 });
    store.append("c", "Frage 1", "Antwort 1");
    store.append("c", "Frage 2", "Antwort 2");
    expect(store.compactionDue("c")).toBeNull();
    store.append("c", "Frage 3", "Antwort 3");
    const due = store.compactionDue("c");
    expect(due?.turns.map((turn) => turn.content)).toEqual([
      "Frage 1",
      "Antwort 1",
      "Frage 2",
      "Antwort 2",
    ]);

    store.compact("c", due?.turns ?? [], "* Notizen");
    expect(store.compactionDue("c")).toBeNull();
    const history = store.history("c", "Frage 4");
    expect(history.summary).toBe("* Notizen");
    expect(history.turns.map((turn) => turn.content)).toEqual(["Frage 3", "Antwort 3", "Frage 4"]);
  });

  it("also compacts long answers before the turn count is reached", () => {
    const store = new ConversationStore({ compactAfterChars: 100, keepTurns: 2 });
    store.append("c", "Frage 1", "x".repeat(80));
    store.append("c", "Frage 2", "y".repeat(80));
    expect(store.compactionDue("c")?.turns).toHaveLength(2);
  });

  it("drops a summary that no longer matches the history", () => {
    const store = new ConversationStore({ compactAfterTurns: 4, keepTurns: 2, maxTurns: 4 });
    store.append("c", "Frage 1", "Antwort 1");
    store.append("c", "Frage 2", "Antwort 2");
    const due = store.compactionDue("c");
    // A second tab asked in the meantime, and the hard limit pushed the oldest pair out.
    store.append("c", "Frage 3", "Antwort 3");
    store.compact("c", due?.turns ?? [], "* veraltet");
    expect(store.history("c", "x").summary).toBeNull();
  });
});
