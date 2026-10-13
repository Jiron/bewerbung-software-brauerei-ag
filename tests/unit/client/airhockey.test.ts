import { describe, expect, it } from "vitest";
import {
  CPU_SPEED,
  CpuPlayer,
  cpuSpeed,
  fold,
  POINTER_SPEED,
  PUCK_MAX_SPEED,
  type Side,
  STEP,
  TABLE,
  Table,
  type Vec,
} from "../../../src/client/features/airhockey/table.ts";

const { length: L, width: W, puckRadius: PR, malletRadius: MR } = TABLE;

/** Deterministic randomness, so a simulated match is the same on every run. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

/** Mallets parked in their far corners, out of the way. */
const PARKED: Record<Side, Vec> = { player: { x: 0, y: 0 }, cpu: { x: L, y: 0 } };
const SPEEDS: Record<Side, number> = { player: 1000, cpu: 1000 };

function run(table: Table, seconds: number): Side | null {
  for (let t = 0; t < seconds; t += STEP) {
    const scorer = table.step(PARKED, SPEEDS);
    if (scorer) return scorer;
  }
  return null;
}

describe("air hockey table", () => {
  it("counts a puck over the goal line for the other side", () => {
    const table = new Table();
    table.puck.pos = { x: 100, y: W / 2 };
    table.puck.vel = { x: -400, y: 0 };
    expect(run(table, 2)).toBe("cpu");

    table.puck.pos = { x: L - 100, y: W / 2 };
    table.puck.vel = { x: 400, y: 0 };
    expect(run(table, 2)).toBe("player");
  });

  it("bounces off the rails next to the goal, and loses a little speed", () => {
    const table = new Table();
    table.puck.pos = { x: 100, y: 20 };
    table.puck.vel = { x: -400, y: 0 };
    expect(run(table, 0.4)).toBeNull();
    expect(table.puck.vel.x).toBeGreaterThan(0);
    expect(table.puck.vel.x).toBeLessThan(400);
  });

  it("keeps every mallet in its own half, inside the rails", () => {
    const table = new Table();
    for (let i = 0; i < 480; i++) {
      table.step({ player: { x: L, y: -50 }, cpu: { x: 0, y: W + 50 } }, SPEEDS);
    }
    const { player, cpu } = table.mallets;
    expect(player.pos).toEqual({ x: L / 2 - MR, y: MR });
    expect(cpu.pos).toEqual({ x: L / 2 + MR, y: W - MR });
  });

  it("lets a mallet shoot the puck, but never faster than the limit", () => {
    const table = new Table();
    table.puck.pos = { x: 100, y: W / 2 };
    table.mallets.player.pos = { x: 60, y: W / 2 };
    let fastest = 0;
    for (let i = 0; i < 30; i++) {
      table.step(
        { player: { x: 140, y: W / 2 }, cpu: PARKED.cpu },
        { player: POINTER_SPEED, cpu: 0 },
      );
      fastest = Math.max(fastest, table.puck.vel.x);
      expect(Math.hypot(table.puck.vel.x, table.puck.vel.y)).toBeLessThanOrEqual(PUCK_MAX_SPEED);
    }
    expect(fastest).toBeGreaterThan(300);
  });

  it("does not let a puck pinned against a rail buzz in place", () => {
    const table = new Table();
    table.puck.pos = { x: 100, y: PR };
    table.mallets.player.pos = { x: 100, y: PR + MR + PR };
    for (let i = 0; i < 120; i++) {
      table.step({ player: { x: 100, y: 0 }, cpu: PARKED.cpu }, SPEEDS);
      expect(Math.hypot(table.puck.vel.x, table.puck.vel.y)).toBeLessThan(1);
    }
  });

  it("puts a puck stuck at an end rail back into play", () => {
    const table = new Table();
    table.puck.pos = { x: PR, y: PR };
    run(table, 2);
    expect(table.puck.pos.x).toBeGreaterThan(L / 4);
  });

  it("serves to the side that conceded", () => {
    const table = new Table();
    table.serve("cpu");
    expect(table.puck.pos.x).toBeGreaterThan(L / 2);
    expect(table.puck.vel).toEqual({ x: 0, y: 0 });
  });
});

describe("C64 opponent", () => {
  it("guards its goal while the puck is on the other side", () => {
    const table = new Table();
    table.puck.pos = { x: 60, y: 30 };
    const target = new CpuPlayer("cpu", seeded(1)).target(table, STEP);
    expect(target.x).toBeGreaterThan(L * 0.7);
  });

  it("plays harder when behind and eases off when ahead, within limits", () => {
    expect(cpuSpeed({ player: 0, cpu: 0 })).toBe(CPU_SPEED);
    expect(cpuSpeed({ player: 3, cpu: 0 })).toBeGreaterThan(CPU_SPEED);
    expect(cpuSpeed({ player: 0, cpu: 4 })).toBeLessThan(CPU_SPEED);
    expect(cpuSpeed({ player: 9, cpu: 0 })).toBe(CPU_SPEED * 1.35);
  });

  it("plays whole matches against itself without getting stuck", () => {
    for (const seed of [1, 2, 3]) {
      const table = new Table();
      const left = new CpuPlayer("player", seeded(seed));
      const right = new CpuPlayer("cpu", seeded(seed + 100));
      let sinceGoal = 0;
      let longestWait = 0;
      let goals = 0;
      for (let t = 0; t < 300; t += STEP) {
        const scorer = table.step(
          { player: left.target(table, STEP), cpu: right.target(table, STEP) },
          { player: CPU_SPEED, cpu: CPU_SPEED },
        );
        sinceGoal += STEP;
        if (scorer) {
          goals++;
          longestWait = Math.max(longestWait, sinceGoal);
          sinceGoal = 0;
          table.serve(scorer === "player" ? "cpu" : "player");
        }
      }
      // Five simulated minutes: plenty of goals, and no rally that never ends.
      expect(goals).toBeGreaterThan(10);
      expect(Math.max(longestWait, sinceGoal)).toBeLessThan(120);
    }
  });
});

describe("fold", () => {
  it("reflects a predicted position off the rails", () => {
    expect(fold(50, 0, 100)).toBe(50);
    expect(fold(130, 0, 100)).toBe(70);
    expect(fold(-20, 0, 100)).toBe(20);
    expect(fold(250, 0, 100)).toBe(50);
  });
});
