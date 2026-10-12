import { DASH_PUNCTUATION } from "../../shared/house-style.ts";

/** Characters whose rewrite depends on what comes next, so they wait for more input. */
const UNSETTLED = /[\s\-‒-―*_#`]+$/;

/**
 * Streaming rewrite of model output into house style. The system prompt asks the
 * model to behave; this filter makes sure it does, even when a token boundary
 * splits "Satz – noch ein Satz" into "Satz –" and " noch ein Satz".
 */
export class HouseStyleFilter {
  #pending = "";
  /** Last character already emitted. Never whitespace except the initial line start. */
  #context = "\n";

  push(chunk: string): string {
    this.#pending += chunk;
    const unsettled = UNSETTLED.exec(this.#pending);
    return this.#emit(unsettled ? unsettled.index : this.#pending.length, false);
  }

  /** Call once at the end of the stream. Trailing whitespace is dropped. */
  flush(): string {
    return this.#emit(this.#pending.length, true).trimEnd();
  }

  #emit(cut: number, isEnd: boolean): string {
    if (cut === 0) return "";
    const segment = this.#pending.slice(0, cut);
    this.#pending = this.#pending.slice(cut);
    const rewritten = rewriteHouseStyle(segment, { context: this.#context, isEnd });
    this.#context = rewritten.at(-1) ?? this.#context;
    return rewritten;
  }
}

interface RewriteOptions {
  /** The character before `text`; "\n" means `text` starts a line. */
  context?: string;
  /** Whether `text` ends the answer (a trailing dash is then dropped). */
  isEnd?: boolean;
}

export function rewriteHouseStyle(text: string, options: RewriteOptions = {}): string {
  const { context = "\n", isEnd = true } = options;
  const rewritten = (context + text)
    .replace(/ß/g, "ss")
    .replace(/\*\*|__|`/g, "")
    .replace(/(^|\n)[ \t]*#{1,6}[ \t]+/g, "$1")
    .replace(DASH_PUNCTUATION, (match: string, offset: number, whole: string) => {
      const prev = whole[offset - 1] ?? "\n";
      const next = whole[offset + match.length];
      if (prev === "\n") return `${/^[ \t]*/.exec(match)?.[0] ?? ""}* `;
      if (/\d/.test(prev) && next !== undefined && /\d/.test(next)) return " bis ";
      if (next === "\n" || (next === undefined && isEnd)) return "";
      if (/[,;:.!?(]/.test(prev)) return " ";
      return ", ";
    });
  return rewritten.slice(context.length);
}
