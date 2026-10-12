import { BOOT } from "../copy.ts";
import type { Screen } from "./screen.ts";

export interface BootOptions {
  screen: Screen;
  /** The border element, which shows tape-loader stripes while "loading". */
  frame: HTMLElement;
  /** 1 is the full show; smaller is faster (returning visitors). */
  speed: number;
  /** Skip all animation and print the end state at once. */
  instant: boolean;
}

const BAR_WIDTH = 16;

/**
 * Power on, LOAD "MANASSES",8,1, loading, RUN. Skippable at any point: skip()
 * does not cancel anything, it just makes every remaining pause zero, so the
 * screen always ends up in the same state.
 */
export class BootSequence {
  readonly #options: BootOptions;
  #skipped: boolean;
  #wake: (() => void) | null = null;

  constructor(options: BootOptions) {
    this.#options = options;
    this.#skipped = options.instant;
  }

  get skipped(): boolean {
    return this.#skipped;
  }

  skip(): void {
    this.#skipped = true;
    this.#wake?.();
  }

  async run(): Promise<void> {
    const { screen, frame } = this.#options;
    screen.clear();
    frame.classList.add("is-powering-on");
    await this.#pause(500);
    frame.classList.remove("is-powering-on");

    screen.line("");
    screen.line(BOOT.banner, "title", { fit: true });
    screen.line("");
    screen.line(BOOT.ram, "default", { fit: true });
    screen.line("");
    screen.line(BOOT.ready);
    await this.#pause(700);
    await this.#type(BOOT.load);
    await this.#pause(350);
    screen.line("");
    screen.line(BOOT.searching);
    await this.#pause(900);
    screen.line(BOOT.loading);
    await this.#loadingBar(screen.line("", "beer"));
    screen.line(BOOT.ready);
    await this.#pause(400);
    await this.#type(BOOT.run);
    await this.#pause(400);
  }

  async #type(text: string): Promise<void> {
    const line = this.#options.screen.line("", "input");
    for (const char of text) {
      line.textContent += char;
      // Humans do not type at a constant rate, and neither did the C64 demo guy.
      await this.#pause(55 + Math.random() * 70);
    }
  }

  async #loadingBar(line: HTMLElement): Promise<void> {
    const { frame } = this.#options;
    frame.classList.add("is-loading");
    for (let step = 0; step <= BAR_WIDTH; step++) {
      const percent = Math.round((step / BAR_WIDTH) * 100);
      line.textContent = `${"█".repeat(step)}${"▒".repeat(BAR_WIDTH - step)} ${percent}%`;
      await this.#pause(110);
    }
    frame.classList.remove("is-loading");
  }

  #pause(ms: number): Promise<void> {
    if (this.#skipped) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = window.setTimeout(resolve, ms * this.#options.speed);
      this.#wake = () => {
        window.clearTimeout(timer);
        resolve();
      };
    });
  }
}
