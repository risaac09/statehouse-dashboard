/* Service worker: cache-first for the app shell, network-first for data. */
var CACHE = 'statehouse-v7';
var SHELL = ['./', 'index.html', 'app.css', 'app.js', 'manifest.json'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  // Data: network-first so the feed stays fresh, fall back to cache offline.
  if (url.pathname.indexOf('/data/') !== -1) {
    e.respondWith(
      fetch(e.request).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return caches.match(e.request); })
    );
    return;
  }
  // Shell: cache-first.
  e.respondWith(caches.match(e.request).then(function (hit) { return hit || fetch(e.request); }));
});
