// Allgemeine Hilfsfunktionen
import {settings} from './constants.js';
import {runtime} from './state.js';

export function buildMediaUrl(mediaPath) {
    const loc = window.location;
    const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return wsProto + '//' + loc.host + mediaPath;
}

export function buildManifestUrl(mediaPath) {
    const loc = window.location;
    const httpProto = loc.protocol === 'https:' ? 'https:' : 'http:';
    const base = mediaPath.endsWith('/') ? mediaPath.slice(0, -1) : mediaPath;
    return `${httpProto}//${loc.host}${base}/llhls.m3u8`;
}

export function destroyPlayerInstance(player) {
    try {
        if (!player) return;
        if (typeof player.remove === 'function') return player.remove();
        if (typeof player.destroy === 'function') return player.destroy();
        if (typeof player.dispose === 'function') return player.dispose();
        console.warn('Player instance ohne remove/destroy/dispose', player);
    } catch (err) {
        console.warn('Fehler beim Destroy Player', err);
    }
}

export function refreshServerThumbs() {
    settings.streams.forEach(s => {
        const img = document.querySelector(`img.thumb-img[data-stream-id="${s.id}"]`);
        if (img) img.src = (runtime.savedThumbSrc[s.id] || s.thumb) + '?t=' + Date.now();
    });
}
