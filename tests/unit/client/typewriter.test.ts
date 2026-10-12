import { describe, expect, it } from "vitest";
import { type TextSink, Typewriter } from "../../../src/client/terminal/typewriter.ts";

/** A manual animation-frame clock: frames only run when the test says so. */
function setup(options: { instant?: boolean; charsPerSecond?: number } = {}) {
  const sink: TextSink & { data: string } = {
    data: "",
    appendData(text: string) {
      this.data += text;
    },
  };
  let time = 0;
  let pending: ((time: number) => void)[] = [];
  const writer = new Typewriter(sink, {
    charsPerSecond: options.charsPerSecond ?? 10,
    instant: () => options.instant ?? false,
    requestFrame: (callback) => {
      pending.push(callback);
      return pending.length;
    },
    now: () => time,
  });
  const frame = (ms: number) => {
    time += ms;
    const callbacks = pending;
    pending = [];
    for (const callback of callbacks) callback(time);
  };
  return { sink, writer, frame };
}

describe("Typewriter", () => {
  it("types at the configured speed", () => {
    const { sink, writer, frame } = setup({ charsPerSecond: 10 });
    writer.push("abc");
    expect(sink.data).toBe("");
    // 10 chars/s plus catch-up for a backlog of 3: one frame of 100 ms writes one char.
    frame(100);
    expect(sink.data).toBe("a");
    frame(1000);
    expect(sink.data).toBe("abc");
  });

  it("speeds up when the backlog grows", () => {
    const slow = setup({ charsPerSecond: 10 });
    slow.writer.push("x".repeat(10));
    slow.frame(500);
    const fast = setup({ charsPerSecond: 10 });
    fast.writer.push("x".repeat(400));
    fast.frame(500);
    expect(fast.sink.data.length).toBeGreaterThan(slow.sink.data.length * 5);
  });

  it("resolves end() once everything is written", async () => {
    const { sink, writer, frame } = setup();
    writer.push("Hoi");
    let done = false;
    const finished = writer.end().then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    frame(5000);
    await finished;
    expect(done).toBe(true);
    expect(sink.data).toBe("Hoi");
  });

  it("writes everything at once on flush and in instant mode", async () => {
    const { sink, writer } = setup();
    writer.push("Schnell");
    writer.flush();
    expect(sink.data).toBe("Schnell");

    const instant = setup({ instant: true });
    instant.writer.push("Sofort");
    expect(instant.sink.data).toBe("Sofort");
    await instant.writer.end();
  });

  it("never splits characters outside the basic plane", () => {
    const { sink, writer, frame } = setup({ charsPerSecond: 7 });
    writer.push("🍺a🍺🍺b🍺");
    for (let i = 0; i < 40; i++) {
      frame(37);
      // A lone high surrogate at the end would render as a broken glyph.
      expect(sink.data).not.toMatch(/[\uD800-\uDBFF]$/);
    }
    expect(sink.data).toBe("🍺a🍺🍺b🍺");
  });
});
