/**
 * The HTTP contract between server, browser client and MCP client.
 * Kept free of runtime code so every side can import it.
 */

export type Tier = "public" | "private";

export type ProviderMode = "live" | "mock";

export interface Persona {
  name: string;
  shortName: string;
}

export interface SessionInfo {
  tier: Tier;
  mode: ProviderMode;
  /** True when the server runs on the fictional example knowledge. */
  demo: boolean;
  persona: Persona;
  limits: { maxMessageLength: number };
  /** Number of locked sections. Never their titles: those stay server-side until unlock. */
  lockedSectionCount: number;
  unlockAvailable: boolean;
  /** REQUIRE_ACCESS_CODE: before unlock, no section is visible and no question reaches the AI. */
  accessRequired: boolean;
  repoUrl: string | null;
}

export interface SectionSummary {
  /** Stable id, e.g. "werdegang/lehre". Used in SOURCES lines and for LIST <id>. */
  id: string;
  title: string;
  fileTitle: string;
  tier: Tier;
  /** Length of the raw text, shown as C64 "blocks" in the directory listing. */
  chars: number;
}

export interface SectionDetail extends SectionSummary {
  content: string;
}

export interface KnowledgeIndex {
  sections: SectionSummary[];
  lockedSectionCount: number;
}

export interface ChatRequestBody {
  conversationId: string;
  message: string;
}

export interface SourceRef {
  id: string;
  title: string;
}

export type ApiErrorCode =
  | "invalid_request"
  | "message_too_long"
  | "rate_limited"
  | "spend_cap"
  | "upstream_unavailable"
  | "refusal"
  | "wrong_code"
  | "locked_out"
  | "unlock_unavailable"
  | "locked"
  | "not_found"
  | "internal";

export interface ApiError {
  error: ApiErrorCode;
  message: string;
  retryAfterSeconds?: number;
  attemptsLeft?: number;
}

/** Server-sent events emitted by POST /api/chat. */
export type ChatEvent =
  | { type: "delta"; text: string }
  | { type: "meta"; sources: SourceRef[]; attempt: boolean; truncated: boolean }
  | { type: "done" }
  | { type: "error"; error: ApiErrorCode; message: string; retryAfterSeconds?: number };

export interface UnlockResponse {
  tier: Tier;
}
