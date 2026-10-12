import { element } from "../lib/browser.ts";

/** Text colors on the blue screen, all at least WCAG AA against the background. */
export type Tone = "default" | "input" | "dim" | "error" | "beer" | "ok" | "title";

/**
 * The scrolling output area. Everything is plain text in a monospaced pixel
 * font, so a "line" is a block element with white-space: pre-wrap.
 *
 * Screen readers do not get every typed character: the output itself is not a
 * live region. Finished results are announced once through `announce()`.
 */
export class Screen {
  readonly #output: HTMLElement;
  readonly #scroller: HTMLElement;
  readonly #announcer: HTMLElement;
  #stickToBottom = true;

  constructor(output: HTMLElement, scroller: HTMLElement, announcer: HTMLElement) {
    this.#output = output;
    this.#scroller = scroller;
    this.#announcer = announcer;
    // Only follow new output while the visitor is at the bottom; reading older
    // answers should not be interrupted by the typewriter.
    scroller.addEventListener("scroll", () => {
      const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      this.#stickToBottom = distance < 48;
    });
  }

  /** Prints one line. `fit` shrinks it to fit the width (for the C64 banner on phones). */
  line(text = "", tone: Tone = "default", options: { fit?: boolean } = {}): HTMLElement {
    const fit = options.fit ? " line--fit" : "";
    const node = element("p", { className: `line tone-${tone}${fit}`, text });
    return this.append(node);
  }

  /** A C64 error code followed by a human explanation. */
  error(code: string, text?: string): void {
    this.line(code, "error");
    if (text) this.line(text);
    this.announce(text ? `${code}. ${text}` : code);
  }

  ready(): void {
    this.line("READY.");
  }

  /** An empty block to fill later, e.g. by the typewriter. */
  block(className: string, tone: Tone = "default"): HTMLElement {
    return this.append(element("div", { className: `line ${className} tone-${tone}` }));
  }

  append<T extends HTMLElement>(node: T): T {
    this.#output.append(node);
    this.follow();
    return node;
  }

  clear(): void {
    this.#output.replaceChildren();
    this.#stickToBottom = true;
  }

  /** Keeps the newest output in view, unless the visitor scrolled up to read. */
  follow(force = false): void {
    if (force) this.#stickToBottom = true;
    if (this.#stickToBottom) this.#scroller.scrollTop = this.#scroller.scrollHeight;
  }

  announce(text: string): void {
    // Clearing first makes screen readers announce a repeated message again.
    this.#announcer.textContent = "";
    window.setTimeout(() => {
      this.#announcer.textContent = text;
    }, 50);
  }
}
