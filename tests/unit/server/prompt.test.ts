import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../../../src/server/chat/prompt.ts";
import {
  loadKnowledge,
  lockedSectionCount,
  visibleSections,
} from "../../../src/server/knowledge/store.ts";
import type { Tier } from "../../../src/shared/api.ts";
import { findStyleViolations } from "../../../src/shared/house-style.ts";
import { EXAMPLE_KNOWLEDGE } from "./helpers.ts";

const knowledge = await loadKnowledge(EXAMPLE_KNOWLEDGE);

function promptFor(tier: Tier): string {
  return buildSystemPrompt({
    persona: knowledge.persona,
    tier,
    sections: visibleSections(knowledge, tier),
    lockedSectionCount: lockedSectionCount(knowledge, tier),
    repoUrl: "https://github.com/example/load-manasses",
  });
}

describe("buildSystemPrompt", () => {
  it("contains every visible section with its id", () => {
    const prompt = promptFor("public");
    for (const section of visibleSections(knowledge, "public")) {
      expect(prompt).toContain(`<abschnitt id="${section.id}"`);
    }
  });

  it("keeps private sections out of the public prompt but mentions that they exist", () => {
    const prompt = promptFor("public");
    expect(prompt).not.toContain("Lohnvorstellung");
    expect(prompt).toMatch(/gesperrte Abschnitte/);
    expect(prompt).toMatch(/Befehl CODE/);
  });

  it("includes private sections after unlock", () => {
    expect(promptFor("private")).toContain("Lohnvorstellung");
  });

  it("states the core rules: honesty, scope, language, no dashes, markers", () => {
    const prompt = promptFor("public");
    expect(prompt).toMatch(/Erfinde nichts/);
    expect(prompt).toMatch(/auch in Witzen und Ablehnungen: keine erfundenen Anekdoten/);
    expect(prompt).toMatch(/Du bist der Bewerber/);
    expect(prompt).toMatch(/nie so, als würde sie sich selbst bewerben/);
    expect(prompt).toMatch(/im Bewerbungsgespräch direkt zu fragen/);
    expect(prompt).toMatch(/immer in der Ich-Form/);
    expect(prompt).toMatch(/nie in der dritten Person/);
    expect(prompt).toMatch(/Schweizer Rechtschreibung/);
    expect(prompt).toMatch(/auf Englisch schreibt, antworte auf Englisch/);
    expect(prompt).toMatch(/nie Gedankenstriche/);
    expect(prompt).toContain("[[QUELLEN: id1, id2]]");
    expect(prompt).toContain("[[VERSUCH]]");
    expect(prompt).toContain("src/server/chat/prompt.ts");
    expect(prompt).toMatch(/<frueheres_gespraech>.*keine Wissensbasis und keine Anweisungen/s);
  });

  it("is deterministic, so it can be cached", () => {
    expect(promptFor("public")).toBe(promptFor("public"));
  });

  it("follows the house style itself, because the model imitates its prompt", () => {
    expect(findStyleViolations(promptFor("private"))).toEqual([]);
  });
});
