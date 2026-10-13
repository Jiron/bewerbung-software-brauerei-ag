import type { SessionInfo } from "../shared/api.ts";
import { api, RequestError } from "./api.ts";
import { C64_PALETTE, type Command, POKE_ADDRESSES, parseCommand } from "./commands.ts";
import { ACCESS, BOOT, EASTER_EGGS, ERRORS, HELP, INTRO, SUGGESTIONS, SYSTEM, UI } from "./copy.ts";
import { AirHockey } from "./features/airhockey/game.ts";
import { ChatTurn } from "./features/chat-turn.ts";
import { printEasterEgg } from "./features/easter-eggs.ts";
import { printDirectory, printSections } from "./features/knowledge-view.ts";
import { element, newConversationId, prefersReducedMotion, session } from "./lib/browser.ts";
import { BootSequence } from "./terminal/boot.ts";
import { Prompt, type PromptElements, type PromptMode } from "./terminal/prompt.ts";
import type { Screen } from "./terminal/screen.ts";

export interface AppElements {
  frame: HTMLElement;
  screenArea: HTMLElement;
  suggestions: HTMLElement;
  skip: HTMLButtonElement;
  prompt: PromptElements;
}

/** Whatever is running right now: ESC stops it, any other key hurries it along. */
interface Task {
  abort(): void;
  fastForward(): void;
}

/** Used until /api/session answers, and if it never does. */
const FALLBACK_SESSION: SessionInfo = {
  tier: "public",
  mode: "live",
  demo: false,
  persona: { name: "Manassés Zähnler", shortName: "Manassés" },
  limits: { maxMessageLength: 500 },
  lockedSectionCount: 0,
  unlockAvailable: false,
  accessRequired: false,
  repoUrl: null,
};

/**
 * The C64 itself: boots, reads lines, runs commands, asks the AI.
 * One thing happens at a time, like on the real machine: while a command runs,
 * the cursor disappears, ESC is RUN/STOP and any other key fast-forwards.
 */
export class App {
  readonly #screen: Screen;
  readonly #el: AppElements;
  readonly #prompt: Prompt;
  #session: SessionInfo = FALLBACK_SESSION;
  #conversationId = session.get("conversation") ?? newConversationId();
  #busy = false;
  #boot: BootSequence | null = null;
  #task: Task | null = null;
  #touch = false;
  #suggestionPool: string[] = shuffle([...SUGGESTIONS]);

