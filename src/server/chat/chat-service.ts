import type { ChatEvent, SourceRef, Tier } from "../../shared/api.ts";
import { displayTitle } from "../knowledge/parse.ts";
import {
  type Knowledge,
  type KnowledgeStore,
  lockedSectionCount,
  visibleSections,
} from "../knowledge/store.ts";
import type { Logger } from "../logger.ts";
import { costUsd, worstCaseCostUsd } from "../security/pricing.ts";
import type { SpendTracker } from "../security/spend-tracker.ts";
import type { ConversationStore } from "./conversations.ts";
import { HouseStyleFilter } from "./house-style-filter.ts";
import { MarkerExtractor } from "./markers.ts";
import { buildSystemPrompt } from "./prompt.ts";
import {
  type ChatProvider,
  NO_USAGE,
  ProviderUnavailableError,
  type StopReason,
  type TokenUsage,
} from "./provider.ts";

export interface ChatServiceDeps {
  provider: ChatProvider;
  knowledge: KnowledgeStore;
  conversations: ConversationStore;
  spend: SpendTracker;
  maxOutputTokens: number;
  repoUrl: string | null;
  logger: Logger;
}

export interface AnswerInput {
  conversationId: string;
  question: string;
  tier: Tier;
  signal: AbortSignal;
}

/**
 * One question in, a stream of ChatEvents out. Knows nothing about HTTP, so the
 * route stays thin and the whole flow is testable with a fake provider.
 *
 *   provider text ─▶ MarkerExtractor ─▶ HouseStyleFilter ─▶ "delta" events
 *                          └─ sources, attempt flag ─────▶ "meta" event
 */
export class ChatService {
  readonly #deps: ChatServiceDeps;
  readonly #prompts = new Map<string, string>();

  constructor(deps: ChatServiceDeps) {
    this.#deps = deps;
  }

  async *answer(input: AnswerInput): AsyncGenerator<ChatEvent> {
    const { provider, knowledge, conversations, spend, logger } = this.#deps;
    const started = Date.now();
    const snapshot = knowledge.current;
    const sections = visibleSections(snapshot, input.tier);
    const system = this.#systemPrompt(snapshot, input.tier);
    const messages = conversations.history(input.conversationId, input.question);

    const inputChars = system.length + messages.reduce((sum, turn) => sum + turn.content.length, 0);
    const reservation = spend.reserve(
      worstCaseCostUsd(provider.model, inputChars, this.#deps.maxOutputTokens),
    );
    if (!reservation) {
      logger.warn("chat.spend_cap_reached", { spentUsd: spend.spentTodayUsd });
      yield {
        type: "error",
        error: "spend_cap",
        message: "Das KI-Budget für heute ist aufgebraucht. Morgen gibts ein neues Fass.",
      };
      return;
    }

    const markers = new MarkerExtractor();
    const style = new HouseStyleFilter();
    let raw = "";
    let usage: TokenUsage = NO_USAGE;
    let stopReason: StopReason = "end";

    try {
      for await (const event of provider.stream({
        system,
        messages,
        sections,
        persona: snapshot.persona,
        signal: input.signal,
      })) {
        if (event.type === "end") {
          usage = event.usage;
          stopReason = event.stopReason;
          continue;
        }
        raw += event.text;
        const visible = style.push(markers.push(event.text));
        if (visible) yield { type: "delta", text: visible };
      }

      const tail = style.push(markers.flush()) + style.flush();
      if (tail) yield { type: "delta", text: tail };
    } catch (error) {
      // We cannot know what an interrupted request cost, so keep the worst case booked.
      reservation.settle(worstCaseCostUsd(provider.model, inputChars, this.#deps.maxOutputTokens));
      if (input.signal.aborted) return;
      if (error instanceof ProviderUnavailableError) {
        yield {
          type: "error",
          error: "upstream_unavailable",
          message: "Die KI ist gerade nicht erreichbar. Bitte gleich nochmal versuchen.",
        };
        return;
      }
      logger.error("chat.failed", { error: String(error) });
      yield { type: "error", error: "internal", message: "Da ist etwas schiefgelaufen." };
      return;
    }

    const cost = costUsd(provider.model, usage);
    reservation.settle(cost);
    const found = markers.markers;
    logger.info("chat.answered", {
      mode: provider.mode,
      tier: input.tier,
      stopReason,
      ms: Date.now() - started,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      costUsd: Number(cost.toFixed(6)),
      sources: found.sourceIds.length,
      attempt: found.attempt,
    });

    if (stopReason === "refusal") {
      yield {
        type: "error",
        error: "refusal",
        message: "Dazu sage ich nichts. Frag mich lieber etwas über meine Arbeit.",
      };
      return;
    }

    const byId = new Map(sections.map((section) => [section.id, section]));
    const sources: SourceRef[] = found.sourceIds.flatMap((id) => {
      const section = byId.get(id);
      // Ids the model made up (or that a visitor talked it into) are dropped.
      return section ? [{ id, title: displayTitle(section) }] : [];
    });

    yield { type: "meta", sources, attempt: found.attempt, truncated: stopReason === "max_tokens" };
    // The raw text keeps the markers, so the model sees its own format in the history.
    conversations.append(input.conversationId, input.question, raw);
    yield { type: "done" };
  }

  #systemPrompt(knowledge: Knowledge, tier: Tier): string {
    const key = `${knowledge.version}:${tier}`;
    let prompt = this.#prompts.get(key);
    if (!prompt) {
      if (this.#prompts.size > 4) this.#prompts.clear();
      prompt = buildSystemPrompt({
        persona: knowledge.persona,
        tier,
        sections: visibleSections(knowledge, tier),
        lockedSectionCount: lockedSectionCount(knowledge, tier),
        repoUrl: this.#deps.repoUrl,
      });
      this.#prompts.set(key, prompt);
    }
    return prompt;
  }
}
