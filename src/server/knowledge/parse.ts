import type { Tier } from "../../shared/api.ts";

export interface KnowledgeSection {
  id: string;
  title: string;
  fileTitle: string;
  tier: Tier;
  content: string;
}

export interface ParsedFile {
  fileSlug: string;
  fileTitle: string;
  sections: KnowledgeSection[];
}

/**
 * Splits one markdown file into sections at its level-2 headings.
 *
 * Text before the first "##" becomes the file's intro section (id = file slug),
 * every "## Heading" becomes "<file>/<heading>". Deeper headings stay inside
 * their section. HTML comments are template notes for the author and are
 * dropped, so empty template sections never reach the model.
 */
export function parseKnowledgeFile(fileName: string, markdown: string, tier: Tier): ParsedFile {
  const { attributes, body } = splitFrontmatter(markdown.replace(/\r\n?/g, "\n"));
  const withoutComments = body.replace(/<!--[\s\S]*?-->/g, "");
  const fileSlug = slugify(fileName.replace(/\.md$/i, "").replace(/^\d+[-_]/, ""));

  const h1 = /^#\s+(.+)$/m.exec(withoutComments);
  const fileTitle = attributes.title ?? h1?.[1]?.trim() ?? titleFromSlug(fileSlug);
  const text = h1 ? withoutComments.replace(h1[0], "") : withoutComments;

  const sections: KnowledgeSection[] = [];
  const usedSlugs = new Set<string>();
  const parts = text.split(/^##\s+(.+)$/m);

  const intro = parts[0]?.trim() ?? "";
  if (intro) {
    sections.push({ id: fileSlug, title: fileTitle, fileTitle, tier, content: intro });
  }

  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i]?.trim() ?? "";
    const content = parts[i + 1]?.trim() ?? "";
    if (!heading || !content) continue;
    const slug = uniqueSlug(slugify(heading), usedSlugs);
    sections.push({ id: `${fileSlug}/${slug}`, title: heading, fileTitle, tier, content });
  }

  return { fileSlug, fileTitle, sections };
}

/** "Werdegang: Lehre", or just "Profil" for a file's intro section. */
export function displayTitle(section: Pick<KnowledgeSection, "title" | "fileTitle">): string {
  return section.title === section.fileTitle ? section.title : `${section.fileTitle}: ${section.title}`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueSlug(slug: string, used: Set<string>): string {
  let candidate = slug || "abschnitt";
  for (let n = 2; used.has(candidate); n++) candidate = `${slug}-${n}`;
  used.add(candidate);
  return candidate;
}

function titleFromSlug(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
}

/** Minimal "key: value" frontmatter. Enough for titles; no YAML dependency needed. */
function splitFrontmatter(markdown: string): { attributes: Record<string, string>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(markdown);
  if (!match) return { attributes: {}, body: markdown };
  const attributes: Record<string, string> = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line.trim());
    if (pair?.[1] && pair[2] !== undefined) {
      attributes[pair[1]] = pair[2].replace(/^["']|["']$/g, "").trim();
    }
  }
  return { attributes, body: markdown.slice(match[0].length) };
}
