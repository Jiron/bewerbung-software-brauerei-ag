import type { ChatTurn } from "./provider.ts";

interface Conversation {
  /** Notes on everything before `turns`, written by the model once the conversation got long. */
  summary: string | null;
  turns: ChatTurn[];
  touchedAt: number;
}

/** A conversation as the model gets to see it. */
export interface History {
  summary: string | null;
  turns: ChatTurn[];
}

export interface ConversationOptions {
  maxConversations?: number;
  /** Compact once the stored turns reach this many... */
  compactAfterTurns?: number;
  /** ...or this many characters, whichever comes first. */
  compactAfterChars?: number;
  /** The newest turns stay word for word; only older ones are summarized. */
  keepTurns?: number;
  /** Hard cap for when compacting is not possible (budget gone, API down): the oldest turns go. */
  maxTurns?: number;
  ttlMs?: number;
  now?: () => number;
}

/**
 * Conversation history lives on the server, keyed by a random id from the
 * client. The client therefore cannot forge earlier assistant turns to steer
 * the model, and requests stay small.
 *
 * Long conversations are compacted like a long Claude Code session: the older
 * turns become a short summary, the newest stay word for word. That keeps every
 * request small and cheap however long someone keeps asking. Bounded in size,
 * count and age.
 */
export class ConversationStore {
  readonly #conversations = new Map<string, Conversation>();
  readonly #maxConversations: number;
  readonly #compactAfterTurns: number;
  readonly #compactAfterChars: number;
  readonly #keepTurns: number;
  readonly #maxTurns: number;
  readonly #ttlMs: number;
  readonly #now: () => number;

  constructor(options: ConversationOptions = {}) {
    this.#maxConversations = options.maxConversations ?? 2_000;
    // Even numbers, so trimming and compacting always keep whole question/answer pairs.
    this.#compactAfterTurns = even(options.compactAfterTurns ?? 16);
    this.#compactAfterChars = options.compactAfterChars ?? 16_000;
    this.#keepTurns = even(options.keepTurns ?? 4);
    this.#maxTurns = even(options.maxTurns ?? 40);
    this.#ttlMs = options.ttlMs ?? 3 * 60 * 60 * 1000;
    this.#now = options.now ?? Date.now;
  }

  /** History for the next request: summary, earlier turns and the new question. */
  history(id: string, question: string): History {
    const { summary, turns } = this.#get(id) ?? { summary: null, turns: [] };
    return { summary, turns: [...turns, { role: "user", content: question }] };
  }

  /** Stores a finished exchange. Unfinished ones (aborted, failed) are never stored. */
  append(id: string, question: string, answer: string): void {
    const conversation = this.#get(id) ?? { summary: null, turns: [], touchedAt: 0 };
    const turns: ChatTurn[] = [
      ...conversation.turns,
      { role: "user", content: question },
      { role: "assistant", content: answer },
    ];
    this.#conversations.delete(id);
    this.#conversations.set(id, {
      summary: conversation.summary,
      turns: turns.slice(Math.max(0, turns.length - this.#maxTurns)),
      touchedAt: this.#now(),
    });
    this.#evict();
  }

  /** The part of a long conversation that should be summarized now, or null while it is short. */
  compactionDue(id: string): History | null {
    const conversation = this.#get(id);
    if (!conversation) return null;
    const { summary, turns } = conversation;
    const chars = turns.reduce((sum, turn) => sum + turn.content.length, 0);
    if (turns.length < this.#compactAfterTurns && chars < this.#compactAfterChars) return null;
    const older = turns.slice(0, Math.max(0, turns.length - this.#keepTurns));
    return older.length > 0 ? { summary, turns: older } : null;
  }

  /**
   * Replaces the summarized turns with their summary. Skipped if the history
   * changed in the meantime (a second tab asking in parallel), because then
   * the summary would describe the wrong turns.
   */
  compact(id: string, summarized: readonly ChatTurn[], summary: string): void {
    const conversation = this.#get(id);
    if (!conversation) return;
    const unchanged = summarized.every((turn, i) => conversation.turns[i] === turn);
    if (!unchanged) return;
    conversation.turns = conversation.turns.slice(summarized.length);
    conversation.summary = summary;
  }

  #get(id: string): Conversation | null {
    const conversation = this.#conversations.get(id);
    if (!conversation) return null;
    if (this.#now() - conversation.touchedAt > this.#ttlMs) {
      this.#conversations.delete(id);
      return null;
    }
    return conversation;
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

function even(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
}
