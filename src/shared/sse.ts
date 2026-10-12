import type { ChatEvent } from "./api.ts";

export interface SseMessage {
  event: string;
  data: string;
}

/**
 * Incremental parser for text/event-stream. EventSource only does GET,
 * and the chat is a POST, so browser and MCP client read the stream themselves.
 */
export class SseParser {
  #buffer = "";

  push(chunk: string): SseMessage[] {
    this.#buffer += chunk.replace(/\r\n?/g, "\n");
    const blocks = this.#buffer.split("\n\n");
    this.#buffer = blocks.pop() ?? "";
    return blocks.flatMap((block) => {
      const message = parseBlock(block);
      return message ? [message] : [];
    });
  }
}

function parseBlock(block: string): SseMessage | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  return data.length > 0 ? { event, data: data.join("\n") } : null;
}

/** Parses one SSE message from /api/chat. Unknown or malformed messages are ignored. */
export function toChatEvent(message: SseMessage): ChatEvent | null {
  try {
    const event = JSON.parse(message.data) as ChatEvent;
    return typeof event === "object" && event !== null && event.type === message.event
      ? event
      : null;
  } catch {
    return null;
  }
}
