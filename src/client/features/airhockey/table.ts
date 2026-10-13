/**
 * Air hockey physics and the computer opponent. No DOM, so whole matches run
 * in unit tests.
 *
 * Coordinates are C64 pixels on a landscape table: x runs from your goal (0)
 * to the C64's goal (LENGTH), y runs across. The renderer turns the table
 * upright on portrait screens; the physics never know.
 */

export const TABLE = {
  length: 304,
  width: 144,
  goalWidth: 64,
  puckRadius: 6,
  malletRadius: 10,
} as const;

/** Fixed physics step. Small enough that the fastest puck moves less than half its radius. */
export const STEP = 1 / 240;

export const PUCK_MAX_SPEED = 700;
/** Mouse and touch: the mallet is where the pointer is, almost. */
export const POINTER_SPEED = 1100;
export const KEYBOARD_SPEED = 330;
export const CPU_SPEED = 300;

const FRICTION_PER_SECOND = 0.3;
const WALL_BOUNCE = 0.85;
const MALLET_BOUNCE = 0.9;

export type Side = "player" | "cpu";

export interface Vec {
  x: number;
  y: number;
}

export interface Body {
  pos: Vec;
  vel: Vec;
  readonly radius: number;
}

interface Zone {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const { length: L, width: W, goalWidth: G, puckRadius: PR, malletRadius: MR } = TABLE;

export class Table {
  readonly puck: Body = body(PR);
  readonly mallets: Record<Side, Body> = { player: body(MR), cpu: body(MR) };
  readonly score: Record<Side, number> = { player: 0, cpu: 0 };
  #stuckFor = 0;
  #cpuFirst = false;

  constructor() {
    this.serve("player");
  }

  /** Puts the puck at rest in the half of `side`, mallets back home. */
  serve(side: Side): void {
    this.puck.pos = servePoint(side);
    this.puck.vel = { x: 0, y: 0 };
    this.#stuckFor = 0;
    for (const owner of ["player", "cpu"] as const) {
      this.mallets[owner].pos = home(owner);
      this.mallets[owner].vel = { x: 0, y: 0 };
    }
  }

  /** The part of the table a mallet may use: its own half, inside the rails. */
  static zone(side: Side): Zone {
    return side === "player"
      ? { minX: MR, maxX: L / 2 - MR, minY: MR, maxY: W - MR }
      : { minX: L / 2 + MR, maxX: L - MR, minY: MR, maxY: W - MR };
  }

  /**
   * Advances the game by one STEP. Each mallet moves towards its target, no
   * faster than its speed. Returns the side that scored, if any.
   */
  step(targets: Record<Side, Vec>, speeds: Record<Side, number>): Side | null {
    for (const side of ["player", "cpu"] as const) {
      this.#moveMallet(side, targets[side], speeds[side]);
    }

    const puck = this.puck;
    const friction = Math.exp(-FRICTION_PER_SECOND * STEP);
    puck.vel.x *= friction;
    puck.vel.y *= friction;
    puck.pos.x += puck.vel.x * STEP;
    puck.pos.y += puck.vel.y * STEP;

    // Scored once the middle of the puck is over the goal line.
    if (puck.pos.x < 0) return "cpu";
    if (puck.pos.x > L) return "player";

    // Whoever is handled last wins a scramble at the centre line, so take turns.
    this.#cpuFirst = !this.#cpuFirst;
    const order: Side[] = this.#cpuFirst ? ["cpu", "player"] : ["player", "cpu"];
    this.#bounceOffRails();
    for (const side of order) this.#hit(side);
    // A hit can push the puck into a rail; the rails win, the mallet gives way.
    this.#bounceOffRails();
    const trapped = order.map((side) => this.#trap(side)).includes(true);
    limitSpeed(puck.vel, PUCK_MAX_SPEED);
    this.#referee(trapped);
    return null;
  }

  /**
   * A puck that cannot be played is put back by hand: stuck at an end rail,
   * where no mallet gets behind it, or pinned against a rail for too long.
   */
  #referee(trapped: boolean): void {
    const { pos, vel } = this.puck;
    const atEndRail = pos.x < MR + PR + 2 || pos.x > L - MR - PR - 2;
    const still = Math.hypot(vel.x, vel.y) < 20;
    this.#stuckFor = still && (atEndRail || trapped) ? this.#stuckFor + STEP : 0;
    if (this.#stuckFor < 1.5) return;
    this.#stuckFor = 0;
    this.puck.pos = servePoint(pos.x < L / 2 ? "player" : "cpu");
    this.puck.vel = { x: 0, y: 0 };
  }

  #moveMallet(side: Side, target: Vec, speed: number): void {
    const mallet = this.mallets[side];
    const goal = clampToZone(target, Table.zone(side));
    const dx = goal.x - mallet.pos.x;
    const dy = goal.y - mallet.pos.y;
    const distance = Math.hypot(dx, dy);
    const reach = speed * STEP;
    const k = distance > reach ? reach / distance : 1;
    mallet.vel = { x: (dx * k) / STEP, y: (dy * k) / STEP };
    mallet.pos = { x: mallet.pos.x + dx * k, y: mallet.pos.y + dy * k };
  }

