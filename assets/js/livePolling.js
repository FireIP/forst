// Live Status Polling & Hysterese
import {settings} from './constants.js';
import {runtime} from './state.js';
import {reorderCardsByLive, setCardLiveState} from './ordering.js';

let pendingPoll = null;

async function fetchLiveStreams(app) {
    const base = settings.LIVE_STATUS_API_BASE_URL.replace(/\/+$/, '');
    const url = `${base}/${encodeURIComponent(app)}`;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), settings.LIVE_FETCH_TIMEOUT_MS);
    try {
        const resp = await fetch(url, {
            method: 'GET',
            cache: 'no-cache',
            signal: controller.signal,
            credentials: 'same-origin'
        });
        if (!resp.ok) throw new Error(`Live status API returned HTTP ${resp.status}`);
        const data = await resp.json();
        if (!data || data.statusCode !== 200 || !Array.isArray(data.response) ||
            !data.response.every(name => typeof name === 'string')) {
            throw new Error('Invalid live status API response');
        }
        return new Set(data.response);
    } finally {
        clearTimeout(id);
    }
}

async function pollApplications() {
    const applications = new Map();
    for (const stream of settings.streams) {
        try {
            const path = new URL(stream.mediaPath, window.location.href).pathname;
            const match = /^\/([^/]+)\/([^/]+)\/?$/.exec(path);
            if (!match) throw new Error(`Invalid stream mediaPath: ${stream.mediaPath}`);
            const app = decodeURIComponent(match[1]);
            const name = stream.sourceStreamName ?? decodeURIComponent(match[2]);
            if (typeof name !== 'string' || !name) throw new Error('Invalid sourceStreamName');
            if (!applications.has(app)) applications.set(app, []);
            applications.get(app).push({stream, name});
        } catch (error) {
            console.warn(`Cannot determine live status for ${stream.id}`, error);
        }
    }
    await Promise.all([...applications].map(async ([app, streams]) => {
        let liveStreams;
        try {
            liveStreams = await fetchLiveStreams(app);
        } catch (error) {
            console.warn(`Live status API polling failed for ${app}`, error);
            return;
        }
        for (const {stream: s, name} of streams) {
            const card = document.querySelector(`.card[data-stream-id="${s.id}"]`);
            if (!card) continue;
            const liveNow = liveStreams.has(name);
            runtime.liveCounters[s.id] = runtime.liveCounters[s.id] || 0;
            if (liveNow) runtime.liveCounters[s.id] = Math.min(settings.LIVE_THRESHOLD, runtime.liveCounters[s.id] + 1); else runtime.liveCounters[s.id] = Math.max(-settings.LIVE_THRESHOLD, runtime.liveCounters[s.id] - 1);
            const currentlyLive = card.dataset.isLive === 'true';
            if (runtime.liveCounters[s.id] >= settings.LIVE_THRESHOLD && !currentlyLive) setCardLiveState(card, true);
            else if (runtime.liveCounters[s.id] <= -settings.LIVE_THRESHOLD && currentlyLive) setCardLiveState(card, false);
        }
    }));
    if (runtime.autoSort && !runtime.fullscreenPaused) reorderCardsByLive();
}

export function pollLiveStatuses() {
    if (!pendingPoll) {
        pendingPoll = pollApplications().finally(() => {
            pendingPoll = null;
        });
    }
    return pendingPoll;
}
