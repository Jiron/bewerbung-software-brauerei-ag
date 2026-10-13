import type { Persona, ProviderMode } from "../../shared/api.ts";
import type { KnowledgeSection } from "../knowledge/parse.ts";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ProviderRequest {
  system: string;
  messages: ChatTurn[];
  /** The sections the system prompt was built from. The mock answers from these. */
  sections: KnowledgeSection[];
  /** How many sections the visitor cannot see yet. The prompt mentions them, so does the mock. */
  lockedSectionCount: number;
  persona: Persona;
  signal: AbortSignal;
}

/** Condensing the older part of a long conversation into notes. */
export interface SummaryRequest {
  system: string;
  /** The older turns as one text, ready to send. */
  transcript: string;
  /** What the transcript was built from. The mock summarizes these. */
  previousSummary: string | null;
  turns: ChatTurn[];
  maxOutputTokens: number;
  signal: AbortSignal;
}

export interface SummaryResult {
  text: string;
  usage: TokenUsage;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export type StopReason = "end" | "max_tokens" | "refusal";

export type ProviderEvent =
  | { type: "text"; text: string }
  | { type: "end"; usage: TokenUsage; stopReason: StopReason };

export interface ChatProvider {
  readonly mode: ProviderMode;
  /** Model id, used to price the usage. */
  readonly model: string;
  stream(request: ProviderRequest): AsyncIterable<ProviderEvent>;
  summarize(request: SummaryRequest): Promise<SummaryResult>;
}

/** The model API is down, overloaded or rejected our credentials. Retrying later may help. */
export class ProviderUnavailableError extends Error {
  override name = "ProviderUnavailableError";
}

export const NO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};
