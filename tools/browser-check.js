/*
 * Developer tool: play the real game in a headless browser and check the
 * things the rule checks cannot see (controls, pause, saving, offline,
 * resizing). Needs Playwright with Chromium. The game itself needs neither.
 *
 *   node tools/browser-check.js            run the checks
 *   node tools/browser-check.js shots DIR  also save screenshots into DIR
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const shotsDir = process.argv[2] === 'shots' ? process.argv[3] : null;

function serve() {
  const server = http.createServer((req, res) => {
    let file = decodeURIComponent(req.url.split('?')[0]);
    if (file.endsWith('/')) file += 'index.html';
    const full = path.join(ROOT, file);
    if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

let failed = 0;
function check(name, ok, detail) {
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok || !detail ? '' : '  → ' + detail));
  if (!ok) failed++;
}
const mode = page => page.evaluate(() => ER.debug.mode());
const state = page => page.evaluate(() => {
  const S = ER.debug.run().S;
  return { lane: S.player.lane, grounded: S.player.grounded, jumps: S.player.jumps, dist: S.dist, over: S.over, t: S.t };
});
// Keep the egg alive while a check looks at something else.
const immortal = page => page.evaluate(() => { const r = ER.debug.run(); r.S.gen.on = false; r.S.things.length = 0; r.S.gates.length = 0; r.S.dog.visits.length = 0; });

(async () => {
  const server = await serve();
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => requests.push(r.url()));
  const shot = async name => { if (shotsDir) await page.screenshot({ path: path.join(shotsDir, name + '.png') }); };

  console.log('Start screen');
  await page.goto(url);
  await page.waitForFunction(() => window.ER && ER.debug);
  check('opens on the start screen', await mode(page) === 'menu');
  check('Play and Start Over buttons are showing', await page.isVisible('#playBtn') && await page.isVisible('#menu [data-start-over]'));
  check('egg starts plain', await page.textContent('#menuWearing') === 'Plain Egg');
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
  await page.keyboard.press('ArrowUp');
  check('Up arrow jumps', (await state(page)).grounded === false);
  await page.waitForTimeout(700);
  check('and lands again', (await state(page)).grounded === true);

  console.log('Touch');
  const cdp = await context.newCDPSession(page);
  const swipe = async (dx, dy) => {
    const x = 195, y = 500;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 4, y: y + dy * i / 4 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(40);
  };
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
  await shot('2-running');

  console.log('Pause');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  check('switching away pauses', await mode(page) === 'paused');
  const frozen = (await state(page)).dist;
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(300);
  check('coming back stays paused until you choose', await mode(page) === 'paused' && (await state(page)).dist === frozen);
  await shot('3-paused');
  await page.tap('#resumeBtn');
  await page.waitForTimeout(200);
  check('Keep Running carries on', await mode(page) === 'playing' && (await state(page)).dist > frozen);
  await page.tap('#pauseBtn');
  check('the pause button pauses', await mode(page) === 'paused');
  await page.keyboard.press('Escape');
  check('Escape resumes', await mode(page) === 'playing');

  console.log('No network while playing');
  requests.length = 0;
  await page.waitForTimeout(1500);
  check('no requests during play', requests.length === 0, requests.join(', '));

  console.log('Resizing');
  for (const [w, h] of [[844, 390], [1440, 810], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(120);
    const L = await page.evaluate(() => { const l = ER.debug.renderer.layout(); const c = document.getElementById('game'); return { w: l.w, h: l.h, cw: c.clientWidth, ch: c.clientHeight }; });
    check('fills ' + w + ' x ' + h, L.w === w && L.h === h && L.cw === w && L.ch === h, JSON.stringify(L));
    check('  still playing after the resize', await mode(page) === 'playing');
  }

  console.log('Ending and results');
  await page.evaluate(() => { const r = ER.debug.run(); r.S.spares = 0; r.S.player.blinkUntil = 0; r.place.obstacle('toaster', r.S.player.lane, r.S.dist + 120); });
  await page.waitForFunction(() => ER.debug.mode() === 'ending', null, { timeout: 5000 });
  await page.waitForTimeout(900);
  await shot('4-ending-zoom');
  await page.waitForFunction(() => ER.debug.mode() === 'results', null, { timeout: 5000 });
  check('results appear after the zoom', await page.isVisible('#results'));
  const unlocked = await page.textContent('#resUnlockName');
  check('a new costume was unlocked: ' + unlocked, await page.textContent('#resUnlockLabel') === 'New costume!' && unlocked !== 'Plain Egg');
  check('and is being worn', await page.evaluate(() => ER.debug.progress.get().wearing !== 'plain'));
  check('results show distance, best, eggs and score',
    /ft$/.test(await page.textContent('#resDist')) && /ft$/.test(await page.textContent('#resBest')) &&
    /^\d+$/.test(await page.textContent('#resEggs')) && /^\d+$/.test(await page.textContent('#resScore')));
  check('Play Again and Start Over buttons are showing', await page.isVisible('#againBtn') && await page.isVisible('#results [data-start-over]'));
  await shot('5-results');

  console.log('Costumes and saving');
  await page.tap('#resStrip .tile[aria-pressed="false"]');
  check('can go back to plain', await page.evaluate(() => ER.debug.progress.get().wearing === 'plain'));
  await page.tap('#resStrip .tile:nth-child(2)');
  const worn = await page.evaluate(() => ER.debug.progress.get().wearing);
  check('can put the costume back on', worn !== 'plain');
  const best = await page.evaluate(() => ER.debug.progress.get().best);
  await page.reload();
  await page.waitForFunction(() => window.ER && ER.debug);
  check('costume and best distance are remembered after a reload',
    await page.evaluate(([w, b]) => { const d = ER.debug.progress.get(); return d.wearing === w && d.best === b && d.unlocked.length === 1; }, [worn, best]));
  check('start screen shows the best distance', await page.isVisible('#menuBest'));

  console.log('Start Over');
  await page.tap('#menu [data-start-over]');
  check('asks "Are you sure?"', await page.isVisible('#confirm') && (await page.textContent('#confirmTitle')) === 'Are you sure?');
  await shot('6-are-you-sure');
  await page.tap('#confirmNo');
  check('"No" keeps everything', !(await page.isVisible('#confirm')) && await page.evaluate(() => ER.debug.progress.get().unlocked.length === 1));
  await page.tap('#menu [data-start-over]');
  await page.tap('#confirmYes');
  check('"Yes" erases costumes, costume worn and best distance',
    await page.evaluate(() => { const d = ER.debug.progress.get(); return d.unlocked.length === 0 && d.wearing === 'plain' && d.best === 0; }));
  check('the egg is plain again', await page.textContent('#menuWearing') === 'Plain Egg' && !(await page.isVisible('#menuBest')));
  await page.reload();
  await page.waitForFunction(() => window.ER && ER.debug);
  check('still erased after a reload', await page.evaluate(() => ER.debug.progress.get().unlocked.length === 0));

  console.log('Offline');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 8000 }).catch(() => {});
  await context.setOffline(true);
  server.close();
  await page.reload();
  const loaded = await page.waitForFunction(() => window.ER && ER.debug && ER.debug.mode() === 'menu', null, { timeout: 8000 }).then(() => true, () => false);
  check('loads with no connection', loaded);
  if (loaded) {
    await page.tap('#playBtn');
    await page.waitForTimeout(600);
    check('and plays', await mode(page) === 'playing' && (await state(page)).dist > 50);
  }

  console.log('Speed of drawing');
  if (loaded) {
    const ms = await page.evaluate(() => {
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
