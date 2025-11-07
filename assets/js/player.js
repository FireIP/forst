// Player Handling & Reconnect
import {runtime} from './state.js';
import {settings} from './constants.js';
import {buildMediaUrl, destroyPlayerInstance} from './utils.js';
import {saveManualOrder} from './drag.js';

export function scheduleReconnect(streamId, stream, cardEl) {
    const attempts = runtime.reconnectAttempts[streamId] || 0;
    if (attempts >= settings.MAX_RECONNECT_ATTEMPTS) {
        console.error(`Max reconnect (${settings.MAX_RECONNECT_ATTEMPTS}) erreicht für ${streamId}`);
        const badge = cardEl?.querySelector('.status-badge');
        if (badge) {
            badge.textContent = 'Connection Failed';
            badge.className = 'badge bg-danger status-badge';
        }
        setTimeout(() => {
            restoreThumbnail(cardEl, streamId);
            delete runtime.reconnectAttempts[streamId];
        }, 5000);
        return;
    }
    runtime.reconnectAttempts[streamId] = attempts + 1;
    const delay = Math.min(settings.RECONNECT_DELAY_BASE * runtime.reconnectAttempts[streamId], 10000);
    const badge = cardEl?.querySelector('.status-badge');
    if (badge) {
        badge.textContent = `Reconnecting (${runtime.reconnectAttempts[streamId]}/${settings.MAX_RECONNECT_ATTEMPTS})...`;
        badge.className = 'badge bg-warning text-dark status-badge';
    }
    if (runtime.reconnectTimers[streamId]) clearTimeout(runtime.reconnectTimers[streamId]);
    runtime.reconnectTimers[streamId] = setTimeout(() => {
        try {
            if (runtime.players[streamId]) {
                destroyPlayerInstance(runtime.players[streamId]);
                delete runtime.players[streamId];
            }
            activateCard(stream, cardEl);
        } catch (err) {
            console.error('Reconnect Fehler', err);
            scheduleReconnect(streamId, stream, cardEl);
        }
        delete runtime.reconnectTimers[streamId];
    }, delay);
}

export function activateCard(stream, cardEl) {
    if (!cardEl) return;
    const streamId = stream.id;
    if (runtime.players[streamId]) {
        return;
    }
    const mediaWrap = cardEl.querySelector('.media-wrap');
    if (!mediaWrap) return;
    const inner = mediaWrap.querySelector('.media-inner');
    if (!inner) return;
    cardEl.classList.add('loading');
    inner.innerHTML = '<div class="loader">Connecting...</div>';
    const closeBtn = mediaWrap.querySelector('.closeBtnCard');
    if (closeBtn) closeBtn.style.display = 'block';
    try {
        const playerContainer = document.createElement('div');
        playerContainer.id = 'player_' + streamId;
        playerContainer.style.cssText = 'width:100%;height:100%;position:absolute;inset:0';
        inner.innerHTML = '';
        inner.appendChild(playerContainer);
        const mediaUrl = buildMediaUrl(stream.mediaPath);
        const opts = {
            autoStart: true,
            autoFallback: true,
            mute: true,
            controls: true,
            sources: [{type: 'webrtc', file: mediaUrl}],
            parseStream: {enabled: true},
            webrtcConfig: {timeoutMaxRetry: 8, connectionTimeout: 10000}
        };
        const playerInstance = OvenPlayer.create(playerContainer.id, opts);
        runtime.players[streamId] = playerInstance;
        if (runtime.reconnectAttempts[streamId] === undefined) {
            runtime.reconnectAttempts[streamId] = 0;
        }
        if (typeof playerInstance.on === 'function') {
            playerInstance.on('error', (error) => {
                const isConn = error && (error.code === 501 || error.code === 511 || error.code === 'CONNECTION_TIMEOUT' || error.code === 'CONNECTION_CLOSED' || error.message?.includes('terminated') || error.message?.includes('timeout') || error.message?.includes('closed') || error.message?.includes('failed'));
                if (isConn) {
                    scheduleReconnect(streamId, stream, cardEl);
                }
            });
            playerInstance.on('stateChanged', (state) => {
                if (state.newstate === 'playing') {
                    runtime.reconnectAttempts[streamId] = 0;
                    if (runtime.reconnectTimers[streamId]) {
                        clearTimeout(runtime.reconnectTimers[streamId]);
                        delete runtime.reconnectTimers[streamId];
                    }
                    cardEl.classList.remove('loading');
                    cardEl.classList.add('playing');
                    const badge = cardEl.querySelector('.status-badge');
                    if (badge) {
                        const live = cardEl.dataset.isLive === 'true';
                        badge.textContent = live ? 'Live' : 'Playing';
                        badge.className = live ? 'badge bg-success status-badge' : 'badge bg-danger status-badge';
                    }
                }
            });
        }
        cardEl.classList.remove('loading');
        cardEl.classList.add('playing');
        const badge = cardEl.querySelector('.status-badge');
        if (badge) {
            const live = cardEl.dataset.isLive === 'true';
            badge.textContent = live ? 'Live' : 'Playing';
            badge.className = live ? 'badge bg-success status-badge' : 'badge bg-danger status-badge';
        }
        setTimeout(() => {
            const wrapper = document.getElementById(playerContainer.id);
            if (wrapper) wrapper.classList.add('ovp-full');
            const ovpEl = wrapper?.querySelector('.ovp');
            if (ovpEl) ovpEl.classList.add('ovp-full');
        }, 120);
    } catch (err) {
        cardEl.classList.remove('loading');
        scheduleReconnect(streamId, stream, cardEl);
    }
}

export function restoreThumbnail(cardEl, streamId) {
    if (!cardEl) return;
    if (runtime.reconnectAttempts) delete runtime.reconnectAttempts[streamId];
    if (runtime.reconnectTimers[streamId]) {
        clearTimeout(runtime.reconnectTimers[streamId]);
        delete runtime.reconnectTimers[streamId];
    }
    const playerInstance = runtime.players[streamId];
    if (playerInstance) {
        destroyPlayerInstance(playerInstance);
        delete runtime.players[streamId];
    }
    const mediaWrap = cardEl.querySelector('.media-wrap');
    if (!mediaWrap) return;
    const inner = mediaWrap.querySelector('.media-inner');
    if (!inner) return;
    const closeBtn = mediaWrap.querySelector('.closeBtnCard');
    if (closeBtn) closeBtn.style.display = 'none';
    inner.innerHTML = '';
    const img = document.createElement('img');
    img.className = 'thumb-img';
    img.setAttribute('data-stream-id', streamId);
    img.src = runtime.savedThumbSrc[streamId] || (settings.streams.find(s => s.id === streamId)?.thumb || '');
    img.alt = settings.streams.find(s => s.id === streamId)?.label || 'preview';
    img.addEventListener('click', () => {
        const s = settings.streams.find(x => x.id === streamId);
        if (s) activateCard(s, cardEl);
    });
    inner.appendChild(img);
    const badge = mediaWrap.querySelector('.status-badge');
    if (badge) {
        const isLive = cardEl.dataset.isLive === 'true';
        badge.textContent = isLive ? 'Live' : 'Preview';
        badge.className = isLive ? 'badge bg-success status-badge' : 'badge bg-dark status-badge';
    }
    cardEl.classList.remove('playing');
    cardEl.classList.remove('loading');
    if (!runtime.autoSort) saveManualOrder();
}

