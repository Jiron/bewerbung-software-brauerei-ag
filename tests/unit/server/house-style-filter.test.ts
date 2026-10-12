import { describe, expect, it } from "vitest";
import {
  HouseStyleFilter,
  rewriteHouseStyle,
} from "../../../src/server/chat/house-style-filter.ts";
import { findStyleViolations } from "../../../src/shared/house-style.ts";

const EN_DASH = "–";
const EM_DASH = "—";

function stream(chunks: string[]): string {
  const filter = new HouseStyleFilter();
  return chunks.map((chunk) => filter.push(chunk)).join("") + filter.flush();
}

describe("rewriteHouseStyle", () => {
  it.each([
    [`Ich teste ${EN_DASH} immer.`, "Ich teste, immer."],
    [`Ich teste${EM_DASH}immer.`, "Ich teste, immer."],
    ["Ich teste - immer.", "Ich teste, immer."],
    ["Ich teste -- immer.", "Ich teste, immer."],
    [`Gesagt, ${EN_DASH} getan.`, "Gesagt, getan."],
    [`Von 2019${EN_DASH}2021 und 3 - 5 Tage.`, "Von 2019 bis 2021 und 3 bis 5 Tage."],
    [`- Punkt eins\n${EN_DASH} Punkt zwei`, "* Punkt eins\n* Punkt zwei"],
    [`Ende ${EM_DASH}`, "Ende"],
    ["Grüße aus der Straße", "Grüsse aus der Strasse"],
    ["**Fett** und `Code`", "Fett und Code"],
    ["## Titel\nText", "Titel\nText"],
  ])("rewrites %j", (input, expected) => {
    expect(rewriteHouseStyle(input)).toBe(expected);
  });

  it("keeps hyphens inside words and dates", () => {
    const text = "Die KI-Version kennt 2024-05-01 und Fullstack-Developer.";
    expect(rewriteHouseStyle(text)).toBe(text);
  });
});

describe("HouseStyleFilter", () => {
  const raw = `Ich mag Tests ${EN_DASH} wirklich.\n\n- Erstens\n- Zweitens ${EM_DASH} sicher.\nGruß`;
  const expected = "Ich mag Tests, wirklich.\n\n* Erstens\n* Zweitens, sicher.\nGruss";

  it("produces the same result for every chunking of the stream", () => {
    for (let i = 0; i <= raw.length; i++) {
      expect(stream([raw.slice(0, i), raw.slice(i)])).toBe(expected);
    }
    expect(stream([...raw])).toBe(expected);
  });

  it("leaves no house-style violations behind", () => {
    expect(findStyleViolations(stream([...raw]))).toEqual([]);
  });

  it("drops trailing whitespace at the end", () => {
    expect(stream(["Antwort.\n\n"])).toBe("Antwort.");
  });
});
