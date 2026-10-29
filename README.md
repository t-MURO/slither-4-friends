# Slither Coop

Browser-Erweiterung (Chrome + Firefox, Manifest V3) für [Slither](http://slither.com), um mit Freunden zusammen zu spielen:

- **Freunde** über gegenseitige Freundescodes (beide müssen sich eintragen), Live-Punktestand, Auto-Join auf denselben Server, „Join“-Button
- **Pfeile** am Bildschirmrand, Ringe und Umrisse um Freunde und verfolgte Schlangen
- **Coop-Minimap**: größer, klarer, frei einstellbar (Größe, Ecke, Farben, Helligkeit, Namen, Linien, Raster)
- **Verbesserte Rangliste** (umschaltbar auf das Original)
- **Spieler verfolgen** nach Name, per Dropdown mit Suche, per Klick in die Rangliste oder auf eine Schlange, mit eigener Farbe (auch auf der Minimap)
- **Pause** (`P`): die Schlange kreist, bis du weiterspielst. **Maus aus** (`M`)

Die gesamte Oberfläche ist im Spiel, ein Popup gibt es nicht.

## Setup

Voraussetzung: Node.js ≥ 20.

```bash
npm install
npm run dev        # Playground mit Live-Reload: http://localhost:8020
```

| Befehl | Zweck |
|---|---|
| `npm run dev` | Dev-Server: Playground mit gemocktem Spiel, Netzwerk und Speicher; Loader fürs echte Spiel |
| `npm run build` | Erweiterung nach `dist/extension/` bauen |
| `npm run watch` | dasselbe, baut bei jeder Änderung neu |
| `npm run zip` | Build und `dist/slither-coop-<version>.zip` (für den Store oder zum Weitergeben) |
| `npm test` | Unit-Tests (Kernlogik und Controller gegen Fake-Adapter) |
| `npm run typecheck` | TypeScript prüfen |
| `npm run check` | Typecheck, Tests und Build in einem |

Die Version kommt aus `package.json` und wird beim Build ins Manifest geschrieben.

## Erweiterung installieren (aus `dist/extension`)

- **Chrome / Edge / Brave:** `chrome://extensions` → Entwicklermodus an → „Entpackte Erweiterung laden“ → Ordner `dist/extension`. Nach einem neuen Build dort auf ↻ klicken.
- **Firefox:** `about:debugging#/runtime/this-firefox` → „Temporäres Add-on laden“ → `dist/extension/manifest.json`. Das bleibt bis zum Neustart von Firefox aktiv. Für eine dauerhafte Installation die Zip-Datei über addons.mozilla.org signieren lassen (auch als „nicht gelistet“ möglich).

## Entwickeln

### Playground (`npm run dev` → http://localhost:8020)

Links ist ein Kontroll-Panel, rechts ein Fake-Spiel in einem iframe, in dem die echte UI läuft. Spiel, Netzwerk und Speicher sind dabei gemockt. Bei jeder Änderung an `src/` wird der Playground automatisch neu geladen.

- **View:** ganze App oder eine einzelne Komponente isoliert (Hud, Panel, Leaderboard, Toast, StatusPill), Viewport-Größe, Overlay-Ebenen einzeln an/aus
- **Game:** Phase (Menü / verbinden / spielen / tot), eigener Server, Länge, Nickname, Zoom, Anzahl Bots, Anteil mit Namen, Schlange in der Nähe spawnen
- **Friends (mock):** Freunde anlegen und live steuern: online, „in meiner Liste“, „hat mich hinzugefügt“, gleicher Server / gleicher Server über IPv6 / anderer Server, Entfernung, Richtung, Kreisen, Punkte, Farbe
- **Network:** Zustand des Signal-Servers, die zuletzt gesendete Nachricht
- **Stored config:** gespeicherte Konfiguration als JSON bearbeiten, „Änderung von außen“ simulieren (wie ein zweiter Tab), neuer Nutzer, Reset

Im Fake-Spiel funktionieren Maus, Klicks, `P` und `M` wie im echten Spiel. In der Konsole des iframes ist `window.__dev` verfügbar (`world`, `net`, `storage`, `app`).

### Im echten Spiel testen, ohne die Erweiterung neu zu laden

Bei laufendem `npm run dev` auf slither.com in der Konsole ausführen (oder als Lesezeichen speichern):

```js
javascript:(()=>{const s=document.createElement('script');s.src='http://localhost:8020/inject.js?'+Date.now();document.head.appendChild(s)})()
```

Das lädt den aktuellen Quellcode ins echte Spiel und tauscht ihn bei jeder Änderung live aus, ohne Neuladen der Seite. Die installierte Erweiterung dafür vorher deaktivieren. Die Konfiguration liegt in diesem Modus im `localStorage` von slither.com. Chrome fragt eventuell nach der Berechtigung für Zugriff aufs „lokale Netzwerk“ (http-Seite → localhost); das bitte erlauben.

### Adapter-Check nach einem Slither-Update

Slither ändert gelegentlich sein Spiel. Gleiches Lesezeichen wie oben, aber mit `check.js` statt `inject.js`, während eine Runde läuft. Der Check prüft, ob alle Spielvariablen noch da sind (eigene Schlange, Server-ID, Kamera, Schlangen, Rangliste, Minimap, Serverwahl, Pause-Steuerung). Außerdem prüft er, ob zwei Peers sich über den PeerJS-Server verbinden und Nachrichten austauschen und ob eine einseitige Freundschaft korrekt **nicht** verbindet. Das Ergebnis erscheint nach ca. 35 s als Tabelle in der Konsole und in `window.__slcCheck`.

## Architektur

```
src/
  core/        reine Logik ohne DOM: Typen, Einstellungen, Server-Vergleich, Geometrie, Store
  adapters/    alles, was nach außen geht, hinter Interfaces
    types.ts     GameAdapter, NetAdapter, StorageAdapter, PrefsAdapter
    real/        slither-game.ts (Spiel-Globals), peer-net.ts (PeerJS + WebRTC), storage.ts
    mock/        world.ts (simuliertes Spiel), net.ts (simulierte Freunde), storage.ts
  app/
    controller.ts  das „Gehirn“: Freunde, Tracking, Auto-Join, Pause; liefert einen beobachtbaren View-State
    mount.tsx      verbindet Adapter, Controller, UI und Overlay
  ui/          Preact-Komponenten (Hud, Panel mit Tabs, Leaderboard, Toast) und das Canvas-Overlay
  entries/     extension.tsx (Content-Script), bridge.ts (Speicher-Brücke), inject.tsx (Dev-Loader)
  dev/         Playground (panel, frame), Mock-Zustand, real-check.ts
static/        manifest.json, Icons
scripts/       build.mjs, dev.mjs (esbuild)
tests/         node:test via tsx
```

**Regel:** Komponenten und Controller sprechen nie direkt mit `window.*`-Globals des Spiels, mit WebSockets oder `chrome.storage`, sondern nur mit den Adaptern. Deshalb läuft alles auch gegen die Mocks. Neue Abhängigkeiten nach außen bekommen eine Methode im passenden Adapter-Interface, eine echte und eine Mock-Implementierung und, falls sinnvoll, einen Regler im Playground-Panel.

**Erweiterung zur Laufzeit:** `bridge.js` läuft in der isolierten Welt und hat Zugriff auf `chrome.storage.sync`. `coop.js` läuft in der Seitenwelt (MAIN) und hat Zugriff auf die Spielvariablen. Beide sprechen über `CustomEvent`s (`slcoop:ready`, `slcoop:config`, `slcoop:save`) miteinander.

**Netzwerk:** Verbindung von Browser zu Browser per WebRTC. Nur das Signaling läuft über den öffentlichen PeerJS-Server (`0.peerjs.com`); einen eigenen Server gibt es nicht. Die Peer-ID ist `slcoop2-<Code>`. Es wählt immer die kleinere ID, und die Gegenseite antwortet nur Codes aus ihrer eigenen Liste. Ein Freund kommt also nur zustande, wenn beide sich eingetragen haben. Gesendet werden 10× pro Sekunde Name, Position, Punkte und Server.

**Server:** Jeder Slither-Server steht doppelt in der Liste (IPv4 und IPv6, gleiche `sid`). Verglichen wird deshalb über die `sid`, und beim Beitreten wird immer der IPv4-Eintrag erzwungen.

## Hinweise

- Statt Vite wird **esbuild** direkt verwendet (Build, Watch, Dev-Server mit Live-Reload). Das ist für eine Erweiterung mit zwei Content-Scripts einfacher und kommt ohne Plugins aus.
- Der Build ist absichtlich nicht minifiziert, weil das die Prüfung bei addons.mozilla.org erleichtert.
