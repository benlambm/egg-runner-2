/*
 * Developer tool: play the real game in a headless browser and check the
 * things the rule checks cannot see (controls, pause, sound, saving, menus
 * at every screen size, offline, resizing). Needs Playwright with Chromium.
 * The game itself needs neither.
 *
 *   node tools/browser-check.js            run the checks (a little over a minute)
 *   node tools/browser-check.js shots DIR  also save screenshots into DIR
 *
 * The game is served the way the live site serves it: from a sub-folder,
 * and with the usual "keep this for ten minutes" note on every file.
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const FOLDER = '/egg-runner-2/';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const shotsDir = process.argv[2] === 'shots' ? process.argv[3] : null;
// Every menu is checked at each of these. Only the first two (the smallest)
// are allowed to scroll.
const SIZES = [[280, 480], [320, 568], [360, 640], [390, 844], [844, 390], [568, 320], [1000, 300], [820, 1180], [1440, 810], [2560, 1080]];
const SAVE_KEY = 'egg-runner-2.save.v1';

function serve(root) {
  const server = http.createServer((req, res) => {
    let file = decodeURIComponent(req.url.split('?')[0]);
    if (!file.startsWith(FOLDER)) { res.writeHead(404); res.end(); return; }
    file = file.slice(FOLDER.length - 1);
    if (file.endsWith('/')) file += 'index.html';
    const full = path.join(root, file);
    if (!full.startsWith(root) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
    fs.createReadStream(full).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}
const address = server => 'http://127.0.0.1:' + server.address().port + FOLDER;

let failed = 0;
function check(name, ok, detail) {
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok || !detail ? '' : '  → ' + detail));
  if (!ok) failed++;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const ready = page => page.waitForFunction(() => window.ER && ER.debug);
const mode = page => page.evaluate(() => ER.debug.mode());
const waitMode = (page, m) => page.waitForFunction(want => ER.debug.mode() === want, m, { timeout: 8000 });
const state = page => page.evaluate(() => {
  const S = ER.debug.run().S;
  return { lane: S.player.lane, grounded: S.player.grounded, jumps: S.player.jumps, dist: S.dist, over: S.over, t: S.t };
});
// Keep the egg alive while a check looks at something else.
const immortal = page => page.evaluate(() => { const r = ER.debug.run(); r.S.gen.on = false; r.S.things.length = 0; r.S.gates.length = 0; r.S.dog.visits.length = 0; });
// End the run at once: clear the track and put a toaster in front of the egg.
const crack = async page => {
  await page.evaluate(() => {
    const r = ER.debug.run(); r.S.gen.on = false; r.S.things.length = 0; r.S.gates.length = 0; r.S.dog.visits.length = 0;
    r.S.spares = 0; r.S.player.blinkUntil = 0; r.place.obstacle('toaster', r.S.player.lane, r.S.dist + 60);
  });
  await waitMode(page, 'ending');
};
const hide = (page, hidden) => page.evaluate(h => { Object.defineProperty(document, 'hidden', { value: h, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);
const focused = page => page.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.getAttribute('data-costume') || a.className || a.tagName) : ''; });

// Runs inside the page before the game does. It lets the checks see what the
// game asks of the browser's sound system and timers, and changes nothing.
function listenIn() {
  const seen = window.__seen = { contexts: [], notes: [], timers: new Set() };
  const Real = window.AudioContext;
  if (Real) window.AudioContext = class extends Real {
    constructor() { super(); seen.contexts.push(this); }
    follow(source) {                       // a note: when it starts, and what it is wired to
      const note = { at: null, out: null }; seen.notes.push(note);
      const start = source.start.bind(source), connect = source.connect.bind(source);
      source.start = (t, ...rest) => { note.at = t === undefined ? this.currentTime : t; return start(t, ...rest); };
      source.connect = (to, ...rest) => { note.out = to; return connect(to, ...rest); };
      return source;
    }
    createOscillator() { return this.follow(super.createOscillator()); }
    createBufferSource() { return this.follow(super.createBufferSource()); }
    createGain() { const g = super.createGain(), cut = g.disconnect.bind(g); g.disconnect = (...a) => { g.unplugged = true; return cut(...a); }; return g; }
  };
  const set = window.setInterval, clear = window.clearInterval;
  window.setInterval = (...a) => { const id = set(...a); seen.timers.add(id); return id; };
  window.clearInterval = id => { seen.timers.delete(id); return clear(id); };
}
// contexts: sound systems made.  state: awake ("running") or asleep.
// timers: repeating timers alive.  made: notes and effects so far.
// toCome: notes lined up for later that are still wired to the speakers.
const sound = page => page.evaluate(() => {
  const s = window.__seen, ac = s.contexts[0];
  return {
    contexts: s.contexts.length, state: ac ? ac.state : 'none', timers: s.timers.size, playing: ER.audio.musicPlaying(), made: s.notes.length,
    toCome: ac ? s.notes.filter(n => n.at > ac.currentTime + 0.005 && !(n.out && n.out.unplugged)).length : 0
  };
});

// Runs inside the page: looks at one menu and lists anything cut off,
// overlapping, spilling out of its box or out of reach.
function lookAt(id, mayScroll) {
  const card = document.querySelector('#' + id + ' .card'), bad = [];
  const name = e => (e.id ? '#' + e.id : e.tagName.toLowerCase()) + ' "' + e.textContent.trim().replace(/\s+/g, ' ').slice(0, 18) + '"';
  const shown = sel => [...card.querySelectorAll(sel)].filter(e => e.getClientRects().length);
  const box = card.getBoundingClientRect();
  const shrunk = box.width / card.offsetWidth || 1;          // the game draws a card smaller when it is too tall
  if (box.left < 0 || box.top < 0 || box.right > innerWidth + 0.5 || box.bottom > innerHeight + 0.5) bad.push('the card runs off the screen');
  const over = card.scrollHeight - card.clientHeight;
  if (over > 1 && !mayScroll) bad.push('the card has to be scrolled (by ' + over + 'px)');
  if (card.scrollTop > 0) bad.push('it opens scrolled down, with its top cut off');
  if (card.scrollWidth - card.clientWidth > 1) bad.push('the card slides sideways');
  if (shrunk < 0.79) bad.push('drawn too small to read (' + shrunk.toFixed(2) + ')');
  const left = box.left + card.clientLeft * shrunk, right = left + card.clientWidth * shrunk;
  for (const e of shown('button, h1, h2, p, li, .label, .value, .stat, .unlock, canvas')) {
    const r = e.getBoundingClientRect();
    // The costume strip slides sideways on purpose, and the "New best!" badge pokes out of its box on purpose.
    if (!e.closest('.strip') && (r.left < left - 1 || r.right > right + 1)) bad.push(name(e) + ' sticks out of the card');
    if (e.tagName !== 'CANVAS' && !e.querySelector('.badge:not([hidden])') && e.scrollWidth > e.clientWidth + 1) bad.push('words spill out of ' + name(e));
  }
  const badge = shown('.badge')[0];
  if (badge) { const r = badge.getBoundingClientRect(); if (r.left < box.left || r.right > box.right || r.top < box.top) bad.push('the "New best!" badge leaves the card'); }
  const blocks = shown('h1, h2, .tagline, .wearing, .best, .hint, .egg-pic, .btn, .stat, .unlock, .strip, .howto li');
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
    const a = blocks[i], b = blocks[j];
    if (a.contains(b) || b.contains(a)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    if (Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left) > 2 && Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top) > 2) bad.push(name(a) + ' overlaps ' + name(b));
  }
  // The costume the egg is wearing is in view without sliding the strip.
  const strip = shown('.strip')[0], worn = strip && strip.querySelector('[aria-pressed="true"]');
  if (worn) { const r = worn.getBoundingClientRect(), s = strip.getBoundingClientRect(); if (r.left < s.left - 1 || r.right > s.right + 1) bad.push('the costume being worn is out of view in the strip'); }
  // Every button can be brought into view and pressed.
  const slid = strip ? strip.scrollLeft : 0;
  for (const b of shown('button')) {
    b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = b.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit || !b.contains(hit)) bad.push('cannot reach ' + name(b));
    if (r.height < 30 || r.width < 44) bad.push(name(b) + ' is too small to tap (' + Math.round(r.width) + ' x ' + Math.round(r.height) + ')');
    // The small buttons (Sound, Music, Home, Start Over, End Run) each hold one short line.
    if (b.classList.contains('small') && !b.closest('.narrow') && r.height / shrunk > 56) bad.push('the words on ' + name(b) + ' break onto two lines');
  }
  card.scrollTop = 0;
  if (strip) strip.scrollLeft = slid;
  return bad;
}

(async () => {
  const server = await serve(ROOT);
  const url = address(server);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await context.addInitScript(listenIn);
  const errors = [], requests = [];
  const watch = p => {
    p.on('pageerror', e => errors.push(String(e)));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    return p;
  };
  const page = watch(await context.newPage());
  page.on('request', r => requests.push(r.url()));
  const shot = async name => { if (shotsDir) await page.screenshot({ path: path.join(shotsDir, name + '.png') }); };
  const fills = async (w, h) => {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(120);
    const L = await page.evaluate(() => { const l = ER.debug.renderer.layout(); const c = document.getElementById('game'); return { w: l.w, h: l.h, cw: c.clientWidth, ch: c.clientHeight }; });
    return L.w === w && L.h === h && L.cw === w && L.ch === h;
  };
  const reload = async () => { await page.reload(); await ready(page); };

  console.log('Start screen');
  await page.goto(url);
  await ready(page);
  check('opens on the start screen', await mode(page) === 'menu');
  check('Play and Start Over buttons are showing', await page.isVisible('#playBtn') && await page.isVisible('#menu [data-start-over]'));
  check('egg starts plain', await page.textContent('#menuWearing') === 'Plain Egg');
  await page.mouse.move(120, 300);
  check('no sound system is started before the first tap or key', (await sound(page)).contexts === 0);
  await shot('1-start');

  console.log('Keyboard');
  await page.keyboard.press('Enter');
  check('Enter starts a run', await mode(page) === 'playing');
  await immortal(page);
  await page.keyboard.press('ArrowLeft');
  check('Left arrow steps left', (await state(page)).lane === -1);
  await page.keyboard.press('ArrowLeft');
  check('cannot step past the left lane', (await state(page)).lane === -1);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  check('Right arrow steps right, twice', (await state(page)).lane === 1);
  await page.keyboard.down('ArrowLeft'); await page.keyboard.down('ArrowLeft'); await page.keyboard.down('ArrowLeft'); await page.keyboard.up('ArrowLeft');
  check('a key held down counts once', (await state(page)).lane === 0);
  await page.keyboard.press('Control+d'); await page.keyboard.press('Alt+ArrowLeft'); await page.keyboard.press('Meta+a'); await page.keyboard.press('Control+p');
  check('Ctrl, Alt and Command combinations are left to the browser', (await state(page)).lane === 0 && await mode(page) === 'playing', JSON.stringify(await state(page)));
  await page.keyboard.press('a'); await page.keyboard.press('d'); await page.keyboard.press('d');
  check('A and D step too', (await state(page)).lane === 1);
  await page.keyboard.press('ArrowUp');
  check('Up arrow jumps', (await state(page)).grounded === false);
  await page.waitForTimeout(700);
  check('and lands again', (await state(page)).grounded === true);
  await page.keyboard.press('Tab');
  const jumpsBefore = (await state(page)).jumps;
  await page.keyboard.press(' ');
  check('Space jumps, even with the pause button picked out by Tab', (await state(page)).jumps === jumpsBefore + 1 && await mode(page) === 'playing');
  await page.waitForTimeout(700);

  console.log('Touch');
  const cdp = await context.newCDPSession(page);
  // points: [x, y, finger]. A "touchEnd" names the fingers that lift; with none named, they all do.
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ x: p[0], y: p[1], id: p[2] || 0 })) });
  const swipe = async (dx, dy, x = 195, y = 500) => {
    await touch('touchStart', [[x, y]]);
    for (let i = 1; i <= 4; i++) await touch('touchMove', [[x + dx * i / 4, y + dy * i / 4]]);
    await touch('touchEnd', []);
    await page.waitForTimeout(40);
  };
  const toLane = lane => page.evaluate(l => { ER.debug.run().S.player.lane = l; }, lane);
  await swipe(-60, 0);
  check('swipe left steps left', (await state(page)).lane === 0);
  await swipe(-60, 0);
  check('swipe left again', (await state(page)).lane === -1);
  await swipe(70, 5);
  check('swipe right steps right', (await state(page)).lane === 0);
  const before = (await state(page)).jumps;
  await swipe(4, -70);
  check('swipe up jumps', (await state(page)).jumps === before + 1);
  await page.waitForTimeout(700);
  await swipe(0, 70);
  check('swipe down does nothing', (await state(page)).lane === 0 && (await state(page)).grounded === true);
  await swipe(300, 0, 40);
  check('one long swipe is one move', (await state(page)).lane === 1);
  await swipe(-70, 0, 30);
  check('a swipe that runs off the edge of the screen still counts', (await state(page)).lane === 0);
  await swipe(10, 0);
  check('a tiny slip of the finger is not a swipe', (await state(page)).lane === 0);
  const scores = await page.evaluate(() => { const r = document.querySelector('.hud-panel').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await swipe(70, 0, scores[0], scores[1]);
  check('a swipe that starts on the scores still counts', (await state(page)).lane === 1);
  const pauseAt = await page.evaluate(() => { const r = document.getElementById('pauseBtn').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await swipe(-90, 0, pauseAt[0], pauseAt[1]);
  check('a swipe that starts on the pause button neither moves nor pauses', (await state(page)).lane === 1 && await mode(page) === 'playing');
  await toLane(0);
  await touch('touchStart', [[200, 500]]); await touch('touchMove', [[206, 500]]); await touch('touchCancel', []);
  await swipe(60, 0);
  check('after a touch the phone cancelled, the next swipe works', (await state(page)).lane === 1);
  // Two thumbs.
  await toLane(0);
  const jumps2 = (await state(page)).jumps;
  await touch('touchStart', [[100, 600, 1]]);
  await touch('touchStart', [[100, 600, 1], [300, 600, 2]]);
  await touch('touchMove', [[60, 600, 1], [300, 560, 2]]);
  await touch('touchMove', [[30, 600, 1], [300, 520, 2]]);
  await touch('touchEnd', []);
  await page.waitForTimeout(40);
  check('two thumbs swiping at once both count (left and jump)', (await state(page)).lane === -1 && (await state(page)).jumps === jumps2 + 1, JSON.stringify(await state(page)));
  await page.waitForTimeout(700);
  await toLane(0);
  await touch('touchStart', [[80, 700, 1]]);                           // a thumb resting on the glass
  await touch('touchStart', [[80, 700, 1], [300, 500, 2]]);
  await touch('touchMove', [[80, 700, 1], [240, 500, 2]]);             // the other thumb swipes left
  const afterOther = (await state(page)).lane;
  await touch('touchEnd', [[240, 500, 2]]);
  await touch('touchMove', [[140, 700, 1]]); await touch('touchMove', [[190, 700, 1]]);   // now the resting thumb swipes right
  await touch('touchEnd', []);
  await page.waitForTimeout(40);
  check('a thumb resting on the screen does not get in the way, and can still swipe later', afterOther === -1 && (await state(page)).lane === 0, afterOther + ' then ' + (await state(page)).lane);
  await page.mouse.move(200, 500); await page.mouse.down(); await page.mouse.move(140, 500, { steps: 4 }); await page.mouse.up();
  check('dragging with a mouse works like a swipe', (await state(page)).lane === -1);
  await toLane(0);
  await shot('2-running');

  console.log('Pause');
  await hide(page, true);
  check('switching away pauses', await mode(page) === 'paused');
  const frozen = (await state(page)).dist;
  await hide(page, false);
  await page.waitForTimeout(300);
  check('coming back stays paused until you choose', await mode(page) === 'paused' && (await state(page)).dist === frozen);
  await page.keyboard.press('ArrowLeft'); await swipe(-60, 0, 195, 800);
  check('steering does nothing while paused', (await state(page)).lane === 0);
  await shot('3-paused');
  await page.tap('#resumeBtn');
  await page.waitForTimeout(200);
  check('Keep Running carries on', await mode(page) === 'playing' && (await state(page)).dist > frozen);
  await page.tap('#pauseBtn');
  check('the pause button pauses', await mode(page) === 'paused');
  await page.keyboard.press('Escape');
  check('Escape resumes', await mode(page) === 'playing');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  check('clicking on another window pauses', await mode(page) === 'paused');
  await page.keyboard.press('p');
  check('P resumes', await mode(page) === 'playing');
  // A long freeze (the phone was busy) must not fling the egg down the track.
  const d0 = (await state(page)).dist;
  await page.evaluate(() => { const until = Date.now() + 1500; while (Date.now() < until) { /* busy */ } });
  await page.waitForTimeout(60);
  const jumped = (await state(page)).dist - d0;
  check('after a 1.5 second freeze the egg has moved a fraction of a second, not 1.5', jumped > 0 && jumped < 150, jumped.toFixed(0) + ' units');

  console.log('Sound');
  let s = await sound(page);
  check('one sound system, the tune playing on one timer', s.contexts === 1 && s.state === 'running' && s.playing && s.timers === 1 && s.made > 3, JSON.stringify(s));
  await page.waitForTimeout(450);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  s = await sound(page);
  check('pausing puts sound to sleep and stops the tune\'s timer', s.state === 'suspended' && !s.playing && s.timers === 0, JSON.stringify(s));
  check('no note is left lined up to play after the pause', s.toCome === 0, s.toCome + ' notes would play on top of the tune when it carries on');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  let s2 = await sound(page);
  check('Keep Running wakes it and the tune carries on', s2.state === 'running' && s2.playing && s2.timers === 1 && s2.made > s.made, JSON.stringify(s2));
  await page.keyboard.press('Escape'); await page.tap('#pauseSoundBtn'); await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  let made = (await sound(page)).made;
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(300);
  s = await sound(page);
  check('Sound: Off silences the tune and the effects', !s.playing && s.timers === 0 && s.made === made, JSON.stringify(s));
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape'); await page.tap('#pauseSoundBtn'); await page.tap('#pauseMusicBtn'); await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  made = (await sound(page)).made;
  await page.waitForTimeout(400);
  const tuneNotes = (await sound(page)).made - made;
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(100);
  s = await sound(page);
  check('Music: Off leaves only the sound effects', !s.playing && tuneNotes === 0 && s.made > made, JSON.stringify(s) + ' tune notes ' + tuneNotes);
  await page.waitForTimeout(700);
  await page.keyboard.press('Escape'); await page.tap('#pauseMusicBtn');
  check('the switches say what is on', await page.textContent('#pauseSoundBtn') === 'Sound: On' && await page.textContent('#pauseMusicBtn') === 'Music: On');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  check('Music: On brings the tune back', (await sound(page)).playing);
  await page.waitForTimeout(450);
  await page.keyboard.press('Escape');
  await page.tap('#quitBtn');
  const leftOver = (await sound(page)).toCome;
  await page.waitForTimeout(400);
  s = await sound(page);
  check('End Run goes to the start screen without unlocking anything', await mode(page) === 'menu' && await page.evaluate(() => ER.debug.progress.get().unlocked.length === 0));
  check('and the start screen is quiet: no tune, no timer, no left-over notes', !s.playing && s.timers === 0 && leftOver === 0 && s.state === 'running', JSON.stringify(s) + ' left over: ' + leftOver);
  await page.tap('#playBtn');
  await immortal(page);
  await page.waitForTimeout(400);
  s = await sound(page);
  check('Play starts a fresh run and the tune', await mode(page) === 'playing' && (await state(page)).t < 1500 && s.playing && s.timers === 1 && s.contexts === 1, JSON.stringify(s));

  console.log('No network while playing');
  requests.length = 0;
  await page.waitForTimeout(1500);
  check('no requests during play', requests.length === 0, requests.join(', '));

  console.log('Resizing');
  for (const [w, h] of [[844, 390], [1440, 810], [390, 844]]) {
    check('fills ' + w + ' x ' + h, await fills(w, h));
    check('  still playing after the resize', await mode(page) === 'playing');
  }
  await page.keyboard.press('Escape');
  check('refits while paused (phone turned on its side and back)', await fills(844, 390) && await fills(390, 844) && await mode(page) === 'paused');
  await page.keyboard.press('Escape');
  // A sharper screen at the same size: the browser sends no "resized" notice for this.
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: false });
  await page.waitForTimeout(200);
  const sharp = await page.evaluate(() => document.getElementById('game').width);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await page.waitForTimeout(200);
  const plain = await page.evaluate(() => document.getElementById('game').width);
  check('redraws sharper when moved to a sharper screen of the same size, and back', sharp === 780 && plain === 390, sharp + ' then ' + plain + ' dots across');

  console.log('Ending and results');
  await crack(page);
  s = await sound(page);
  check('the tune stops when the run ends', !s.playing && s.timers === 0, JSON.stringify(s));
  await hide(page, true);
  const asleep = (await sound(page)).state;
  await hide(page, false);
  await page.waitForTimeout(150);
  check('sound sleeps while the game is in the background and wakes on return', asleep === 'suspended' && (await sound(page)).state === 'running' && await mode(page) === 'ending');
  check('refits during the zoom', await fills(844, 390) && await fills(390, 844) && await mode(page) === 'ending');
  await page.waitForTimeout(500);
  await shot('4-ending-zoom');
  await waitMode(page, 'results');
  check('results appear after the zoom', await page.isVisible('#results'));
  const unlocked = await page.textContent('#resUnlockName');
  check('a new costume was unlocked: ' + unlocked, await page.textContent('#resUnlockLabel') === 'New costume!' && unlocked !== 'Plain Egg');
  check('and is being worn', await page.evaluate(() => ER.debug.progress.get().wearing !== 'plain'));
  check('results show distance, best, eggs and score',
    /ft$/.test(await page.textContent('#resDist')) && /ft$/.test(await page.textContent('#resBest')) &&
    /^\d+$/.test(await page.textContent('#resEggs')) && /^\d+$/.test(await page.textContent('#resScore')));
  check('Play Again and Start Over buttons are showing', await page.isVisible('#againBtn') && await page.isVisible('#results [data-start-over]'));
  check('refits behind the results', await fills(844, 390) && await fills(390, 844) && await mode(page) === 'results');
  await shot('5-results');

  console.log('Costumes and saving');
  await page.waitForTimeout(550);
  await page.tap('#resStrip .tile[aria-pressed="false"]');
  check('can go back to plain', await page.evaluate(() => ER.debug.progress.get().wearing === 'plain'));
  await page.tap('#resStrip .tile:nth-child(2)');
  const worn = await page.evaluate(() => ER.debug.progress.get().wearing);
  check('can put the costume back on', worn !== 'plain');
  const best = await page.evaluate(() => ER.debug.progress.get().best);
  await page.tap('#homeBtn');
  await page.tap('#musicBtn');
  await reload();
  check('costume and best distance are remembered after a reload',
    await page.evaluate(([w, b]) => { const d = ER.debug.progress.get(); return d.wearing === w && d.best === b && d.unlocked.length === 1; }, [worn, best]));
  check('start screen shows the best distance', await page.isVisible('#menuBest'));
  check('and so are the sound switches', await page.textContent('#musicBtn') === 'Music: Off' && await page.textContent('#soundBtn') === 'Sound: On');
  await page.tap('#musicBtn');
  // Choosing a costume with the keyboard.
  await page.focus('#menuStrip .tile[aria-pressed="false"]');
  await page.keyboard.press('Enter');
  check('Enter on a costume puts it on', await page.evaluate(() => ER.debug.progress.get().wearing === 'plain'));
  check('and the keyboard stays on that costume', await focused(page) === 'plain', 'it is on: ' + await focused(page));
  await page.keyboard.press('Enter');
  check('so a second Enter does not start a run by surprise', await mode(page) === 'menu');
  await page.evaluate(w => ER.debug.progress.wear(w), worn);
  // Two tabs of the game open at once.
  const tab2 = watch(await context.newPage());
  await tab2.goto(url);
  await ready(tab2);
  await tab2.evaluate(() => ER.debug.progress.finishRun(10));           // a run ends in the second tab
  await page.waitForTimeout(250);
  check('a costume unlocked in a second tab shows up in the first', await page.textContent('#menuCount') === '2 of 16', await page.textContent('#menuCount'));
  await page.evaluate(() => ER.debug.progress.finishRun(20));            // and then one in the first
  await tab2.waitForTimeout(250);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
  check('neither tab wipes out the other\'s costumes or best distance', stored.unlocked.length === 3 && stored.best === best, JSON.stringify(stored));
  await tab2.close();
  await page.evaluate(([key, w, b]) => localStorage.setItem(key, JSON.stringify({ unlocked: [w], wearing: w, best: b })), [SAVE_KEY, worn, best]);
  await reload();

  console.log('Start Over');
  await page.tap('#menu [data-start-over]');
  check('asks "Are you sure?"', await page.isVisible('#confirm') && (await page.textContent('#confirmTitle')) === 'Are you sure?');
  check('the keyboard starts on "No"', await focused(page) === 'confirmNo');
  await shot('6-are-you-sure');
  const visited = new Set();
  for (let i = 0; i < 7; i++) { await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab'); visited.add(await focused(page)); }
  check('Tab stays on the two answers', [...visited].sort().join() === 'confirmNo,confirmYes', [...visited].join(', '));
  await page.evaluate(() => document.getElementById('playBtn').focus());
  check('nothing behind the question can be reached', /^confirm/.test(await focused(page)), 'the keyboard got to: ' + await focused(page));
  await page.keyboard.press('Escape');
  check('Escape closes it, keeps everything, and returns to the Start Over button',
    !(await page.isVisible('#confirm')) && await page.evaluate(() => document.activeElement.hasAttribute('data-start-over') && ER.debug.progress.get().unlocked.length === 1));
  await page.tap('#menu [data-start-over]');
  await page.tap('#confirmNo');
  check('"No" keeps everything', !(await page.isVisible('#confirm')) && await page.evaluate(() => ER.debug.progress.get().unlocked.length === 1));
  await page.tap('#menu [data-start-over]');
  for (let i = 0; i < 6; i++) await page.keyboard.down('Enter');        // Enter held down on "No"
  await page.keyboard.up('Enter');
  check('Enter held down on "No" answers once (the question does not flicker open and shut)', !(await page.isVisible('#confirm')) && await mode(page) === 'menu');
  await page.tap('#menu [data-start-over]');
  await page.tap('#confirmYes');
  check('"Yes" erases costumes, costume worn and best distance',
    await page.evaluate(() => { const d = ER.debug.progress.get(); return d.unlocked.length === 0 && d.wearing === 'plain' && d.best === 0; }));
  check('the egg is plain again', await page.textContent('#menuWearing') === 'Plain Egg' && !(await page.isVisible('#menuBest')));
  await reload();
  check('still erased after a reload', await page.evaluate(() => ER.debug.progress.get().unlocked.length === 0));

  console.log('Skipping the zoom, and many runs');
  await page.keyboard.press('Enter');
  await page.keyboard.down(' ');                       // Space (jump) is still held down as the egg cracks
  await crack(page);
  for (let i = 0; i < 16; i++) { await page.keyboard.down(' '); await page.waitForTimeout(50); }
  check('a key still held down from the run does not skip the zoom', await mode(page) === 'ending');
  await page.keyboard.up(' ');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(80);
  check('a fresh press of Enter skips it', await mode(page) === 'results');
  await page.keyboard.press('Enter');
  check('the results stay up for a moment, so a second press cannot skip them', await mode(page) === 'results');
  await page.waitForTimeout(550);
  await page.keyboard.press('Enter');
  check('after that, Enter plays again', await mode(page) === 'playing');
  await crack(page);
  await page.waitForTimeout(600);
  await touch('touchStart', [[195, 430]]); await touch('touchEnd', []);      // first tap: skip the zoom
  await waitMode(page, 'results');
  // Second tap, a moment later, on the big button that has just appeared.
  const again = await page.evaluate(() => { const r = document.getElementById('againBtn').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await touch('touchStart', [again]); await touch('touchEnd', []);
  await page.waitForTimeout(80);
  check('a double tap to skip the zoom does not press the button that appears under the finger',
    await mode(page) === 'results' && await page.isVisible('#results'), 'the results were skipped: now ' + await mode(page));
  await page.waitForTimeout(550);
  await page.tap('#againBtn');
  check('Play Again starts the next run', await mode(page) === 'playing');
  let clean = true;
  for (let i = 0; i < 4; i++) {
    const fresh = await page.evaluate(() => { const S = ER.debug.run().S; return S.t < 1500 && S.eggs === 0 && S.spares === 0 && !S.over && document.getElementById('hudEggs').textContent === '0' && !document.getElementById('hud').hidden; });
    clean = clean && fresh;
    if (i === 1) { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); }
    await crack(page);
    await page.waitForTimeout(520);
    await page.keyboard.press('Enter');
    await waitMode(page, 'results');
    if (i < 3) { await page.waitForTimeout(550); await page.keyboard.press('Enter'); await waitMode(page, 'playing'); }
  }
  s = await sound(page);
  check('six runs back to back: each starts from zero', clean);
  check('every run unlocked a costume', await page.evaluate(() => ER.debug.progress.get().unlocked.length === 6), String(await page.evaluate(() => ER.debug.progress.get().unlocked.length)));
  check('still one sound system and no stray timers', s.contexts === 1 && s.timers === 0 && !s.playing, JSON.stringify(s));
  await page.waitForTimeout(550);
  await page.tap('#results [data-start-over]');
  await page.tap('#confirmYes');
  check('Start Over from the results goes back to a plain egg on the start screen',
    await mode(page) === 'menu' && await page.isVisible('#menu') && !(await page.isVisible('#results')) && await page.evaluate(() => ER.debug.progress.get().unlocked.length === 0));

  console.log('Random play');
  {
    // A few hundred random key presses, taps, swipes, turns of the phone and
    // switches away, the way a small child might treat it. After every one,
    // the screens must still make sense. The "random" choices come from a
    // fixed seed, so a failure can be played back.
    let seed = 2;
    const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = list => list[Math.floor(rnd() * list.length)];
    const KEYS = ['Enter', ' ', 'Escape', 'p', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Tab', 'Shift+Tab', 'a', 'd', 'w'];
    const BUTTONS = ['#playBtn', '#againBtn', '#homeBtn', '#pauseBtn', '#resumeBtn', '#quitBtn', '#soundBtn', '#musicBtn', '#pauseSoundBtn', '#pauseMusicBtn', '#confirmNo', '#confirmYes',
      '#menu [data-start-over]', '#results [data-start-over]', '#menuStrip button', '#resStrip button'];
    const TURNS = [[390, 844], [844, 390], [320, 568], [568, 320], [1000, 300], [1440, 810]];
    const recent = [], muddles = [];
    for (let i = 0; i < 300 && muddles.length === 0; i++) {
      const r = rnd();
      let did;
      if (r < 0.3) { const k = pick(KEYS); did = 'key ' + (k === ' ' ? 'Space' : k); await page.keyboard.press(k); }
      else if (r < 0.6) {
        const sel = pick(BUTTONS); did = 'tap ' + sel;
        const at = await page.evaluate(q => { const e = document.querySelector(q); if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, sel);
        if (at) { await touch('touchStart', [at]); await touch('touchEnd', []); } else did += ' (not showing)';
      } else if (r < 0.75) {
        const vp = page.viewportSize(), x = rnd() * vp.width, y = rnd() * vp.height, dx = (rnd() - 0.5) * 200, dy = (rnd() - 0.5) * 200; did = 'swipe';
        await touch('touchStart', [[x, y]]); await touch('touchMove', [[x + dx / 2, y + dy / 2]]); await touch('touchMove', [[x + dx, y + dy]]);
        await touch(rnd() < 0.15 ? 'touchCancel' : 'touchEnd', []);
      } else if (r < 0.8) { const size = pick(TURNS); did = 'screen ' + size.join(' x '); await page.setViewportSize({ width: size[0], height: size[1] }); }
      else if (r < 0.86) { did = 'switch away and back'; await hide(page, true); await hide(page, false); }
      else if (r < 0.9) { did = 'click another window'; await page.evaluate(() => window.dispatchEvent(new Event('blur'))); }
      else if (r < 0.95) { did = 'crack'; await page.evaluate(() => { if (ER.debug.mode() === 'playing') { const run = ER.debug.run(); run.S.spares = 0; run.S.player.blinkUntil = 0; run.place.obstacle('toaster', run.S.player.lane, run.S.dist + 40); } }); }
      else { did = 'wait'; await page.waitForTimeout(100 + rnd() * 700); }
      recent.push(did); if (recent.length > 8) recent.shift();
      await page.waitForTimeout(rnd() < 0.3 ? 60 : 5);
      const wrong = await page.evaluate(() => {
        const showing = id => !document.getElementById(id).hidden, m = ER.debug.mode(), out = [];
        const menu = { menu: 'menu', results: 'results', paused: 'pause' }[m] || null;
        for (const id of ['menu', 'results', 'pause']) if (showing(id) !== (id === menu)) out.push('the ' + id + ' screen is ' + (showing(id) ? 'showing' : 'hidden') + ' while ' + m);
        if (showing('hud') !== (m === 'playing' || m === 'ending')) out.push('the scores are ' + (showing('hud') ? 'showing' : 'hidden') + ' while ' + m);
        if (showing('confirm') && m !== 'menu' && m !== 'results') out.push('"Are you sure?" is open while ' + m);
        const timers = window.__seen.timers.size;
        if (timers > 1 || ER.audio.musicPlaying() !== (timers === 1)) out.push(timers + ' timers');
        if (ER.audio.musicPlaying() && m !== 'playing') out.push('the tune is playing while ' + m);
        const key = document.activeElement;
        if (key && key !== document.body && !key.getClientRects().length) out.push('the keyboard is on a hidden button');
        return out;
      });
      if (wrong.length) muddles.push(wrong.join('; ') + '  (after: ' + recent.join(', ') + ')');
    }
    check('300 random keys, taps, swipes and turns of the phone never leave the screens in a muddle', muddles.length === 0, muddles[0]);
    // Whatever it ended on, there is a way back to the start screen and into a run.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press('Escape');                       // closes "Are you sure?" if it is open; otherwise pauses or resumes
    if (await mode(page) === 'paused') await page.tap('#quitBtn');
    if (await mode(page) === 'playing') { await page.keyboard.press('Escape'); await page.tap('#quitBtn'); }
    if (await mode(page) === 'ending') await waitMode(page, 'results');
    if (await mode(page) === 'results') { await page.waitForTimeout(550); await page.tap('#homeBtn'); }
    if (await page.isVisible('#confirm')) await page.tap('#confirmNo');
    await page.tap('#playBtn');
    check('and afterwards a run can still be started', await mode(page) === 'playing');
    await page.keyboard.press('Escape');
    await page.tap('#quitBtn');
  }

  console.log('Every menu at every screen size');
  // The fullest menus: nearly every costume, a long best distance, the longest
  // wording on the results, and the costume with the longest name unlocked.
  const fullest = JSON.stringify({ unlocked: ['chef', 'cowboy', 'wizard', 'ninja', 'pirate', 'astronaut', 'hero', 'king', 'clown', 'robot', 'dino', 'viking', 'vampire', 'detective', 'mummy'], wearing: 'detective', best: 9999 * 120, runs: 15 });
  for (let i = 0; i < SIZES.length; i++) {
    const [w, h] = SIZES[i], mayScroll = i < 2, bad = [];
    const look = async (label, id) => { for (const b of await page.evaluate(([a, c]) => lookAt(a, c), [id, mayScroll])) bad.push(label + ': ' + b); if (shotsDir) await shot('size-' + w + 'x' + h + '-' + label.replace(/\W+/g, '-')); };
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(([key, save]) => localStorage.setItem(key, save), [SAVE_KEY, fullest]);
    await reload();
    await page.addScriptTag({ content: lookAt.toString() });
    await look('start screen', 'menu');
    await page.evaluate(() => document.querySelector('#menu [data-start-over]').click());
    await look('are you sure', 'confirm');
    await page.evaluate(() => document.getElementById('confirmNo').click());
    await page.evaluate(() => { ER.debug.startRun(5); const S = ER.debug.run().S; S.gen.on = false; S.things.length = 0; S.gates.length = 0; S.dog.visits.length = 0; S.dist = 9999 * 120; S.eggs = 999; });
    await page.waitForTimeout(80);
    for (const b of await page.evaluate(() => {
      const panel = document.querySelector('.hud-panel').getBoundingClientRect(), btn = document.getElementById('pauseBtn').getBoundingClientRect(), out = [];
      if (panel.right > btn.left - 4) out.push('the scores run into the pause button');
      if (panel.left < 0 || btn.right > innerWidth || panel.top < 0) out.push('the scores or the pause button are off the screen');
      if (panel.bottom > innerHeight * 0.3) out.push('the scores cover too much of the track');
      return out;
    })) bad.push('while running: ' + b);
    if (shotsDir) await shot('size-' + w + 'x' + h + '-running');
    await page.evaluate(() => document.getElementById('pauseBtn').click());
    await look('paused', 'pause');
    await page.evaluate(() => document.getElementById('resumeBtn').click());
    await crack(page);
    await page.evaluate(() => { ER.debug.run().S.cause = 'knife'; });
    await page.waitForTimeout(520);
    await page.keyboard.press('Enter');
    await waitMode(page, 'results');
    await look('results', 'results');
    if (await page.textContent('#resUnlockName') !== 'Bumblebee') bad.push('results: expected the longest costume name');
    check(w + ' x ' + h + (mayScroll ? ' (may scroll)' : ''), bad.length === 0, bad.join('; '));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(([key, save]) => localStorage.setItem(key, save), [SAVE_KEY, fullest]);
  await reload();
  // Is the costume the keyboard is on (or, failing that, the one being worn) fully inside the strip?
  const inStrip = () => page.evaluate(() => {
    const tile = document.querySelector('#menuStrip .tile:focus') || document.querySelector('#menuStrip [aria-pressed="true"]');
    const r = tile.getBoundingClientRect(), s = document.getElementById('menuStrip').getBoundingClientRect();
    return r.left >= s.left - 1 && r.right <= s.right + 1;
  });
  check('the start screen opens with the costume being worn in view', await inStrip());
  await page.focus('#playBtn');
  const cutOff = [];
  for (let i = 0; i < 16; i++) { await page.keyboard.press('Tab'); if (!(await inStrip())) cutOff.push(await page.evaluate(() => document.activeElement.textContent.trim())); }
  check('moving along the costumes with Tab keeps each one fully in view', cutOff.length === 0, 'cut off at the edge: ' + cutOff.join(', '));
  await page.evaluate(key => localStorage.removeItem(key), SAVE_KEY);
  await reload();

  console.log('Offline');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 8000 }).catch(() => {});
  {
    // A new version, tried on a throw-away copy of the game with its own
    // web server, so the real files are never touched.
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'egg-runner-2-check-'));
    for (const f of ['index.html', 'style.css', 'sw.js', 'manifest.json']) fs.copyFileSync(path.join(ROOT, f), path.join(copy, f));
    for (const d of ['js', 'icons']) fs.cpSync(path.join(ROOT, d), path.join(copy, d), { recursive: true });
    const server2 = await serve(copy), url2 = address(server2);
    const context2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page2 = watch(await context2.newPage());
    const copies = () => page2.evaluate(() => caches.keys());
    const until = async (test, ms = 10000) => { for (const end = Date.now() + ms; Date.now() < end; await pause(100)) if (await test()) return true; return false; };
    try {
      // Another game on the same web address already has an offline copy of its own.
      await page2.goto(url2 + 'manifest.json');
      await page2.evaluate(async () => { const c = await caches.open('egg-runner-v3'); await c.put('/egg-runner/index.html', new Response('another game')); });
      await page2.goto(url2);
      await ready(page2);
      await page2.evaluate(() => navigator.serviceWorker.ready);
      await until(() => page2.evaluate(() => navigator.serviceWorker.controller !== null));
      const first = (await copies()).filter(k => k.startsWith('egg-runner-2-'));
      check('the first visit saves one offline copy', first.length === 1, (await copies()).join(', '));
      check('and leaves another game\'s offline copy alone', await page2.evaluate(async () => !!(await caches.match('/egg-runner/index.html'))), (await copies()).join(', '));
      // Publish a new version: one file changes and VERSION is bumped.
      fs.appendFileSync(path.join(copy, 'js', 'tuning.js'), '\n// CHANGED-FOR-THE-NEW-VERSION\n');
      fs.writeFileSync(path.join(copy, 'sw.js'), fs.readFileSync(path.join(copy, 'sw.js'), 'utf8').replace(/const VERSION = ([^;]+);/, "const VERSION = $1 + '-next';"));
      await page2.reload();
      await ready(page2);
      const swapped = await until(async () => { const k = (await copies()).filter(n => n.startsWith('egg-runner-2-')); return k.length === 1 && k[0].endsWith('-next'); });
      check('a new version replaces the old copy', swapped, (await copies()).join(', '));
      const fresh = await page2.evaluate(async () => {
        const name = (await caches.keys()).find(k => k.endsWith('-next'));
        const hit = name && await (await caches.open(name)).match('js/tuning.js');
        return hit ? (await hit.text()).includes('CHANGED-FOR-THE-NEW-VERSION') : false;
      });
      check('and the new copy holds the new files, not ones the browser downloaded minutes ago', fresh);
      check('still leaving the other game alone', await page2.evaluate(async () => !!(await caches.match('/egg-runner/index.html'))));
      // The saved copy vanishes (another game clearing everything, or the phone short of space).
      await page2.reload();
      await ready(page2);
      await page2.evaluate(async () => { for (const k of await caches.keys()) if (k.startsWith('egg-runner-2-')) await caches.delete(k); });
      await page2.reload();
      await ready(page2);
      await until(() => page2.evaluate(async () => { const name = (await caches.keys()).find(k => k.startsWith('egg-runner-2-')); return !!name && (await (await caches.open(name)).keys()).length >= 11; }), 4000);
      await context2.setOffline(true);
      const healed = await page2.reload().then(() => page2.waitForFunction(() => window.ER && ER.debug && ER.debug.mode() === 'menu', null, { timeout: 5000 })).then(() => true, () => false);
      check('if the saved copy is wiped, opening the game online once saves it again', healed);
    } finally {
      await context2.close();
      server2.close();
      fs.rmSync(copy, { recursive: true, force: true });
    }
  }
  await context.setOffline(true);
  server.close();
  await page.reload();
  const loaded = await page.waitForFunction(() => window.ER && ER.debug && ER.debug.mode() === 'menu', null, { timeout: 8000 }).then(() => true, () => false);
  check('loads with no connection', loaded);
  if (loaded) {
    await page.tap('#playBtn');
    await page.waitForTimeout(600);
    check('and plays', await mode(page) === 'playing' && (await state(page)).dist > 50);
    const link = await page.goto(url + 'index.html?source=homescreen').then(() => ready(page)).then(() => true, () => false);
    check('also from a home-screen link with extra words on the address', link);
  }

  console.log('The tune');
  if (loaded) {
    // Play 40 seconds of the tune into a buffer (faster than real time) and measure it.
    const tune = await page.evaluate(async () => {
      const rate = 22050, seconds = 40, bpm = 122, len = 60 / bpm / 4;
      const off = new OfflineAudioContext(1, rate * seconds, rate);
      const band = ER.audio.createMusic(off, off.destination);
      for (let n = 0, t = 0.05; t < seconds - 0.5; n++, t += len) band.play(n, t, len);
      const data = (await off.startRendering()).getChannelData(0);
      let peak = 0, sum = 0, bad = 0;
      for (let i = 0; i < data.length; i++) { const v = data[i]; if (!isFinite(v)) bad++; peak = Math.max(peak, Math.abs(v)); sum += v * v; }
      // Loudness in 10 ms slices, then how strongly it repeats once per beat.
      const hop = Math.round(rate * 0.01), env = [];
      for (let i = 0; i + hop < data.length; i += hop) { let e = 0; for (let j = 0; j < hop; j++) e += data[i + j] * data[i + j]; env.push(Math.sqrt(e / hop)); }
      const mean = env.reduce((a, b) => a + b, 0) / env.length;
      const corr = lag => { let c = 0, d = 0; for (let i = 0; i + lag < env.length; i++) { c += (env[i] - mean) * (env[i + lag] - mean); d += (env[i] - mean) * (env[i] - mean); } return c / d; };
      const beat = Math.round(60 / bpm / 0.01);
      const quietest = Math.min(...Array.from({ length: seconds - 2 }, (_, s) => Math.max(...env.slice(s * 100 + 100, s * 100 + 200))));
      // The game plays the band at the tune's volume, through its main volume.
      const volume = ER.TUNING.MUSIC_VOLUME * ER.audio.mainVolume;
      return { peak, volume, rms: Math.sqrt(sum / data.length), bad, onBeat: corr(beat), offBeat: corr(Math.round(beat * 0.37)), quietest };
    });
    check('the tune plays (loudness ' + tune.rms.toFixed(3) + ')', tune.rms > 0.02 && tune.bad === 0, JSON.stringify(tune));
    // Sound distorts when what reaches the speakers goes past 1.00. The tune
    // must stay under half of that, so the loudest sound effect (also about
    // half) can land on its loudest moment without distorting.
    // (This used to measure the band before the game's volume was applied,
    // against 0.98. The cymbals and claps are made from random hiss, so that
    // number changes on every run, between about 0.83 and 1.00, and the check
    // failed about one run in fifteen with nothing wrong.)
    const loudest = tune.peak * tune.volume;
    check('it never distorts (loudest moment ' + loudest.toFixed(2) + ' of 1.00 at the speakers)', loudest < 0.5, JSON.stringify(tune));
    check('it has a steady beat', tune.onBeat > 0.3 && tune.onBeat > tune.offBeat + 0.2, JSON.stringify(tune));
    check('it never drops out', tune.quietest > 0.01, JSON.stringify(tune));
  }

  console.log('Speed of drawing');
  if (loaded) {
    const ms = await page.evaluate(() => {
      ER.debug.startRun(3);
      const r = ER.debug.run(); r.S.spares = 5;
      for (let i = 0; i < 6000; i++) { r.S.player.blinkUntil = r.S.t + 500; r.step(); r.drain(); }
      const t0 = performance.now();
      for (let i = 0; i < 120; i++) ER.debug.renderer.draw(r, t0 + i * 16, { costume: 'wizard', zoom: 0, sinceOver: 0, frozen: false });
      return (performance.now() - t0) / 120;
    });
    check('one frame draws in ' + ms.toFixed(2) + ' ms (a 60 fps frame has 16.7 ms)', ms < 8);
  }

  check('no errors in the browser console', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failed ? '\n' + failed + ' check(s) FAILED' : '\nAll browser checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