  #bounceOffRails(): void {
    const { pos, vel } = this.puck;
    if (pos.y < PR) {
      pos.y = PR;
      vel.y = Math.abs(vel.y) * WALL_BOUNCE;
    } else if (pos.y > W - PR) {
      pos.y = W - PR;
      vel.y = -Math.abs(vel.y) * WALL_BOUNCE;
    }

    const inMouth = Math.abs(pos.y - W / 2) < G / 2;
    if (!inMouth) {
      if (pos.x < PR) {
        pos.x = PR;
        vel.x = Math.abs(vel.x) * WALL_BOUNCE;
      } else if (pos.x > L - PR) {
        pos.x = L - PR;
        vel.x = -Math.abs(vel.x) * WALL_BOUNCE;
      }
    }
    // The corners of the goal mouths are posts the puck can ricochet off.
    for (const x of [0, L]) {
      for (const y of [W / 2 - G / 2, W / 2 + G / 2]) bounceOffPoint(this.puck, { x, y });
    }
  }

  /** Mallet against puck. The mallet is held by a hand, so it counts as infinitely heavy. */
  #hit(side: Side): void {
    const mallet = this.mallets[side];
    const puck = this.puck;
    const normal = contactNormal(mallet, puck);
    if (!normal) return;
    const reach = MR + PR;
    puck.pos = { x: mallet.pos.x + normal.x * reach, y: mallet.pos.y + normal.y * reach };
    const closing = (puck.vel.x - mallet.vel.x) * normal.x + (puck.vel.y - mallet.vel.y) * normal.y;
    if (closing < 0) {
      puck.vel.x -= (1 + MALLET_BOUNCE) * closing * normal.x;
      puck.vel.y -= (1 + MALLET_BOUNCE) * closing * normal.y;
    }
  }

  /**
   * Puck pinned between mallet and rail: the mallet gives way and the puck
   * stops dead. Without this, every step would pump more speed into a puck
   * that cannot move, and it would buzz in place.
   */
  #trap(side: Side): boolean {
    const mallet = this.mallets[side];
    const normal = contactNormal(mallet, this.puck, 0.5);
    if (!normal) return false;
    const reach = MR + PR;
    mallet.pos = clampToZone(
      { x: this.puck.pos.x - normal.x * reach, y: this.puck.pos.y - normal.y * reach },
      Table.zone(side),
    );
    this.puck.vel = { x: 0, y: 0 };
    return true;
  }
}

/**
 * The C64 player. It decides a few times per second, not every step: instant
 * reactions and perfect aim would make it unbeatable, and nobody wants to
 * play against that.
 */
export class CpuPlayer {
  readonly #side: Side;
  readonly #random: () => number;
  #target: Vec;
  #thinkIn = 0;
  #shot: Vec = { x: L, y: W / 2 };
  #puckInHalfFor = 0;

  constructor(side: Side, random: () => number = Math.random) {
    this.#side = side;
    this.#random = random;
    this.#target = home(side);
  }

