// Live Status Polling & Hysterese
import {settings} from './constants.js';
import {runtime} from './state.js';
import {reorderCardsByLive, setCardLiveState} from './ordering.js';
import {buildManifestUrl} from './utils.js';

export async function isStreamLiveOnce(stream) {
    const url = buildManifestUrl(stream.mediaPath);
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), settings.LIVE_FETCH_TIMEOUT_MS);
    try {
        const resp = await fetch(url, {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
            credentials: 'same-origin'
        });
        clearTimeout(id);
        if (!resp.ok) return false;
        const text = await resp.text();
        if (!text) return false;
        if (text.includes('#EXTM3U')) return true;
        return true;
    } catch (_) {
        return false;
    }
}

export async function pollLiveStatuses() {
    const tasks = settings.streams.map(async s => {
        const card = document.querySelector(`.card[data-stream-id="${s.id}"]`);
        if (!card) return;
        const liveNow = await isStreamLiveOnce(s);
        runtime.liveCounters[s.id] = runtime.liveCounters[s.id] || 0;
        if (liveNow) runtime.liveCounters[s.id] = Math.min(settings.LIVE_THRESHOLD, runtime.liveCounters[s.id] + 1); else runtime.liveCounters[s.id] = Math.max(-settings.LIVE_THRESHOLD, runtime.liveCounters[s.id] - 1);
        const currentlyLive = card.dataset.isLive === 'true';
        if (runtime.liveCounters[s.id] >= settings.LIVE_THRESHOLD && !currentlyLive) setCardLiveState(card, true);
        else if (runtime.liveCounters[s.id] <= -settings.LIVE_THRESHOLD && currentlyLive) setCardLiveState(card, false);
    });
    await Promise.all(tasks);
    if (runtime.autoSort && !runtime.fullscreenPaused) reorderCardsByLive();
}
