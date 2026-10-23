// Initialer Einstiegspunkt
import {settings} from './constants.js';
import {loadExternalConfig} from './config.js';
import {runtime} from './state.js';
import {createGrid} from './dom.js';
import {pollLiveStatuses} from './livePolling.js';
import {destroyPlayerInstance, refreshServerThumbs} from './utils.js';
import {loadAutoSortSetting, reorderCardsByLive, resetOrderToOriginal, setAutoSort} from './ordering.js';
import {initializeNotifications, shouldShowNotifications} from './notifications.js';
import './debug.js';

window.debug = {settings, runtime, pollLiveStatuses};

async function init() {
    await loadExternalConfig();
    settings.streams.forEach((s, i) => runtime.streamIndex[s.id] = i);
    createGrid();
    const autosortToggle = document.getElementById('autosort_toggle');
    const resetOrderBtn = document.getElementById('resetOrderBtn');
    const savedAuto = loadAutoSortSetting();
    if (autosortToggle) autosortToggle.checked = savedAuto;
    setAutoSort(savedAuto, pollLiveStatuses);
    pollLiveStatuses().catch(() => {
    });
    setInterval(() => pollLiveStatuses().catch(() => {
    }), settings.LIVE_POLL_MS);
    setInterval(() => refreshServerThumbs(), settings.THUMB_SERVER_REFRESH_MS);

    // Initialize PWA and notifications
    if (shouldShowNotifications()) {
        initializeNotifications().catch(err => {
            console.warn('Failed to initialize notifications:', err);
        });
    }

    autosortToggle?.addEventListener('change', e => setAutoSort(e.target.checked, pollLiveStatuses));
    resetOrderBtn?.addEventListener('click', ev => {
        ev.preventDefault();
        resetOrderToOriginal();
    });

    document.addEventListener('fullscreenchange', () => {
        runtime.fullscreenPaused = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (!runtime.fullscreenPaused && runtime.autoSort) {
            setTimeout(() => {
                reorderCardsByLive();
            }, 150);
        }
    });

    window.addEventListener('beforeunload', () => {
        Object.values(runtime.players).forEach(p => {
            try {
                destroyPlayerInstance(p);
            } catch (_) {
            }
        });
    });
}

init();
