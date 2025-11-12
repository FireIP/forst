// Service Worker for Forst PWA
// Handles caching, background sync, and push notifications

const CACHE_VERSION = 'forst-v1';
const CACHE_URLS = [
  '/',
  '/index.html',
  '/assets/css/main.css',
  '/assets/js/bootstrap.js',
  '/assets/js/config.js',
  '/assets/js/constants.js',
  '/assets/js/debug.js',
  '/assets/js/dom.js',
  '/assets/js/drag.js',
  '/assets/js/livePolling.js',
  '/assets/js/ordering.js',
  '/assets/js/player.js',
  '/assets/js/state.js',
  '/assets/js/utils.js',
  '/assets/js/notifications.js'
];

// Install event - cache essential assets
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(CACHE_URLS);
      })
      .catch(err => {
        console.warn('[SW] Cache installation failed:', err);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(cacheName => cacheName !== CACHE_VERSION)
            .map(cacheName => {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Don't cache API calls or stream manifest checks
  if (url.pathname.includes('/app/') || url.pathname.includes('.m3u8')) {
    return event.respondWith(fetch(event.request));
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request)
          .then(response => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            // Clone the response to cache it
            const responseToCache = response.clone();
            caches.open(CACHE_VERSION)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            return response;
          });
      })
      .catch(() => {
        // Return offline page or message if available
        return new Response('Offline', {
          headers: { 'Content-Type': 'text/plain' }
        });
      })
  );
});

// Background sync for stream status polling
self.addEventListener('sync', event => {
  console.log('[SW] Background sync event:', event.tag);
  if (event.tag === 'poll-streams') {
    event.waitUntil(pollStreamsAndNotify());
  }
});

// Periodic background sync (when supported)
self.addEventListener('periodicsync', event => {
  console.log('[SW] Periodic sync event:', event.tag);
  if (event.tag === 'poll-streams-periodic') {
    event.waitUntil(pollStreamsAndNotify());
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification click:', event.notification.tag);
  event.notification.close();
  
  // Focus or open the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // If a window is already open, focus it
        for (let client of clientList) {
          if (client.url.includes(self.registration.scope) && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise, open a new window
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

// Message handler from main app
self.addEventListener('message', event => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data.type === 'POLL_STREAMS') {
    event.waitUntil(pollStreamsAndNotify());
  } else if (event.data.type === 'UPDATE_CONFIG') {
    // Store config for background polling
    const config = event.data.config;
    self.streamsConfig = config;
  }
});

// Function to poll stream statuses and send notifications
async function pollStreamsAndNotify() {
  try {
    console.log('[SW] Polling stream statuses...');
    
    // Get config from IndexedDB or use default
    const config = await getStoredConfig();
    if (!config || !config.streams) {
      console.log('[SW] No config available for polling');
      return;
    }
    
    // Get previous states from IndexedDB
    const previousStates = await getStreamStates() || {};
    const currentStates = {};
    
    // Poll each stream
    const pollPromises = config.streams.map(async stream => {
      const isLive = await checkStreamLive(stream.mediaPath);
      currentStates[stream.id] = isLive;
      
      // If state changed from offline to online, send notification
      const wasLive = previousStates[stream.id] || false;
      if (isLive && !wasLive) {
        await sendNotification(stream);
      }
    });
    
    await Promise.all(pollPromises);
    
    // Store current states for next poll
    await storeStreamStates(currentStates);
    
    console.log('[SW] Polling complete');
  } catch (error) {
    console.error('[SW] Error polling streams:', error);
  }
}

// Check if a stream is live
async function checkStreamLive(mediaPath) {
  try {
    const manifestUrl = `${mediaPath}/playlist.m3u8`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);
    
    const response = await fetch(manifestUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) return false;
    const text = await response.text();
    return text && text.includes('#EXTM3U');
  } catch (error) {
    console.warn('[SW] Stream check failed:', mediaPath, error);
    return false;
  }
}

// Send notification for live stream
async function sendNotification(stream) {
  try {
    const title = `${stream.label} is now live!`;
    const options = {
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
    };
    
    await self.registration.showNotification(title, options);
    console.log('[SW] Notification sent for stream:', stream.id);
  } catch (error) {
    console.error('[SW] Failed to send notification:', error);
  }
}

// IndexedDB helpers for persistent storage
async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ForstDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
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

async function getStoredConfig() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['config'], 'readonly');
      const store = transaction.objectStore('config');
      const request = store.get('current');
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  } catch (error) {
    console.error('[SW] Failed to get config:', error);
    return null;
  }
}

async function getStreamStates() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['streamStates'], 'readonly');
      const store = transaction.objectStore('streamStates');
      const request = store.get('current');
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  } catch (error) {
    console.error('[SW] Failed to get stream states:', error);
    return null;
  }
}

async function storeStreamStates(states) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['streamStates'], 'readwrite');
      const store = transaction.objectStore('streamStates');
      const request = store.put(states, 'current');
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error('[SW] Failed to store stream states:', error);
  }
}

async function storeConfig(config) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['config'], 'readwrite');
      const store = transaction.objectStore('config');
      const request = store.put(config, 'current');
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error('[SW] Failed to store config:', error);
  }
}

// Export for message handling
self.storeConfig = storeConfig;
