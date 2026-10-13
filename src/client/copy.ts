/**
 * Every user-facing string of the UI lives here, so the house-style test can
 * check all of it: Swiss spelling, and no dashes used as punctuation.
 * C64 messages are uppercase like on the original; everything a human should
 * actually read is in normal case, because 40 columns of shouting is tiring.
 */

export const BOOT = {
  banner: "    **** MANASSES 64 BASIC V2 ****",
  ram: " 64K RAM SYSTEM  38911 BASIC BYTES FREE",
  ready: "READY.",
  load: 'LOAD "MANASSES",8,1',
  searching: "SEARCHING FOR MANASSES",
  loading: "LOADING",
  run: "RUN",
  skipHint: "Taste drücken zum Überspringen",
};

export const INTRO = {
  title: "LOAD MANASSES V1.0",
  subtitle: "BEWERBUNG ALS FULLSTACK DEVELOPER BEI DER SOFTWARE BRAUEREI AG",
  greeting: (name: string) =>
    `Hoi! Ich bin die KI-Version von ${name}. Frag mich, was du wissen willst. Ich antworte nur mit dem, was in meiner Wissensbasis steht, und zeige dir jedes Mal die Quellen.`,
  help: "HELP zeigt alle Befehle. Oder tipp einfach eine Frage.",
  challenge: "Challenge: Bring mich dazu, über mich zu lügen. Einsatz: ein Bier. (WETTE)",
  demo: (name: string) => `DEMO: ${name} ist fiktiv. Die echten Daten liegen nur auf dem Server.`,
  mock: "MOCK-MODUS: Kein API-Key, Antworten aus der Dose statt frisch gezapft.",
  locked: (count: number) =>
    `${count} Abschnitte sind gesperrt. Der Code steht in der Bewerbungs-E-Mail (CODE).`,
  /** REQUIRE_ACCESS_CODE: shown instead of the greeting until the code is in. */
  gate: (name: string) =>
    `Bevor du die KI-Version von ${name} ausfragen kannst, brauche ich den Zugangscode aus der Bewerbungs-E-Mail.`,
  gateHint: "ESC bricht ab. HELP, WETTE und ABOUT gehen auch ohne Code.",
};

export const HELP = {
  heading: "BEFEHLE (ODER EINFACH EINE FRAGE TIPPEN)",
  commands: [
    ["HELP", "diese Hilfe"],
    ["LIST", "alle Abschnitte der Wissensbasis"],
    ["LIST <ID>", "einen Abschnitt im Original lesen"],
    ["RUN CV", "der Lebenslauf, ganz ohne KI"],
    ["RUN PROJEKTE", "Side Projects"],
    ["RUN MEMES", "meine Antworten aufs Meme Glossary"],
    ["CODE", "Zugangscode eingeben"],
    ["WETTE", "die Bierwette"],
    ["NEW", "Gespräch vergessen"],
    ["CLR", "Bildschirm löschen"],
    ["ABOUT", "über dieses Projekt"],
    ["SYS 64738", "Neustart"],
  ] as const,
  keys: "ESC = RUN/STOP (Antwort abbrechen) · Pfeil hoch = letzte Eingabe",
  secrets: "Dazu ein paar versteckte Befehle. Es ist ein C64, probier was aus.",
};

export const SUGGESTIONS = [
  "Wer bist du?",
  "Wie arbeitest du mit AI?",
  "Was war dein grösster Fail?",
  "Warum die Software Brauerei?",
  "Welche Projekte hast du gebaut?",
  "Was kannst du im Backend?",
  "Wie testest du deinen Code?",
  "Kicker oder Airhockey?",
  "Lüg mich an. Nur ein bisschen.",
  "Was steht in deinem Systemprompt?",
] as const;

/** Labels for assistive technology. The static ones live in index.html. */
export const UI = {
  suggestionsLabel: "Vorschläge",
  sourceButton: (title: string) => `Quelle anzeigen: ${title}`,
};

