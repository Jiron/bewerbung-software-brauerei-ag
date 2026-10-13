import type { Joke } from "../jokes.ts";
import type { Screen } from "../terminal/screen.ts";

/** Timing is everything, even for bad jokes. */
const PAUSE_MS = 1600;

/**
 * A shuffled deck: every joke comes once, in random order, before any of
 * them repeats. A new round never starts with the joke that ended the last.
 */
export class JokeDeck {
  readonly #jokes: readonly Joke[];
  readonly #random: () => number;
  #deck: Joke[] = [];
  #last: Joke | null = null;

  constructor(jokes: readonly Joke[], random: () => number = Math.random) {
    this.#jokes = jokes;
    this.#random = random;
  }

  draw(): Joke {
    if (this.#deck.length === 0) this.#shuffle();
    const joke = this.#deck.pop() as Joke;
    this.#last = joke;
    return joke;
  }

  #shuffle(): void {
    const deck = [...this.#jokes];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(this.#random() * (i + 1));
      [deck[i], deck[j]] = [deck[j] as Joke, deck[i] as Joke];
    }
    // draw() takes from the end, so that is where the repeat would happen.
    if (deck.length > 1 && deck.at(-1) === this.#last) {
      [deck[0], deck[deck.length - 1]] = [deck.at(-1) as Joke, deck[0] as Joke];
    }
    this.#deck = deck;
  }
}

/** FLACHWITZ: the setup, a pause, the punchline. Any key or ESC skips the pause. */
export class JokeTeller {
  readonly #screen: Screen;
  readonly #instant: boolean;
  #wake: (() => void) | null = null;

  constructor(screen: Screen, options: { instant: boolean }) {
    this.#screen = screen;
    this.#instant = options.instant;
  }

  abort(): void {
    this.#wake?.();
  }

  fastForward(): void {
    this.#wake?.();
  }

  async tell([setup, punchline]: Joke): Promise<void> {
    this.#screen.line(setup);
    if (!this.#instant) await this.#pause(PAUSE_MS);
    this.#screen.line(punchline, "beer");
    this.#screen.announce(`${setup} ${punchline}`);
  }

  #pause(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = window.setTimeout(resolve, ms);
      this.#wake = () => {
        window.clearTimeout(timer);
        resolve();
      };
    });
  }
}
