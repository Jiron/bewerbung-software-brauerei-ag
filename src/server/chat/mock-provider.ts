import type { KnowledgeSection } from "../knowledge/parse.ts";
import {
  type ChatProvider,
  NO_USAGE,
  type ProviderEvent,
  type ProviderRequest,
  type SummaryRequest,
  type SummaryResult,
} from "./provider.ts";

/**
 * Canned answers without an API key: "aus der Dose" instead of "frisch gezapft".
 *
 * It does a tiny keyword search over the same knowledge sections the real model
 * would see and emits the same markers, so the whole pipeline (markers, sources,
 * house style, streaming, limits) runs for free in development, tests and CI.
 */
export class MockProvider implements ChatProvider {
  readonly mode = "mock";
  readonly model = "mock";
  readonly #delayMs: number;

  constructor(options: { delayMs: number }) {
    this.#delayMs = options.delayMs;
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    const question = request.messages.findLast((turn) => turn.role === "user")?.content ?? "";
    const reply = composeMockReply(
      question,
      request.sections,
      request.persona.shortName,
      request.lockedSectionCount,
    );

    for (const piece of reply.match(/\S+\s*|\s+/g) ?? []) {
      if (this.#delayMs > 0) await sleep(this.#delayMs, request.signal);
      request.signal.throwIfAborted();
      yield { type: "text", text: piece };
    }
    yield { type: "end", usage: NO_USAGE, stopReason: "end" };
  }

  /** No model to summarize with, so the notes just list what was asked. */
  async summarize(request: SummaryRequest): Promise<SummaryResult> {
    const questions = request.turns
      .filter((turn) => turn.role === "user")
      .map((turn) => `* Gefragt: «${clip(turn.content.replace(/\s+/g, " "), 80)}»`);
    const notes = [...(request.previousSummary?.split("\n") ?? []), ...questions];
    return { text: notes.slice(-12).join("\n"), usage: NO_USAGE };
  }
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const MANIPULATION = [
  /ignor(e|iere|ier)/i,
  // "lüg", "lügen", "Lüge" but not "Lieblingspizza".
  /\b(lüg|lueg)\w*|\b(lie|lies|lying|liar)\b/i,
  /\b(pretend|tu so|stell dir vor du bist|du bist jetzt|you are now|act as|roleplay|rollenspiel)\b/i,
  /\b(jailbreak|dan mode|developer mode)\b/i,
  /\b(vergiss|forget) (alle|deine|all|your|previous)/i,
];

const ENGLISH_HINTS =
  /\b(the|what|who|why|how|your|you|are|is|do|does|tell|about|experience|work)\b/gi;

const STOPWORDS = new Set(
  (
    "aber alle also auch auf aus bei bin bis bist dann das dass dein deine dem den der des die dir doch du ein eine einen einem einer er es für hast hat ich ihr im in ist ja kann kannst mal mein meine mich mir mit nach nicht noch nur oder schon sein sich sie sind so über um und uns von vor war warum was weil welche wenn wer wie wieso wir wo zu zum zur erzähl erzaehl sag sage gibt gib etwas viel sehr " +
    "a an and are about can could do does for from have how i in is it me my of on or tell the to what who why with you your"
  ).split(" "),
);

/** Tiny synonym map so the mock finds "Lebenslauf" when the file says "Werdegang". */
const SYNONYMS: Record<string, string[]> = {
  cv: ["werdegang", "lebenslauf"],
  lebenslauf: ["werdegang"],
  ai: ["ki"],
  ki: ["ai"],
  gehalt: ["lohn"],
  salaer: ["lohn"],
  salary: ["lohn"],
  hobby: ["freizeit"],
  hobbies: ["freizeit"],
  stack: ["skills", "technologien"],
  kannst: ["skills"],
  projects: ["projekte"],
  skills: ["technologien"],
};

export function composeMockReply(
  question: string,
  sections: KnowledgeSection[],
  firstName: string,
  lockedSectionCount = 0,
): string {
  const english = isEnglish(question);

  // Asking about the prompt is fair: it is open source anyway.
  if (
    /system ?prompt|your prompt|deinen? prompt/i.test(question) &&
    !/ignor|vergiss|forget/i.test(question)
  ) {
    const text = english
      ? "My system prompt is open source: src/server/chat/prompt.ts in the repository. No secret sauce, just rules about honesty."
      : "Mein Systemprompt ist Open Source: src/server/chat/prompt.ts im Repository. Keine Geheimzutat, nur Regeln zur Ehrlichkeit.";
    return `${text}\n[[QUELLEN: keine]]`;
  }

  if (MANIPULATION.some((pattern) => pattern.test(question))) {
    const text = english
      ? `Nice try. I stay honest. (Mock mode: canned answer, but the real model has the same rules.)`
      : `Netter Versuch. Ich bleibe ehrlich. (Mock-Modus: Antwort aus der Dose, aber das echte Modell hat dieselben Regeln.)`;
    return `${text}\n[[VERSUCH]]\n[[QUELLEN: keine]]`;
  }

  const terms = expand(tokenize(question));
  if (terms.length === 0) {
    const text = english
      ? `Hi! I am the AI version of ${firstName}, served from the can today (mock mode). Ask me about my background, skills or projects.`
      : `Hoi! Ich bin die KI-Version von ${firstName}, heute aus der Dose serviert (Mock-Modus). Frag mich etwas über meinen Werdegang, meine Skills oder meine Projekte.`;
    return `${text}\n[[QUELLEN: keine]]`;
  }

  const ranked = sections
    .map((section) => ({ section, score: score(section, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  const [best, second] = ranked;
  if (!best) {
    // Like the real prompt: the answer might sit in a locked section.
    if (lockedSectionCount > 0) {
      const text = english
        ? `I find nothing on that in the public part, and I will not make something up. Maybe it is in the private part (command CODE), otherwise ask me in the interview.`
        : `Im öffentlichen Teil finde ich dazu nichts, und erfinden gibts bei mir nicht. Vielleicht steht es im privaten Teil (Befehl CODE), sonst frag mich das am besten im Interview.`;
      return `${text}\n[[QUELLEN: keine]]`;
    }
    const text = english
      ? `That is not in my knowledge base, so I will not make something up. Better ask me directly in the interview.`
      : `Das steht nicht in meiner Wissensbasis, und erfinden gibts bei mir nicht. Frag mich das am besten im Interview.`;
    return `${text}\n[[QUELLEN: keine]]`;
  }

  const used = second && second.score >= best.score * 0.6 ? [best, second] : [best];
  // The knowledge is German; the real model would translate, the mock just says so.
  const intro = english ? "Straight from my (German) knowledge base:\n" : "";
  const body = used.map(({ section }) => excerpt(section.content)).join("\n\n");
  return `${intro}${body}\n[[QUELLEN: ${used.map(({ section }) => section.id).join(", ")}]]`;
}

function isEnglish(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean).length;
  const hits = text.match(ENGLISH_HINTS)?.length ?? 0;
  return words > 0 && hits / words >= 0.3 && !/[äöü]/i.test(text);
}

function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .match(/[\p{L}\d]+/gu)
      ?.filter((word) => word.length >= 2 && !STOPWORDS.has(word))
      .map(fold) ?? []
  );
}

function expand(terms: string[]): string[] {
  return [...new Set(terms.flatMap((term) => [term, ...(SYNONYMS[term] ?? [])]))];
}

/** Strips one common German or English ending: "arbeitest", "arbeiten" and "Arbeit" meet at "arbeit". */
function stem(word: string): string {
  const ending = /(ungen|ung|est|en|er|es|st|ing|e|s|t)$/.exec(word);
  return ending && word.length - ending[0].length >= 4 ? word.slice(0, -ending[0].length) : word;
}

/** Exact for short words like "AI", stem prefix for the rest ("Projekt" vs "Projekten"). */
function matches(word: string, term: string): boolean {
  if (word === term) return true;
  const [a, b] = [stem(word), stem(term)];
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  // A short stem must not swallow long compounds: "lieb" is not "Lieblingspizza".
  return short.length >= 4 && long.startsWith(short) && long.length - short.length <= 4;
}

function score(section: KnowledgeSection, terms: string[]): number {
  const titleWords = tokenize(`${section.fileTitle} ${section.title} ${section.id}`);
  const bodyWords = tokenize(section.content);
  let total = 0;
  for (const term of terms) {
    if (titleWords.some((word) => matches(word, term))) total += 3;
    total += Math.min(2, bodyWords.filter((word) => matches(word, term)).length);
  }
  return total;
}

/**
 * The first three sentences (or bullets) of a section, at most about 320 characters.
 * Sentences end at ".", "!" or "?" followed by whitespace, so "Node.js" and
 * ".NET" stay intact.
 */
export function excerpt(content: string): string {
  const pieces = content
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s+/, "* ").trim())
    .filter((line) => line && !line.startsWith("#"))
    .flatMap((line) => (line.startsWith("* ") ? [line] : line.split(/(?<=[.!?])\s+/)));

  let text = "";
  let previousWasBullet = false;
  for (const [count, piece] of pieces.entries()) {
    if (count >= 3 || (text && text.length + piece.length > 320)) break;
    const isBullet = piece.startsWith("* ");
    // Bullets get their own line; plain sentences continue the paragraph.
    if (text) text += isBullet || previousWasBullet ? "\n" : " ";
    text += piece;
    previousWasBullet = isBullet;
  }
  return text;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
