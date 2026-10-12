import type { ChatTurn } from "./provider.ts";

interface Conversation {
  turns: ChatTurn[];
  touchedAt: number;
}

/**
 * Conversation history lives on the server, keyed by a random id from the
 * client. The client therefore cannot forge earlier assistant turns to steer
 * the model, and requests stay small. Bounded in size, count and age.
 */
export class ConversationStore {
  readonly #conversations = new Map<string, Conversation>();
  readonly #maxConversations: number;
  readonly #maxTurns: number;
  readonly #ttlMs: number;
  readonly #now: () => number;

  constructor(
    options: {
      maxConversations?: number;
      maxTurns?: number;
      ttlMs?: number;
      now?: () => number;
    } = {},
  ) {
    this.#maxConversations = options.maxConversations ?? 2_000;
    // Even, so trimming always keeps whole question/answer pairs.
    this.#maxTurns = Math.max(2, Math.floor((options.maxTurns ?? 16) / 2) * 2);
    this.#ttlMs = options.ttlMs ?? 3 * 60 * 60 * 1000;
    this.#now = options.now ?? Date.now;
  }

  /** History for the next request: earlier turns plus the new question. */
  history(id: string, question: string): ChatTurn[] {
    return [...this.#get(id), { role: "user", content: question }];
  }

  /** Stores a finished exchange. Unfinished ones (aborted, failed) are never stored. */
  append(id: string, question: string, answer: string): void {
    const turns: ChatTurn[] = [
      ...this.#get(id),
      { role: "user", content: question },
      { role: "assistant", content: answer },
    ];
    const trimmed = turns.slice(Math.max(0, turns.length - this.#maxTurns));
    this.#conversations.delete(id);
    this.#conversations.set(id, { turns: trimmed, touchedAt: this.#now() });
    this.#evict();
  }

  #get(id: string): ChatTurn[] {
    const conversation = this.#conversations.get(id);
    if (!conversation) return [];
    if (this.#now() - conversation.touchedAt > this.#ttlMs) {
      this.#conversations.delete(id);
      return [];
    }
    return conversation.turns;
  }

  #evict(): void {
    // Map keeps insertion order and append() re-inserts, so the first key is the stalest.
    while (this.#conversations.size > this.#maxConversations) {
      const oldest = this.#conversations.keys().next().value;
      if (oldest === undefined) break;
      this.#conversations.delete(oldest);
    }
  }
}
