/**
 * Turns one line of input into a command. Pure, so every C64 quirk is unit-tested.
 * Anything that is not clearly a command is a question for the AI, which is why
 * only exact keywords count: "Hilfe, was machst du?" is a question, "HELP" is not.
 */

export type EasterEgg =
  | "amiga"
  | "macbook"
  | "sudo"
  | "rmrf"
  | "beer"
  | "noBugs"
  | "println"
  | "papierkorb"
  | "jira"
  | "exit"
  | "shell"
  | "lineNumbers"
  | "goto";

export type Command =
  | { kind: "empty" }
  | { kind: "help" }
  | { kind: "list"; target: string | null }
  | { kind: "run"; program: string | null }
  | { kind: "code" }
  | { kind: "logout" }
  | { kind: "new" }
  | { kind: "clear" }
  | { kind: "about" }
  | { kind: "reset" }
  | { kind: "poke"; address: number; value: number }
  | { kind: "print"; text: string }
  | { kind: "load"; name: string }
  | { kind: "syntaxError" }
  | { kind: "airhockey" }
  | { kind: "joke" }
  | { kind: "easterEgg"; egg: EasterEgg }
  | { kind: "question"; text: string };

const KEYWORDS: Record<string, Command> = {
  HELP: { kind: "help" },
  HILFE: { kind: "help" },
  "?": { kind: "help" },
  LIST: { kind: "list", target: null },
  RUN: { kind: "run", program: null },
  CODE: { kind: "code" },
  LOGIN: { kind: "code" },
  UNLOCK: { kind: "code" },
  LOGOUT: { kind: "logout" },
  LOCK: { kind: "logout" },
  NEW: { kind: "new" },
  CLR: { kind: "clear" },
  CLS: { kind: "clear" },
  CLEAR: { kind: "clear" },
  "PRINT CHR$(147)": { kind: "clear" },
  ABOUT: { kind: "about" },
  README: { kind: "about" },
  "SYS 64738": { kind: "reset" },
  SYS64738: { kind: "reset" },
  AIRHOCKEY: { kind: "airhockey" },
  "AIR HOCKEY": { kind: "airhockey" },
  "RUN AIRHOCKEY": { kind: "airhockey" },
  FLACHWITZ: { kind: "joke" },
  WITZ: { kind: "joke" },
  DADJOKE: { kind: "joke" },
  "DAD JOKE": { kind: "joke" },
};

const EGGS: Record<string, EasterEgg> = {
  AMIGA: "amiga",
  MACBOOK: "macbook",
  BIER: "beer",
  PROST: "beer",
  ZAPF: "beer",
  ZAPFEN: "beer",
  JIRA: "jira",
  EXIT: "exit",
  QUIT: "exit",
  LS: "shell",
  DIR: "shell",
  PWD: "shell",
  CD: "shell",
};

export function parseCommand(input: string): Command {
  const text = input.trim();
  if (!text) return { kind: "empty" };

  // Keywords are case-insensitive and tolerate a trailing "!" or ".".
  const upper = text
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[.!]+$/, "");

  const keyword = KEYWORDS[upper];
  if (keyword) return keyword;
  const egg = EGGS[upper];
  if (egg) return { kind: "easterEgg", egg };

  if (/^LOAD ?"\$" ?(, ?8)?(, ?1)?$/.test(upper)) return { kind: "list", target: null };

  const list = /^LIST ([\p{L}\d/_-]+)$/iu.exec(text);
  if (list?.[1]) return { kind: "list", target: list[1].toLowerCase() };

  const run = /^RUN ([\p{L}\d_-]+)$/iu.exec(text);
  if (run?.[1]) return { kind: "run", program: run[1].toLowerCase() };

  const load = /^LOAD ?"([^"]*)" ?(, ?\d+)?(, ?\d+)?$/.exec(upper);
  if (load) return { kind: "load", name: load[1] ?? "" };

  const poke = /^POKE ?(\d+) ?, ?(\d+)$/.exec(upper);
  if (poke) return { kind: "poke", address: Number(poke[1]), value: Number(poke[2]) };

  // PRINT "TEXT" and its C64 shorthand ?"TEXT". Keeps the case as typed.
  const print = /^(?:PRINT ?|\?)"([^"]*)"?;?$/i.exec(text);
  if (print) return { kind: "print", text: print[1] ?? "" };

  // Things that look like BASIC but are not valid. Real sentences ("Print mal den CV")
  // have more than one word after the keyword and stay questions.
  if (/^SYS ?\d+$/.test(upper) || /^POKE ?\d/.test(upper) || /^PRINT ?[^"\s]\S*$/.test(upper)) {
    return { kind: "syntaxError" };
  }
  if (/^GO ?TO ?\d+$/.test(upper)) return { kind: "easterEgg", egg: "goto" };
  if (/^\d+ ?(PRINT|GOTO|GOSUB|IF|FOR|NEXT|POKE|REM|LET|INPUT|END|DATA|DIM|SYS|\?)/.test(upper)) {
    return { kind: "easterEgg", egg: "lineNumbers" };
  }
  if (/^SUDO\b/.test(upper)) return { kind: "easterEgg", egg: "sudo" };
  if (/^RM -RF\b/.test(upper)) return { kind: "easterEgg", egg: "rmrf" };
  if (/^SYSTEM\.OUT\.PRINTLN/.test(upper)) return { kind: "easterEgg", egg: "println" };
  if (/^SEHR GEEHRTE/.test(upper)) return { kind: "easterEgg", egg: "papierkorb" };
  if (/MAKE IT WORK.*NO BUGS/.test(upper)) return { kind: "easterEgg", egg: "noBugs" };

  return { kind: "question", text };
}

/** C64 color codes 0 to 15, Pepto palette. */
export const C64_PALETTE = [
  "#000000",
  "#ffffff",
  "#68372b",
  "#70a4b2",
  "#6f3d86",
  "#588d43",
  "#352879",
  "#b8c76f",
  "#6f4f25",
  "#433900",
  "#9a6759",
  "#444444",
  "#6c6c6c",
  "#9ad284",
  "#6c5eb5",
  "#959595",
] as const;

export const POKE_ADDRESSES = {
  border: 53280,
  background: 53281,
  text: 646,
} as const;
