# Code of Meme: meine Antworten

Euer Inserat sagt: «Kannst du dich mit einem Meme nicht identifizieren: no chance. Findest du dich in allen wieder: let's talk.» Also bin ich alle durchgegangen. Ehrlich, und wo möglich mit einem Beweis, den ihr in diesem Repository nachprüfen könnt. Behauptungen ohne Beleg gibts im Gespräch.

## Freedom, Responsibility, Performance

> Uns interessiert nicht, wann die Arbeit gemacht wird. Sondern dass sie gemacht wird.

Dieses Projekt hatte keine Projekt-Nanny, nur ein Briefing und einen Agenten, der es umgesetzt hat. Freiheit hiess hier: C64 statt PDF. Verantwortung hiess: Eine öffentliche KI, die mein Geld ausgibt, bekommt ein hartes Tagesbudget, Rate Limits und einen Zugangscode, der nur als Hash existiert.

**Beweis:** [`src/server/security/`](src/server/security/)

## Be entertaining

> 60% die gelieferte Lösung, 30% wie es sich auf dem Weg angefühlt hat.

Darum ist ein leeres Budget hier kein «Error 503», sondern ein `?FASS LEER ERROR` mit dem Hinweis, was ohne KI weiterhin funktioniert. Die anderen 10% sind die Katze, ich weiss.

**Beweis:** [`src/client/copy.ts`](src/client/copy.ts), alle Texte an einem Ort.

## Developer Pride

> Manchmal baue ich so geile Sachen, dass ich es euch allen im Slack schreibe.

Ich bin stolz auf die Schrift. Die bekannten C64-Fonts haben unklare Lizenzen, also gibt es hier eine eigene: jedes Zeichen als 8x8-Raster im Code, inklusive Umlauten, «Guillemets» und Blockgrafik für das Bierglas. Ein Test prüft, dass jedes Zeichen der Oberfläche in der Schrift existiert. Ja, das hätte ich in den Slack gepostet.

**Beweis:** [`scripts/font/glyphs.ts`](scripts/font/glyphs.ts)

## Boomerang Protection

> Deshalb baue und teste ich meinen Stuff so gut wie möglich, dass es keine Boomerangs gibt.

Unit-Tests für die Logik, End-to-End-Tests auf Desktop und Mobile, Barrierefreiheit mit axe, alles in der CI. Die Tests haben während der Entwicklung echte Fehler gefunden, bevor sie jemand anderes gesehen hat. Welche, steht ohne Beschönigung in [AI-WORKFLOW.md](AI-WORKFLOW.md).

**Beweis:** [`tests/`](tests/) und [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

## Surprise, M\*therf+cker

> Nicht mit Software, die um die Ohren fliegt, sondern mit Dingen, die man so gar nicht erwartet hätte.

Eine Bewerbung, die bootet. Ein MCP-Server, damit euer Claude Code mich interviewen kann. `LOAD "$",8` zeigt die Wissensbasis als Diskettenverzeichnis. Und ein paar Befehle, die in keiner Hilfe stehen.

**Beweis:** [`mcp/`](mcp/), die Anleitung steht im README unter «Aus Claude Code».

## Honesty

> Ausreden und Lügen sind irgendwie doppelt Scheisse.

Das ganze Projekt ist um diese Folie gebaut. Der Bot darf nur sagen, was in seiner Wissensbasis steht, zeigt zu jeder Antwort die Quellen und sagt «weiss ich nicht», wenn er es nicht weiss. Und weil ein Prompt allein kein Beweis ist, lässt sich jede Antwort über ihre Quellen nachprüfen.

**Beweis:** [`src/server/chat/prompt.ts`](src/server/chat/prompt.ts), der komplette Systemprompt, öffentlich.

## Be proactive

> Ich suche mir proaktiv meine nächsten Baustellen.

Niemand hat nach IPv6-Rate-Limits pro /64, einem reproduzierbaren Font-Build oder einem Hash-Format ohne Dollarzeichen gefragt (Docker Compose hätte es sonst still zerlegt). Drin ist es trotzdem, weil es sonst später jemand anderes hätte finden müssen.

**Beweis:** [`src/server/http/client-ip.ts`](src/server/http/client-ip.ts), [`src/server/security/access-code.ts`](src/server/security/access-code.ts)

## Problem, Problem, Problem...

> Finde Lösungen. Keine Probleme.

Problem: Eine KI kann lügen. Lösung: Quellen, Tests und ein Prompt, der öffentlich im Repository steht.<br>
Problem: Das Original-Hellblau auf Blau hat einen Kontrast von 2.3:1. Lösung: etwas heller, jetzt 5.4:1, und ein Satz in `ABOUT`, der sich bei Commodore entschuldigt.<br>
Problem: Kein API-Key auf dem Laptop eines Reviewers. Lösung: Mock-Modus, der denselben Weg durch den Code nimmt.

## Have fun

> Besser einen guten Freund verloren, als einen schlechten Witz nicht zu machen.

Tippt `FLACHWITZ`: über 50 bekannte schlechte Witze, jedes Mal ein anderer. Lieber einen Freund verlieren, ihr wisst schon.

**Beweis:** [`src/client/jokes.ts`](src/client/jokes.ts)
