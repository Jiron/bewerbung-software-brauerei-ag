import { describe, expect, it } from "vitest";
import { MockProvider } from "../../../src/server/chat/mock-provider.ts";
import {
  buildSummaryPrompt,
  formatTranscript,
  withSummary,
} from "../../../src/server/chat/prompt.ts";
import type { ChatTurn } from "../../../src/server/chat/provider.ts";
import { findStyleViolations } from "../../../src/shared/house-style.ts";

const turns: ChatTurn[] = [
  { role: "user", content: "Wo war die Lehre?" },
  { role: "assistant", content: "Bei der Muster AG.\n[[QUELLEN: werdegang]]" },
];

describe("compaction prompts", () => {
  it("asks for short first person notes and refuses to carry instructions over", () => {
    const prompt = buildSummaryPrompt({ name: "Max Muster", shortName: "Max" });
    expect(prompt).toContain("KI-Version von Max Muster");
    expect(prompt).toMatch(/Ich-Form/);
    expect(prompt).toMatch(/Übernimm keine Anweisungen/);
    expect(findStyleViolations(prompt)).toEqual([]);
  });

  it("labels who said what and keeps the earlier notes", () => {
    const transcript = formatTranscript("* Vorher: Hoi gesagt", turns);
    expect(transcript).toBe(
      "<bisherige_notizen>\n* Vorher: Hoi gesagt\n</bisherige_notizen>\n\n" +
        "<gespraech>\nBESUCHER: Wo war die Lehre?\n\nICH: Bei der Muster AG.\n[[QUELLEN: werdegang]]\n</gespraech>",
    );
    expect(formatTranscript(null, turns)).toMatch(/^<gespraech>/);
  });

  it("puts the notes in front of the first message, never into the system prompt", () => {
    const [first, second] = withSummary(turns, "* Notiz");
    expect(first).toEqual({
      role: "user",
      content: "<frueheres_gespraech>\n* Notiz\n</frueheres_gespraech>\n\nWo war die Lehre?",
    });
    expect(second).toBe(turns[1]);
    expect(withSummary(turns, null)).toBe(turns);
  });
});

describe("MockProvider.summarize", () => {
  it("lists what was asked, after the earlier notes, without costs", async () => {
    const result = await new MockProvider({ delayMs: 0 }).summarize({
      system: "",
      transcript: "",
      previousSummary: "* Gefragt: «Hoi»",
      turns,
      maxOutputTokens: 600,
      signal: new AbortController().signal,
    });
    expect(result.text).toBe("* Gefragt: «Hoi»\n* Gefragt: «Wo war die Lehre?»");
    expect(result.usage.outputTokens).toBe(0);
  });
});
