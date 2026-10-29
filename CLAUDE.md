# Slither Coop – notes for Claude

Browser extension (Chrome + Firefox, MV3) for slither.com / slither.io: friends find each other
(mutual friend codes, PeerJS/WebRTC), live scores, edge arrows, Coop minimap, improved
leaderboard, player tracking, pause (P), mouse toggle (M). All UI is in-game; no popup.
The README has setup, architecture and the dev workflow; read it first.

## Commands
- `npm run dev`: playground with mocked game/net/storage at http://localhost:8020, live reload.
  Also serves `inject.js` (live loader for the real game) and `check.js` (adapter check).
- `npm run check`: typecheck, tests and build. Run it before every commit.
- `npm run zip`: build plus `dist/slither-coop-<version>.zip`.
- Version lives in `package.json`; the build writes it into the manifest. Bump it for user-visible changes.

## Rules
- UI and controller never touch game globals, WebSockets or chrome.storage directly; only the
  adapters in `src/adapters/` (real + mock) do. A new external dependency gets an interface method,
  a real and a mock implementation, and if useful a control in the playground panel (`src/dev/panel.tsx`).
- Servers: compare by `sid` (each server is listed as IPv4 and IPv6); when joining, force the IPv4 entry.
- PeerJS signaling messages must match PeerJS exactly (key order `{type, payload, dst}`), or 0.peerjs.com drops them.
- Peer id is `slcoop2-<code>`; the smaller id dials; a peer answers only codes on its own list (mutual rule).
- After a Slither update: run `check.js` in the real game while playing (see README).
- Commits: author Tadeo <tadeomuro@gmail.com>; messages in English.

## State (2026-10-29)
- v4.0.0 is the first commit (tag `v4.0.0`), delivered as `slither-coop.bundle`. If `.git` does not exist yet:
  `git init -b main && git fetch slither-coop.bundle main --tags && git reset FETCH_HEAD`, then delete the bundle.
- Planned: private GitHub repo `slither-4-friends`: `gh repo create slither-4-friends --private --source . --push`, then `git push --tags`.
- Obsolete v3 files in the root (delete them, never commit them): `bridge.js`, `coop.js`, `manifest.json`,
  `popup.html`, `popup.css`, `popup.js`, `icons/`.
- Small open UI issues: in the playground's friend card the code wraps; in the Coop list, "hasn't added you" still shows a green dot.
