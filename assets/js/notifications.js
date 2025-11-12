// Notification handling and service worker integration
import {settings} from './constants.js';
import {runtime} from './state.js';

let serviceWorkerRegistration = null;

// Initialize notifications and service worker
export async function initializeNotifications() {
    // Check if service workers are supported
    if (!('serviceWorker' in navigator)) {
        console.warn('Service Workers not supported');
        return false;
    }

    try {
        // Register service worker
        serviceWorkerRegistration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/'
        });
        
        console.log('Service Worker registered:', serviceWorkerRegistration);

        // Wait for the service worker to be ready
        await navigator.serviceWorker.ready;
        console.log('Service Worker ready');

        // Request notification permission if not already granted
        if ('Notification' in window && Notification.permission === 'default') {
            // Show a UI prompt first (best practice)
            showNotificationPrompt();
        }

        // Send config to service worker
        await updateServiceWorkerConfig();

        // Register for periodic background sync if supported
        await registerPeriodicSync();

        return true;
    } catch (error) {
        console.error('Failed to initialize notifications:', error);
        return false;
    }
}

// Show a friendly prompt before requesting notification permission
function showNotificationPrompt() {
    const promptDiv = document.createElement('div');
    promptDiv.className = 'notification-prompt alert alert-info alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3';
    promptDiv.style.zIndex = '9999';
    promptDiv.style.maxWidth = '500px';
    promptDiv.innerHTML = `
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        <h6 class="alert-heading mb-2">Enable Stream Notifications?</h6>
        <p class="mb-2 small">Get notified when streams go live, even when this tab is closed.</p>
        <div class="d-flex gap-2">
            <button class="btn btn-sm btn-primary" id="enable-notifications">Enable</button>
            <button class="btn btn-sm btn-secondary" id="decline-notifications">Not now</button>
        </div>
    `;
    
    document.body.appendChild(promptDiv);

    document.getElementById('enable-notifications')?.addEventListener('click', async () => {
        await requestNotificationPermission();
        promptDiv.remove();
    });

    document.getElementById('decline-notifications')?.addEventListener('click', () => {
        promptDiv.remove();
        // Store preference to not show again for a while
        localStorage.setItem('notification_prompt_declined', Date.now().toString());
    });

    // Auto-dismiss after 15 seconds if no action
    setTimeout(() => {
        if (document.body.contains(promptDiv)) {
            promptDiv.remove();
        }
    }, 15000);
}

// Request notification permission
export async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.warn('Notifications not supported');
        return false;
    }

    try {
        const permission = await Notification.requestPermission();
        console.log('Notification permission:', permission);
        
        if (permission === 'granted') {
            // Show a test notification
            showTestNotification();
            // Register for background sync
            await registerBackgroundSync();
            return true;
        }
        return false;
    } catch (error) {
        console.error('Failed to request notification permission:', error);
        return false;
    }
}

// Show a test notification
async function showTestNotification() {
    if (!serviceWorkerRegistration) return;

    try {
        await serviceWorkerRegistration.showNotification('Forst Notifications Enabled', {
            body: 'You\'ll be notified when streams go live',
            icon: '/assets/icons/icon-192x192.png',
            badge: '/assets/icons/icon-144x144.png',
            tag: 'test-notification',
            requireInteraction: false
        });
    } catch (error) {
        console.error('Failed to show test notification:', error);
    }
}

// Register for background sync
async function registerBackgroundSync() {
    if (!serviceWorkerRegistration) return;

    // Check if Background Sync is supported
    if (!('sync' in serviceWorkerRegistration)) {
        console.warn('Background Sync not supported');
        return;
    }

    try {
        await serviceWorkerRegistration.sync.register('poll-streams');
        console.log('Background sync registered');
    } catch (error) {
        console.error('Failed to register background sync:', error);
    }
}

