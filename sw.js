// sw.js
// Service Worker for offline availability and update checking.

const CACHE_NAME = 'kinder-deutsch-lern-app-v1.0.3';
const ASSETS_TO_CACHE = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'content/vocabulary.json',
  'assets/wasm/core.wasm',
  'manifest.json',
  // Include Outfit Google Fonts locally if cached, or external CDN URLs
  'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap',
  'https://fonts.gstatic.com/s/outfit/v11/QId1tHdjS0o1dr2dBbW4.woff2'
];

// Install Service Worker and cache all vital assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching all files');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => {
      // Force the waiting service worker to become the active service worker
      return self.skipWaiting();
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
