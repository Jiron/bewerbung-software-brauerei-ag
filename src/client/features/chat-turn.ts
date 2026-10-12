import type { ApiErrorCode, ChatEvent, ProviderMode, SourceRef } from "../../shared/api.ts";
import { RequestError, streamChat } from "../api.ts";
import { CHAT, ERRORS, UI } from "../copy.ts";
import { element } from "../lib/browser.ts";
import type { Screen } from "../terminal/screen.ts";
import { Typewriter } from "../terminal/typewriter.ts";

export interface ChatTurnDeps {
  screen: Screen;
  mode: ProviderMode;
  maxMessageLength: number;
  /** True when text should appear without the typewriter (reduced motion). */
  instant: () => boolean;
  /** Records a detected manipulation attempt and returns the new total. */
  recordAttempt: () => number;
  showSource: (id: string) => void;
}

type Failure = { error: ApiErrorCode | "offline"; retryAfterSeconds?: number | undefined };
type MetaEvent = Extract<ChatEvent, { type: "meta" }>;

const TAP_FRAMES = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

/**
 * One question and its answer on screen:
 *
 *   ZAPFE ANTWORT ▄          (while waiting; becomes "FRISCH GEZAPFT IN 1.2 S")
 *   The answer, typed out...
 *   QUELLEN: [Werdegang: Ausbildung] [Skills]
 */
export class ChatTurn {
  readonly #deps: ChatTurnDeps;
  readonly #abort = new AbortController();
  #writer: Typewriter | null = null;
  #fastForward = false;

  constructor(deps: ChatTurnDeps) {
    this.#deps = deps;
  }

  /** RUN/STOP: cancels the request and the rest of the answer. */
  abort(): void {
    this.#abort.abort();
  }

  /** Any key while typing: show the rest of the answer at once. */
  fastForward(): void {
    this.#fastForward = true;
    this.#writer?.flush();
  }

  async run(conversationId: string, question: string): Promise<void> {
    const { screen } = this.#deps;
    const started = performance.now();
    const status = screen.line(CHAT.tapping, "beer");
    const stopTapping = this.#animateTap(status);
    const answer = screen.block("answer");
    answer.setAttribute("aria-label", UI.answering);
    const writer = new Typewriter(answer.appendChild(document.createTextNode("")), {
      charsPerSecond: 60,
      instant: () => this.#fastForward || this.#deps.instant(),
      onWrite: () => screen.follow(),
    });
    this.#writer = writer;

    // An object, not two lets: TypeScript does not track assignments made inside the callback.
    const outcome: { meta: MetaEvent | null; failure: Failure | null } = {
      meta: null,
      failure: null,
    };

    try {
      await streamChat(
        { conversationId, message: question },
        (event) => {
          if (event.type === "delta") {
            stopTapping();
            writer.push(event.text);
          } else if (event.type === "meta") {
            outcome.meta = event;
          } else if (event.type === "error") {
            outcome.failure = event;
          }
        },
        this.#abort.signal,
      );
      await writer.end();
    } catch (error) {
      writer.flush();
      if (this.#abort.signal.aborted) {
        stopTapping();
        if (!writer.text) status.remove();
        screen.line(CHAT.break);
        return;
      }
      outcome.failure =
        error instanceof RequestError
          ? { error: error.code, retryAfterSeconds: error.retryAfterSeconds }
          : { error: "internal" };
    } finally {
      stopTapping();
      answer.removeAttribute("aria-label");
    }

    if (outcome.failure) {
      if (!writer.text) {
        status.remove();
        answer.remove();
      }
      this.#printFailure(outcome.failure);
      return;
    }

    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    status.textContent =
      this.#deps.mode === "live" ? CHAT.tappedLive(seconds) : CHAT.tappedMock(seconds);
    this.#printMeta(outcome.meta);
    screen.announce(writer.text);
  }

  #printMeta(meta: MetaEvent | null): void {
    const { screen } = this.#deps;
    if (meta?.truncated) screen.line(CHAT.truncated, "dim");
    if (meta?.attempt) screen.line(CHAT.attempt(this.#deps.recordAttempt()), "beer");
    if (!meta || meta.sources.length === 0) {
      screen.line(CHAT.noSources, "dim");
      return;
    }
    screen.append(this.#sourcesLine(meta.sources));
  }

  #sourcesLine(sources: SourceRef[]): HTMLElement {
    const line = element("p", { className: "line sources tone-dim" });
    line.append(element("span", { text: `${CHAT.sources} ` }));
    for (const source of sources) {
      const button = element("button", { className: "chip chip--inline", text: source.title });
      button.type = "button";
      button.setAttribute("aria-label", UI.sourceButton(source.title));
      button.addEventListener("click", () => this.#deps.showSource(source.id));
      line.append(button, " ");
    }
    return line;
  }

  #printFailure(failure: Failure): void {
    const { screen } = this.#deps;
    switch (failure.error) {
      case "rate_limited": {
        const { code, text } = ERRORS.rateLimited(failure.retryAfterSeconds ?? 60);
        screen.error(code, text);
        break;
      }
      case "message_too_long": {
        const { code, text } = ERRORS.tooLong(this.#deps.maxMessageLength);
        screen.error(code, text);
        break;
      }
      case "spend_cap":
        screen.error(ERRORS.spendCap.code, ERRORS.spendCap.text);
        break;
      case "upstream_unavailable":
        screen.error(ERRORS.unavailable.code, ERRORS.unavailable.text);
        break;
      case "offline":
        screen.error(ERRORS.offline.code, ERRORS.offline.text);
        break;
      case "refusal":
        screen.error(ERRORS.refusal.code, ERRORS.refusal.text);
        break;
      default:
        screen.error(ERRORS.internal.code, ERRORS.internal.text);
    }
  }

  /** The little beer glass filling up while the first token is on its way. */
  #animateTap(status: HTMLElement): () => void {
    if (this.#deps.instant()) {
      status.textContent = `${CHAT.tapping}...`;
      return () => {};
    }
    let frame = 0;
    const timer = window.setInterval(() => {
      frame = (frame + 1) % TAP_FRAMES.length;
      status.textContent = `${CHAT.tapping} ${TAP_FRAMES[frame]}`;
    }, 120);
    return () => window.clearInterval(timer);
  }
}
