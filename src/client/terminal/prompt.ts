export type PromptMode = "text" | "secret";

export interface PromptElements {
  form: HTMLFormElement;
  text: HTMLTextAreaElement;
  secret: HTMLInputElement;
  before: HTMLElement;
  cursor: HTMLElement;
  after: HTMLElement;
}

export interface PromptHandlers {
  onSubmit(value: string, mode: PromptMode): void;
  onEscape(): void;
}

/**
 * The input line with the blinking C64 block cursor.
 *
 * A real <textarea> (or a password <input> for the access code) sits invisibly
 * on top of a mirror that draws the text and the cursor. Screen readers, mobile
 * keyboards, autocorrect and paste keep working because the visitor types into
 * a native control; the mirror is only paint.
 */
export class Prompt {
  readonly #el: PromptElements;
  readonly #handlers: PromptHandlers;
  readonly #history: string[] = [];
  #historyIndex = 0;
  #mode: PromptMode = "text";

  constructor(elements: PromptElements, handlers: PromptHandlers) {
    this.#el = elements;
    this.#handlers = handlers;

    for (const field of [elements.text, elements.secret] as HTMLElement[]) {
      field.addEventListener("keydown", (event) => this.#onKeyDown(event));
      for (const type of ["input", "keyup", "click", "select", "focus", "blur"]) {
        field.addEventListener(type, () => this.render());
      }
    }
    document.addEventListener("selectionchange", () => this.render());
    elements.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.#submit();
    });
  }

  get #field(): HTMLTextAreaElement | HTMLInputElement {
    return this.#mode === "secret" ? this.#el.secret : this.#el.text;
  }

  get mode(): PromptMode {
    return this.#mode;
  }

  get visible(): boolean {
    return !this.#el.form.hidden;
  }

  show(mode: PromptMode = "text"): void {
    this.#mode = mode;
    this.#el.text.hidden = mode === "secret";
    this.#el.secret.hidden = mode !== "secret";
    this.#el.form.hidden = false;
    this.render();
  }

  hide(): void {
    this.#el.form.hidden = true;
  }

  focus(): void {
    if (this.visible) this.#field.focus({ preventScroll: true });
  }

  setMaxLength(length: number): void {
    this.#el.text.maxLength = length;
  }

  /** Puts text into the line as if typed (used by the suggestion buttons). */
  fill(value: string): void {
    this.#el.text.value = value;
    this.#el.text.setSelectionRange(value.length, value.length);
    this.render();
  }

  render(): void {
    const field = this.#field;
    const value = this.#mode === "secret" ? "*".repeat(field.value.length) : field.value;
    const focused = document.activeElement === field;
    const caret = focused ? (field.selectionEnd ?? value.length) : value.length;
    const chars = Array.from(value.slice(0, caret));
    this.#el.before.textContent = chars.join("");
    this.#el.cursor.textContent = Array.from(value.slice(caret))[0] ?? " ";
    this.#el.after.textContent = Array.from(value.slice(caret)).slice(1).join("");
  }

  #onKeyDown(event: KeyboardEvent): void {
    if (event.isComposing) return;
    // The prompt consumes Enter and Escape. Otherwise the Enter that starts
    // SYS 64738 would bubble up and skip the very boot it just started.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      this.#submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.#handlers.onEscape();
    } else if (this.#mode === "text" && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      if (this.#history.length === 0) return;
      event.preventDefault();
      this.#browseHistory(event.key === "ArrowUp" ? -1 : 1);
    }
  }

  #browseHistory(step: number): void {
    this.#historyIndex = Math.min(this.#history.length, Math.max(0, this.#historyIndex + step));
    this.fill(this.#history[this.#historyIndex] ?? "");
  }

  #submit(): void {
    const field = this.#field;
    const value = field.value;
    field.value = "";
    if (this.#mode === "text" && value.trim() && this.#history.at(-1) !== value) {
      this.#history.push(value);
    }
    this.#historyIndex = this.#history.length;
    this.render();
    this.#handlers.onSubmit(value, this.#mode);
  }
}
