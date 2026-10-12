# Ehrlich gebaut mit AI

Euer Inserat: «Du weisst, wann der Agent recht hat, wann er halluziniert und wann er deine Datenbank-Migration gerade mit vollem Selbstvertrauen zu Gulasch verarbeitet hat.» Dieses Dokument ist der Versuch, genau das offenzulegen: wie dieses Projekt mit einem Agenten entstanden ist, wie geprüft wurde und wo der Agent danebenlag.

## Setup

* **Agent:** Claude Code mit Claude Opus 5.5, eine lange, weitgehend autonome Session mit Commits an jedem Meilenstein.
* **Input:** ein Briefing von mir mit Ziel, Ton, Sicherheitsanforderungen und Definition of Done. Zum Beispiel: keine echten Daten und keine Schlüssel im Repo, zwei Wissensstufen mit Zugangscode, jede Grenze und jeder Fehler im Stil des Hauses, keine Gedankenstriche, Mock-Modus ohne API-Key, Prüfung im echten Browser auf Desktop und Mobile.
* **Recherche:** Der Agent hat euer Inserat, die «Über uns»-Seite und das Meme Glossary gelesen. Die Folien sind Bilder, also wurden sie einzeln geöffnet und Text samt Bildinhalt ausgelesen.
* **Verifikation:** Tests als Sicherheitsnetz, danach der echte Browser. Für Desktop- und Mobile-Ansichten hat der Agent Playwright-Screenshots erstellt und angeschaut, dazu axe für Barrierefreiheit.

## Entscheidungen, die der Agent selbst getroffen hat

Nicht alles stand im Briefing. Diese Punkte hat der Agent entschieden und begründet. Sie stehen hier, damit man sie hinterfragen kann:

| Entscheidung | Begründung |
| --- | --- |
| Eigene Pixelschrift statt eines bekannten C64-Fonts | Lizenzen der Originale passen nicht sicher zu MIT. |
| Vanilla TypeScript statt React | Ein Bildschirm mit Textausgabe, etwa 12 KB JavaScript. |
| Node führt TypeScript direkt aus | Kein Server-Build, weniger bewegliche Teile. |
| Gesprächsverlauf nur auf dem Server | Der Browser kann keine früheren Antworten fälschen, um das Modell zu steuern. |
| Fiktive Person Max Muster in `knowledge.example` | Die Demo läuft sofort, ohne dass jemand fiktive Fakten für echte hält. |
| Keine Protokollierung von Fragen | Besucher sind Menschen, deren Fragen nicht in Logs gehören. Geloggt werden nur Tokens, Kosten und Dauer. |

## Wo der Agent danebenlag

Die ehrliche Liste. Kein Fehler ist in Produktion gegangen, aber jeder davon wäre ohne die Spalte «Gefunden durch» dort gelandet.

