import { C64_PALETTE } from "../../commands.ts";
import { CHAT, GAME } from "../../copy.ts";
import { element, isTouchDevice } from "../../lib/browser.ts";
import type { Screen } from "../../terminal/screen.ts";
import {
  CpuPlayer,
  cpuSpeed,
  KEYBOARD_SPEED,
  POINTER_SPEED,
  type Side,
  STEP,
  TABLE,
  Table,
  type Vec,
} from "./table.ts";

export interface AirHockeyOptions {
  screen: Screen;
  /** The border: it flashes on every goal and shows tape stripes while loading. */
  frame: HTMLElement;
  /** Skip the loading pause (reduced motion). */
  instant: boolean;
}

export const WIN_SCORE = 5;

type Orientation = "landscape" | "portrait";

const RAIL = 8;
const { length: L, width: W, goalWidth: G, puckRadius: PR, malletRadius: MR } = TABLE;

/** Pepto colors by their C64 names, so the drawing code reads like a sprite editor. */
const COLOR = {
  black: C64_PALETTE[0],
  white: C64_PALETTE[1],
  red: C64_PALETTE[2],
  green: C64_PALETTE[5],
  blue: C64_PALETTE[6],
  yellow: C64_PALETTE[7],
  orange: C64_PALETTE[8],
  lightRed: C64_PALETTE[10],
  lightGreen: C64_PALETTE[13],
  lightBlue: C64_PALETTE[14],
};

const MOVE_KEYS: Record<string, Vec> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
};

/**
 * AIRHOCKEY: you against the C64, first to five. Takes over the screen like a
 * program loaded from disk and gives it back with the result when it ends.
 *
 * The table is drawn at C64 resolution into a small canvas and scaled up with
 * hard pixel edges. Mouse, touch and arrow keys all steer the green mallet;
 * ESC (or the RUN/STOP button) ends the game.
 */
