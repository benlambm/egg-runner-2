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
const VERSION = 'egg-runner-2-kitchen-1';
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
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Serve the saved copy first; only go to the network for something missing.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(hit => hit || fetch(event.request))
  );
});
