import Anthropic from "@anthropic-ai/sdk";
import type { Logger } from "../logger.ts";
import {
  type ChatProvider,
  type ProviderEvent,
  type ProviderRequest,
  ProviderUnavailableError,
  type StopReason,
  type SummaryRequest,
  type SummaryResult,
  type TokenUsage,
} from "./provider.ts";

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  effort: "low" | "medium" | "high";
  maxOutputTokens: number;
  logger: Logger;
  /** Replaces the network in tests. */
  fetch?: typeof fetch;
  maxRetries?: number;
}

export class AnthropicProvider implements ChatProvider {
  readonly mode = "live";
  readonly model: string;
  readonly #client: Anthropic;
  readonly #options: AnthropicProviderOptions;

  constructor(options: AnthropicProviderOptions) {
    this.model = options.model;
    this.#options = options;
    this.#client = new Anthropic({
      apiKey: options.apiKey,
      // One retry is enough for a chat: the visitor is watching a blinking cursor.
      maxRetries: options.maxRetries ?? 1,
      timeout: 45_000,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    const stream = this.#client.messages.stream(
      {
        model: this.model,
        max_tokens: this.#options.maxOutputTokens,
        // Chat answers are short; low effort keeps latency and cost down.
        // Thinking stays adaptive (the model default) and is never shown.
        output_config: { effort: this.#options.effort },
        // The system prompt only changes with the knowledge or the tier, so it caches well.
        system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
        messages: request.messages,
      },
      { signal: request.signal },
    );

    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        }
      }
      const message = await stream.finalMessage();
      yield {
        type: "end",
        stopReason: toStopReason(message.stop_reason),
        usage: toUsage(message.usage),
      };
    } catch (error) {
      throw this.#translate(error);
    }
  }

  async summarize(request: SummaryRequest): Promise<SummaryResult> {
    try {
      const message = await this.#client.messages.create(
        {
          model: this.model,
          max_tokens: request.maxOutputTokens,
          output_config: { effort: this.#options.effort },
          system: request.system,
          messages: [{ role: "user", content: request.transcript }],
        },
        { signal: request.signal },
      );
      const text = message.content.flatMap((block) => (block.type === "text" ? [block.text] : []));
      return { text: text.join(""), usage: toUsage(message.usage) };
    } catch (error) {
      throw this.#translate(error);
    }
  }

  #translate(error: unknown): unknown {
    if (error instanceof Anthropic.APIUserAbortError) return error;
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError
    ) {
      this.#options.logger.error("anthropic.auth_failed", { status: error.status });
      return new ProviderUnavailableError("Anthropic rejected the API key.");
    }
    if (error instanceof Anthropic.RateLimitError) {
      this.#options.logger.warn("anthropic.rate_limited", { status: error.status });
      return new ProviderUnavailableError("Anthropic rate limit reached.");
    }
    if (error instanceof Anthropic.APIConnectionError) {
      this.#options.logger.warn("anthropic.connection_failed", { message: error.message });
      return new ProviderUnavailableError("Anthropic is not reachable.");
    }
    if (error instanceof Anthropic.APIError && (error.status ?? 0) >= 500) {
      this.#options.logger.warn("anthropic.server_error", { status: error.status });
      return new ProviderUnavailableError("Anthropic returned a server error.");
    }
    return error;
  }
}

function toUsage(usage: Anthropic.Usage): TokenUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

function toStopReason(reason: string | null): StopReason {
  if (reason === "max_tokens") return "max_tokens";
  if (reason === "refusal") return "refusal";
  return "end";
}
