/* Care Clinic PWA - Service Worker */
const VERSION = 'v1.0.0';
const CACHE_STATIC = `clinic-static-${VERSION}`;
const CACHE_FONTS = `clinic-fonts-${VERSION}`;
const CACHE_API = `clinic-api-${VERSION}`;

const STATIC_PRECACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.webmanifest',
  '/manifest.json',
  '/icon.svg',
  '/favicon.ico',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
];

// Install: Pre-cache static shell assets and activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(async (cache) => {
      try {
        await cache.addAll(STATIC_PRECACHE);
      } catch (err) {
        console.warn('[SW] Failed some precache items:', err);
      }
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up previous cache versions and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (![CACHE_STATIC, CACHE_FONTS, CACHE_API].includes(key)) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch dispatcher
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Navigation requests: Network-first with cached index.html fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_STATIC).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match('/index.html');
          if (fallback) return fallback;
          return caches.match('/');
        })
    );
    return;
  }

  // 2. Google Web Fonts: Cache-First
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_FONTS).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 3. Clinic REST API calls (/api/*)
  if (url.pathname.startsWith('/api/')) {
    if (request.method === 'GET') {
      // Network-First with Cache Fallback for GET queries (patients, doctors, dashboard summary)
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_API).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(async () => {
            const cached = await caches.match(request);
            if (cached) {
              // Return cached response with header noting offline state
              const headers = new Headers(cached.headers);
              headers.set('X-Clinic-Offline-Cached', 'true');
              return new Response(cached.body, {
                status: cached.status,
                statusText: cached.statusText,
                headers,
              });
            }
            return new Response(
              JSON.stringify({
                offline: true,
                detail: 'You are currently offline. Unable to reach clinic server.',
              }),
              {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          })
      );
    } else {
      // POST / PUT / DELETE: Pass through; if network fails, return offline message
      event.respondWith(
        fetch(request).catch(() => {
          return new Response(
            JSON.stringify({
              offline: true,
              detail: 'Cannot save changes while offline. Please check your internet connection.',
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        })
      );
    }
    return;
  }

  // 4. Static assets (CSS, JS, images, icons, manifest): Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_STATIC).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => null);

      return cached || fetchPromise;
    })
  );
});

// Skip waiting message handler
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
