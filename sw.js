// sw.js
// Service Worker for offline availability and update checking.

const CACHE_NAME = 'kinder-deutsch-lern-app-v1.0.11';
const ASSETS_TO_CACHE = [
  './',
  'index.html',
  'style.css',
  'js/app.js',
  'js/state.js',
  'js/wasm.js',
  'js/audio.js',
  'js/confetti.js',
  'js/translations.js',
  'js/ui.js',
  'js/creator.js',
  'js/games.js',
  'content/vocabulary.json',
  'assets/wasm/core.wasm',
  'manifest.json'
];

// Install Service Worker and cache all vital assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching all files');
      const requests = ASSETS_TO_CACHE.map(url => {
        // Bypass HTTP cache for local resources to ensure we cache the fresh files
        if (url.startsWith('./') || !url.startsWith('http')) {
          return new Request(url, { cache: 'reload' });
        }
        return new Request(url);
      });
      return cache.addAll(requests);
    })
  );
});

// Clean up old caches on activation
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      // Force control of open pages
      return self.clients.claim();
    })
  );
});

// Fetch handler: cache-first approach for absolute offline speed
self.addEventListener('fetch', (event) => {
  // Bypass non-HTTP/HTTPS requests (like chrome-extension://, browser extension assets)
  if (!event.request.url.startsWith('http')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // Fallback to network
      return fetch(event.request).then((networkResponse) => {
        // Cache dynamic fetches of the same origin
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // If both fail and request is for page, return offline page index
        if (event.request.mode === 'navigate') {
          return caches.match('index.html');
        }
      });
    })
  );
});

// Listen for messages from client (e.g. skipWaiting)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
