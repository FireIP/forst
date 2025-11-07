// Laden externer Konfiguration und Anwenden auf settings
import {settings} from './constants.js';

export function applyExternalConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    const map = {
        streams: 'streams',
        thumbServerRefreshMs: 'THUMB_SERVER_REFRESH_MS',
        livePollMs: 'LIVE_POLL_MS',
        liveFetchTimeoutMs: 'LIVE_FETCH_TIMEOUT_MS',
        reorderMinIntervalMs: 'REORDER_MIN_INTERVAL_MS',
        liveThreshold: 'LIVE_THRESHOLD',
        maxReconnectAttempts: 'MAX_RECONNECT_ATTEMPTS',
        reconnectDelayBaseMs: 'RECONNECT_DELAY_BASE',
        defaultAutoSort: 'DEFAULT_AUTO_SORT'
    };
    Object.entries(map).forEach(([src, dest]) => {
        if (Object.prototype.hasOwnProperty.call(cfg, src) && typeof cfg[src] !== 'undefined') {
            settings[dest] = cfg[src];
        }
    });
}

export async function loadExternalConfig() {
    const candidates = ['/config.json', '/config.example.json'];
    for (const url of candidates) {
        try {
            const resp = await fetch(url, {cache: 'no-store', credentials: 'same-origin'});
            if (resp.ok) {
                const data = await resp.json();
                applyExternalConfig(data);
                break;
            }
        } catch (_) { /* nächster Versuch */
        }
    }
}
