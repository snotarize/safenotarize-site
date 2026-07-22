const CACHE_NAME = 'safenotarize-session-v8';
const CACHE_PREFIX = 'safenotarize-session-v';
const APP_SHELL = [
  '/thank-you.html',
  '/manifest.webmanifest',
  '/safenotarize-icon-192.png',
  '/safenotarize-icon-512.png'
];
const PROTECTED_WORKFLOW_PATHS = new Set([
  '/book.html',
  '/book-ht.html',
  '/upload.html',
  '/thank-you.html',
  '/scheduled.html',
  '/pay.html'
]);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept or cache third-party services or unsupported cross-origin requests.
  if (url.origin !== self.location.origin) return;

  // Never cache Make webhook/API responses. Always get fresh session status.
  if (url.hostname.includes('hook.us2.make.com')) return;

  if (request.mode === 'navigate') {
    const isProtectedWorkflow = PROTECTED_WORKFLOW_PATHS.has(url.pathname);

    if (isProtectedWorkflow) {
      event.respondWith(
        fetch(request, {cache:'no-store'}).catch(() => caches.match('/thank-you.html'))
      );
      return;
    }

    event.respondWith(
      fetch(request, {cache:'no-store'}).then(response => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {})
          );
        }
        return response;
      }).catch(() => caches.match(request).then(cached => cached || caches.match('/thank-you.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {})
        );
      }
      return response;
    }))
  );
});
