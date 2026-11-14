/*
 * Developer tool: take pictures of the game in a headless browser, so
 * changes to the art can be looked at. Needs Playwright with Chromium.
 *
 *   node tools/shots.js <outDir> [scene ...]
 *
 * Scenes (default: all except perf):
 *   menu      the start screen
 *   play      early in a run (9 s)           late     far into a run (100 s)
 *   knives    chopping knives up close        dog      warning, wind-up, snap
 *   jump      mid-jump over butter, sweating  hit      the moment a spare is lost
 *   ending    the zoom on the cracked egg     results  the results screen
 *   eaten     the ending after the dog wins
 *   sprites   every picture in art.js, enlarged, on floor and track colours
 *   costumes  every costume: standing, running, worried, jumping, cracked
 *   dogsheet  the dog in each pose, enlarged
 *   perf      prints the average time to draw one busy frame
 *
 * Environment:  SIZE=phone|small|landscape|tablet|desktop|ultrawide (default phone)
 *               DPR=1|2|3 (default 1)   SEED=number (default 7)
 *               DAY=0..1 pins the far kitchen's slow loop at that point
 *               (0 morning, 0.25 afternoon, 0.5 sunset, 0.75 night), if the
 *               renderer offers setBackdropTime(); leave unset to let it run
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const SIZES = { phone: [390, 844], small: [320, 568], landscape: [844, 390], tablet: [820, 1180], desktop: [1440, 810], ultrawide: [2200, 900] };
const ALL = ['menu', 'play', 'late', 'knives', 'dog', 'jump', 'hit', 'ending', 'results', 'eaten', 'sprites', 'costumes', 'dogsheet'];

const outDir = process.argv[2];
if (!outDir) { console.error('usage: node tools/shots.js <outDir> [scene ...]'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
const scenes = process.argv.slice(3).length ? process.argv.slice(3) : ALL;
const sizeName = process.env.SIZE || 'phone';
const [W, H] = SIZES[sizeName] || SIZES.phone;
const DPR = Number(process.env.DPR || 1);
const SEED = Number(process.env.SEED || 7);

function serve() {
  const server = http.createServer((req, res) => {
    let file = decodeURIComponent(req.url.split('?')[0]);
    if (file.endsWith('/')) file += 'index.html';
    const full = path.join(ROOT, file);
    if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(full).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

(async () => {
  const server = await serve();
  const url = 'http://127.0.0.1:' + server.address().port + '/index.html';
  const browser = await chromium.launch();
  const errors = [];

  async function open() {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/sw\.js|ServiceWorker/.test(m.text())) errors.push(m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => window.ER && ER.debug);
    if (process.env.DAY !== undefined) {
      await page.evaluate(day => { const R = ER.debug.renderer; if (R.setBackdropTime) R.setBackdropTime(day); }, Number(process.env.DAY));
    }
    await page.waitForTimeout(250);
    return page;
  }
  const shot = (page, name) => page.screenshot({ path: path.join(outDir, name + '-' + sizeName + '.png') });
  // Start a run on a known course. clear=true empties the track so a scene can place its own things.
  async function start(page, clear) {
    await page.evaluate(([seed, clear]) => {
      ER.debug.startRun(seed);
      const r = ER.debug.run();
      if (clear) { r.S.gen.on = false; r.S.things.length = 0; r.S.gates.length = 0; r.S.dog.visits.length = 0; }
    }, [SEED, clear]);
  }
  // Run the rules forward to `ms` without the egg being hurt.
  const forward = (page, ms, spares) => page.evaluate(([ms, spares]) => {
    const r = ER.debug.run(); r.S.spares = 5;
    while (r.S.t < ms) { r.S.player.blinkUntil = r.S.t + 500; r.step(); r.drain(); }
    r.S.player.blinkUntil = 0; r.S.spares = spares;
  }, [ms, spares]);
  // A big canvas over the page for sheets of pictures.
  async function sheet(page, name, w, h, painter) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(([w, h]) => {
      const cv = document.createElement('canvas'); cv.id = 'sheet'; cv.width = w; cv.height = h;
      cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99;width:' + w + 'px;height:' + h + 'px';
      document.body.appendChild(cv);
    }, [w, h]);
    await page.evaluate(painter);
    await (await page.$('#sheet')).screenshot({ path: path.join(outDir, name + '.png') });
  }

  for (const scene of scenes) {
    const page = await open();
    if (scene === 'menu') {
      await shot(page, 'menu');
    } else if (scene === 'play' || scene === 'late') {
      await start(page, false);
      await forward(page, scene === 'play' ? 9000 : 100000, scene === 'play' ? 3 : 5);
      await page.waitForTimeout(250);
      await shot(page, scene);
    } else if (scene === 'knives') {
      await start(page, true);
      await page.evaluate(() => {
        const r = ER.debug.run(); r.S.spares = 2;
        r.place.knives(r.S.dist + 560, [-1, 0, 1]); r.place.knives(r.S.dist + 1700, [0]);
        r.place.eggs(1, r.S.dist + 850, 4, true);
      });
      await page.waitForTimeout(700);
      await shot(page, 'knives');
    } else if (scene === 'dog') {
      await start(page, true);
      await page.evaluate(() => { const r = ER.debug.run(); r.S.spares = 5; r.place.dog(r.S.dist + 420, -1); r.input('left'); });
      await page.waitForTimeout(750);
      await shot(page, 'dog-warning');
      await page.waitForFunction(() => ER.debug.run().S.dog.phase === 'windup', null, { timeout: 9000 });
      await page.waitForTimeout(300);
      await shot(page, 'dog-windup');
      await page.waitForFunction(() => ER.debug.run().S.dog.phase === 'snap', null, { timeout: 9000 });
      await page.waitForTimeout(60);
      await shot(page, 'dog-snap');
    } else if (scene === 'jump') {
      await start(page, true);
      await page.evaluate(() => { const r = ER.debug.run(); r.S.spares = 4; r.place.obstacle('butter', 0, r.S.dist + 330); r.place.obstacle('toaster', 1, r.S.dist + 330); r.place.eggs(0, r.S.dist + 420, 3, false); });
      await page.waitForFunction(() => { const r = ER.debug.run(); const o = r.S.things[0]; return o.d - r.S.dist < 75; }, null, { timeout: 5000 });
      await page.evaluate(() => ER.debug.run().input('jump'));
      await page.waitForTimeout(230);
      await shot(page, 'jump');
    } else if (scene === 'hit') {
      await start(page, true);
      await page.evaluate(() => { const r = ER.debug.run(); r.S.spares = 3; r.place.obstacle('toaster', 0, r.S.dist + 260); r.place.obstacle('carton', -1, r.S.dist + 700); });
      await page.waitForFunction(() => ER.debug.run().S.spares === 2, null, { timeout: 5000 });
      await page.waitForTimeout(140);
      await shot(page, 'hit');
    } else if (scene === 'ending' || scene === 'results') {
      await start(page, true);
      await page.evaluate(() => { const r = ER.debug.run(); r.place.eggs(0, r.S.dist + 80, 2, false); r.place.obstacle('carton', 0, r.S.dist + 320); });
      await page.waitForFunction(() => ER.debug.mode() === 'ending', null, { timeout: 6000 });
      await page.waitForTimeout(1200);
      if (scene === 'ending') await shot(page, 'ending');
      else { await page.waitForFunction(() => ER.debug.mode() === 'results', null, { timeout: 6000 }); await page.waitForTimeout(300); await shot(page, 'results'); }
    } else if (scene === 'eaten') {
      await start(page, true);
      await page.evaluate(() => { const r = ER.debug.run(); r.place.dog(r.S.dist + 300, 1); r.input('right'); });
      await page.waitForFunction(() => ER.debug.mode() === 'ending', null, { timeout: 12000 });
      await page.waitForTimeout(1200);
      await shot(page, 'eaten');
    } else if (scene === 'sprites') {
      await sheet(page, 'sprites', 1500, 1300, () => {
        const cv = document.getElementById('sheet'), c = cv.getContext('2d'), A = ER.art;
        c.fillStyle = '#f6e7c8'; c.fillRect(0, 0, 1500, 650); c.fillStyle = '#46b3c2'; c.fillRect(0, 650, 1500, 650);
        const names = Object.keys(A.PICS);
        for (let half = 0; half < 2; half++) {
          let x = 20, y = 0, rowH = 0;
          for (const name of names) {
            const p = A.PICS[name], k = name === 'frame' ? 0.7 : 1.8, w = (p.w + 30) * k, h = (p.h + p.d + 40) * k;
            if (x + w > 1480) { x = 20; y += rowH; rowH = 0; }
            rowH = Math.max(rowH, h);
            const sp = A.sprite(name, 3);
            c.drawImage(sp.img, x + w / 2 - sp.ox * k, half * 650 + y + h - 30 - sp.oy * k, sp.w * k, sp.h * k);
            c.fillStyle = '#2b1a10'; c.font = '700 15px system-ui'; c.textAlign = 'center';
            c.fillText(name, x + w / 2, half * 650 + y + h - 6);
            x += w;
          }
        }
      });
    } else if (scene === 'costumes') {
      await sheet(page, 'costumes', 1560, 1740, () => {
        const cv = document.getElementById('sheet'), c = cv.getContext('2d'), C = ER.costumes;
        c.fillStyle = '#f6e7c8'; c.fillRect(0, 0, 1560, 1740);
        C.LIST.forEach((cos, i) => {
          const col = i % 6, row = Math.floor(i / 6), x0 = 130 + col * 260, y0 = 330 + row * 580;
          c.fillStyle = '#46b3c2'; c.fillRect(col * 260 + 6, y0 + 30, 248, 216);
          const draw = (dx, dy, k, o) => { c.save(); c.translate(x0 + dx, y0 + dy); c.scale(k, k); C.drawEgg(c, Object.assign({ costume: cos.id, mood: 'happy', t: 300, air: 0, still: false, vy: 0, lean: 0, pace: 0.5 }, o)); c.restore(); };
          draw(0, 0, 2.6, { still: true });
          draw(-78, 220, 1.5, { t: 130 });                                   // running
          draw(0, 220, 1.5, { mood: 'worried', t: 260 });                    // worried
          draw(78, 190, 1.5, { air: 0.9, vy: 0.4 });                         // jumping
          if (i < 3) draw(0, 250, 0.01, {});                                 // (spacer)
          c.fillStyle = '#2b1a10'; c.font = '700 20px system-ui'; c.textAlign = 'center'; c.fillText(cos.name, x0, y0 - 262);
        });
        // The cracked look, on the last free cells.
        ['plain', 'chef', 'ninja', 'robot', 'mummy'].forEach((id, j) => {
          c.save(); c.translate(1560 - 150 - j * 150, 1700); c.scale(1.5, 1.5);
          C.drawEgg(c, { costume: id, mood: 'cracked', t: 0, air: 0, still: true }); c.restore();
        });
      });
    } else if (scene === 'dogsheet') {
      await sheet(page, 'dogsheet', 1500, 520, () => {
        const cv = document.getElementById('sheet'), c = cv.getContext('2d');
        c.fillStyle = '#f6e7c8'; c.fillRect(0, 0, 1500, 520);
        const poses = [['idle', 0, 0, false], ['idle', 0, 180, false], ['windup', 0.3, 60, false], ['windup', 1, 120, false], ['snap', 0.2, 0, false], ['idle', 0, 90, true]];
        poses.forEach((p, i) => {
          c.save(); c.translate(190 + i * 245, 440); c.scale(1.7, 1.7);
          ER.art.drawDog(c, { phase: p[0], f: p[1], t: p[2], happy: p[3] }); c.restore();
          c.fillStyle = '#2b1a10'; c.font = '700 18px system-ui'; c.textAlign = 'center';
          c.fillText(p[3] ? 'happy (just ate)' : p[0] + ' ' + p[1], 150 + i * 245, 495);
        });
      });
    } else if (scene === 'perf') {
      await start(page, false);
      await forward(page, 100000, 5);
      const ms = await page.evaluate(() => {
        const r = ER.debug.run();
        r.place.knives(r.S.dist + 700, [-1, 0, 1]);
        if (!r.S.dog.visits.length) r.place.dog(r.S.dist - 2000, 1);
        r.S.player.sweatUntil = r.S.t + 5000;
        for (let i = 0; i < 240; i++) { r.S.player.blinkUntil = r.S.t + 500; r.step(); r.drain(); }
        const R = ER.debug.renderer, t0 = performance.now();
        for (let i = 0; i < 30; i++) R.draw(r, t0 + i * 16, { costume: 'wizard', zoom: 0, sinceOver: 0, frozen: false });
        const t1 = performance.now(), n = 200;
        for (let i = 0; i < n; i++) { if (i % 20 === 0) { R.fx.egg(true); R.fx.shell(1); R.fx.popup('+25'); } R.draw(r, t1 + i * 16, { costume: 'wizard', zoom: 0, sinceOver: 0, frozen: false }); }
        return (performance.now() - t1) / n;
      });
      console.log('perf ' + sizeName + ' @' + DPR + 'x: ' + ms.toFixed(2) + ' ms per frame');
    } else {
      console.error('unknown scene: ' + scene);
    }
    await page.close();
  }
  await browser.close();
  server.close();
  if (errors.length) { console.log('BROWSER ERRORS:\n  ' + [...new Set(errors)].join('\n  ')); process.exit(1); }
  console.log('shots written to ' + outDir);
})().catch(e => { console.error(e); process.exit(1); });
