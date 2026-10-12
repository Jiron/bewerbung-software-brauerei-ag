import type {
  ApiError,
  ApiErrorCode,
  ChatEvent,
  KnowledgeIndex,
  SectionDetail,
  SessionInfo,
  UnlockResponse,
} from "../shared/api.ts";
import { SseParser, toChatEvent } from "../shared/sse.ts";

/** A failed request, normalized: either the server's error body or "offline". */
export class RequestError extends Error {
  readonly code: ApiErrorCode | "offline";
  readonly retryAfterSeconds: number | undefined;
  readonly attemptsLeft: number | undefined;

  constructor(code: ApiErrorCode | "offline", body: Partial<ApiError> = {}) {
    super(body.message ?? code);
    this.code = code;
    this.retryAfterSeconds = body.retryAfterSeconds;
    this.attemptsLeft = body.attemptsLeft;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...init.headers },
      credentials: "same-origin",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new RequestError("offline");
  }
  if (!response.ok) throw await toRequestError(response);
  return (await response.json()) as T;
}

async function toRequestError(response: Response): Promise<RequestError> {
  try {
    const body = (await response.json()) as ApiError;
    return new RequestError(body.error ?? "internal", body);
  } catch {
    return new RequestError(response.status >= 500 ? "upstream_unavailable" : "internal");
  }
}

export const api = {
  session: () => request<SessionInfo>("/api/session"),
  knowledge: () => request<KnowledgeIndex>("/api/knowledge"),
  section: (id: string) =>
    request<SectionDetail>(`/api/knowledge/${id.split("/").map(encodeURIComponent).join("/")}`),
  unlock: (code: string) =>
    request<UnlockResponse>("/api/unlock", { method: "POST", body: JSON.stringify({ code }) }),
  lock: () => request<UnlockResponse>("/api/lock", { method: "POST", body: "{}" }),
};

/**
 * Sends a question and calls `onEvent` for every server-sent event.
 * Errors before the stream starts (rate limit, validation) throw a RequestError;
 * errors during the stream arrive as "error" events.
 */
export async function streamChat(
  body: { conversationId: string; message: string },
  onEvent: (event: ChatEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new RequestError("offline");
  }
  if (!response.ok || !response.body) throw await toRequestError(response);

  const parser = new SseParser();
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const message of parser.push(value)) {
        const event = toChatEvent(message);
        if (event) onEvent(event);
      }
    }
  } catch (error) {
    if (signal.aborted) throw error;
    throw new RequestError("offline");
  }
}