  target(table: Table, dt: number): Vec {
    const ownHalf = this.#mirror(table.puck.pos).x < L / 2;
    // A new shot is picked every time the puck comes over.
    if (ownHalf && this.#puckInHalfFor === 0) this.#shot = this.#pickShot();
    this.#puckInHalfFor = ownHalf ? this.#puckInHalfFor + dt : 0;
    this.#thinkIn -= dt;
    if (this.#thinkIn <= 0) {
      this.#thinkIn = 0.08 + this.#random() * 0.08;
      this.#target = this.#mirror(this.#decide(table));
    }
    return this.#target;
  }

  /** A corner of the goal, straight or off a side rail. */
  #pickShot(): Vec {
    const corner = W / 2 + (this.#random() < 0.5 ? -1 : 1) * (G / 2 - PR - 2);
    const roll = this.#random();
    // A bank shot aims at the mirror image of the goal behind the rail.
    if (roll < 0.2) return { x: L, y: 2 * PR - corner };
    if (roll < 0.4) return { x: L, y: 2 * (W - PR) - corner };
    return { x: L, y: corner };
  }

  /** Decides in its own frame: own goal at x = 0, attacking towards x = LENGTH. */
  #decide(table: Table): Vec {
    const puck = this.#mirror(table.puck.pos);
    const vel = this.#mirrorVelocity(table.puck.vel);
    const mallet = this.#mirror(table.mallets[this.#side].pos);
    const guard = { x: MR + 24, y: W / 2 };

    if (puck.x > L / 2) {
      // Puck on the other side: guard the goal and shadow the puck across.
      return { x: guard.x + 30, y: W / 2 + (puck.y - W / 2) * 0.4 };
    }
    if (vel.x < -140 && puck.x > mallet.x) {
      // Incoming shot: step into its path, give or take a few pixels.
      const time = (puck.x - guard.x) / -vel.x;
      const guess = (this.#random() - 0.5) * 40;
      return { x: guard.x, y: fold(puck.y + vel.y * time, PR, W - PR) + guess };
    }
    if (this.#puckInHalfFor > 3.5) {
      // Dawdled long enough: ram it from wherever the mallet is.
      return through(mallet, puck);
    }

    // Line up behind the puck, as far as the rails allow, then drive through it.
    const reach = MR + PR;
    const dir = normalize({ x: this.#shot.x - puck.x, y: this.#shot.y - puck.y });
    const behind = clampToZone(
      { x: puck.x - dir.x * (reach + 6), y: puck.y - dir.y * (reach + 6) },
      OWN_ZONE,
    );
    // Too close to the own end rail to hit it forward: keep the goal shut instead.
    if (puck.x - behind.x < 4) return { x: guard.x, y: puck.y };
    if (mallet.x > puck.x - 4) {
      // On the wrong side of the puck: go around it.
      const away = mallet.y < puck.y ? -1 : 1;
      return { x: puck.x - reach - 8, y: puck.y + away * (reach + 8) };
    }
    if (Math.hypot(mallet.x - behind.x, mallet.y - behind.y) < 8) return through(behind, puck);
    return behind;
  }

  /** Into its own frame and back: mirroring is its own inverse. */
  #mirror(point: Vec): Vec {
    return this.#side === "player" ? point : { x: L - point.x, y: point.y };
  }

  #mirrorVelocity(vel: Vec): Vec {
    return this.#side === "player" ? vel : { x: -vel.x, y: vel.y };
  }
}

/** Where a mallet waits after a goal. */
export function home(side: Side): Vec {
  return { x: side === "player" ? MR + 24 : L - MR - 24, y: W / 2 };
}

function servePoint(side: Side): Vec {
  return { x: side === "player" ? L * 0.3 : L * 0.7, y: W / 2 };
}

/** The CPU decides in its own frame, where its half is always the player's half. */
const OWN_ZONE = Table.zone("player");

/** A point past the puck, on the line from `from` through it: where to swing to hit it. */
function through(from: Vec, puck: Vec): Vec {
  const dir = normalize({ x: puck.x - from.x, y: puck.y - from.y });
  return { x: puck.x + dir.x * 24, y: puck.y + dir.y * 24 };
}

/** The C64 plays harder when it is behind, and eases off when it leads. */
export function cpuSpeed(score: Record<Side, number>): number {
  const factor = 1 + 0.08 * (score.player - score.cpu);
  return CPU_SPEED * Math.min(1.35, Math.max(0.8, factor));
}

function body(radius: number): Body {
  return { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, radius };
}

function clampToZone(point: Vec, zone: Zone): Vec {
  return {
    x: Math.min(zone.maxX, Math.max(zone.minX, point.x)),
    y: Math.min(zone.maxY, Math.max(zone.minY, point.y)),
  };
}

/**
 * Unit vector from mallet to puck while they overlap by more than `slack`,
 * else null. A hit leaves them touching exactly, and rounding must not turn
 * that into a trap.
 */
function contactNormal(mallet: Body, puck: Body, slack = 0): Vec | null {
  const dx = puck.pos.x - mallet.pos.x;
  const dy = puck.pos.y - mallet.pos.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= mallet.radius + puck.radius - slack) return null;
  // Dead centre: push towards the opponent.
  if (distance === 0) return { x: mallet.pos.x < L / 2 ? 1 : -1, y: 0 };
  return { x: dx / distance, y: dy / distance };
}

function bounceOffPoint(puck: Body, point: Vec): void {
  const dx = puck.pos.x - point.x;
  const dy = puck.pos.y - point.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= puck.radius || distance === 0) return;
  const nx = dx / distance;
  const ny = dy / distance;
  puck.pos = { x: point.x + nx * puck.radius, y: point.y + ny * puck.radius };
  const closing = puck.vel.x * nx + puck.vel.y * ny;
  if (closing < 0) {
    puck.vel.x -= (1 + WALL_BOUNCE) * closing * nx;
    puck.vel.y -= (1 + WALL_BOUNCE) * closing * ny;
  }
}

function limitSpeed(vel: Vec, max: number): void {
  const speed = Math.hypot(vel.x, vel.y);
  if (speed <= max) return;
  vel.x *= max / speed;
  vel.y *= max / speed;
}

function normalize(vec: Vec): Vec {
  const length = Math.hypot(vec.x, vec.y) || 1;
  return { x: vec.x / length, y: vec.y / length };
}

/** Where a value ends up after bouncing between two walls, like the puck off the rails. */
export function fold(value: number, min: number, max: number): number {
  const span = max - min;
  let t = (value - min) % (2 * span);
  if (t < 0) t += 2 * span;
  return min + (t > span ? 2 * span - t : t);
}
