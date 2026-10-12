import { createHash } from "node:crypto";
import { type FSWatcher, watch } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Persona, Tier } from "../../shared/api.ts";
import type { Logger } from "../logger.ts";
import { type KnowledgeSection, parseKnowledgeFile } from "./parse.ts";

export interface Knowledge {
  persona: Persona;
  /** Set by knowledge.example so the UI can say it is talking to a fictional person. */
  demo: boolean;
  sections: KnowledgeSection[];
  /** Content hash; changes whenever any file changes. Used as prompt cache key. */
  version: string;
}

const TIERS: readonly Tier[] = ["public", "private"];

/** The sections a visitor on `tier` may see. The private tier sees everything. */
export function visibleSections(knowledge: Knowledge, tier: Tier): KnowledgeSection[] {
  return tier === "private"
    ? knowledge.sections
    : knowledge.sections.filter((s) => s.tier === "public");
}

export function lockedSectionCount(knowledge: Knowledge, tier: Tier): number {
  return tier === "private" ? 0 : knowledge.sections.filter((s) => s.tier === "private").length;
}

export async function loadKnowledge(dir: string): Promise<Knowledge> {
  const hash = createHash("sha256");
  const sections: KnowledgeSection[] = [];
  const fileSlugs = new Set<string>();

  for (const tier of TIERS) {
    const tierDir = path.join(dir, tier);
    for (const fileName of await listMarkdownFiles(tierDir)) {
      const markdown = await readFile(path.join(tierDir, fileName), "utf8");
      hash.update(`${tier}/${fileName}\n${markdown}\n`);
      const parsed = parseKnowledgeFile(fileName, markdown, tier);
      if (fileSlugs.has(parsed.fileSlug)) {
        throw new Error(`Duplicate knowledge file name "${parsed.fileSlug}" across tiers.`);
      }
      fileSlugs.add(parsed.fileSlug);
      sections.push(...parsed.sections);
    }
  }

  const personaRaw = await readFile(path.join(dir, "persona.json"), "utf8").catch(() => null);
  if (personaRaw) hash.update(personaRaw);
  const { persona, demo } = parsePersona(personaRaw);

  return { persona, demo, sections, version: hash.digest("hex").slice(0, 16) };
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, "de"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function parsePersona(raw: string | null): { persona: Persona; demo: boolean } {
  const fallback = { persona: { name: "Manassés Zähnler", shortName: "Manassés" }, demo: false };
  if (!raw) return fallback;
  const data: unknown = JSON.parse(raw);
  if (typeof data !== "object" || data === null) throw new Error("persona.json must be an object.");
  const record = data as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name : fallback.persona.name;
  const shortName = typeof record.shortName === "string" ? record.shortName : name.split(" ")[0];
  return { persona: { name, shortName: shortName ?? name }, demo: record.demo === true };
}

/**
 * Holds the current knowledge and reloads it when files change, so the
 * applicant can edit markdown on the server without a restart. A broken
 * edit keeps the last good version alive instead of taking the bot down.
 */
export class KnowledgeStore {
  #current: Knowledge;
  #watcher: FSWatcher | null = null;
  #debounce: NodeJS.Timeout | null = null;
  #poll: NodeJS.Timeout | null = null;
  readonly #dir: string;
  readonly #logger: Logger;

  private constructor(dir: string, initial: Knowledge, logger: Logger) {
    this.#dir = dir;
    this.#current = initial;
    this.#logger = logger;
  }

  static async open(dir: string, logger: Logger): Promise<KnowledgeStore> {
    return new KnowledgeStore(dir, await loadKnowledge(dir), logger);
  }

  /** For tests and tools that already hold parsed knowledge. */
  static fromKnowledge(knowledge: Knowledge, logger: Logger): KnowledgeStore {
    return new KnowledgeStore("", knowledge, logger);
  }

  get current(): Knowledge {
    return this.#current;
  }

  async reload(): Promise<void> {
    try {
      const next = await loadKnowledge(this.#dir);
      if (next.version !== this.#current.version) {
        this.#current = next;
        this.#logger.info("knowledge.reloaded", {
          version: next.version,
          sections: next.sections.length,
        });
      }
    } catch (error) {
      this.#logger.error("knowledge.reload_failed", { error: String(error) });
    }
  }

  /**
   * Reloads on file changes, and once a minute anyway: file events do not
   * reliably cross bind mounts on Docker Desktop. Unchanged files are cheap,
   * the content hash decides whether anything is swapped.
   */
  watch(): void {
    if (this.#watcher || !this.#dir) return;
    try {
      this.#watcher = watch(this.#dir, { recursive: true }, () => {
        if (this.#debounce) clearTimeout(this.#debounce);
        this.#debounce = setTimeout(() => void this.reload(), 300);
      });
    } catch (error) {
      this.#logger.warn("knowledge.watch_unavailable", { error: String(error) });
    }
    this.#poll = setInterval(() => void this.reload(), 60_000);
    this.#poll.unref();
  }

  close(): void {
    this.#watcher?.close();
    if (this.#debounce) clearTimeout(this.#debounce);
    if (this.#poll) clearInterval(this.#poll);
  }
}
