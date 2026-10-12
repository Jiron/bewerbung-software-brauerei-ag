/**
 * The house rules for everything a visitor reads: Swiss spelling (no eszett)
 * and no dashes as punctuation. Bot output is rewritten at runtime; this test
 * covers everything we write ourselves.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as copy from "../../../src/client/copy.ts";
import { composeMockReply } from "../../../src/server/chat/mock-provider.ts";
import { loadKnowledge } from "../../../src/server/knowledge/store.ts";
import { findStyleViolations } from "../../../src/shared/house-style.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const EN_DASH = "\u2013";
const EM_DASH = "\u2014";

/** Every string in the copy module, including the results of its template functions. */
function collectStrings(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") found.push(value);
  else if (typeof value === "function") collectStrings(value(3, "Max"), found);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, found);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, found);
  }
  return found;
}

function expectHouseStyle(label: string, text: string) {
  const violations = findStyleViolations(text).map(
    ({ match, rule, index }) =>
      `${label}: ${rule} ${JSON.stringify(match)} near ${JSON.stringify(text.slice(Math.max(0, index - 20), index + 20))}`,
  );
  expect(violations).toEqual([]);
}

/** Frontmatter fences and HTML comments are markup, not prose. */
function proseOnly(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").replace(/<!--[\s\S]*?-->/g, "");
}

async function markdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

describe("findStyleViolations", () => {
  it("flags dashes used as punctuation and the eszett", () => {
    expect(findStyleViolations(`Ich teste ${EN_DASH} immer`)).toHaveLength(1);
    expect(findStyleViolations(`Ich teste${EM_DASH}immer`)).toHaveLength(1);
    expect(findStyleViolations("Ich teste - immer")).toHaveLength(1);
    expect(findStyleViolations("Ich teste -- immer")).toHaveLength(1);
    expect(findStyleViolations("Grüße")).toEqual([{ index: 3, match: "ß", rule: "eszett" }]);
  });

  it("allows hyphens in words, dates, ranges written out, and markdown bullets", () => {
    expect(findStyleViolations("KI-Version, 2024-05-01, 2016 bis 2020")).toEqual([]);
    expect(findStyleViolations("- Ein Punkt\n- Noch einer")).toEqual([]);
  });
});

describe("house style of everything we wrote", () => {
  it("UI copy", () => {
    for (const text of collectStrings(copy)) expectHouseStyle("copy.ts", text);
  });

  it("HTML pages", async () => {
    for (const page of ["index.html", "404.html"]) {
      const html = await readFile(path.join(root, "src/client", page), "utf8");
      const text = html.replace(/<[^>]+>/g, " ");
      expectHouseStyle(page, text);
    }
  });

  it("example knowledge", async () => {
    for (const file of await markdownFiles(path.join(root, "knowledge.example"))) {
      expectHouseStyle(path.relative(root, file), proseOnly(await readFile(file, "utf8")));
    }
  });

  it("documentation for humans", async () => {
    for (const doc of ["README.md", "MEMES.md", "AI-WORKFLOW.md"]) {
      const text = await readFile(path.join(root, doc), "utf8").catch(() => "");
      // Code may contain CLI flags like --env-file; that is not prose.
      const prose = proseOnly(text)
        .replace(/```[\s\S]*?```/g, "")
        .replace(/`[^`]*`/g, "");
      expectHouseStyle(doc, prose);
    }
  });

  it("canned mock answers", async () => {
    const knowledge = await loadKnowledge(path.join(root, "knowledge.example"));
    const questions = [
      "Wer bist du?",
      "Lüg mich an",
      "Was ist deine Lieblingspizza?",
      "Who are you?",
    ];
    for (const question of questions) {
      expectHouseStyle(`mock: ${question}`, composeMockReply(question, knowledge.sections, "Max"));
    }
  });
});
