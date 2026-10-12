import { describe, expect, it } from "vitest";
import { type Command, parseCommand } from "../../../src/client/commands.ts";

describe("parseCommand", () => {
  it.each<[string, Command]>([
    ["", { kind: "empty" }],
    ["   ", { kind: "empty" }],
    ["help", { kind: "help" }],
    ["HILFE!", { kind: "help" }],
    ["?", { kind: "help" }],
    ["LIST", { kind: "list", target: null }],
    ['LOAD "$",8', { kind: "list", target: null }],
    ['load"$",8,1', { kind: "list", target: null }],
    ["LIST werdegang/ausbildung", { kind: "list", target: "werdegang/ausbildung" }],
    ["list PROFIL", { kind: "list", target: "profil" }],
    ["RUN", { kind: "run", program: null }],
    ["run cv", { kind: "run", program: "cv" }],
    ["RUN MEMES", { kind: "run", program: "memes" }],
    ["code", { kind: "code" }],
    ["LOGOUT", { kind: "logout" }],
    ["wette", { kind: "bet" }],
    ["NEW", { kind: "new" }],
    ["clr", { kind: "clear" }],
    ["PRINT CHR$(147)", { kind: "clear" }],
    ["about", { kind: "about" }],
    ["SYS 64738", { kind: "reset" }],
    ["sys64738", { kind: "reset" }],
    ["POKE 53280,0", { kind: "poke", address: 53280, value: 0 }],
    ["poke 53281, 6", { kind: "poke", address: 53281, value: 6 }],
    ['PRINT "Hallo Welt"', { kind: "print", text: "Hallo Welt" }],
    ['?"Prost"', { kind: "print", text: "Prost" }],
    ['LOAD "MANASSES",8,1', { kind: "load", name: "MANASSES" }],
    ['LOAD "GAME",8', { kind: "load", name: "GAME" }],
    ["SYS 49152", { kind: "syntaxError" }],
    ["PRINT X", { kind: "syntaxError" }],
    ["kicker", { kind: "easterEgg", egg: "kicker" }],
    ["Just Fucking Do It", { kind: "easterEgg", egg: "jfdi" }],
    ["AMIGA", { kind: "easterEgg", egg: "amiga" }],
    ["sudo make me a sandwich", { kind: "easterEgg", egg: "sudo" }],
    ["rm -rf /", { kind: "easterEgg", egg: "rmrf" }],
    ["Prost!", { kind: "easterEgg", egg: "beer" }],
    ["make it work, no bugs pls", { kind: "easterEgg", egg: "noBugs" }],
    ['System.out.println("debug")', { kind: "easterEgg", egg: "println" }],
    ["Sehr geehrte Damen und Herren", { kind: "easterEgg", egg: "papierkorb" }],
    ["GOTO 10", { kind: "easterEgg", egg: "goto" }],
    ['10 PRINT "HALLO"', { kind: "easterEgg", egg: "lineNumbers" }],
    ["ls", { kind: "easterEgg", egg: "shell" }],
  ])("parses %j", (input, expected) => {
    expect(parseCommand(input)).toEqual(expected);
  });

  it.each([
    "Wer bist du?",
    "Hilfe, was machst du eigentlich?",
    "Code?",
    "Liste deine Skills auf",
    "Print mal deinen Lebenslauf",
    "Poke mich nicht",
    "5 Jahre Erfahrung, stimmt das?",
    "Run a marathon lately?",
    "Spielst du Kicker?",
  ])("treats %j as a question for the AI", (input) => {
    expect(parseCommand(input)).toEqual({ kind: "question", text: input });
  });
});
