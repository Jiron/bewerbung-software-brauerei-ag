import { describe, expect, it } from "vitest";
import { MarkerExtractor } from "../../../src/server/chat/markers.ts";

function run(chunks: string[]) {
  const extractor = new MarkerExtractor();
  let visible = "";
  for (const chunk of chunks) visible += extractor.push(chunk);
  visible += extractor.flush();
  return { visible, ...extractor.markers };
}

describe("MarkerExtractor", () => {
  const answer = "Ich habe eine Lehre gemacht.\n\n[[QUELLEN: werdegang/lehre, skills]]";

  it("removes the sources marker and collects its ids", () => {
    const result = run([answer]);
    expect(result.visible).toBe("Ich habe eine Lehre gemacht.\n\n");
    expect(result.sourceIds).toEqual(["werdegang/lehre", "skills"]);
    expect(result.attempt).toBe(false);
  });

  it("handles markers split at every possible chunk boundary", () => {
    const text = "Netter Versuch.\n[[VERSUCH]]\n[[QUELLEN: profil]]";
    for (let i = 0; i <= text.length; i++) {
      for (let j = i; j <= text.length; j += 7) {
        const result = run([text.slice(0, i), text.slice(i, j), text.slice(j)]);
        expect(result.visible).toBe("Netter Versuch.\n\n");
        expect(result.sourceIds).toEqual(["profil"]);
        expect(result.attempt).toBe(true);
      }
    }
  });

  it("streams character by character", () => {
    const result = run([...answer]);
    expect(result.visible).toBe("Ich habe eine Lehre gemacht.\n\n");
    expect(result.sourceIds).toEqual(["werdegang/lehre", "skills"]);
  });

  it("treats 'keine' as no sources", () => {
    expect(run(["Weiss ich nicht. [[QUELLEN: keine]]"]).sourceIds).toEqual([]);
  });

  it("accepts the English marker names", () => {
    const result = run(["Nope. [[ATTEMPT]] [[SOURCES: profil]]"]);
    expect(result).toMatchObject({ attempt: true, sourceIds: ["profil"] });
  });

  it("leaves ordinary double brackets visible", () => {
    const result = run(["Array: [[1, 2], [3]] und [[Hallo]]"]);
    expect(result.visible).toBe("Array: [[1, 2], [3]] und [[Hallo]]");
    expect(result.sourceIds).toEqual([]);
  });

  it("releases an unterminated marker-like text at the end", () => {
    expect(run(["Kaputt [[QUELLEN: profil"]).visible).toBe("Kaputt [[QUELLEN: profil");
  });

  it("does not hold back text forever when a bracket never closes", () => {
    const extractor = new MarkerExtractor();
    const visible = extractor.push(`[[QUELLEN ${"x".repeat(500)}`);
    expect(visible.length).toBeGreaterThan(400);
  });
});
