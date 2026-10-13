import { describe, expect, it } from "vitest";
import { JokeDeck } from "../../../src/client/features/flachwitz.ts";
import { findSections } from "../../../src/client/features/knowledge-view.ts";
import { FLACHWITZE, type Joke } from "../../../src/client/jokes.ts";
import type { SectionSummary } from "../../../src/shared/api.ts";

const section = (id: string): SectionSummary => ({
  id,
  title: id,
  fileTitle: id,
  tier: "public",
  chars: 10,
});

describe("findSections", () => {
  // A file with text before its first heading gets an intro section named like the file.
  const sections = ["projekte", "projekte/musterwetter", "projekte/jarvis", "werdegang/lehre"].map(
    section,
  );
  const ids = (found: SectionSummary[]) => found.map((s) => s.id);

  it("selects a whole file by its name, intro included", () => {
    expect(ids(findSections(sections, "projekte"))).toEqual([
      "projekte",
      "projekte/musterwetter",
      "projekte/jarvis",
    ]);
  });

  it("selects one section by its full id", () => {
    expect(ids(findSections(sections, "werdegang/lehre"))).toEqual(["werdegang/lehre"]);
  });

  it("selects only the cited section for a source button", () => {
    expect(ids(findSections(sections, "projekte", { exact: true }))).toEqual(["projekte"]);
  });

  it("does not mistake a prefix for a file", () => {
    expect(findSections(sections, "projekt")).toEqual([]);
  });
});

describe("JokeDeck", () => {
  /** Deterministic randomness, so the shuffle is the same on every run. */
  function seeded(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 16807) % 2147483647;
      return state / 2147483647;
    };
  }

  it("tells every joke once before repeating any", () => {
    const deck = new JokeDeck(FLACHWITZE, seeded(7));
    const round = new Set(FLACHWITZE.map(() => deck.draw()));
    expect(round.size).toBe(FLACHWITZE.length);
  });

  it("never tells the same joke twice in a row, not even between rounds", () => {
    const jokes: Joke[] = [
      ["A?", "a."],
      ["B?", "b."],
      ["C?", "c."],
    ];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const deck = new JokeDeck(jokes, seeded(seed));
      let previous: Joke | null = null;
      for (let i = 0; i < 30; i++) {
        const joke = deck.draw();
        expect(joke).not.toBe(previous);
        previous = joke;
      }
    }
  });

  it("has plenty of jokes, each with a setup and a punchline", () => {
    expect(FLACHWITZE.length).toBeGreaterThanOrEqual(50);
    for (const [setup, punchline] of FLACHWITZE) {
      expect(setup.trim()).not.toBe("");
      expect(punchline.trim()).not.toBe("");
    }
    expect(new Set(FLACHWITZE.map(([setup]) => setup)).size).toBe(FLACHWITZE.length);
  });
});
