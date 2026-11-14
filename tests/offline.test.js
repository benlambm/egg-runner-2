// Offline play, no network during play, and nothing an app wrapper would break.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const gameJs = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f);

test('the offline copy lists every file the game loads, and nothing missing from disk', () => {
  const sw = read('sw.js');
  const listed = [...sw.matchAll(/'\.\/([^']*)'/g)].map(m => m[1]).filter(Boolean);
  for (const f of listed) assert.ok(fs.existsSync(path.join(ROOT, f)), 'sw.js lists a missing file: ' + f);
  const html = read('index.html');
  const needed = new Set(['index.html', 'style.css', 'manifest.json', ...gameJs]);
  for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) needed.add(m[1]);
  for (const icon of JSON.parse(read('manifest.json')).icons) needed.add(icon.src);
  for (const f of needed) assert.ok(listed.includes(f), 'sw.js does not keep a copy of ' + f);
});

test('index.html loads every script, rules before drawing', () => {
  const html = read('index.html');
  const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual([...order].sort(), [...gameJs].sort());
  assert.ok(order.indexOf('js/tuning.js') < order.indexOf('js/rules.js'));
  assert.equal(order[order.length - 1], 'js/main.js');
});

test('nothing is loaded from another site', () => {
  for (const f of ['index.html', 'style.css', 'manifest.json', ...gameJs]) {
    const text = read(f).replace(/https?:\/\/www\.w3\.org\/[^\s"']*/g, '');
    assert.ok(!/https?:\/\//.test(text.replace(/\/\^https\?:\$\//, '')), f + ' mentions a web address');
    assert.ok(!/@import|url\(\s*['"]?(?!data:)/.test(text), f + ' pulls in an outside file');
  }
});

test('the game code makes no network calls', () => {
  for (const f of gameJs) {
    const text = read(f);
    for (const word of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource', 'importScripts']) {
      assert.ok(!text.includes(word), f + ' uses ' + word);
    }
  }
});

test('no asset files: the only pictures are the app icons', () => {
  const assets = [];
  (function walk(dir) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.name.startsWith('.') || f.name === 'node_modules') continue;
      const full = path.join(dir, f.name);
      if (f.isDirectory()) walk(full);
      else if (/\.(png|jpe?g|gif|webp|svg|mp3|wav|ogg|m4a|ttf|woff2?)$/i.test(f.name)) assets.push(path.relative(ROOT, full));
    }
  })(ROOT);
  assert.deepEqual(assets.sort(), ['icons/icon-192.png', 'icons/icon-512.png']);
});

test('nothing a phone-app wrapper would break', () => {
  for (const f of gameJs) {
    const text = read(f);
    for (const word of ['alert(', 'confirm(', 'prompt(', 'window.open', 'document.cookie']) {
      assert.ok(!text.includes(word), f + ' uses ' + word);
    }
  }
  const main = read('js/main.js');
  assert.ok(/serviceWorker/.test(main) && /\^https\?:/.test(main), 'the service worker is only registered on a real web address');
  const html = read('index.html');
  assert.ok(!/(src|href)="\//.test(html), 'all paths are relative');
});

test('every tuning number is commented', () => {
  const lines = read('js/tuning.js').split('\n');
  const start = lines.findIndex(l => l.includes('var TUNING = {'));
  const end = lines.findIndex((l, i) => i > start && /^\s{2}\};/.test(l));
  let block = [];
  for (let i = start + 1; i < end; i++) {
    const line = lines[i];
    if (/^\s*[A-Z_]+:/.test(line)) {
      const hasComment = line.includes('//') || (lines[i - 1] || '').trim().startsWith('//') || (lines[i + 1] || '').trim().startsWith('//');
      assert.ok(hasComment, 'no comment for: ' + line.trim());
      block.push(line);
    }
  }
  assert.ok(block.length > 50);
});