export class AirHockey {
  readonly #options: AirHockeyOptions;
  readonly #table = new Table();
  readonly #cpu = new CpuPlayer("cpu");
  readonly #keys = new Set<string>();
  readonly #done = Promise.withResolvers<Side | null>();
  readonly #el = {
    root: element("div", { className: "game" }),
    score: element("p", { className: "line game__score" }),
    stop: element("button", { className: "chip", text: GAME.stop }),
    stage: element("div", { className: "game__stage" }),
    canvas: element("canvas", { className: "game__table" }),
    hint: element("p", { className: "line tone-dim" }),
  };
  readonly #backgrounds = new Map<Orientation, HTMLCanvasElement>();
  #orientation: Orientation = "landscape";
  #pointer: Vec | null = null;
  #aborted = false;
  #wake: (() => void) | null = null;
  #frameId = 0;
  #lastTime = 0;
  #backlog = 0;
  #pausedUntil = 0;
  #message: string | null = null;
  #winner: Side | null = null;

  constructor(options: AirHockeyOptions) {
    this.#options = options;
  }

  /** RUN/STOP. After the last goal it only skips the victory lap. */
  abort(): void {
    this.#aborted = true;
    this.#wake?.();
    this.#done.resolve(this.#winner);
  }

  /** Any key during LOADING skips the wait, like on the boot screen. */
  fastForward(): void {
    this.#wake?.();
  }

  async run(): Promise<void> {
    const { screen, frame } = this.#options;
    screen.line(GAME.searching);
    screen.line(GAME.loading);
    frame.classList.add("is-loading");
    await this.#pause(this.#options.instant ? 0 : 1400);
    frame.classList.remove("is-loading");
    if (this.#aborted) {
      screen.line(CHAT.break);
      return;
    }

    const giveBack = screen.takeOver(this.#build());
    const stopListening = this.#listen();
    const resize = new ResizeObserver(() => this.#layout());
    resize.observe(this.#el.stage);
    this.#layout();
    this.#renderScore();
    screen.announce(`${GAME.label}. ${this.#el.hint.textContent}`);
    this.#frameId = requestAnimationFrame((time) => this.#loop(time));

    const winner = await this.#done.promise;
    cancelAnimationFrame(this.#frameId);
    resize.disconnect();
    stopListening();
    frame.classList.remove("is-goal");
    giveBack();
    this.#printResult(winner);
  }

  // ── setup ──────────────────────────────────────────────────────────────────

  #build(): HTMLElement {
    const { root, score, stop, stage, canvas, hint } = this.#el;
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", GAME.label);
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", GAME.label);
    stop.type = "button";
    stop.addEventListener("click", () => this.abort());
    hint.textContent = isTouchDevice() ? GAME.hintTouch : GAME.hintDesktop;
    const bar = element("div", { className: "game__bar" });
    bar.append(score, stop);
    stage.append(canvas);
    root.append(bar, stage, hint);
    return root;
  }

  #listen(): () => void {
    const canvas = this.#el.canvas;
    const onPointer = (event: PointerEvent) => {
      if (event.type === "pointerdown") canvas.setPointerCapture(event.pointerId);
      // Mice steer by hovering; fingers and pens only while they touch the table.
      if (event.pointerType !== "mouse" && event.buttons === 0) return;
      this.#pointer = this.#toTable(event);
      this.#keys.clear();
    };
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (!(key in MOVE_KEYS)) return;
      event.preventDefault();
      if (event.type === "keydown") {
        this.#keys.add(key);
        this.#pointer = null;
      } else {
        this.#keys.delete(key);
      }
    };
    canvas.addEventListener("pointerdown", onPointer);
    canvas.addEventListener("pointermove", onPointer);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }

  /** Portrait screens get the table upright, your goal at the bottom. Pixels stay square. */
  #layout(): void {
    const { stage, canvas } = this.#el;
    const box = stage.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    this.#orientation = box.height > box.width ? "portrait" : "landscape";
    const long = L + 2 * RAIL;
    const short = W + 2 * RAIL;
    canvas.width = this.#orientation === "landscape" ? long : short;
    canvas.height = this.#orientation === "landscape" ? short : long;
    // Whole device pixels per C64 pixel where there is room, so every pixel is the same size.
    const ratio = window.devicePixelRatio || 1;
    const fit = Math.min(box.width / canvas.width, box.height / canvas.height) * ratio;
    const scale = (fit >= 2 ? Math.floor(fit) : fit) / ratio;
    canvas.style.width = `${canvas.width * scale}px`;
    canvas.style.height = `${canvas.height * scale}px`;
    this.#draw();
  }

  // ── game loop ──────────────────────────────────────────────────────────────

  #loop(time: number): void {
    // Capped, so a tab that was in the background does not fast-forward the match.
    const elapsed = this.#lastTime ? Math.min(0.05, (time - this.#lastTime) / 1000) : 0;
    this.#lastTime = time;
    if (time >= this.#pausedUntil) {
      if (this.#message) {
        this.#message = null;
        this.#renderScore();
      }
      this.#backlog += elapsed;
      while (this.#backlog >= STEP) {
        this.#backlog -= STEP;
        const scorer = this.#table.step(
          { player: this.#playerTarget(), cpu: this.#cpu.target(this.#table, STEP) },
          {
            player: this.#keys.size > 0 ? KEYBOARD_SPEED : POINTER_SPEED,
            cpu: cpuSpeed(this.#table.score),
          },
        );
        if (scorer) {
          this.#goal(scorer, time);
          break;
        }
      }
    }
    this.#draw();
    this.#frameId = requestAnimationFrame((next) => this.#loop(next));
  }

  #playerTarget(): Vec {
    const mallet = this.#table.mallets.player.pos;
    if (this.#keys.size === 0) return this.#pointer ?? mallet;
    let x = 0;
    let y = 0;
    for (const key of this.#keys) {
      const move = MOVE_KEYS[key];
      if (move) ({ x, y } = { x: x + move.x, y: y + move.y });
    }
    // The keys move the mallet on screen, so on an upright table "up" is towards the C64.
    const dir = this.#orientation === "landscape" ? { x, y } : { x: -y, y: x };
    return { x: mallet.x + dir.x * 100, y: mallet.y + dir.y * 100 };
  }

  #goal(scorer: Side, time: number): void {
    const { score } = this.#table;
    score[scorer]++;
    this.#renderScore();
    this.#flashBorder(scorer);
    this.#options.screen.announce(GAME.announceGoal(scorer === "player", score.player, score.cpu));
    if (score[scorer] >= WIN_SCORE) {
      this.#winner = scorer;
      this.#message = scorer === "player" ? GAME.youWin : GAME.cpuWins;
      this.#renderScore();
      this.#pausedUntil = Number.POSITIVE_INFINITY;
      window.setTimeout(() => this.#done.resolve(scorer), 1600);
      return;
    }
    this.#message = scorer === "player" ? GAME.goalPlayer : GAME.goalCpu;
    this.#renderScore();
    // The one who conceded gets the puck, like at the real table.
    this.#table.serve(scorer === "player" ? "cpu" : "player");
    this.#pausedUntil = time + 900;
    this.#backlog = 0;
  }

  #flashBorder(scorer: Side): void {
    const { frame } = this.#options;
    frame.style.setProperty("--flash", scorer === "player" ? COLOR.lightGreen : COLOR.lightRed);
    frame.classList.remove("is-goal");
    // Restart the animation even if the last flash has not finished.
    void frame.offsetWidth;
    frame.classList.add("is-goal");
  }

  #renderScore(): void {
    const { player, cpu } = this.#table.score;
    const you = element("span", { className: "tone-ok", text: GAME.you });
    const them = element("span", { className: "tone-error", text: GAME.cpu });
    this.#el.score.replaceChildren(you, ` ${player} : ${cpu} `, them);
    if (this.#message) this.#el.score.append(`  ${this.#message}`);
  }

  #printResult(winner: Side | null): void {
    const { screen } = this.#options;
    const { player, cpu } = this.#table.score;
    if (winner === null) {
      screen.line(CHAT.break);
      screen.line(GAME.aborted(player, cpu));
      return;
    }
    screen.line(GAME.final(player, cpu), "title");
    screen.line(winner === "player" ? GAME.won : GAME.lost);
    screen.announce(`${GAME.final(player, cpu)}. ${winner === "player" ? GAME.won : GAME.lost}`);
  }

  // ── drawing ────────────────────────────────────────────────────────────────

  #draw(): void {
    const canvas = this.#el.canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(this.#background(), 0, 0);
    const { puck, mallets } = this.#table;
    this.#mallet(ctx, mallets.cpu.pos, COLOR.red, COLOR.lightRed);
    this.#mallet(ctx, mallets.player.pos, COLOR.green, COLOR.lightGreen);
    const p = this.#toCanvas(puck.pos);
    disc(ctx, p.x, p.y, PR, COLOR.orange);
    disc(ctx, p.x, p.y, PR - 1, COLOR.yellow);
  }

  #mallet(ctx: CanvasRenderingContext2D, pos: Vec, rim: string, face: string): void {
    const { x, y } = this.#toCanvas(pos);
    disc(ctx, x, y, MR, rim);
    disc(ctx, x, y, MR - 2, face);
    disc(ctx, x, y, 4, rim);
    disc(ctx, x, y, 2, COLOR.white);
  }

  /** The table without anything moving on it, drawn once per orientation. */
  #background(): HTMLCanvasElement {
    const cached = this.#backgrounds.get(this.#orientation);
    if (cached) return cached;
    const layer = document.createElement("canvas");
    layer.width = this.#el.canvas.width;
    layer.height = this.#el.canvas.height;
    const ctx = layer.getContext("2d");
    if (!ctx) return layer;
    const rect = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      const a = this.#toCanvas({ x, y });
      const b = this.#toCanvas({ x: x + w, y: y + h });
      ctx.fillRect(
        Math.min(a.x, b.x),
        Math.min(a.y, b.y),
        Math.abs(b.x - a.x),
        Math.abs(b.y - a.y),
      );
    };

    rect(-RAIL, -RAIL, L + 2 * RAIL, W + 2 * RAIL, COLOR.lightBlue);
    rect(0, 0, L, W, COLOR.blue);
    // The air holes the puck floats on.
    for (let x = 4; x < L; x += 8) {
      for (let y = 4; y < W; y += 8) rect(x, y, 1, 1, COLOR.lightBlue);
    }
    rect(L / 2 - 1, 0, 2, W, COLOR.lightRed);
    const centre = this.#toCanvas({ x: L / 2, y: W / 2 });
    ring(ctx, centre.x, centre.y, 18, COLOR.lightRed);
    for (const x of [0, L]) {
      rect(x === 0 ? -RAIL : L, W / 2 - G / 2, RAIL, G, COLOR.black);
      // Goal creases: half circles, the half outside the table hides under the rail.
      ctx.save();
      const inner = this.#toCanvas({ x: 0, y: 0 });
      const outer = this.#toCanvas({ x: L, y: W });
      ctx.beginPath();
      ctx.rect(
        Math.min(inner.x, outer.x),
        Math.min(inner.y, outer.y),
        Math.abs(outer.x - inner.x),
        Math.abs(outer.y - inner.y),
      );
      ctx.clip();
      const goal = this.#toCanvas({ x, y: W / 2 });
      ring(ctx, goal.x, goal.y, G / 2 + 4, COLOR.lightBlue);
      ctx.restore();
    }
    this.#backgrounds.set(this.#orientation, layer);
    return layer;
  }

  // ── coordinates ────────────────────────────────────────────────────────────

  #toCanvas(point: Vec): Vec {
    return this.#orientation === "landscape"
      ? { x: RAIL + point.x, y: RAIL + point.y }
      : { x: RAIL + point.y, y: RAIL + L - point.x };
  }

  #toTable(event: PointerEvent): Vec {
    const canvas = this.#el.canvas;
    const box = canvas.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * canvas.width - RAIL;
    // A finger hides what it touches, so the mallet sits a little above it.
    const lift = event.pointerType === "touch" ? MR + 4 : 0;
    const y = ((event.clientY - box.top) / box.height) * canvas.height - RAIL - lift;
    return this.#orientation === "landscape" ? { x, y } : { x: L - y, y: x };
  }

  #pause(ms: number): Promise<void> {
    if (ms === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = window.setTimeout(resolve, ms);
      this.#wake = () => {
        window.clearTimeout(timer);
        resolve();
      };
    });
  }
}

/**
 * A filled circle with hard pixel edges, row by row like a sprite. Canvas
 * arcs are anti-aliased, and blurry edges are not a C64 thing.
 */
function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  const left = Math.round(cx - r);
  const top = Math.round(cy - r);
  for (let row = 0; row < 2 * r; row++) {
    const inset = Math.round(r - halfWidth(r, row));
    ctx.fillRect(left + inset, top + row, 2 * r - 2 * inset, 1);
  }
}

/** A one pixel circle line, for the markings on the table. */
function ring(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  const left = Math.round(cx - r);
  const top = Math.round(cy - r);
  for (let row = 0; row < 2 * r; row++) {
    const outer = Math.round(r - halfWidth(r, row));
    const inner = row === 0 || row === 2 * r - 1 ? r : Math.round(r - halfWidth(r - 1, row - 1));
    const width = Math.max(1, inner - outer);
    ctx.fillRect(left + outer, top + row, width, 1);
    ctx.fillRect(left + 2 * r - outer - width, top + row, width, 1);
  }
}

function halfWidth(r: number, row: number): number {
  const dy = row + 0.5 - r;
  return Math.sqrt(Math.max(0, r * r - dy * dy));
}
