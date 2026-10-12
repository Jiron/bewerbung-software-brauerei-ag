/** Where the text goes. A DOM Text node fits; tests use a plain object. */
export interface TextSink {
  readonly data: string;
  appendData(text: string): void;
}

export interface TypewriterOptions {
  /** Base speed. The writer speeds up when the model streams faster than it types. */
  charsPerSecond: number;
  /** When true, text appears immediately (reduced motion, or the visitor got impatient). */
  instant: () => boolean;
  /** Called after every write, e.g. to keep the screen scrolled to the bottom. */
  onWrite?: () => void;
  /** Injected for tests. */
  requestFrame?: (callback: (time: number) => void) => number;
  now?: () => number;
}

/**
 * Types streamed text into a DOM node at C64-ish speed.
 *
 * The model delivers text in bursts; the writer smooths that into an even flow
 * and catches up when the backlog grows, so a long answer never takes longer
 * to type than to read.
 */
export class Typewriter {
  readonly #target: TextSink;
  readonly #options: Required<Omit<TypewriterOptions, "onWrite">> &
    Pick<TypewriterOptions, "onWrite">;
  #queue = "";
  #ended = false;
  #running = false;
  #lastFrame = 0;
  #carry = 0;
  readonly #done = Promise.withResolvers<void>();

  constructor(target: TextSink, options: TypewriterOptions) {
    this.#target = target;
    this.#options = {
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      now: () => performance.now(),
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
    this.#write(this.#queue.length);
    this.#settle();
  }

  #schedule(): void {
    if (this.#options.instant()) {
      this.flush();
      return;
    }
    if (this.#running) return;
    this.#running = true;
    this.#lastFrame = this.#options.now();
    this.#options.requestFrame((time) => this.#tick(time));
  }

  #tick(time: number): void {
    if (this.#options.instant()) {
      this.#running = false;
      this.flush();
      return;
    }
    const elapsed = Math.max(0, time - this.#lastFrame) / 1000;
    this.#lastFrame = time;
    // Catch up: every 40 characters of backlog add the base speed again.
    const speed = this.#options.charsPerSecond * (1 + this.#queue.length / 40);
    this.#carry += elapsed * speed;
    const count = Math.floor(this.#carry);
    this.#carry -= count;
    this.#write(count);

    if (this.#queue.length > 0) {
      this.#options.requestFrame((next) => this.#tick(next));
      return;
    }
    this.#running = false;
    this.#settle();
  }

  #write(count: number): void {
    if (count <= 0 || !this.#queue) return;
    // Never split a surrogate pair.
    const chars = Array.from(this.#queue.slice(0, count + 1))
      .slice(0, count)
      .join("");
    this.#target.appendData(chars);
    this.#queue = this.#queue.slice(chars.length);
    this.#options.onWrite?.();
  }

  #settle(): void {
    if (this.#ended && this.#queue.length === 0) this.#done.resolve();
  }
}
