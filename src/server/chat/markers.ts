/**
 * The model ends every answer with machine-readable markers:
 *
 *   [[VERSUCH]]                     (only for manipulation attempts)
 *   [[QUELLEN: werdegang/lehre, skills]]
 *
 * This extractor removes them from the visible stream and collects their
 * content. Markers can be split across stream chunks, so a possible marker
 * start is held back until it is either complete or clearly ordinary text.
 */

const MARKER = /^\[\[\s*(QUELLEN|SOURCES|VERSUCH|ATTEMPT)\s*(?::\s*([^\]]*))?\]\]$/i;
const MARKER_HEADS = ["QUELLEN", "SOURCES", "VERSUCH", "ATTEMPT"];
const MAX_MARKER_LENGTH = 400;

export interface AnswerMarkers {
  sourceIds: string[];
  attempt: boolean;
}

export class MarkerExtractor {
  #pending = "";
  #sourceIds: string[] = [];
  #attempt = false;

  /** Returns the part of `chunk` that is safe to show. */
  push(chunk: string): string {
    this.#pending += chunk;
    let visible = "";

    while (this.#pending) {
      const start = this.#pending.indexOf("[[");
      if (start === -1) {
        // A single trailing "[" might become "[[" with the next chunk.
        const keep = this.#pending.endsWith("[") ? 1 : 0;
        visible += this.#pending.slice(0, this.#pending.length - keep);
        this.#pending = this.#pending.slice(this.#pending.length - keep);
        break;
      }

      visible += this.#pending.slice(0, start);
      this.#pending = this.#pending.slice(start);
      const end = this.#pending.indexOf("]]");

      if (end === -1) {
        if (this.#couldStillBeMarker()) break;
        visible += "[[";
        this.#pending = this.#pending.slice(2);
        continue;
      }

      const candidate = this.#pending.slice(0, end + 2);
      this.#pending = this.#pending.slice(end + 2);
      if (!this.#consume(candidate)) visible += candidate;
    }

    return visible;
  }

  /** Ends the stream. Returns any held-back text that turned out not to be a marker. */
  flush(): string {
    const rest = this.#pending;
    this.#pending = "";
    return rest;
  }

  get markers(): AnswerMarkers {
    return { sourceIds: [...this.#sourceIds], attempt: this.#attempt };
  }

  #couldStillBeMarker(): boolean {
    if (this.#pending.length > MAX_MARKER_LENGTH) return false;
    // "[[QUE" or "[[QUELLEN: werdeg" may still complete; "[[Hallo" never will.
    const head = this.#pending.slice(2).trimStart().toUpperCase();
    return MARKER_HEADS.some((name) => name.startsWith(head.slice(0, name.length)));
  }

  #consume(candidate: string): boolean {
    const match = MARKER.exec(candidate);
    if (!match) return false;
    const kind = match[1]?.toUpperCase();
    if (kind === "VERSUCH" || kind === "ATTEMPT") {
      this.#attempt = true;
    } else {
      const ids = (match[2] ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id && !/^(keine|none|-)$/i.test(id));
      for (const id of ids) if (!this.#sourceIds.includes(id)) this.#sourceIds.push(id);
    }
    return true;
  }
}
