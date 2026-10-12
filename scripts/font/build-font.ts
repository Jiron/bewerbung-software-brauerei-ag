/**
 * Compiles the bitmap glyphs in glyphs.ts into an OpenType font.
 *
 *   npm run font
 *
 * Each glyph is traced into clean outlines (one polygon per connected shape,
 * holes included) instead of one square per pixel, so browsers render it
 * without hairline seams at any size.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import opentype, { type Path } from "opentype.js";
import { ALIASES, GLYPHS } from "./glyphs.ts";

const PIXEL = 128;
const SIZE = 8;
const UNITS_PER_EM = PIXEL * SIZE;
export const OUTPUT = path.resolve(import.meta.dirname, "../../src/client/fonts/manasses64.otf");

type Point = readonly [number, number];
export type Bitmap = boolean[][];

export function parseGlyph(char: string, art: string): Bitmap {
  const rows = art
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (rows.length !== SIZE || rows.some((row) => !/^[.#]{8}$/.test(row))) {
    throw new Error(`Glyph ${JSON.stringify(char)} must be 8 rows of 8 "." or "#".`);
  }
  return rows.map((row) => [...row].map((pixel) => pixel === "#"));
}

/**
 * Walks the border of every lit pixel with the lit side on the left. Edges
 * between two lit pixels cancel out, what remains links up into closed loops:
 * outer shapes counter-clockwise, holes clockwise.
 */
export function traceOutlines(bitmap: Bitmap): Point[][] {
  const lit = (col: number, row: number) => bitmap[row]?.[col] === true;
  const edges = new Map<string, Point[]>();
  const add = (from: Point, to: Point) => {
    const key = from.join(",");
    edges.set(key, [...(edges.get(key) ?? []), to]);
  };

  bitmap.forEach((pixels, row) => {
    pixels.forEach((on, col) => {
      if (!on) return;
      // y grows upwards; the baseline is the bottom of row 6.
      const left = col;
      const right = col + 1;
      const top = SIZE - 1 - row;
      const bottom = SIZE - 2 - row;
      if (!lit(col, row + 1)) add([left, bottom], [right, bottom]);
      if (!lit(col + 1, row)) add([right, bottom], [right, top]);
      if (!lit(col, row - 1)) add([right, top], [left, top]);
      if (!lit(col - 1, row)) add([left, top], [left, bottom]);
    });
  });

  const loops: Point[][] = [];
  for (const [startKey] of edges) {
    while (edges.get(startKey)?.length) {
      const start = startKey.split(",").map(Number) as [number, number];
      const loop: Point[] = [start];
      let current = start;
      for (;;) {
        const key = current.join(",");
        const next = edges.get(key)?.shift();
        if (!next) throw new Error("Open outline: this should be impossible for a pixel grid.");
        if (next[0] === start[0] && next[1] === start[1]) break;
        loop.push(next);
        current = next as [number, number];
      }
      loops.push(dropCollinear(loop));
    }
  }
  return loops;
}

function dropCollinear(loop: Point[]): Point[] {
  return loop.filter((point, i) => {
    const prev = loop.at(i - 1) ?? point;
    const next = loop[(i + 1) % loop.length] ?? point;
    const sameColumn = prev[0] === point[0] && point[0] === next[0];
    const sameRow = prev[1] === point[1] && point[1] === next[1];
    return !sameColumn && !sameRow;
  });
}

function toPath(loops: Point[][]): Path {
  const outline = new opentype.Path();
  for (const loop of loops) {
    loop.forEach(([x, y], i) => {
      if (i === 0) outline.moveTo(x * PIXEL, y * PIXEL);
      else outline.lineTo(x * PIXEL, y * PIXEL);
    });
    outline.close();
  }
  return outline;
}

function glyphName(char: string): string {
  return `uni${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;
}

export function buildFont(): ArrayBuffer {
  const notdef = new opentype.Glyph({
    name: ".notdef",
    advanceWidth: UNITS_PER_EM,
    path: toPath(traceOutlines(parseGlyph(".notdef", NOTDEF))),
  });

  const entries: [string, string][] = [
    ...Object.entries(GLYPHS),
    ...Object.entries(ALIASES).map(([alias, target]): [string, string] => {
      const art = GLYPHS[target];
      if (!art) throw new Error(`Alias ${JSON.stringify(alias)} points to a missing glyph.`);
      return [alias, art];
    }),
  ];

  const glyphs = entries.map(
    ([char, art]) =>
      new opentype.Glyph({
        name: glyphName(char),
        unicode: char.codePointAt(0),
        advanceWidth: UNITS_PER_EM,
        path: toPath(traceOutlines(parseGlyph(char, art))),
      }),
  );

  const font = new opentype.Font({
    familyName: "Manasses 64",
    styleName: "Regular",
    unitsPerEm: UNITS_PER_EM,
    ascender: (SIZE - 1) * PIXEL,
    descender: -PIXEL,
    designer: "LOAD MANASSES contributors",
    description: "8x8 pixel font in the style of the Commodore 64, drawn from scratch.",
    license: "MIT",
    version: "1.0",
    createdTimestamp: FIXED_TIMESTAMP,
    glyphs: [notdef, ...glyphs],
  });
  return withFixedClock(() => font.toArrayBuffer());
}

/** 2026-10-12. Fixed so the build is reproducible and the font only changes with its glyphs. */
const FIXED_TIMESTAMP = 1_791_763_200;

/**
 * opentype.js stamps the "modified" date with `new Date()` and has no option
 * for it, so the clock is pinned while the font is serialized.
 */
function withFixedClock<T>(build: () => T): T {
  const RealDate = Date;
  globalThis.Date = new Proxy(RealDate, {
    construct: (target, args) =>
      args.length > 0 ? Reflect.construct(target, args) : new target(FIXED_TIMESTAMP * 1000),
  });
  try {
    return build();
  } finally {
    globalThis.Date = RealDate;
  }
}

const NOTDEF = `
  ########
  #......#
  #......#
  #......#
  #......#
  #......#
  ########
  ........`;

if (import.meta.main) {
  const buffer = buildFont();
  await writeFile(OUTPUT, new Uint8Array(buffer));
  console.log(`Wrote ${path.relative(process.cwd(), OUTPUT)} (${buffer.byteLength} bytes).`);
}
