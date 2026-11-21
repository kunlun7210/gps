const cachePrefix = 'field-compass:' + self.registration.scope + ':';
const cacheName = cachePrefix + 'v10';
const root = new URL('./', self.registration.scope).href;
const entry = new URL('index.html', root).href;
const assets = [
  'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'icon-180.png', 'icon-192.png', 'icon-512.png',
].map(path => new URL(path, root).href);
const cachedPaths = new Set(assets);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => {
    return cache.addAll(assets.map(url => new Request(url, { cache: 'reload' })));
  }));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(cachePrefix) && key !== cacheName)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;

  const path = url.origin + url.pathname;
  const isHome = request.mode === 'navigate' && (path === root || path === entry);
  if (!isHome && !cachedPaths.has(request.url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    return await cache.match(isHome ? entry : request) || fetch(request);
  })());
});