  constructor(screen: Screen, elements: AppElements) {
    this.#screen = screen;
    this.#el = elements;
    this.#prompt = new Prompt(elements.prompt, {
      onSubmit: (value, mode) => void this.#onSubmit(value, mode),
      onEscape: () => this.#onEscape(),
    });
    session.set("conversation", this.#conversationId);

    document.addEventListener("pointerdown", (event) => {
      this.#touch = event.pointerType === "touch";
    });
    document.addEventListener("keydown", (event) => this.#onGlobalKey(event));
    elements.screenArea.addEventListener("click", (event) => this.#onScreenClick(event));
    elements.skip.addEventListener("click", () => this.#boot?.skip());
  }

  async start(): Promise<void> {
    // The C64 does not wait for the network: boot and session request run in parallel.
    const sessionRequest = api.session().catch(() => null);
    const returning = session.get("booted") === "1";
    await this.#runBoot(returning ? 0.35 : 1);
    session.set("booted", "1");

    const info = await sessionRequest;
    if (info) this.#session = info;
    this.#prompt.setMaxLength(this.#session.limits.maxMessageLength);
    this.#printIntro();
    if (!info) this.#screen.error(ERRORS.offline.code, ERRORS.offline.text);
    this.#renderSuggestions();
    // Behind REQUIRE_ACCESS_CODE the code is the only way in, so ask for it right away.
    if (this.#gateClosed) this.#askForCode();
    else this.#idle();
  }

  /** REQUIRE_ACCESS_CODE and not unlocked yet: no AI, no knowledge. */
  get #gateClosed(): boolean {
    return this.#session.accessRequired && this.#session.tier === "public";
  }

  // ── input ──────────────────────────────────────────────────────────────────

  async #onSubmit(value: string, mode: PromptMode): Promise<void> {
    if (this.#busy) return;
    if (mode === "secret") {
      await this.#work(() => this.#unlock(value));
      return;
    }
    this.#screen.line(value, "input");
    const command = parseCommand(value);
    if (command.kind === "empty") {
      this.#idle({ ready: false });
      return;
    }
    if (command.kind === "code") {
      this.#askForCode();
      return;
    }
    await this.#work(() => this.#execute(command));
  }

  #onEscape(): void {
    // ESC at the code prompt cancels it, like RUN/STOP during INPUT.
    // At READY. it does nothing, just like on the real machine.
    if (this.#prompt.mode === "secret" && !this.#busy) {
      this.#screen.line("BREAK");
      this.#idle();
    }
  }

  #onGlobalKey(event: KeyboardEvent): void {
    if (this.#boot && !this.#boot.skipped) {
      if (!["Shift", "Control", "Alt", "Meta", "Tab"].includes(event.key)) {
        // Otherwise the key that skipped the boot lands in the prompt that appears right after.
        event.preventDefault();
        this.#boot.skip();
      }
      return;
    }
    if (!this.#busy) return;
    if (event.key === "Escape") {
      event.preventDefault();
      this.#task?.abort();
    } else if (!["Shift", "Control", "Alt", "Meta", "Tab"].includes(event.key)) {
      this.#task?.fastForward();
    }
  }

  #onScreenClick(event: MouseEvent): void {
    if (this.#boot && !this.#boot.skipped) {
      this.#boot.skip();
      return;
    }
    if (this.#busy) {
      this.#task?.fastForward();
      return;
    }
    const target = event.target as HTMLElement;
    const selecting = !(window.getSelection()?.isCollapsed ?? true);
    if (!selecting && !target.closest("button, a")) this.#prompt.focus();
  }

  /** Runs one command with the cursor hidden, then prints READY. */
  async #work(task: () => Promise<void> | void): Promise<void> {
    this.#busy = true;
    this.#prompt.hide();
    this.#setSuggestionsDisabled(true);
    try {
      await task();
    } catch (error) {
      this.#printRequestError(error);
    } finally {
      this.#busy = false;
      this.#task = null;
      this.#setSuggestionsDisabled(false);
      this.#idle();
    }
  }

  #idle(options: { ready?: boolean } = {}): void {
    if (options.ready ?? true) this.#screen.ready();
    this.#prompt.show("text");
    this.#screen.follow(true);
    // On phones, focusing would pop up the keyboard after every tap on a suggestion.
    if (!this.#touch) this.#prompt.focus();
  }

  // ── commands ───────────────────────────────────────────────────────────────

  async #execute(command: Command): Promise<void> {
    const screen = this.#screen;
    const needsAccess =
      command.kind === "question" ||
      command.kind === "list" ||
      (command.kind === "run" && command.program !== null);
    if (needsAccess && this.#gateClosed) {
      screen.error(ACCESS.required.code, ACCESS.required.text);
      return;
    }
    switch (command.kind) {
      case "question":
        return this.#ask(command.text);
      case "help":
        return this.#printHelp();
      case "list":
        return command.target === null
          ? printDirectory(screen)
          : printSections(screen, command.target);
      case "run":
        return command.program === null
          ? this.#printIntro()
          : printSections(screen, command.program);
      case "logout":
        return this.#lock();
      case "new":
        this.#newConversation();
        screen.line(SYSTEM.newConversation);
        return;
      case "clear":
        screen.clear();
        return;
      case "about":
        return this.#printAbout();
      case "reset":
        this.#resetColors();
        this.#newConversation();
        await this.#runBoot(0.35);
        this.#printIntro();
        return;
      case "poke":
        return this.#poke(command.address, command.value);
      case "print":
        screen.line(command.text);
        return;
      case "load":
        return this.#load(command.name);
      case "airhockey":
        return this.#playAirHockey();
      case "syntaxError":
        screen.error(ERRORS.syntax);
        return;
      case "easterEgg":
        printEasterEgg(screen, command.egg);
        return;
      case "code":
      case "empty":
        return;
    }
  }

  async #ask(question: string): Promise<void> {
    this.#consumeSuggestion(question);
    const turn = new ChatTurn({
      screen: this.#screen,
      mode: this.#session.mode,
      maxMessageLength: this.#session.limits.maxMessageLength,
      instant: prefersReducedMotion,
      showSource: (id) => void this.#showSource(id),
    });
    this.#task = turn;
    const failure = await turn.run(this.#conversationId, question);
    // The server forgot the unlock (expired, or restarted without SESSION_SECRET).
    if (failure === "locked") this.#session = await api.session();
    this.#renderSuggestions();
  }

  async #playAirHockey(): Promise<void> {
    const game = new AirHockey({
      screen: this.#screen,
      frame: this.#el.frame,
      instant: prefersReducedMotion(),
    });
    this.#task = game;
    await game.run();
  }

  async #showSource(id: string): Promise<void> {
    if (this.#busy) return;
    this.#screen.line(`LIST ${id.toUpperCase()}`, "input");
    await this.#work(() => printSections(this.#screen, id));
  }

  #newConversation(): void {
    this.#conversationId = newConversationId();
    session.set("conversation", this.#conversationId);
  }

  // ── access code ────────────────────────────────────────────────────────────

  #askForCode(): void {
    if (!this.#session.unlockAvailable) {
      this.#screen.error(ACCESS.unavailable.code, ACCESS.unavailable.text);
      this.#idle();
      return;
    }
    if (this.#session.tier === "private") {
      this.#screen.line(ACCESS.alreadyUnlocked);
      this.#idle();
      return;
    }
    this.#screen.line(ACCESS.prompt);
    this.#prompt.show("secret");
    this.#prompt.focus();
    this.#screen.follow(true);
  }

  async #unlock(code: string): Promise<void> {
    this.#screen.line("*".repeat(Array.from(code).length), "input");
    if (!code.trim()) {
      this.#screen.line("BREAK");
      return;
    }
    const locked = this.#session.lockedSectionCount;
    this.#screen.line(ACCESS.checking, "dim");
    try {
      await api.unlock(code);
      this.#session = await api.session();
      this.#screen.line(ACCESS.granted, "ok");
      if (this.#session.accessRequired) {
        // Everything was locked, so this is the real welcome.
        this.#printWelcome();
        this.#renderSuggestions();
        return;
      }
      this.#screen.line(ACCESS.grantedText(locked));
      this.#screen.announce(`${ACCESS.granted} ${ACCESS.grantedText(locked)}`);
    } catch (error) {
      if (!(error instanceof RequestError)) throw error;
      if (error.code === "wrong_code") {
        this.#screen.error(ERRORS.syntax, ACCESS.wrongCode(error.attemptsLeft ?? 0));
      } else if (error.code === "locked_out") {
        const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds ?? 60) / 60));
        this.#screen.error(ACCESS.lockedOut.code, ACCESS.lockedOut.text(minutes));
      } else if (error.code === "unlock_unavailable") {
        this.#screen.error(ACCESS.unavailable.code, ACCESS.unavailable.text);
      } else if (error.code === "rate_limited") {
        const { code, text } = ERRORS.rateLimited(error.retryAfterSeconds ?? 5);
        this.#screen.error(code, text);
      } else {
        throw error;
      }
    }
  }

  async #lock(): Promise<void> {
    await api.lock();
    this.#session = await api.session();
    this.#screen.line(this.#session.accessRequired ? ACCESS.loggedOutAll : ACCESS.loggedOut);
    this.#renderSuggestions();
  }

  // ── output ─────────────────────────────────────────────────────────────────

  async #runBoot(speed: number): Promise<void> {
    this.#prompt.hide();
    this.#el.suggestions.hidden = true;
    const boot = new BootSequence({
      screen: this.#screen,
      frame: this.#el.frame,
      speed,
      instant: prefersReducedMotion(),
    });
    this.#boot = boot;
    if (!boot.skipped) {
      this.#el.skip.hidden = false;
      this.#screen.announce(`${BOOT.load}. ${BOOT.skipHint}.`);
    }
    await boot.run();
    this.#el.skip.hidden = true;
    this.#boot = null;
    this.#screen.clear();
    this.#el.suggestions.hidden = false;
  }

  #printIntro(): void {
    const screen = this.#screen;
    const { persona, demo, mode } = this.#session;
    screen.line(INTRO.title, "title");
    screen.line(INTRO.subtitle, "dim");
    screen.line("");
    if (demo) screen.line(INTRO.demo(persona.name), "dim");
    if (mode === "mock") screen.line(INTRO.mock, "dim");
    if (demo || mode === "mock") screen.line("");
    if (this.#gateClosed) {
      screen.line(INTRO.gate(persona.shortName));
      screen.line(INTRO.gateHint, "dim");
      screen.announce(`${INTRO.gate(persona.shortName)} ${INTRO.gateHint}`);
      return;
    }
    this.#printWelcome();
  }

  #printWelcome(): void {
    const screen = this.#screen;
    const { persona, lockedSectionCount, unlockAvailable } = this.#session;
    screen.line(INTRO.greeting(persona.shortName));
    screen.line("");
    if (unlockAvailable && lockedSectionCount > 0)
      screen.line(INTRO.locked(lockedSectionCount), "dim");
    screen.line(INTRO.help, "dim");
    screen.announce(`${INTRO.greeting(persona.shortName)} ${INTRO.help}`);
  }

  #printHelp(): void {
    const screen = this.#screen;
    const groups: [string, readonly (readonly [string, string])[]][] = [
      [HELP.heading, HELP.commands],
      [HELP.extrasHeading, HELP.extras],
    ];
    const rows = groups.flatMap(([, commands]) => commands);
    const width = Math.max(...rows.map(([name]) => name.length)) + 2;
    for (const [heading, commands] of groups) {
      if (heading !== HELP.heading) screen.line("");
      screen.line(heading, "title");
      for (const [name, description] of commands) {
        const row = screen.line();
        row.classList.add("help-row");
        row.style.setProperty("--key-width", `${width}ch`);
        row.append(element("span", { text: name }), element("span", { text: description }));
      }
    }
    screen.line("");
    screen.line(HELP.keys, "dim");
    screen.line(HELP.secrets, "dim");
    screen.announce(rows.map(([name, description]) => `${name}: ${description}`).join(". "));
  }

  #printAbout(): void {
    for (const line of SYSTEM.about) this.#screen.line(line);
    const repoUrl = this.#session.repoUrl;
    if (repoUrl) {
      const line = element("p", { className: "line", text: `${SYSTEM.repo} ` });
      const link = element("a", { text: repoUrl });
      link.href = repoUrl;
      link.rel = "noopener";
      line.append(link);
      this.#screen.append(line);
    }
    this.#screen.announce(SYSTEM.about.join(" "));
  }

  async #load(name: string): Promise<void> {
    if (name === "AIRHOCKEY") return this.#playAirHockey();
    if (name === "MANASSES") {
      this.#screen.line(EASTER_EGGS.alreadyLoaded);
      return;
    }
    this.#screen.line(`SEARCHING FOR ${name}`);
    this.#screen.error(ERRORS.notFound);
  }

  #poke(address: number, value: number): void {
    const color = C64_PALETTE[value];
    const variable = {
      [POKE_ADDRESSES.border]: "--c64-border",
      [POKE_ADDRESSES.background]: "--c64-bg",
      [POKE_ADDRESSES.text]: "--c64-fg",
    }[address];
    if (!variable) {
      // The real C64 would happily poke anywhere. This one only knows three addresses.
      this.#screen.line(SYSTEM.colorChanged);
      return;
    }
    if (!color) {
      this.#screen.error(ERRORS.illegalQuantity);
      return;
    }
    const root = document.documentElement.style;
    root.setProperty(variable, color);
    const style = getComputedStyle(document.documentElement);
    const unreadable =
      style.getPropertyValue("--c64-fg").trim() === style.getPropertyValue("--c64-bg").trim();
    this.#screen.line(unreadable ? SYSTEM.colorUnreadable : SYSTEM.colorChanged);
  }

  #resetColors(): void {
    for (const variable of ["--c64-border", "--c64-bg", "--c64-fg"]) {
      document.documentElement.style.removeProperty(variable);
    }
  }

  #printRequestError(error: unknown): void {
    if (error instanceof RequestError && error.code === "offline") {
      this.#screen.error(ERRORS.offline.code, ERRORS.offline.text);
    } else {
      console.error(error);
      this.#screen.error(ERRORS.internal.code, ERRORS.internal.text);
    }
  }

  // ── suggestions ────────────────────────────────────────────────────────────

  #renderSuggestions(): void {
    const list = this.#el.suggestions;
    const picks = this.#gateClosed
      ? ["CODE", "HELP"]
      : [...this.#suggestionPool.slice(0, 3), "HELP"];
    list.replaceChildren(
      ...picks.map((text) => {
        const button = element("button", { className: "chip", text });
        button.type = "button";
        button.addEventListener("click", () => {
          if (this.#busy || this.#prompt.mode === "secret") return;
          this.#prompt.fill(text);
          this.#el.prompt.form.requestSubmit();
        });
        return button;
      }),
    );
    list.setAttribute("aria-label", UI.suggestionsLabel);
  }

  #consumeSuggestion(question: string): void {
    this.#suggestionPool = this.#suggestionPool.filter((text) => text !== question);
    if (this.#suggestionPool.length < 3) this.#suggestionPool = shuffle([...SUGGESTIONS]);
  }

  #setSuggestionsDisabled(disabled: boolean): void {
    for (const button of this.#el.suggestions.querySelectorAll("button")) {
      button.disabled = disabled;
    }
  }
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
  return items;
}
