import { describe, expect, it } from "vitest";
import { type TextSink, Typewriter } from "../../../src/client/terminal/typewriter.ts";

/** A manual animation-frame clock: frames only run when the test says so. */
function setup(options: { instant?: boolean; wordsPerSecond?: number; random?: number } = {}) {
  const sink: TextSink & { data: string } = {
    data: "",
    appendData(text: string) {
      this.data += text;
    },
  };
  let time = 0;
  let pending: ((time: number) => void)[] = [];
  const writer = new Typewriter(sink, {
    wordsPerSecond: options.wordsPerSecond ?? 5,
    instant: () => options.instant ?? false,
    requestFrame: (callback) => {
      pending.push(callback);
      return pending.length;
    },
    now: () => time,
    // 0.5 means: two words per burst, pauses exactly as long as the pace says.
    random: () => options.random ?? 0.5,
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
  it("prints bursts of whole words with pauses in between", () => {
    const { sink, writer, frame } = setup({ wordsPerSecond: 5 });
    writer.push("Ich bin ein kleiner Brotkasten ");
    frame(16);
    expect(sink.data).toBe("Ich bin ");
    // Two words at five words per second: the next burst is due 400 ms later.
    frame(300);
    expect(sink.data).toBe("Ich bin ");
    frame(120);
    expect(sink.data).toBe("Ich bin ein kleiner ");
  });

  it("waits for the rest of a word the model is still sending", () => {
    const { sink, writer, frame } = setup();
    writer.push("Brot");
    frame(16);
    expect(sink.data).toBe("");
    writer.push("kasten ist");
    frame(16);
    expect(sink.data).toBe("Brotkasten ");
    void writer.end();
    frame(1000);
    expect(sink.data).toBe("Brotkasten ist");
  });

  it("thinks a little longer after a sentence", () => {
    const { sink, writer, frame } = setup({ wordsPerSecond: 5 });
    writer.push("Ja, klar. Und dann ");
    frame(16);
    expect(sink.data).toBe("Ja, klar. ");
    frame(420);
    expect(sink.data).toBe("Ja, klar. ");
    frame(140);
    expect(sink.data).toBe("Ja, klar. Und dann ");
  });

  it("prints bigger bursts when the backlog grows", () => {
    const slow = setup();
    slow.writer.push("Wort ".repeat(10));
    for (let i = 0; i < 10; i++) slow.frame(100);
    const fast = setup();
    fast.writer.push("Wort ".repeat(400));
    for (let i = 0; i < 10; i++) fast.frame(100);
    expect(fast.sink.data.length).toBeGreaterThan(slow.sink.data.length * 5);
  });

  it("resolves end() once everything is written", async () => {
    const { sink, writer, frame } = setup();
    writer.push("Hoi zäme");
    let done = false;
    const finished = writer.end().then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    for (let i = 0; i < 5; i++) frame(1000);
    await finished;
    expect(done).toBe(true);
    expect(sink.data).toBe("Hoi zäme");
  });

  it("writes everything at once on flush and in instant mode", async () => {
    const { sink, writer } = setup();
    writer.push("Schnell wie der Blitz");
    writer.flush();
    expect(sink.data).toBe("Schnell wie der Blitz");

    const instant = setup({ instant: true });
    instant.writer.push("Sofort");
    expect(instant.sink.data).toBe("Sofort");
    await instant.writer.end();
  });

  it("keeps line breaks and characters outside the basic plane intact", () => {
    const { sink, writer, frame } = setup();
    writer.push("🍺a 🍺🍺\n\n* b🍺 ");
    void writer.end();
    for (let i = 0; i < 40; i++) {
      frame(37);
      // A lone high surrogate at the end would render as a broken glyph.
      expect(sink.data).not.toMatch(/[\uD800-\uDBFF]$/);
    }
    expect(sink.data).toBe("🍺a 🍺🍺\n\n* b🍺 ");
  });
});
