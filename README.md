# forst (Fire Oven RTC Stream)
Website for presenting OvenMediaEngine WebRTC streams to replace discord screen sharing

## Configuration
This app loads runtime configuration from `/config.json` if present, otherwise it falls back to `/config.example.json` committed in the repo.

- `config.json` is ignored by Git (see `.gitignore`). Provide this file during deployment to override defaults.

### Files
- `config.example.json` — safe default config committed to Git. You may edit labels/paths as examples; it contains no secrets.
- `config.json` — your real deployment config (not committed). Place it at the site root so it is accessible at `/config.json`.

### Example `config.json`
```json
{
  "streams": [
    {"id": "stream", "label": "Stream", "mediaPath": "/app/stream", "thumb": "/thumbs/stream.jpg"}
  ],
  "thumbServerRefreshMs": 180000,
  "livePollMs": 5000,
  "liveStatusApiBaseUrl": "/api/live",
  "liveFetchTimeoutMs": 4500,
  "reorderMinIntervalMs": 15000,
  "liveThreshold": 2,
  "maxReconnectAttempts": 10,
  "reconnectDelayBaseMs": 2000,
  "defaultAutoSort": true
}
```

### Live status via the OvenMediaEngine API

Live detection uses OME's `GET /v1/vhosts/{vhost}/apps/{app}/streams` endpoint,
not LL-HLS manifests. Each poll makes one request per application, regardless of
the number of configured streams. Application and stream names come from each
`mediaPath` (`/app/stream`); query parameters are ignored. OME lists **input**
stream names. If an output profile renames a playback stream, set
`"sourceStreamName": "original-input-name"` on that stream's config entry.
A stream is live when its input name appears in the API's `response` array.
This detects presence in OME,
not whether a particular playback protocol is healthy, and does not pull
on-demand streams into existence.

**Deployment changes are required when upgrading:**

1. Enable OME's management API in `Server.xml`: set
   `Bind/Managers/API/Port` (the nginx example uses `8081`), configure
   `Managers/Host/Names`, and set a strong `Managers/API/AccessToken`.
   Keep the management port private (loopback/private network and firewall;
   with Docker, publish it only on `127.0.0.1`).
2. Install the `/api/live/` proxy and cache configuration from `default.nginx`.
   Include the file in nginx's `http` context, make the cache directory writable
   by nginx, and adjust the upstream address and `default` virtual-host name
   to match OME. The example allows application names containing letters,
   digits, underscores and hyphens; adjust its allowlist if yours differ.
3. Replace `<base64-of-OME-AccessToken>` in the **server-side nginx config**
   with the base64-encoded AccessToken (without a trailing newline).
   Never put the token in `config.json` or JavaScript: those are public.
   Keep the nginx config outside the web root. Only read-only stream-list
   requests are exposed; do not proxy the whole management API.
4. Check and reload nginx. A request to `/api/live/app` should return
   `{"statusCode":200,"message":"OK","response":["stream"]}` when `stream` is
   present, or an empty `response` array when no streams are present.

`liveStatusApiBaseUrl` defaults to `/api/live`; change it if your same-origin
proxy uses another prefix. The proxy caches successful lists for two seconds
and shares them across viewers. Polls still run every `livePollMs`, with the
existing `liveThreshold` hysteresis. `liveFetchTimeoutMs` covers both the
request and reading its JSON body. Failed, timed-out or malformed API responses
are reported in the browser console and leave the last known state unchanged;
there is no LL-HLS fallback. An unavailable or misconfigured API therefore
leaves initial cards in Preview until valid status data arrives.

### Tests

Run the live-status regression tests with Node.js 22.7 or later:

```sh
node --test tests/livePolling.test.js
```

## Modularisierte Frontend-Architektur (Refactor 2025-11-07)

```
assets/
  css/
    main.css              # ausgelagerte Styles
  js/
    constants.js          # Tunables & LocalStorage Keys
    config.js             # Externe Konfiguration laden/apply
    state.js              # Laufzeit-Container (runtime)
    utils.js              # Generische Helfer (URLs, Destroy, Thumbs)
    dom.js                # Grid-Erzeugung
    drag.js               # Drag & Drop & Persistenz manueller Reihenfolge
    player.js             # Player-Handling & Reconnect-Strategie
    livePolling.js        # Live-Status Polling + Hysterese
    ordering.js           # Sortierlogik & Auto-Sort Schalter
    bootstrap.js          # Initialisierung / Entry Point
    debug.js              # Optionales Debug-Interface (window.debug)
```

Eine vollständig bereinigte Version ohne Inline-Styles/-Scripts liegt als `index.refactored.html` vor. Um sie produktiv zu nutzen, benenne diese Datei zu `index.html` oder ersetze den Inhalt der bestehenden Datei manuell.

### Einstieg
`bootstrap.js` orchestriert:
1. `loadExternalConfig()` → Settings überschreiben
2. Indizes aufbauen
3. `createGrid()`
4. Auto-Sort Status laden und anwenden (`setAutoSort()`)
5. Erste Live-Poll Runde + Intervalle für Polling & Thumb Refresh
6. Event-Listener (Fullscreen, Toggles, Reset)

### Debug
`window.debug` enthält u.a. `settings`, `runtime`, `pollLiveStatuses`. Reconnect-Status kann über `runtime.reconnectAttempts` inspiziert werden.

### Wartungshinweise
- Beim Ändern von Tunables nur `constants.js` anfassen.
- Neue UI-Komponenten in eigenes Modul (z.B. `events.js`) extrahieren, falls Umfang wächst.
- Bundling (Vite/Rollup) optional: ein Entry Point = `bootstrap.js`.
- Für TypeScript-Migration: zuerst `constants`, `state`, dann schrittweise weitere Module typisieren.
