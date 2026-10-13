/** Where the text goes. A DOM Text node fits; tests use a plain object. */
export interface TextSink {
  readonly data: string;
  appendData(text: string): void;
}

export interface TypewriterOptions {
  /** Average pace. The writer speeds up when the model streams faster than it prints. */
  wordsPerSecond: number;
  /** When true, text appears immediately (reduced motion, or the visitor got impatient). */
  instant: () => boolean;
  /** Called after every write, e.g. to keep the screen scrolled to the bottom. */
  onWrite?: () => void;
  /** Injected for tests. */
  requestFrame?: (callback: (time: number) => void) => number;
  now?: () => number;
  random?: () => number;
}

/** Extra wait after a sentence, as if the machine had to think. */
const SENTENCE_PAUSE_MS = 140;
/** Every this many words of backlog add one word to each burst. */
const CATCH_UP_WORDS = 10;

/**
 * Prints streamed text in bursts of a few whole words with uneven pauses, like
 * a 300 baud line. Smooth letter by letter typing is what every chat UI does;
 * this should feel like 1985.
 *
 * A word the model is still streaming is held back until it is complete. When
 * the backlog grows, bursts get bigger, so a long answer never takes longer to
 * appear than to read.
 */
export class Typewriter {
  readonly #target: TextSink;
  readonly #options: Required<Omit<TypewriterOptions, "onWrite">> &
    Pick<TypewriterOptions, "onWrite">;
  #queue = "";
  #ended = false;
  #running = false;
  #nextBurst = 0;
  readonly #done = Promise.withResolvers<void>();

  constructor(target: TextSink, options: TypewriterOptions) {
    this.#target = target;
    this.#options = {
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      now: () => performance.now(),
      random: Math.random,
      ...options,
    };
  }

  get text(): string {
    return this.#target.data + this.#queue;
  }

  push(text: string): void {
    this.#queue += text;
    this.#schedule();
  }

  /** No more text will come. Resolves once everything is on screen. */
  end(): Promise<void> {
    this.#ended = true;
    this.#schedule();
    return this.#done.promise;
  }

  /** Writes the whole backlog at once. */
  flush(): void {
    this.#write(this.#queue);
    this.#settle();
  }

  #schedule(): void {
    if (this.#options.instant()) {
      this.flush();
      return;
    }
    if (this.#running) return;
    this.#running = true;
    this.#options.requestFrame((time) => this.#tick(time));
  }

  #tick(time: number): void {
    if (this.#options.instant()) {
      this.#running = false;
      this.flush();
      return;
    }
    if (time >= this.#nextBurst) {
      const { random, wordsPerSecond } = this.#options;
      const words = 1 + Math.floor(random() * 3);
      const catchUp = Math.floor(countWords(this.#queue) / CATCH_UP_WORDS);
      const burst = this.#takeWords(words + catchUp);
      if (!burst) {
        // Only half a word so far. push() or end() wakes the writer again.
        this.#running = false;
        this.#settle();
        return;
      }
      this.#write(burst);
      // The pause only counts the base words: catch-up words come for free.
      const pause = (words / wordsPerSecond) * 1000 * (0.5 + random());
      const sentenceEnd = /[.!?:]\s*$/.test(burst) ? SENTENCE_PAUSE_MS : 0;
      this.#nextBurst = time + pause + sentenceEnd;
    }

    if (this.#queue.length > 0) {
      this.#options.requestFrame((next) => this.#tick(next));
      return;
    }
    this.#running = false;
    this.#settle();
  }

  /** Up to `count` complete words, with the whitespace that follows them. */
  #takeWords(count: number): string {
    // While the stream runs, a word is only complete once whitespace follows it.
    const word = this.#ended ? /^\s*\S+\s*/ : /^\s*\S+\s+/;
    let taken = "";
    let rest = this.#queue;
    for (let i = 0; i < count; i++) {
      const match = word.exec(rest);
      if (!match) break;
      taken += match[0];
      rest = rest.slice(match[0].length);
    }
    // Trailing whitespace at the very end.
    if (this.#ended && !taken) taken = rest;
    return taken;
  }

  #write(text: string): void {
    if (!text) return;
    this.#target.appendData(text);
    this.#queue = this.#queue.slice(text.length);
    this.#options.onWrite?.();
  }

  #settle(): void {
    if (this.#ended && this.#queue.length === 0) this.#done.resolve();
  }
}

function countWords(text: string): number {
  return text.match(/\S+/g)?.length ?? 0;
}
