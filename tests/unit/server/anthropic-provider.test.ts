/**
 * The live provider without the network: the SDK gets a fake fetch that
 * answers like the Messages API, so request shape, stream handling, usage
 * and error mapping are tested before the first real API call.
 */
import { describe, expect, it } from "vitest";
import { AnthropicProvider } from "../../../src/server/chat/anthropic-provider.ts";
import {
  type ProviderEvent,
  type ProviderRequest,
  ProviderUnavailableError,
} from "../../../src/server/chat/provider.ts";
import { silentLogger } from "../../../src/server/logger.ts";

type Event = Record<string, unknown> & { type: string };

function sseResponse(events: Event[]): Response {
  const body = events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function messageStream(options: {
  text: string[];
  stopReason?: string;
  thinking?: boolean;
}): Event[] {
  const events: Event[] = [
    {
      type: "message_start",
      message: {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-haiku-5-5",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 120,
          output_tokens: 1,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 3000,
        },
      },
    },
  ];
  let index = 0;
  if (options.thinking) {
    events.push(
      {
        type: "content_block_start",
        index,
        content_block: { type: "thinking", thinking: "", signature: "" },
      },
      { type: "content_block_delta", index, delta: { type: "thinking_delta", thinking: "" } },
      { type: "content_block_delta", index, delta: { type: "signature_delta", signature: "sig" } },
      { type: "content_block_stop", index },
    );
    index++;
  }
  events.push({ type: "content_block_start", index, content_block: { type: "text", text: "" } });
  for (const text of options.text) {
    events.push({ type: "content_block_delta", index, delta: { type: "text_delta", text } });
  }
  events.push(
    { type: "content_block_stop", index },
    {
      type: "message_delta",
      delta: { stop_reason: options.stopReason ?? "end_turn", stop_sequence: null },
      usage: { output_tokens: 42 },
    },
    { type: "message_stop" },
  );
  return events;
}

function provider(fetchImpl: typeof fetch) {
  return new AnthropicProvider({
    apiKey: "sk-ant-test",
    model: "claude-haiku-5-5",
    effort: "low",
    maxOutputTokens: 1024,
    logger: silentLogger,
    fetch: fetchImpl,
    maxRetries: 0,
  });
}

const request = (): ProviderRequest => ({
  system: "SYSTEM PROMPT",
  messages: [{ role: "user", content: "Hoi" }],
  sections: [],
  lockedSectionCount: 0,
  persona: { name: "Max Muster", shortName: "Max" },
  signal: new AbortController().signal,
});

async function collect(events: AsyncIterable<ProviderEvent>): Promise<ProviderEvent[]> {
  const out: ProviderEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

describe("AnthropicProvider", () => {
  it("sends Haiku 5.5 the cached system prompt with low effort and no sampling parameters", async () => {
    let sent: Record<string, unknown> = {};
    const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return sseResponse(messageStream({ text: ["Hoi"] }));
    }) as typeof fetch;

    await collect(provider(fake).stream(request()));
    expect(sent).toMatchObject({
      model: "claude-haiku-5-5",
      max_tokens: 1024,
      stream: true,
      output_config: { effort: "low" },
      system: [{ type: "text", text: "SYSTEM PROMPT", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "Hoi" }],
    });
    expect(sent).not.toHaveProperty("temperature");
    expect(sent).not.toHaveProperty("thinking");
  });

  it("streams only text, ignores thinking blocks and reports usage", async () => {
    const fake = (async () =>
      sseResponse(messageStream({ text: ["Hoi ", "zäme"], thinking: true }))) as typeof fetch;
    const events = await collect(provider(fake).stream(request()));
    expect(events).toEqual([
      { type: "text", text: "Hoi " },
      { type: "text", text: "zäme" },
      {
        type: "end",
        stopReason: "end",
        usage: { inputTokens: 120, outputTokens: 42, cacheReadTokens: 3000, cacheWriteTokens: 0 },
      },
    ]);
  });

  it.each([
    ["refusal", "refusal"],
    ["max_tokens", "max_tokens"],
  ])("maps stop reason %s", async (apiReason, ours) => {
    const fake = (async () =>
      sseResponse(messageStream({ text: ["..."], stopReason: apiReason }))) as typeof fetch;
    const events = await collect(provider(fake).stream(request()));
    expect(events.at(-1)).toMatchObject({ type: "end", stopReason: ours });
  });

  it.each([
    [529, "overloaded_error"],
    [500, "api_error"],
    [429, "rate_limit_error"],
    [401, "authentication_error"],
  ])("turns HTTP %i into ProviderUnavailableError", async (status, type) => {
    const fake = (async () =>
      new Response(JSON.stringify({ type: "error", error: { type, message: "nope" } }), {
        status,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    await expect(collect(provider(fake).stream(request()))).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it("summarizes with one plain request and reports usage", async () => {
    let sent: Record<string, unknown> = {};
    const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const body = {
        id: "msg_summary",
        type: "message",
        role: "assistant",
        model: "claude-haiku-5-5",
        content: [
          { type: "thinking", thinking: "", signature: "sig" },
          { type: "text", text: "* Notiz" },
        ],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 900, output_tokens: 40 },
      };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const result = await provider(fake).summarize({
      system: "FASSE ZUSAMMEN",
      transcript: "<gespraech>BESUCHER: Hoi</gespraech>",
      previousSummary: null,
      turns: [],
      maxOutputTokens: 600,
      signal: new AbortController().signal,
    });
    expect(sent).toMatchObject({
      model: "claude-haiku-5-5",
      max_tokens: 600,
      output_config: { effort: "low" },
      system: "FASSE ZUSAMMEN",
      messages: [{ role: "user", content: "<gespraech>BESUCHER: Hoi</gespraech>" }],
    });
    expect(sent).not.toHaveProperty("stream");
    expect(result).toEqual({
      text: "* Notiz",
      usage: { inputTokens: 900, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 },
    });
  });

  it("treats an unreachable API as unavailable", async () => {
    const fake = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await expect(collect(provider(fake).stream(request()))).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });
});
