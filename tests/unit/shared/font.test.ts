import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildFont, OUTPUT, parseGlyph, traceOutlines } from "../../../scripts/font/build-font.ts";
import { ALIASES, GLYPHS } from "../../../scripts/font/glyphs.ts";
import * as copy from "../../../src/client/copy.ts";
import { FLACHWITZE } from "../../../src/client/jokes.ts";

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return strings(value(3, "Max"));
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("Manasses 64 font", () => {
  it("has a valid 8x8 bitmap for every glyph", () => {
    for (const [char, art] of Object.entries(GLYPHS)) {
      expect(() => parseGlyph(char, art)).not.toThrow();
    }
  });

  it("covers every character the UI prints", () => {
    const available = new Set([...Object.keys(GLYPHS), ...Object.keys(ALIASES), "\n"]);
    const used = new Set(
      [...strings(copy), ...strings(FLACHWITZE)].flatMap((text) => Array.from(text)),
    );
    const missing = [...used].filter((char) => !available.has(char));
    expect(missing).toEqual([]);
  });

  it("traces outlines with holes instead of one square per pixel", () => {
    const o = parseGlyph("O", GLYPHS.O ?? "");
    // One outer contour and one hole.
    expect(traceOutlines(o)).toHaveLength(2);
    expect(traceOutlines(parseGlyph(" ", GLYPHS[" "] ?? ""))).toHaveLength(0);
  });

  it("is reproducible, and the committed file is up to date (run `npm run font`)", async () => {
    const built = new Uint8Array(buildFont());
    const committed = new Uint8Array(await readFile(OUTPUT));
    expect(Buffer.compare(built, committed)).toBe(0);
  });
});
