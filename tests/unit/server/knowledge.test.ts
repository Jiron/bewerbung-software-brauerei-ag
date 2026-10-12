import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseKnowledgeFile, slugify } from "../../../src/server/knowledge/parse.ts";
import {
  loadKnowledge,
  lockedSectionCount,
  visibleSections,
} from "../../../src/server/knowledge/store.ts";
import { EXAMPLE_KNOWLEDGE } from "./helpers.ts";

describe("parseKnowledgeFile", () => {
  const markdown = [
    "---",
    "title: Werdegang",
    "---",
    "<!-- Vorlage: wird entfernt -->",
    "Kurz vorab.",
    "",
    "## Lehre bei der Beispiel AG",
    "Vier Jahre.",
    "### Details",
    "Bleiben im Abschnitt.",
    "",
    "## Leer",
    "<!-- nur ein Kommentar -->",
    "",
    "## Lehre bei der Beispiel AG",
    "Doppelt benannt.",
  ].join("\r\n");

  it("splits at level-2 headings with stable ids", () => {
    const parsed = parseKnowledgeFile("02-werdegang.md", markdown, "public");
    expect(parsed.fileTitle).toBe("Werdegang");
    expect(parsed.sections.map((section) => section.id)).toEqual([
      "werdegang",
      "werdegang/lehre-bei-der-beispiel-ag",
      "werdegang/lehre-bei-der-beispiel-ag-2",
    ]);
    expect(parsed.sections[1]?.content).toBe("Vier Jahre.\n### Details\nBleiben im Abschnitt.");
  });

  it("drops template comments and empty sections", () => {
    const parsed = parseKnowledgeFile("x.md", markdown, "private");
    expect(JSON.stringify(parsed)).not.toContain("Vorlage");
    expect(parsed.sections.some((section) => section.title === "Leer")).toBe(false);
    expect(parsed.sections.every((section) => section.tier === "private")).toBe(true);
  });

  it("falls back to the first h1 or the file name for the title", () => {
    expect(parseKnowledgeFile("projekte.md", "# Meine Projekte\nText", "public").fileTitle).toBe(
      "Meine Projekte",
    );
    expect(parseKnowledgeFile("10-side-projects.md", "Text", "public").fileTitle).toBe(
      "Side projects",
    );
  });

  it("slugifies German titles", () => {
    expect(slugify("Grösster Fail: Datenbank-Migration")).toBe(
      "groesster-fail-datenbank-migration",
    );
    expect(slugify("Café Übersicht")).toBe("cafe-uebersicht");
  });
});

describe("loadKnowledge", () => {
  it("loads the example persona and both tiers", async () => {
    const knowledge = await loadKnowledge(EXAMPLE_KNOWLEDGE);
    expect(knowledge.persona).toEqual({ name: "Max Muster", shortName: "Max" });
    expect(knowledge.demo).toBe(true);
    expect(visibleSections(knowledge, "public").every((s) => s.tier === "public")).toBe(true);
    expect(visibleSections(knowledge, "private")).toHaveLength(knowledge.sections.length);
    expect(lockedSectionCount(knowledge, "public")).toBeGreaterThan(0);
    expect(lockedSectionCount(knowledge, "private")).toBe(0);
  });

  it("changes its version when a file changes", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "knowledge-"));
    await mkdir(path.join(dir, "public"));
    await writeFile(path.join(dir, "public", "a.md"), "Eins");
    const before = await loadKnowledge(dir);
    await writeFile(path.join(dir, "public", "a.md"), "Zwei");
    const after = await loadKnowledge(dir);
    expect(after.version).not.toBe(before.version);
    expect(after.persona.shortName).toBe("Manassés");
  });

  it("rejects the same file name in both tiers", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "knowledge-"));
    await mkdir(path.join(dir, "public"));
    await mkdir(path.join(dir, "private"));
    await writeFile(path.join(dir, "public", "profil.md"), "A");
    await writeFile(path.join(dir, "private", "01-profil.md"), "B");
    await expect(loadKnowledge(dir)).rejects.toThrow(/Duplicate/);
  });
});
