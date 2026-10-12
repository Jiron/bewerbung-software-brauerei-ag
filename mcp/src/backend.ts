import type {
  ApiError,
  ChatEvent,
  KnowledgeIndex,
  SectionDetail,
  SessionInfo,
  SourceRef,
} from "../../src/shared/api.ts";
import { SseParser, toChatEvent } from "../../src/shared/sse.ts";

export interface Answer {
  text: string;
  sources: SourceRef[];
  attempt: boolean;
  truncated: boolean;
}

export class BackendError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Talks to a deployed LOAD MANASSES server over the same HTTP API the C64 UI
 * uses. Keeps one conversation and, after unlock, the session cookie.
 */
export class Backend {
  readonly baseUrl: string;
  readonly #fetch: Fetch;
  #cookie: string | null = null;
  #conversationId = crypto.randomUUID();

  constructor(options: { baseUrl: string; fetch?: Fetch }) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.#fetch = options.fetch ?? ((url, init) => fetch(url, init));
  }

  session(): Promise<SessionInfo> {
    return this.#json("/api/session");
  }

  knowledge(): Promise<KnowledgeIndex> {
    return this.#json("/api/knowledge");
  }

  section(id: string): Promise<SectionDetail> {
    return this.#json(`/api/knowledge/${id.split("/").map(encodeURIComponent).join("/")}`);
  }

  async unlock(code: string): Promise<void> {
    const response = await this.#request("/api/unlock", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    if (cookie) this.#cookie = cookie;
  }

  newConversation(): void {
    this.#conversationId = crypto.randomUUID();
  }

  async ask(question: string): Promise<Answer> {
    const response = await this.#request("/api/chat", {
      method: "POST",
      body: JSON.stringify({ conversationId: this.#conversationId, message: question }),
    });
    if (!response.body) throw new BackendError("internal", "Empty response.");

    const answer: Answer = { text: "", sources: [], attempt: false, truncated: false };
    const parser = new SseParser();
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      for (const message of parser.push(decoder.decode(chunk, { stream: true }))) {
        const event: ChatEvent | null = toChatEvent(message);
        if (event?.type === "delta") answer.text += event.text;
        if (event?.type === "meta") Object.assign(answer, event);
        if (event?.type === "error") throw new BackendError(event.error, event.message);
      }
    }
    return { ...answer, text: answer.text.trim() };
  }

  async #json<T>(path: string): Promise<T> {
    return (await (await this.#request(path)).json()) as T;
  }

  async #request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.#cookie) headers.cookie = this.#cookie;
    let response: Response;
    try {
      response = await this.#fetch(`${this.baseUrl}${path}`, { ...init, headers });
    } catch {
      throw new BackendError(
        "offline",
        `?DEVICE NOT PRESENT ERROR: ${this.baseUrl} ist nicht erreichbar.`,
      );
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as Partial<ApiError>;
      throw new BackendError(body.error ?? "internal", body.message ?? `HTTP ${response.status}`);
    }
    return response;
  }
}
