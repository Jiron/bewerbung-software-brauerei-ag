import { describe, expect, it } from "vitest";
import { SseParser, toChatEvent } from "../../../src/shared/sse.ts";

describe("SseParser", () => {
  it("parses events split across chunks", () => {
    const stream =
      'event: delta\ndata: {"type":"delta","text":"Hoi"}\n\nevent: done\r\ndata: {"type":"done"}\r\n\r\n';
    for (let i = 1; i < stream.length; i++) {
      const parser = new SseParser();
      const messages = [...parser.push(stream.slice(0, i)), ...parser.push(stream.slice(i))];
      expect(messages.map(toChatEvent)).toEqual([{ type: "delta", text: "Hoi" }, { type: "done" }]);
    }
  });

  it("joins multi-line data and ignores comments", () => {
    const parser = new SseParser();
    expect(parser.push(": ping\nevent: x\ndata: a\ndata: b\n\n")).toEqual([
      { event: "x", data: "a\nb" },
    ]);
  });

  it("ignores events whose payload does not match the event name", () => {
    expect(toChatEvent({ event: "delta", data: '{"type":"done"}' })).toBeNull();
    expect(toChatEvent({ event: "delta", data: "not json" })).toBeNull();
  });
});