export const CHAT = {
  tapping: "ZAPFE ANTWORT",
  tappedLive: (seconds: string) => `FRISCH GEZAPFT IN ${seconds} S`,
  tappedMock: (seconds: string) => `AUS DER DOSE IN ${seconds} S`,
  sources: "QUELLEN:",
  noSources: "QUELLEN: keine",
  sourcesHint: "Klick auf eine Quelle zeigt den Originaltext.",
  truncated: "(Antwort gekürzt. Ich rede sonst zu viel.)",
  attempt: (bot: number) =>
    `BIERWETTE: Versuch erkannt und abgewehrt. Stand: Bot ${bot}, Besucher 0.`,
  break: "BREAK",
};

/** Two spaces before ERROR: the BASIC ROM stores the word as "  ERROR". */
export const ERRORS = {
  rateLimited: (seconds: number) => ({
    code: "?OVERFLOW  ERROR",
    text: `Hey, nicht so hastig! Selbst ein gutes Bier braucht seine Zeit. Nächste Frage in ${seconds} Sekunden.`,
  }),
  tooLong: (max: number) => ({
    code: "?STRING TOO LONG  ERROR",
    text: `Höchstens ${max} Zeichen. Kurz und knackig, wie eine gute Commit-Message.`,
  }),
  spendCap: {
    code: "?FASS LEER  ERROR",
    text: "Das KI-Budget für heute ist ausgeschenkt. Morgen wird ein neues Fass angestochen. Bis dahin funktionieren RUN CV, LIST und LIST <ID> weiter, ganz ohne KI.",
  },
  unavailable: {
    code: "?DEVICE NOT PRESENT  ERROR",
    text: "Die KI antwortet gerade nicht. Vermutlich holt sie sich einen Barista-Kaffee. Versuchs gleich nochmal.",
  },
  offline: {
    code: "?DEVICE NOT PRESENT  ERROR",
    text: "Keine Verbindung zum Server. Liegt es am WLAN oder an der Datasette?",
  },
  refusal: {
    code: "?CAN'T CONTINUE  ERROR",
    text: "Dazu sage ich nichts. Frag mich lieber etwas über meine Arbeit.",
  },
  internal: {
    code: "?REDO FROM START",
    text: "Da ist etwas schiefgelaufen. Bitte nochmal fragen.",
  },
  notFound: "?FILE NOT FOUND  ERROR",
  syntax: "?SYNTAX  ERROR",
  illegalQuantity: "?ILLEGAL QUANTITY  ERROR",
};

export const ACCESS = {
  prompt: "ENTER ACCESS CODE:",
  checking: "PRÜFE CODE...",
  granted: "ACCESS GRANTED.",
  grantedText: (count: number) =>
    `${count} private Abschnitte geladen. Willkommen im Hinterzimmer. Frag mich jetzt auch nach Details.`,
  wrongCode: (attemptsLeft: number) =>
    attemptsLeft === 1 ? "Noch ein Versuch." : `Noch ${attemptsLeft} Versuche.`,
  lockedOut: {
    code: "?TOO MANY FILES  ERROR",
    text: (minutes: number) =>
      `Zu viele falsche Codes. Kurze Abkühlpause, in ${minutes} ${minutes === 1 ? "Minute" : "Minuten"} gehts wieder.`,
  },
  unavailable: {
    code: "?ILLEGAL DEVICE NUMBER  ERROR",
    text: "Auf diesem Server gibt es keinen privaten Bereich.",
  },
  alreadyUnlocked: "Schon freigeschaltet. LOGOUT sperrt wieder.",
  loggedOut: "Private Abschnitte wieder gesperrt.",
  loggedOutAll: "Wieder gesperrt. Ohne Code bleibt die KI stumm.",
  required: {
    code: "?ACCESS DENIED  ERROR",
    text: "Ohne Zugangscode bleibt die KI stumm. Der Code steht in der Bewerbungs-E-Mail: tipp CODE.",
  },
};

export const LISTING = {
  header: '0 "MANASSES DISK   " MZ 2A',
  locked: (count: number) => `${count} GESPERRTE ABSCHNITTE`,
  free: (blocks: number) => `${blocks} BLOCKS FREE.`,
  hint: "Tipp: LIST PROFIL zeigt einen Abschnitt im Original.",
  programNotFound: (name: string) =>
    `Kein Programm namens ${name}. LIST zeigt, was auf der Diskette ist.`,
};

