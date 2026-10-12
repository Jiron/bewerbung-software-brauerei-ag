// opentype.js 2 ships without type definitions. This covers the part the font build uses.
declare module "opentype.js" {
  class Path {
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    close(): void;
  }

  class Glyph {
    constructor(options: { name: string; unicode?: number; advanceWidth: number; path: Path });
  }

  class Font {
    constructor(options: {
      familyName: string;
      styleName: string;
      unitsPerEm: number;
      ascender: number;
      descender: number;
      glyphs: Glyph[];
      designer?: string;
      description?: string;
      license?: string;
      version?: string;
      createdTimestamp?: number;
    });
    toArrayBuffer(): ArrayBuffer;
  }

  const opentype: { Path: typeof Path; Glyph: typeof Glyph; Font: typeof Font };
  export default opentype;
  export { Font, Glyph, Path };
}