| Was passiert ist | Gefunden durch | Fix |
| --- | --- | --- |
| Der Mock hat «Lieblingspizza» als Lügenversuch erkannt, weil `lie` im Wort steckt. | Unit-Test | Wortgrenzen in der Regex |
| Das Hash-Format für den Zugangscode enthielt `$`. Docker Compose hätte es in der `.env` still zerlegt, das Entsperren wäre in Produktion einfach nie gegangen. | Review nach dem ersten Lauf | Format mit `:` und base64url, Test dazu |
| Eine Testklasse nutzte TypeScript Parameter Properties, die Node beim Ausführen von TypeScript nicht unterstützt. | Review vor dem Ausführen | Normale Felder |
| Ein Konfigurationstest hing davon ab, ob auf dem Rechner ein echter `knowledge`-Ordner liegt. | Review | Fester Testordner |
| Der Vite-Proxy für `/api` hat auch die Datei `/api.ts` abgefangen. Ergebnis: leere Seite. | Browser | Proxy auf `/api/` |
| Der Satzteiler im Mock machte aus «Node.js, C# mit .NET» ein «js, C# mit NET». | Screenshot | Satzende nur vor Leerzeichen, Test dazu |
| Die Taste, mit der man den Boot überspringt, landete als Leerzeichen in der Eingabezeile. | Screenshot | `preventDefault` beim Überspringen |
| Das Enter, das `SYS 64738` absendet, hat den gerade gestarteten Neustart sofort wieder übersprungen. | E2E-Test | Eingabezeile verschluckt ihre Tasten |
| Das Leuchten der Schrift senkte den Kontrast auf dem Handy auf 4.09:1. Die Rechnung des Agents hatte das Leuchten ignoriert. | axe im E2E-Test | Hellere Schrift, schwächeres Leuchten |
| Der SSE-Parser brach, wenn ein Zeilenumbruch `\r\n` auf zwei Pakete verteilt ankam. | Unit-Test über alle Paketgrenzen | Zustand für ein offenes `\r` |
| Der Font-Build war nicht reproduzierbar, weil opentype.js die aktuelle Zeit in die Datei schreibt. | Test «Schrift ist aktuell» | Uhr beim Build fixiert |
| `LIST profil` in Kleinbuchstaben wurde als Frage an die KI geschickt. | Unit-Test | Regex ohne Gross- und Kleinschreibung |
| `serveStatic` setzt Header aus `onFound` zu spät, Cache-Header fehlten. | Unit-Test | Eigene kleine Middleware |
| Das Schreibwerkzeug des Agents hat `–`-Escapes in echte Zeichen verwandelt. Im Code standen danach Halbgeviertstrich und Geviertstrich, die man nicht unterscheiden kann, und unsichtbare geschützte Leerzeichen. | Beim Lesen des Codes | Escapes per Skript aus Codepunkten wiederhergestellt |
| Der Mock fand auf die vorgeschlagene Frage «Wie arbeitest du mit AI?» nichts: Zwei Buchstaben waren zu kurz, «arbeitest» passte nicht zu «arbeiten». | Smoke-Test des MCP-Servers | Leichtes Stemming, Tests für alle Vorschläge |
| Das Stemming war danach zu grosszügig: «lieb» passte zu «Lieblingspizza». | Unit-Test | Längenbegrenzung |
| Die Begrenzung paralleler Code-Prüfungen hatte ein Race: Prüfung vor einem `await`, Hochzählen danach. Sechs gleichzeitige Versuche kamen alle durch. | Unit-Test mit parallelen Anfragen | Prüfen und Hochzählen ohne `await` dazwischen |
| Der erste Entwurf von MEMES.md behauptete, ich hätte die Schrift selbst Pixel für Pixel gezeichnet. Hat der Agent. | Review gegen die Folie «Honesty» | Formulierung korrigiert |
| **Der teuerste Fehler:** Die Regel `knowledge/` in der `.gitignore` sollte den privaten Wissensordner schützen, blendete aber auch `src/server/knowledge/` aus. Der Wissens-Loader war nie committet, ein frischer Clone wäre nicht gestartet. Alle 192 Tests waren trotzdem grün, weil die Dateien auf der Platte lagen. Biome hat sie aus demselben Grund nie formatiert. | Nachbau des Docker-Builds aus den committeten Dateien | `/knowledge/` statt `knowledge/`, seither wird jede Änderung in einem frischen Clone geprüft |

Dazu kamen zwei Fehler in den eigenen Tests des Agents (ein E2E-Test erwartete nach `CODE` ein `READY.`, ein anderer fand denselben Text zusätzlich in der unsichtbaren Screenreader-Ansage) und ein paar Shell-Befehle, deren Escaping beim Bearbeiten von Code mit Regex kaputtging.

**Was daraus folgt:** Von den 19 Fehlern in der Tabelle haben automatisierte Tests 10 gefunden, Browser und Screenshots 3, Reviews 5 und der nachgestellte Build einen. Der Agent schreibt schnell und meistens richtig, aber er prüft seine eigenen Annahmen nicht von selbst. Das Sicherheitsnetz muss stehen, bevor man ihm vertraut. Und es muss prüfen, was ausgeliefert wird: Grüne Tests im Arbeitsverzeichnis beweisen nichts über das Repository.

## Was noch ein Mensch prüfen muss

Ehrlich offen, Stand jetzt:

* **Echte Antworten:** Die Tests laufen im Mock-Modus. Wie sich Claude Haiku mit der echten Wissensbasis verhält, insbesondere bei Jailbreak-Versuchen, braucht einen Testlauf mit API-Key und kritisches Lesen der Antworten.
* **Die Wissensbasis selbst:** Was der Bot über mich sagt, ist nur so ehrlich wie das, was ich hineinschreibe.
* **Screenreader:** axe findet keine Verstösse, aber ein Durchgang mit NVDA oder VoiceOver ersetzt das nicht.
* **Docker:** Auf dem Entwicklungsrechner gab es weder Docker noch WSL. Der Build wurde aus einem frischen Clone Stufe für Stufe nachgestellt (Kontext gemäss `.dockerignore`, dieselben Befehle, Start wie im `CMD`, dieselben Smoke-Tests wie in der CI), und alle Importpfade wurden auf exakte Gross- und Kleinschreibung geprüft, wie sie Linux verlangt. Ein echter `docker build` steht trotzdem noch aus.
* **MEMES.md:** steht in meiner Stimme und muss nach meinem Gegenlesen stimmen, nicht nach dem des Agents.
