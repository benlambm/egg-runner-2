/*
 * Egg Runner 2 — offline play.
 *
 * On first load this keeps a copy of every file the game needs. After that
 * the game starts from the copy, with or without a connection, and makes no
 * network requests while you play.
 *
 * WHEN YOU CHANGE ANY GAME FILE: bump VERSION below. That is what tells
 * phones that already have the game to fetch the new files. If you add or
 * remove a file, update FILES too (a check in /tests compares it to disk).
 */
// Every copy this game keeps has a name starting with PREFIX. Other games
// on the same web address keep copies of their own under other names.
const PREFIX = 'egg-runner-2-';
const VERSION = PREFIX + 'kitchen-2';
const FILES = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/tuning.js',
  './js/rules.js',
  './js/view.js',
  './js/art.js',
  './js/costumes.js',
  './js/render.js',
  './js/audio.js',
  './js/progress.js',
  './js/main.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  // 'reload' means: fetch each file from the web server itself. Without it
  // the browser may hand over the files it downloaded a few minutes ago,
  // and a new version would be saved with the OLD files inside it.
  event.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(FILES.map(file => new Request(file, { cache: 'reload' }))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Throw away this game's older copies, and only this game's. (Deleting
  // everything would also wipe the offline copy of any other game hosted
  // on the same web address.)
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Serve the saved copy first; only go to the network for something missing.
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  event.respondWith(
    caches.open(VERSION).then(cache =>
      cache.match(request, { ignoreSearch: true }).then(hit => hit || fetch(request).then(response => {
        // Missing from the saved copy (the copy was cleared, or a file was
        // left off the list above). If it is one of this game's own files,
        // keep it now, so it is there the next time there is no connection.
        if (response.ok && !response.redirected && request.url.startsWith(self.registration.scope)) {
          event.waitUntil(cache.put(request, response.clone()).catch(() => { /* no room: fetch it again next time */ }));
        }
        return response;
      }))
    )
  );
});
