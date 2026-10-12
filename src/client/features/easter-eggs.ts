import type { EasterEgg } from "../commands.ts";
import { BEER_GLASS, EASTER_EGGS } from "../copy.ts";
import type { Screen, Tone } from "../terminal/screen.ts";

type Output =
  | { text: string; tone?: Tone; art?: string }
  | { error: { code: string; text: string } };

/** What each hidden command prints. Kept honest: none of them claims anything about the applicant. */
const OUTPUTS: Record<EasterEgg, Output> = {
  kicker: { text: EASTER_EGGS.kicker },
  jfdi: { text: EASTER_EGGS.jfdi, tone: "beer" },
  amiga: { error: EASTER_EGGS.amiga },
  macbook: { text: EASTER_EGGS.macbook },
  sudo: { text: EASTER_EGGS.sudo },
  rmrf: { text: EASTER_EGGS.rmrf },
  beer: { text: EASTER_EGGS.beer, art: BEER_GLASS },
  noBugs: { error: EASTER_EGGS.noBugs },
  println: { error: EASTER_EGGS.println },
  papierkorb: { error: EASTER_EGGS.papierkorb },
  jira: { text: EASTER_EGGS.jira },
  exit: { text: EASTER_EGGS.exit },
  shell: { text: EASTER_EGGS.shell },
  lineNumbers: { error: EASTER_EGGS.lineNumbers },
  goto: { error: EASTER_EGGS.goto },
};

export function printEasterEgg(screen: Screen, egg: EasterEgg): void {
  const output = OUTPUTS[egg];
  if ("error" in output) {
    screen.error(output.error.code, output.error.text);
    return;
  }
  if (output.art) screen.line(output.art, "beer");
  screen.line(output.text, output.tone);
  screen.announce(output.text);
}
