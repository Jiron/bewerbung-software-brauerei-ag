# Ehrlich gebaut mit AI

Euer Inserat: «Du weisst, wann der Agent recht hat, wann er halluziniert und wann er deine Datenbank-Migration gerade mit vollem Selbstvertrauen zu Gulasch verarbeitet hat.» Dieses Dokument ist der Versuch, genau das offenzulegen: wie dieses Projekt mit einem Agenten entstanden ist, wie geprüft wurde und wo der Agent danebenlag.

## Setup

* **Agent:** Claude Code mit Claude Opus 5.5, eine lange, weitgehend autonome Session mit Commits an jedem Meilenstein.
* **Input:** ein Briefing von mir mit Ziel, Ton, Sicherheitsanforderungen und Definition of Done. Zum Beispiel: keine echten Daten und keine Schlüssel im Repo, zwei Wissensstufen mit Zugangscode, jede Grenze und jeder Fehler im Stil des Hauses, keine Gedankenstriche, Mock-Modus ohne API-Key, Prüfung im echten Browser auf Desktop und Mobile.
* **Verifikation:** Tests als Sicherheitsnetz, danach der echte Browser. Für Desktop- und Mobile-Ansichten hat der Agent Playwright-Screenshots erstellt und angeschaut, dazu axe für Barrierefreiheit.

## Recherche zuerst

Bevor die erste Zeile Code entstand, hat der Agent das Inserat, die «Über uns»-Seite und alle zehn Folien des Meme Glossary gelesen. Die Folien sind Bilder, also wurde jede einzeln geöffnet, Text und Bildinhalt ausgelesen. Am Ende wurde alles nochmals gegen die Live-Seiten geprüft (dabei fiel auf, dass Folie 6 «M\*therf+cker» schreibt, nicht «M\*therf\*cker»).

Was davon wo gelandet ist:

| Fundstück | Quelle | Verwendung |
| --- | --- | --- |
| Freie Hardware-Wahl: C64, Amiga oder MacBook | Inserat | Das ganze Konzept. `AMIGA` gibt einen `?WRONG MACHINE ERROR`, `MACBOOK` liegt nicht im Brotkasten. |
| Eigene Zapfanlage | Inserat | Antworten werden gezapft, Mock-Antworten kommen aus der Dose, leeres Budget ist ein `?FASS LEER ERROR`. |
| Kicker-Matches und Airhockey-Duelle | Inserat | Vorschlag «Kicker oder Airhockey?», Befehl `KICKER` mit ehrlicher Antwort, und `AIRHOCKEY` als Spiel gegen den C64. |
| «Just Fucking Do It» | Inserat, «Über uns» | Befehl `JFDI`, mit Tests. |
| Gesundes Misstrauen gegenüber AI-Output, Datenbank-Migration «zu Gulasch» | Inserat | Quellen zu jeder Antwort, dieses Dokument. Die fiktive Wissensbasis erzählt eine Migrations-Panne als grössten Fail. |
| «make it work, no bugs pls» | Inserat | Gleichnamiges Easter Egg: `?PROMPT TOO VAGUE ERROR`. |
| «System.out.println-Debugger» | Inserat | `System.out.println(...)` gibt einen `?WRONG LANGUAGE ERROR`. |
| Projekt-Nanny, Jira-Board | Inserat | Befehl `JIRA`. |
| «Läuft bei mir lokal» ist kein Deployment-Konzept | Inserat | Docker, Compose und CI, die den Stack wie in Produktion starten. |
| «Sehr geehrte Damen und Herren» landet im Papierkorb | Inserat, «Über uns» | Wer so anfängt, bekommt einen `?PAPIERKORB ERROR`. |
| Code of Meme: neun Werte als Memes | Meme Glossary | MEMES.md mit einer Antwort und einem Beleg pro Folie. Folie «Honesty» ist die Grundregel des Bots. |
| GitHub- und App-Store-Heldentaten statt Anschreiben | Inserat, «Über uns» | Die Bewerbung ist selbst ein Repository. |

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
| Der Cursor blinkte laut Kommentar «in C64-Tempo», ein Zyklus dauerte aber 1.07 statt 0.67 Sekunden. Der KERNAL schaltet ihn alle 20 Jiffies um, also alle 1/3 Sekunden. | Abgleich mit dem ROM-Listing | 0.667 s pro Blinkzyklus. Dabei auch korrigiert: Fehlermeldungen haben wie im ROM zwei Leerzeichen vor `ERROR`. |
| Nach der Korrektur in MEMES.md stand im Befehl `ABOUT` weiterhin, die Schrift sei «von Hand gezeichnet». | Review aller Texte | Formulierung korrigiert |
| Auf dem Handy fiel die Hilfe-Tabelle auseinander, und lange Vorschläge brachen auf zwei Zeilen um und sahen aus wie Eingabefelder. | Screenshot | Hilfe gestapelt, Vorschläge als eine Zeile zum Wischen |
| Der vorgeschlagene «Was war dein grösster Fail?» bekam im Mock «steht nicht in meiner Wissensbasis», obwohl die Antwort im gesperrten Teil liegt. | Durchklicken aller Vorschläge | Mock verweist wie das echte Modell auf `CODE` |
| Beim Airhockey löste der erste Entwurf Kollisionen immer zuerst für den Spieler, dann für den C64 auf. Wer zuletzt drankam, gewann jedes Gerangel an der Mittellinie: Zwei gleiche Computergegner spielten 9:38. | Simulierte Matches C64 gegen C64 | Reihenfolge wechselt bei jedem Schritt, seither ausgeglichen |
| Ein Puck, den ein Schläger gegen die Bande drückte, bekam bei jedem Physikschritt neuen Schwung und zitterte mit Höchstgeschwindigkeit auf der Stelle. | Simulation | Eingeklemmter Puck steht still, nach 1.5 Sekunden legt ihn ein «Schiedsrichter» zurück ins Spiel |
| Nach jedem Treffer lagen Puck und Schläger wegen Rundung um Millionstel Pixel ineinander. Das zählte als «eingeklemmt» und stoppte jeden Schuss entlang der Bande. | Simulation | Toleranz von einem halben Pixel |
| Der C64 wartete vor einem Puck, der knapp auf der anderen Seite der Mittellinie lag, und kam nie heran. Der Puck lag dort für immer. | Simulation | Die eigene Hälfte endet exakt an der Mittellinie |
| Nach einem Tor blieb «TOR FÜR DEN C64!» bis zum nächsten Tor stehen. | Browser | Anzeige nach der Pause neu zeichnen |
| **Der teuerste Fehler:** Die Regel `knowledge/` in der `.gitignore` sollte den privaten Wissensordner schützen, blendete aber auch `src/server/knowledge/` aus. Der Wissens-Loader war nie committet, ein frischer Clone wäre nicht gestartet. Alle 192 Tests waren trotzdem grün, weil die Dateien auf der Platte lagen. Biome hat sie aus demselben Grund nie formatiert. | Nachbau des Docker-Builds aus den committeten Dateien | `/knowledge/` statt `knowledge/`, seither wird jede Änderung in einem frischen Clone geprüft |

