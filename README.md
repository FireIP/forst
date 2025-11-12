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
    {"id": "stream", "label": "Stream", "mediaPath": "/app/steam", "thumb": "/thumbs/steam.jpg"}
  ],
  "thumbServerRefreshMs": 180000,
  "livePollMs": 5000,
  "liveFetchTimeoutMs": 4500,
  "reorderMinIntervalMs": 15000,
  "liveThreshold": 2,
  "maxReconnectAttempts": 10,
  "reconnectDelayBaseMs": 2000,
  "defaultAutoSort": true,
  "statsApiUrl": "http://your-ome-server:8081",
  "vhostName": "default",
  "viewerStatsPollMs": 10000,
  "viewerStatsTimeoutMs": 5000
}
```

### Viewer Count Feature

To enable viewer count display on stream cards, configure the following in `config.json`:

- `statsApiUrl` — OvenMediaEngine API base URL (e.g., `http://localhost:8081`). Set to `null` to disable viewer counting.
- `vhostName` — Virtual host name in OvenMediaEngine (default: `"default"`).
- `viewerStatsPollMs` — Polling interval for viewer stats in milliseconds (default: 10000).
- `viewerStatsTimeoutMs` — Timeout for viewer stats API requests in milliseconds (default: 5000).

The viewer count badge appears in the top-right corner of each stream card when viewers are connected.

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
