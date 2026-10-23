// Viewer Statistics Fetching from OvenMediaEngine API
import {settings} from './constants.js';
import {runtime} from './state.js';

export async function fetchViewerStats() {
    if (!settings.statsApiUrl) {
        return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), settings.VIEWER_STATS_TIMEOUT_MS);

    try {
        const url = `${settings.statsApiUrl}/v1/stats/current/vhosts/${settings.vhostName}`;
        const resp = await fetch(url, {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
            credentials: 'same-origin'
        });
        clearTimeout(timeoutId);

        if (!resp.ok) {
            console.warn('Failed to fetch viewer stats:', resp.status);
            return;
        }

        const data = await resp.json();
        updateViewerCounts(data);
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.warn('Error fetching viewer stats:', err);
        }
    }
}

function updateViewerCounts(statsData) {
    if (!statsData || !statsData.response || !statsData.response[0]) {
        return;
    }

    const vhost = statsData.response[0];
    const apps = vhost.applications || [];

    // Reset all counts to 0
    settings.streams.forEach(s => {
        runtime.viewerCounts[s.id] = 0;
    });

    // Update counts from stats
    apps.forEach(app => {
        const streams = app.streams || [];
        streams.forEach(stream => {
            const streamName = stream.name;
            // Find matching stream config by matching the stream name in mediaPath
            const matchingStream = settings.streams.find(s => {
                const pathParts = s.mediaPath.split('/');
                return pathParts[pathParts.length - 1] === streamName;
            });

            if (matchingStream) {
                // Sum up all connections from different outputs (webrtc, hls, dash, etc)
                const totalConnections = stream.totalConnections || 0;
                runtime.viewerCounts[matchingStream.id] = totalConnections;
                updateViewerDisplay(matchingStream.id, totalConnections);
            }
        });
    });
}

function updateViewerDisplay(streamId, count) {
    const card = document.querySelector(`.card[data-stream-id="${streamId}"]`);
    if (!card) return;

    let viewerBadge = card.querySelector('.viewer-count-badge');
    
    if (count > 0) {
        if (!viewerBadge) {
            viewerBadge = document.createElement('span');
            viewerBadge.className = 'badge bg-info viewer-count-badge';
            const mediaWrap = card.querySelector('.media-wrap');
            if (mediaWrap) {
                mediaWrap.appendChild(viewerBadge);
            }
        }
        viewerBadge.textContent = `${count} viewer${count !== 1 ? 's' : ''}`;
        viewerBadge.style.display = 'block';
    } else if (viewerBadge) {
        viewerBadge.style.display = 'none';
    }
}
