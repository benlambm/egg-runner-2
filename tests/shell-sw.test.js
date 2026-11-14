// The offline copy (sw.js), run here against a stand-in for the browser's
// storage and network: what it saves, what it throws away when a new
// version arrives, and what it does when a file is missing.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const SITE = 'https://example.test/egg-runner-2/';       // the live game is in a sub-folder like this

// A stand-in browser: named stores of saved files, a network that answers
// from `online` (address → text), and the three moments a service worker
// is told about (install, activate, fetch).
function browser(source, online) {
  const stores = new Map();              // store name → Map(address → text)
  const fetched = [];                    // every request that went to the network
  const strip = url => url.split('?')[0];
  class Request {
    constructor(url, init) { this.url = new URL(url, SITE).href; this.method = (init && init.method) || 'GET'; this.cache = (init && init.cache) || 'default'; }
  }
  const response = text => ({ ok: true, status: 200, text, clone() { return response(text); } });
  const asRequest = r => (typeof r === 'string' ? new Request(r) : r);
  async function fetch(req) {
    req = asRequest(req);
    fetched.push(req);
    if (!online || !(req.url in online)) {
      if (!online) throw new TypeError('offline');
      return { ok: false, status: 404, clone() { return this; } };
    }
    return response(online[req.url]);
  }
  function store(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const files = stores.get(name);
    return {
      async addAll(list) {
        const got = await Promise.all(list.map(async item => { const r = await fetch(item); if (!r.ok) throw new TypeError('missing ' + asRequest(item).url); return [asRequest(item).url, r.text]; }));
        got.forEach(([url, text]) => files.set(url, text));        // all or nothing, like the real thing
      },
      async match(req, o) {
        const url = asRequest(req).url;
        for (const [key, text] of files) if (key === url || (o && o.ignoreSearch && strip(key) === strip(url))) return response(text);
        return undefined;
      },
      async put(req, res) { files.set(asRequest(req).url, res.text); }
    };
  }
  const caches = {
    open: async name => store(name),
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name),
    async match(req, o) { for (const name of stores.keys()) { const hit = await store(name).match(req, o); if (hit) return hit; } return undefined; }
  };
  const handlers = {};
  const self = {
    addEventListener(type, fn) { handlers[type] = fn; },
    skipWaiting() {}, clients: { claim: async () => {} },
    registration: { scope: SITE }
  };
  vm.runInNewContext(source, { self, caches, fetch, Request, URL, Promise, console, location: new URL(SITE + 'sw.js') });
  // Deliver one of the three moments and wait for everything it started.
  async function tell(type, request) {
    const waits = [];
    let answer;
    const event = { request, waitUntil: p => waits.push(p), respondWith: p => { answer = p; } };
    handlers[type](event);
    const out = answer ? await answer : undefined;
    await Promise.all(waits);
    return out;
  }
  return { stores, fetched, Request, tell, get: url => tell('fetch', new Request(url)) };
}

// The addresses sw.js says it keeps, and a web server that has them all.
const FILES = [...SOURCE.matchAll(/'(\.\/[^']*)'/g)].map(m => new URL(m[1], SITE).href);
const server = tag => Object.fromEntries(FILES.map(url => [url, tag + ' ' + url]));
const VERSION = (() => { const b = browser(SOURCE, server('x')); return b.tell('install').then(() => [...b.stores.keys()][0]); })();

test('installing saves every listed file, fresh from the web server', async () => {
  const b = browser(SOURCE, server('new'));
  await b.tell('install');
  const name = await VERSION;
  assert.equal(b.stores.size, 1);
  assert.deepEqual([...b.stores.get(name).keys()].sort(), [...FILES].sort());
  // 'reload' tells the browser not to hand over a copy it downloaded earlier.
  // Without it a new version can be saved with the old files inside.
  for (const req of b.fetched) assert.equal(req.cache, 'reload', req.url + ' may be answered from the browser\'s own short-term copy');
});

test('a new version throws away this game\'s old copies and nobody else\'s', async () => {
  const b = browser(SOURCE, server('new'));
  const name = await VERSION;
  b.stores.set('egg-runner-2-v2', new Map([[SITE + 'index.html', 'the old flat game']]));       // the older game on this address
  b.stores.set('egg-runner-2-kitchen-0', new Map([[SITE + 'index.html', 'an older build']]));
  b.stores.set('egg-runner-v3', new Map([['https://example.test/egg-runner/index.html', 'another game']]));
  b.stores.set('some-other-app', new Map([['https://example.test/other/', 'another app']]));
  await b.tell('install');
  await b.tell('activate');
  assert.deepEqual([...b.stores.keys()].sort(), ['egg-runner-v3', name, 'some-other-app'].sort());
});

test('the game is served from its own saved copy, with or without a connection', async () => {
  const b = browser(SOURCE, server('new'));
  await b.tell('install'); await b.tell('activate');
  const offline = browser(SOURCE, null);
  offline.stores.set(await VERSION, b.stores.get(await VERSION));
  for (const url of [SITE, SITE + 'index.html', SITE + 'js/main.js', SITE + '?utm_source=share', SITE + 'index.html?source=pwa']) {
    const r = await offline.get(url);
    assert.ok(r && r.ok, 'offline: ' + url);
  }
  assert.equal(offline.fetched.length, 0, 'nothing went to the network');
});

test('it never answers from another version\'s or another game\'s copy', async () => {
  const b = browser(SOURCE, server('new'));
  // An old copy that has not been cleared yet, holding the same addresses.
  b.stores.set('egg-runner-2-kitchen-0', new Map(FILES.map(url => [url, 'OLD ' + url])));
  await b.tell('install');
  const r = await b.get(SITE + 'js/main.js');
  assert.equal(r.text, 'new ' + SITE + 'js/main.js', 'a mix of old and new files');
});

test('a file missing from the saved copy is fetched, then kept for next time', async () => {
  // The saved copy can vanish (another game on the same address clearing
  // every copy it finds, or the phone short of space) and a file can be left
  // off the list. Either way: fetch it while online, and keep it.
  const online = Object.assign(server('new'), { [SITE + 'js/extra.js']: 'left off the list' });
  const b = browser(SOURCE, online);
  await b.tell('install'); await b.tell('activate');
  b.stores.get(await VERSION).clear();                   // wiped by someone else
  for (const url of [SITE, SITE + 'js/main.js', SITE + 'js/extra.js']) assert.ok((await b.get(url)).ok, url);
  const offline = browser(SOURCE, null);
  offline.stores.set(await VERSION, b.stores.get(await VERSION));
  for (const url of [SITE, SITE + 'js/main.js', SITE + 'js/extra.js']) assert.ok((await offline.get(url)).ok, 'offline next time: ' + url);
});

test('it keeps nothing that is not part of this game, and no failed answers', async () => {
  const online = Object.assign(server('new'), { 'https://example.test/egg-runner/index.html': 'another game' });
  const b = browser(SOURCE, online);
  await b.tell('install'); await b.tell('activate');
  const before = b.stores.get(await VERSION).size;
  assert.ok((await b.get('https://example.test/egg-runner/index.html')).ok, 'passed through to the network');
  assert.equal((await b.get(SITE + 'no-such-file.js')).status, 404);
  assert.equal(b.stores.get(await VERSION).size, before);
  // Anything other than a plain download is left to the browser.
  assert.equal(await b.tell('fetch', new b.Request(SITE + 'index.html', { method: 'POST' })), undefined);
});

test('the version name is this game\'s own, and is still Egg Runner 2', async () => {
  const name = await VERSION;
  assert.match(name, /^egg-runner-2-/);
});