Dazu kamen zwei Fehler in den eigenen Tests des Agents (ein E2E-Test erwartete nach `CODE` ein `READY.`, ein anderer fand denselben Text zusätzlich in der unsichtbaren Screenreader-Ansage), ein paar Shell-Befehle, deren Escaping beim Bearbeiten von Code mit Regex kaputtging, und eine Behauptung ohne Prüfung: Im ersten Abschlussbericht stand, das Repository habe keinen GitHub-Remote. Es hatte einen, `git remote -v` hätte es in einer Sekunde gezeigt.

**Was daraus folgt:** Von den 28 Fehlern in der Tabelle haben automatisierte Tests 10 gefunden, Simulationen 4, Browser und Screenshots 6, Reviews 7 und der nachgestellte Build einen. Der Agent schreibt schnell und meistens richtig, aber er prüft seine eigenen Annahmen nicht von selbst. Das Sicherheitsnetz muss stehen, bevor man ihm vertraut. Und es muss prüfen, was ausgeliefert wird: Grüne Tests im Arbeitsverzeichnis beweisen nichts über das Repository.

## Was noch ein Mensch prüfen muss

Ehrlich offen, Stand jetzt:

* **Echte Antworten:** Die Tests laufen im Mock-Modus. Wie sich Claude Haiku mit der echten Wissensbasis verhält, insbesondere bei Jailbreak-Versuchen, braucht einen Testlauf mit API-Key und kritisches Lesen der Antworten.
* **Die Wissensbasis selbst:** Was der Bot über mich sagt, ist nur so ehrlich wie das, was ich hineinschreibe.
* **Screenreader:** axe findet keine Verstösse, aber ein Durchgang mit NVDA oder VoiceOver ersetzt das nicht.
* **Docker:** Auf dem Entwicklungsrechner gab es weder Docker noch WSL. Der Build wurde deshalb zuerst aus einem frischen Clone Stufe für Stufe nachgestellt, danach hat die CI auf GitHub das Image echt gebaut, gestartet und per Smoke-Test geprüft. Offen ist der Betrieb hinter einem Reverse Proxy mit HTTPS, also der echte Deploy.
* **MEMES.md:** steht in meiner Stimme und muss nach meinem Gegenlesen stimmen, nicht nach dem des Agents.
