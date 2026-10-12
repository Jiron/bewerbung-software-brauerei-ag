import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Logger } from "../logger.ts";

interface SpendState {
  day: string;
  usd: number;
}

/**
 * Daily budget for API spend, reset at midnight Swiss time.
 *
 * Requests reserve their worst-case cost up front and settle the real cost
 * afterwards, so parallel requests cannot overshoot the cap together.
 * The state is persisted to DATA_DIR (if set) so a restart does not refill the keg.
 */
export class SpendTracker {
  readonly #capUsd: number;
  readonly #now: () => Date;
  readonly #file: string | null;
  readonly #logger: Logger;
  #state: SpendState;
  #reserved = 0;

  constructor(options: {
    capUsd: number;
    dataDir: string | null;
    logger: Logger;
    now?: () => Date;
  }) {
    this.#capUsd = options.capUsd;
    this.#now = options.now ?? (() => new Date());
    this.#file = options.dataDir ? path.join(options.dataDir, "spend.json") : null;
    this.#logger = options.logger;
    this.#state = { day: this.#today(), usd: 0 };
  }

  async load(): Promise<void> {
    if (!this.#file) return;
    try {
      const saved = JSON.parse(await readFile(this.#file, "utf8")) as Partial<SpendState>;
      if (saved.day === this.#today() && typeof saved.usd === "number") {
        this.#state = { day: saved.day, usd: saved.usd };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.#logger.warn("spend.load_failed", { error: String(error) });
      }
    }
  }

  get spentTodayUsd(): number {
    this.#rollOver();
    return this.#state.usd;
  }

  /** Reserves budget for one request. Returns null when the cap would be exceeded. */
  reserve(worstCaseUsd: number): Reservation | null {
    this.#rollOver();
    if (this.#state.usd + this.#reserved + worstCaseUsd > this.#capUsd) return null;
    this.#reserved += worstCaseUsd;
    let settled = false;
    return {
      settle: (actualUsd: number) => {
        if (settled) return;
        settled = true;
        this.#reserved -= worstCaseUsd;
        this.#rollOver();
        this.#state.usd += actualUsd;
        void this.#save();
      },
    };
  }

  #rollOver(): void {
    const today = this.#today();
    if (this.#state.day !== today) this.#state = { day: today, usd: 0 };
  }

  #today(): string {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(this.#now());
  }

  async #save(): Promise<void> {
    if (!this.#file) return;
    try {
      await mkdir(path.dirname(this.#file), { recursive: true });
      await writeFile(this.#file, JSON.stringify(this.#state));
    } catch (error) {
      this.#logger.warn("spend.save_failed", { error: String(error) });
    }
  }
}

export interface Reservation {
  /** Replaces the reserved worst case with the actual cost. Safe to call more than once. */
  settle(actualUsd: number): void;
}
