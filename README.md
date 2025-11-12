# forst (Fire Oven RTC Stream)
Website for presenting OvenMediaEngine WebRTC streams to replace discord screen sharing

## PWA & Notification Features

This application is a **Progressive Web App (PWA)** with support for:

- **📱 Installable**: Install the app on your device from the browser
- **🔔 Push Notifications**: Get notified when streams go live, even when the tab is closed
- **⚡ Background Sync**: Service worker polls stream status in the background
- **📡 Offline Support**: Basic app functionality works offline with cached resources

### Notifications

When a stream transitions from offline to online, you'll receive a notification if:
- You've granted notification permissions
- The browser supports notifications (most modern browsers)
- The service worker is active

**How it works:**
1. On first visit, you'll see a prompt asking if you want to enable notifications
2. Click "Enable" to grant permission
3. The service worker will register and start monitoring streams
4. Notifications will appear even when:
   - The tab is in the background
   - The tab is closed (but browser is running)
   - Your device is locked (on mobile)

**Browser Support:**
- ✅ Chrome/Edge 80+ (full support including periodic sync)
- ✅ Firefox 79+ (notifications + basic sync)
- ✅ Safari 16.4+ (iOS/macOS with limitations)
- ⚠️ Periodic background sync requires Chrome 80+ and may need feature flags

### Installing as PWA

**Desktop (Chrome/Edge):**
1. Click the install icon in the address bar (⊕)
2. Click "Install" in the dialog
3. The app will open in its own window

**Mobile (Chrome/Safari):**
1. Open the menu (⋮)
2. Tap "Add to Home Screen" or "Install App"
3. Confirm installation

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
  "defaultAutoSort": true
}
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
    notifications.js      # PWA & Notification Handling (NEW)
    bootstrap.js          # Initialisierung / Entry Point
    debug.js              # Optionales Debug-Interface (window.debug)
  icons/                  # PWA App Icons (NEW)
manifest.json             # PWA Manifest (NEW)
sw.js                     # Service Worker (NEW)
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

## Deployment Considerations for PWA

### HTTPS Requirement
Service workers and many PWA features **require HTTPS** in production. Exceptions:
- `localhost` for development
- `127.0.0.1` for local testing

### Service Worker Scope
The service worker (`sw.js`) is served from the root and controls the entire app scope (`/`). If deploying to a subdirectory, update:
- Service worker registration path in `notifications.js`
- `scope` parameter in service worker registration
- `start_url` in `manifest.json`

### Caching Strategy
The service worker caches these files for offline use:
- HTML, CSS, and JavaScript files
- App icons
- **NOT cached**: Stream manifests, API calls, thumbnails (always fetched fresh)

To update the cache after deploying new code, increment the `CACHE_VERSION` in `sw.js`.

### Security Headers
The nginx config already includes appropriate CSP headers. Ensure your deployment includes:
```nginx
add_header Content-Security-Policy "default-src 'self' 'unsafe-inline' data: blob: https: ws: wss:; img-src 'self' data: https:;";
```

### Browser Permissions
Users must grant notification permissions for background notifications to work. The app includes:
- A friendly permission prompt (not the browser's default)
- Permission state persistence
- Graceful degradation when permissions are denied