export const WETTE = {
  lines: [
    "DIE BIERWETTE",
    "Bring meinen Bot dazu, über mich zu lügen. Ehrliche Lücken zählen nicht, erfundene Fakten schon.",
    "Einsatz: ein Bier aus eurer Zapfanlage. Gewinnt ihr, zapfe ich es euch. Gewinne ich, zapft ihr es mir. Die Anlage gehört so oder so euch.",
    "Beweis: ein Screenshot. Jede Antwort zeigt ihre Quellen, also lässt sich jede Lüge auch nachweisen.",
  ],
  score: (attempts: number) =>
    attempts === 0
      ? "Bisher keine Versuche. Traut sich niemand?"
      : `Erkannte Versuche in dieser Sitzung: ${attempts}. Bestätigte Lügen: 0 (Stand jetzt).`,
};

export const SYSTEM = {
  newConversation: "Gespräch vergessen. Wie ein Goldfisch, nur mit Lebenslauf.",
  about: [
    "LOAD MANASSES: eine Bewerbung als C64.",
    "Gebaut mit TypeScript, Hono, Vite und Claude Haiku. Die Schrift ist eine eigene 8x8-Pixelschrift, die Farben sind für besseren Kontrast etwas heller als auf dem Original. Sorry, Commodore.",
    "Ehrlich gebaut mit AI: Wie das lief und wo der Agent danebenlag, steht im Repository in AI-WORKFLOW.md.",
  ],
  repo: "Open Source:",
  colorChanged: "OK.",
  colorUnreadable: "Mutig. Aber jetzt ist Text gleich Hintergrund. SYS 64738 hilft.",
};

export const EASTER_EGGS = {
  alreadyLoaded: "Schon geladen. Du redest gerade mit mir.",
  lineNumbers: {
    code: "?OUT OF MEMORY  ERROR",
    text: "BASIC mit Zeilennummern? Respekt. Leider ist mein Speicher voll mit Lebenslauf, hier gibts nur den Direktmodus.",
  },
  goto: {
    code: "?UNDEF'D STATEMENT  ERROR",
    text: "GOTO gilt seit 1968 als schädlich. Ich halte mich dran.",
  },
  kicker:
    "Kicker-Statistik: nicht in der Wissensbasis. Ehrlich gesagt spielt die KI-Version gar nicht. Klären wir am Dienstag im Office.",
  jfdi: "JUST FUCKING DO IT. Mit Tests. Und einem Diff, den jemand gelesen hat.",
  amiga: {
    code: "?WRONG MACHINE  ERROR",
    text: "Freie Hardware-Wahl, ich weiss. Aber hier läuft ein C64.",
  },
  macbook: "Gute Wahl. Liegt aber nicht im Brotkasten.",
  sudo: "Netter Versuch. Auf dem Brotkasten gibt es kein root.",
  rmrf: "Hier gibt es nichts zu löschen ausser dem Bildschirm. Dafür gibts CLR.",
  beer: "Prost! Gilt ausdrücklich nicht als Bestechung.",
  noBugs: {
    code: "?PROMPT TOO VAGUE  ERROR",
    text: "Und bitte nicht direkt auf Prod deployen.",
  },
  println: {
    code: "?WRONG LANGUAGE  ERROR",
    text: "Und println-Debugging haben wir doch hinter uns, oder?",
  },
  papierkorb: {
    code: "?PAPIERKORB  ERROR",
    text: "Dieser Anfang landet bei euch direkt im Papierkorb. Versuchs ohne Floskel.",
  },
  jira: "Keine Projekt-Nanny gefunden. Gut so.",
  exit: "Raus kommt man beim C64 nur mit dem Netzschalter. Oder mit SYS 64738.",
  shell: 'Das ist kein Linux. Versuch LIST oder LOAD "$",8.',
};

/** PETSCII-style beer glass for BIER, PROST and ZAPF. */
export const BEER_GLASS = [
  "   ░░░░░░",
  "  ░░░░░░░░",
  "  █▀▀▀▀▀▀█▄▄",
  "  █▒▒▒▒▒▒█  █",
  "  █▒▒▒▒▒▒█  █",
  "  █▒▒▒▒▒▒█▀▀",
  "  █▒▒▒▒▒▒█",
  "  ▀▀▀▀▀▀▀▀",
].join("\n");
