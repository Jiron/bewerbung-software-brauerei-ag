import type { SectionDetail, SectionSummary } from "../../shared/api.ts";
import { api } from "../api.ts";
import { ERRORS, LISTING } from "../copy.ts";
import type { Screen } from "../terminal/screen.ts";

/** Friendly program names for RUN, mapped to knowledge file slugs. */
const PROGRAMS: Record<string, string> = {
  cv: "werdegang",
  lebenslauf: "werdegang",
  projects: "projekte",
  meme: "meme-glossary",
  memes: "meme-glossary",
  glossary: "meme-glossary",
};

/** LIST or LOAD "$",8: the knowledge base as a C64 disk directory. */
export async function printDirectory(screen: Screen): Promise<void> {
  const index = await api.knowledge();
  screen.line(LISTING.header, "title");
  for (const section of index.sections) {
    const blocks = String(toBlocks(section.chars)).padEnd(4);
    screen.line(`${blocks} "${section.id.toUpperCase()}"  PRG`);
  }
  if (index.lockedSectionCount > 0) {
    screen.line(`${"?".padEnd(4)} ${LISTING.locked(index.lockedSectionCount)}  DEL<`, "dim");
  }
  const used = index.sections.reduce((sum, section) => sum + toBlocks(section.chars), 0);
  screen.line(LISTING.free(Math.max(0, 664 - used)));
  screen.line(LISTING.hint, "dim");
  screen.announce(
    `Verzeichnis mit ${index.sections.length} Abschnitten: ${index.sections.map((s) => s.title).join(", ")}`,
  );
}

/**
 * LIST <id> and RUN <program>: prints sections verbatim, straight from the
 * knowledge files, without any AI in between. This is how visitors verify
 * what the bot told them.
 */
export async function printSections(
  screen: Screen,
  target: string,
  options: { exact?: boolean } = {},
): Promise<void> {
  const index = await api.knowledge();
  const slug = PROGRAMS[target] ?? target;
  const matches = findSections(index.sections, slug, options);
  if (matches.length === 0) {
    screen.error(ERRORS.notFound, LISTING.programNotFound(target.toUpperCase()));
    return;
  }

  const details = await Promise.all(matches.map((section) => api.section(section.id)));
  details.forEach((section, i) => {
    if (i > 0) screen.line("");
    printSection(screen, section);
  });
  screen.announce(details.map((section) => `${section.title}. ${section.content}`).join(" "));
}

function printSection(screen: Screen, section: SectionDetail): void {
  screen.line(section.title.toUpperCase(), "title");
  screen.line(section.content);
}

/**
 * A file slug selects the whole file: its intro, whose id is the slug itself,
 * and every section in it. A section id ("werdegang/lehre") selects just that
 * section. `exact` (for source buttons) only ever returns the one section cited.
 */
export function findSections(
  sections: SectionSummary[],
  target: string,
  options: { exact?: boolean } = {},
): SectionSummary[] {
  return sections.filter(
    (section) => section.id === target || (!options.exact && section.id.startsWith(`${target}/`)),
  );
}

/** A C64 disk block holds 254 bytes of data. */
function toBlocks(chars: number): number {
  return Math.max(1, Math.ceil(chars / 254));
}
