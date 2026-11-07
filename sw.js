const CACHE_NAME = 'safenotarize-session-v9';
const CACHE_PREFIX = 'safenotarize-session-v';
const APP_SHELL = [
  '/thank-you.html',
  '/manifest.webmanifest',
  '/safenotarize-icon-192.png',
  '/safenotarize-icon-512.png'
];
const PROTECTED_WORKFLOW_PATHS = new Set([
  '/book.html',
  '/upload-ht.html',
  '/thank-you-ht.html',
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

  // Handoff configuration and client code must be fresh, including for installed apps.
  if (url.pathname === '/assets/document-handoff.js' || url.pathname === '/assets/document-handoff-config.js') {
    event.respondWith(fetch(request, {cache:'no-store'}));
    return;
  }

  // Never cache Make webhook/API responses. Always get fresh session status.
  if (url.hostname.includes('hook.us2.make.com')) return;

  if (request.mode === 'navigate') {
    const isProtectedWorkflow = PROTECTED_WORKFLOW_PATHS.has(url.pathname) || url.pathname.startsWith('/documents/');

    if (isProtectedWorkflow) {
      event.respondWith(
        fetch(request, {cache:'no-store'}).catch(() => new Response(
          '<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connection needed | SafeNotarize</title><body style="font:18px Arial;padding:28px;color:#00274d"><h1>A connection is needed</h1><p>Reconnect to the internet, then refresh this page to continue. We cannot send documents or check your session while you are offline.</p><button style="padding:14px" onclick="location.reload()">Try again</button></body></html>',
          {status:503,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}}
        ))
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
