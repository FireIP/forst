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
  "defaultAutoSort": true
}
```