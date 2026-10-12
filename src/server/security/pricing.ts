import type { TokenUsage } from "../chat/provider.ts";

/** USD per million tokens. Source: Anthropic pricing page, October 2026. */
interface ModelPrice {
  input: number;
  output: number;
}

const PRICES: Record<string, ModelPrice> = {
  // Prompts up to 100k tokens; ours are a few thousand.
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  mock: { input: 0, output: 0 },
};

/** Unknown models are priced like the most expensive one, so the spend cap errs on the safe side. */
const FALLBACK: ModelPrice = { input: 10, output: 50 };

const CACHE_READ_FACTOR = 0.1;
const CACHE_WRITE_FACTOR = 1.25;

export function priceFor(model: string): ModelPrice {
  return PRICES[model] ?? FALLBACK;
}

export function costUsd(model: string, usage: TokenUsage): number {
  const price = priceFor(model);
  const inputMillions =
    usage.inputTokens +
    usage.cacheReadTokens * CACHE_READ_FACTOR +
    usage.cacheWriteTokens * CACHE_WRITE_FACTOR;
  return (inputMillions * price.input + usage.outputTokens * price.output) / 1_000_000;
}

/**
 * Upper bound for one request before it is sent: every input character as a
 * token (real ratio is about 1 token per 3 to 4 characters), written to cache,
 * and the full output budget used.
 */
export function worstCaseCostUsd(
  model: string,
  inputChars: number,
  maxOutputTokens: number,
): number {
  return costUsd(model, {
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: inputChars,
    outputTokens: maxOutputTokens,
  });
}