// Register for periodic background sync (when supported)
async function registerPeriodicSync() {
    if (!serviceWorkerRegistration) return;

    // Check if Periodic Background Sync is supported
    if (!('periodicSync' in serviceWorkerRegistration)) {
        console.log('Periodic Background Sync not supported (requires Chrome 80+ with flag or origin trial)');
        return;
    }

    try {
        const status = await navigator.permissions.query({
            name: 'periodic-background-sync'
        });
        
        if (status.state === 'granted') {
            await serviceWorkerRegistration.periodicSync.register('poll-streams-periodic', {
                minInterval: settings.LIVE_POLL_MS // Minimum interval in milliseconds
            });
            console.log('Periodic background sync registered');
        } else {
            console.log('Periodic background sync permission not granted');
        }
    } catch (error) {
        console.warn('Failed to register periodic background sync:', error);
    }
}

// Update service worker with current config
export async function updateServiceWorkerConfig() {
    if (!serviceWorkerRegistration || !serviceWorkerRegistration.active) {
        return;
    }

    try {
        // Send config via postMessage
        serviceWorkerRegistration.active.postMessage({
            type: 'UPDATE_CONFIG',
            config: {
                streams: settings.streams,
                livePollMs: settings.LIVE_POLL_MS
            }
        });

        // Also store in IndexedDB for service worker access
        await storeConfigInIndexedDB({
            streams: settings.streams,
            livePollMs: settings.LIVE_POLL_MS
        });

        console.log('Service worker config updated');
    } catch (error) {
        console.error('Failed to update service worker config:', error);
    }
}

// Store config in IndexedDB for service worker access
async function storeConfigInIndexedDB(config) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ForstDB', 1);
        
        request.onerror = () => reject(request.error);
        
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['config'], 'readwrite');
            const store = transaction.objectStore('config');
            const putRequest = store.put(config, 'current');
            
            putRequest.onsuccess = () => resolve();
            putRequest.onerror = () => reject(putRequest.error);
        };
        
        request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('config')) {
                db.createObjectStore('config');
            }
            if (!db.objectStoreNames.contains('streamStates')) {
                db.createObjectStore('streamStates');
            }
        };
    });
}

// Notify about stream state change
export async function notifyStreamLive(stream) {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
        return;
    }

    // If service worker is available, use it to show notification
    if (serviceWorkerRegistration) {
        try {
            await serviceWorkerRegistration.showNotification(
                `${stream.label} is now live!`,
                {
                    body: 'Click to watch the stream',
                    icon: '/assets/icons/icon-192x192.png',
                    badge: '/assets/icons/icon-144x144.png',
                    tag: `stream-${stream.id}`,
                    requireInteraction: false,
                    vibrate: [200, 100, 200],
                    data: {
                        streamId: stream.id,
                        url: '/'
                    }
                }
            );
        } catch (error) {
            console.error('Failed to show notification via service worker:', error);
        }
    } else {
        // Fallback to regular notification (only works when page is open)
        try {
            const notification = new Notification(`${stream.label} is now live!`, {
                body: 'Click to watch the stream',
                icon: '/assets/icons/icon-192x192.png',
                tag: `stream-${stream.id}`
            });
            
            notification.onclick = () => {
                window.focus();
                notification.close();
            };
        } catch (error) {
            console.error('Failed to show notification:', error);
        }
    }
}

// Check if notifications should be shown (based on user preference)
export function shouldShowNotifications() {
    if (!('Notification' in window)) return false;
    
    // Check if user declined recently (within 7 days)
    const declined = localStorage.getItem('notification_prompt_declined');
    if (declined) {
        const declinedTime = parseInt(declined, 10);
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - declinedTime < sevenDays) {
            return false;
        }
    }
    
    return Notification.permission === 'default' || Notification.permission === 'granted';
}

// Get notification permission status
export function getNotificationStatus() {
    if (!('Notification' in window)) {
        return 'unsupported';
    }
    return Notification.permission;
}
