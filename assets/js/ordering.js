// Sortierlogik & Auto-Sort Zustand
import {settings} from './constants.js';
import {runtime} from './state.js';
import {
    applyManualOrderIfExists,
    disableDraggingOnAllCards,
    enableDraggingOnAllCards,
    loadManualOrder
} from './drag.js';

export function loadAutoSortSetting() {
    try {
        const raw = localStorage.getItem(settings.LS_AUTO_SORT);
        if (raw === null) return settings.DEFAULT_AUTO_SORT;
        return raw === 'true';
    } catch (_) {
        return settings.DEFAULT_AUTO_SORT;
    }
}

export function saveAutoSortSetting(v) {
    try {
        localStorage.setItem(settings.LS_AUTO_SORT, v ? 'true' : 'false');
    } catch (_) {
    }
}

export function setCardLiveState(cardEl, isLive) {
    const prev = cardEl.dataset.isLive === 'true';
    if (prev === isLive) return false;
    cardEl.dataset.isLive = isLive ? 'true' : 'false';
    if (isLive) {
        cardEl.classList.add('live');
        const badge = cardEl.querySelector('.status-badge');
        if (badge && !cardEl.classList.contains('playing')) {
            badge.textContent = 'Live';
            badge.className = 'badge bg-success status-badge';
        }
    } else {
        cardEl.classList.remove('live');
        const badge = cardEl.querySelector('.status-badge');
        if (badge && !cardEl.classList.contains('playing')) {
            badge.textContent = 'Preview';
            badge.className = 'badge bg-dark status-badge';
        }
    }
    return true;
}

export function reorderCardsByLive() {
    if (runtime.fullscreenPaused) return;
    const now = Date.now();
    if (now - runtime.lastReorderAt < settings.REORDER_MIN_INTERVAL_MS) return;
    const grid = document.getElementById('grid');
    if (!grid) return;
    const cards = [...grid.querySelectorAll('.card')];
    const sorted = cards.slice().sort((a, b) => {
        const aLive = a.dataset.isLive === 'true' ? 1 : 0;
        const bLive = b.dataset.isLive === 'true' ? 1 : 0;
        if (aLive !== bLive) return bLive - aLive;
        const ai = parseInt(a.dataset.streamIndex || '0', 10);
        const bi = parseInt(b.dataset.streamIndex || '0', 10);
        return ai - bi;
    });
    const current = cards.map(c => c.dataset.streamId).join(',');
    const next = sorted.map(c => c.dataset.streamId).join(',');
    if (current === next) return;
    sorted.forEach(c => grid.appendChild(c));
    runtime.lastReorderAt = Date.now();
}

export function setAutoSort(enabled, pollFn) {
    runtime.autoSort = !!enabled;
    saveAutoSortSetting(runtime.autoSort);
    const dragHint = document.getElementById('dragHint');
    if (runtime.autoSort) {
        disableDraggingOnAllCards();
        if (dragHint) dragHint.textContent = 'Auto-sort ist aktiv — Live zuerst.';
        if (!runtime.fullscreenPaused) reorderCardsByLive();
        if (!runtime.reorderTimer) {
            runtime.reorderTimer = setInterval(() => {
                pollFn().catch(() => {
                });
            }, settings.LIVE_POLL_MS);
        }
    } else {
        enableDraggingOnAllCards();
        if (dragHint) dragHint.textContent = 'Ziehe Karten zum Reorden. Reihenfolge wird gespeichert.';
        if (runtime.reorderTimer) {
            clearInterval(runtime.reorderTimer);
            runtime.reorderTimer = null;
        }
        applyManualOrderIfExists();
    }
}

export function resetOrderToOriginal() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    const cards = [...grid.querySelectorAll('.card')];
    cards.sort((a, b) => runtime.streamIndex[a.dataset.streamId] - runtime.streamIndex[b.dataset.streamId]).forEach(c => grid.appendChild(c));
    localStorage.removeItem(settings.LS_MANUAL_ORDER);
}

export {applyManualOrderIfExists, loadManualOrder};
