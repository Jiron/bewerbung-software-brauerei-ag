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
  persona: Persona;
  signal: AbortSignal;
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
