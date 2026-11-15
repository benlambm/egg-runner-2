/*
 * Developer tool: draw the app icon with the game's own art, so the icon
 * always matches the game. Needs Playwright with Chromium (the game does not).
 *
 *   node tools/make-icons.js options <folder>   draw every design into <folder>,
 *                                               plus sheet.png showing them side by side
 *   node tools/make-icons.js install <A|B|C|D>  write that design to icons/icon-512.png
 *                                               and icons/icon-192.png
 *
 * Each design is drawn at 1024 x 1024 and shrunk, which keeps edges smooth.
 * Phones crop icons to circles and rounded squares, so everything that
 * matters sits inside the middle 80% (the "safe zone").
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

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

// Runs inside the page. Draws design `id` and returns PNGs as data URLs.
function paintInPage(id) {
  const A = ER.art, C = ER.costumes, S = 1024;
  const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const c = cv.getContext('2d');
  const TAU = Math.PI * 2;

  // ── helpers ────────────────────────────────────────────────────────
  function egg(x, y, k, o, tilt) {            // (x, y) is where its feet stand
    c.save(); c.translate(x, y); if (tilt) c.rotate(tilt); c.scale(k, k);
    C.drawEgg(c, Object.assign({ costume: 'plain', mood: 'happy', t: 0, air: 0, still: false, vy: 0, lean: 0, pace: 0.5 }, o));
    c.restore();
  }
  function pic(name, x, y, k, tilt) {         // any picture from js/art.js
    c.save(); c.translate(x, y); if (tilt) c.rotate(tilt); c.scale(k, k); A.PICS[name].draw(c); c.restore();
  }
  function shadow(x, y, rx, ry, alpha) {
    c.save(); c.translate(x, y); c.scale(1, ry / rx);
    const g = c.createRadialGradient(0, 0, rx * 0.15, 0, 0, rx);
    g.addColorStop(0, 'rgba(30,50,80,' + alpha + ')'); g.addColorStop(1, 'rgba(30,50,80,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, TAU); c.fill(); c.restore();
  }
  function sparkle(x, y, r, color) {
    c.fillStyle = color || '#ffffff'; A.star(c, x, y, r, 4); c.fill();
  }
  // Rays spreading from a point, like a cartoon sunburst.
  function sunburst(cx, cy, light, dark, n) {
    c.fillStyle = dark; c.fillRect(0, 0, S, S);
    c.fillStyle = light;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 0.5) / n) * TAU;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a0) * 1600, cy + Math.sin(a0) * 1600);
      c.lineTo(cx + Math.cos(a1) * 1600, cy + Math.sin(a1) * 1600); c.closePath(); c.fill();
    }
    const g = c.createRadialGradient(cx, cy, 60, cx, cy, 760);
    g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(0.45, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
  }
  // A strip of the game's teal checkered track across the bottom, seen
  // slightly from above so the squares narrow toward the back.
  function floorStrip(top) {
    const vx = 512, vy = top - 300, rows = [0, 0.2, 0.5, 1].map(f => top + (S - top) * f), colW = 230;
    const xAt = (xBottom, y) => vx + (xBottom - vx) * (y - vy) / (S - vy);
    c.fillStyle = '#46b3c2'; c.fillRect(0, top, S, S - top);
    c.fillStyle = '#2f98aa';
    for (let j = 0; j < rows.length - 1; j++) {
      for (let i = -6; i < 7; i++) {
        if ((i + j) & 1) continue;
        const x0 = vx + i * colW - colW / 2, x1 = x0 + colW;
        c.beginPath(); c.moveTo(xAt(x0, rows[j]), rows[j]); c.lineTo(xAt(x1, rows[j]), rows[j]);
        c.lineTo(xAt(x1, rows[j + 1]), rows[j + 1]); c.lineTo(xAt(x0, rows[j + 1]), rows[j + 1]); c.closePath(); c.fill();
      }
    }
    c.fillStyle = 'rgba(20,60,80,0.18)'; c.fillRect(0, top, S, 10);            // shade under the edge
    c.fillStyle = '#fff3d6'; c.fillRect(0, top - 20, S, 24);                    // the track's pale raised edge
    c.fillStyle = '#e3bd84'; for (let x = 24; x < S; x += 96) c.fillRect(x, top - 12, 50, 8);
  }
  // The game's own view: far kitchen wall, cream floor, the track running away.
  function trackScene() {
    const vy = 226, wallBase = 316, W0 = 640, D = 300, bottom = S;
    const sAt = d => D / (D + d), yAt = d => vy + (bottom - vy) * sAt(d);
    // Wall, window and cabinets.
    c.fillStyle = A.grad(c, 0, 0, 0, wallBase, ['#9fd8e4', '#cfeef0']); c.fillRect(0, 0, S, wallBase);
    c.fillStyle = '#f7fbfc'; c.fillRect(0, 96, S, 60);
    c.strokeStyle = '#cfe3e8'; c.lineWidth = 3; c.beginPath();
    for (let x = 0; x <= S; x += 64) { c.moveTo(x, 96); c.lineTo(x, 156); } c.moveTo(0, 126); c.lineTo(S, 126); c.stroke();
    A.rr(c, 372, -30, 280, 150, 14); A.paint(c, A.grad(c, 0, 0, 0, 120, ['#6ec3ff', '#d8f2ff']), '#ffffff', 14);
    c.fillStyle = '#ffe066'; c.beginPath(); c.arc(590, 44, 30, 0, TAU); c.fill();
    c.fillStyle = '#ffffff'; A.oval(c, 450, 70, 46, 20); c.fill(); A.oval(c, 486, 56, 34, 22); c.fill();
    c.fillStyle = '#ffffff'; c.fillRect(506, -30, 12, 150);
    c.fillStyle = '#fff8ea'; c.fillRect(0, 150, S, 22); c.fillStyle = '#7a4a24'; c.fillRect(0, 170, S, 5);
    c.fillStyle = A.grad(c, 0, 172, 0, wallBase, ['#f6ab62', '#e98f45']); c.fillRect(0, 175, S, wallBase - 175);
    for (let i = 0; i < 8; i++) {
      const x = 14 + i * 128;
      if (x > 380 && x < 560) continue;
      A.rr(c, x, 190, 104, 118, 10); A.paint(c, '#f9bd7e', '#b9662a', 4);
      A.oval(c, x + 52, 250, 8, 8); A.paint(c, '#fff8ea', '#b9662a', 3);
    }
    c.fillStyle = '#6d4420'; c.fillRect(0, wallBase - 14, S, 14);
    c.beginPath(); c.moveTo(430, wallBase); c.lineTo(430, 252); c.quadraticCurveTo(430, 196, 512, 196); c.quadraticCurveTo(594, 196, 594, 252); c.lineTo(594, wallBase); c.closePath();
    A.paint(c, A.grad(c, 0, 196, 0, wallBase, ['#23160f', '#5b4130']), '#7a4a24', 6);
    // Floor.
    c.fillStyle = A.grad(c, 0, wallBase, 0, S, ['#fbefd6', '#f3dfb9']); c.fillRect(0, wallBase, S, S - wallBase);
    c.strokeStyle = 'rgba(190,160,110,0.5)'; c.lineWidth = 3; c.beginPath();
    for (const x of [-1500, -900, 900, 1500]) { c.moveTo(512 + x * sAt(2600), yAt(2600)); c.lineTo(512 + x, bottom); }
    for (const d of [150, 520, 1300]) { c.moveTo(0, yAt(d)); c.lineTo(S, yAt(d)); }
    c.stroke();
    // Track: pale raised edge, then the checker.
    const far = 2600;
    function quad(x0, x1, d0, d1, fill) {
      c.beginPath(); c.moveTo(512 + x0 * sAt(d1), yAt(d1)); c.lineTo(512 + x1 * sAt(d1), yAt(d1));
      c.lineTo(512 + x1 * sAt(d0), yAt(d0)); c.lineTo(512 + x0 * sAt(d0), yAt(d0)); c.closePath(); c.fillStyle = fill; c.fill();
    }
    quad(-W0 - 60, W0 + 60, -40, far, 'rgba(60,38,20,0.16)');
    quad(-W0 - 44, W0 + 44, -40, far, '#fff3d6');
    quad(-W0, W0, -40, far, '#46b3c2');
    const L = 190;
    for (let n = -1; n * L < far; n++) {
      const d0 = Math.max(-40, n * L), d1 = Math.min(far, (n + 1) * L);
      for (let lane = 0; lane < 3; lane++) {
        if ((n + lane) & 1) continue;
        quad(-W0 + lane * W0 * 2 / 3, -W0 + (lane + 1) * W0 * 2 / 3, d0, d1, '#2f98aa');
      }
    }
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 5; c.beginPath();
    for (const x of [-W0 / 3, W0 / 3]) { c.moveTo(512 + x * sAt(far), yAt(far)); c.lineTo(512 + x * sAt(-40), yAt(-40)); }
    c.stroke();
    const haze = c.createLinearGradient(0, wallBase, 0, wallBase + 120);
    haze.addColorStop(0, 'rgba(255,246,226,0.8)'); haze.addColorStop(1, 'rgba(255,246,226,0)');
    c.fillStyle = haze; c.fillRect(0, wallBase, S, 120);
    return { sAt, yAt, W0 };
  }

  // ── the four designs ───────────────────────────────────────────────
  if (id === 'A') {
    // On the track: the game's own view, with the kitchen at the far end.
    const v = trackScene();
    const at = (lane, d) => ({ x: 512 + lane * v.W0 * 2 / 3 * v.sAt(d), y: v.yAt(d), k: v.sAt(d) * 4.6 });
    let p = at(-1, 760); shadow(p.x + 8, p.y, 48, 12, 0.3); pic('carton', p.x, p.y, p.k);
    p = at(1, 700); shadow(p.x + 10, p.y, 74, 18, 0.3); pic('toaster', p.x, p.y, p.k);
    shadow(520, 902, 180, 40, 0.42);
    egg(512, 896, 5.7, { t: 95, pace: 0.6 });
  } else if (id === 'B') {
    // Big jump: the egg leaping for joy in front of a bold "2".
    sunburst(512, 470, '#ffd84a', '#ffbf1f', 14);
    floorStrip(800);
    c.font = '900 560px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.lineJoin = 'round';
    c.lineWidth = 44; c.strokeStyle = '#b3202f'; c.strokeText('2', 706, 690);
    c.fillStyle = '#e5484d'; c.fillText('2', 706, 690);
    c.lineWidth = 10; c.strokeStyle = 'rgba(255,255,255,0.55)'; c.strokeText('2', 700, 684);
    shadow(410, 838, 130, 26, 0.3);
    egg(404, 742, 6.4, { air: 0.95, vy: 0.5, t: 60 }, -0.07);
    sparkle(196, 250, 34); sparkle(282, 168, 18); sparkle(842, 250, 26); sparkle(150, 560, 20); sparkle(866, 700, 16);
  } else if (id === 'C') {
    // Knife hop: the old icon's egg and knife, redrawn in the new style.
    sunburst(512, 440, '#f2675f', '#e5484d', 14);
    floorStrip(790);
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineCap = 'round';
    [[150, 420, 150, 12], [110, 500, 190, 16], [160, 580, 130, 10]].forEach(l => { c.lineWidth = l[3]; c.beginPath(); c.moveTo(l[0], l[1]); c.lineTo(l[0] + l[2], l[1]); c.stroke(); });
    shadow(560, 850, 250, 30, 0.34);
    pic('knife', 566, 852, 4.5);
    shadow(520, 842, 110, 20, 0.22);
    egg(512, 668, 6.1, { air: 1, vy: 0.2, t: 40, mood: 'happy' }, 0.06);
    sparkle(820, 300, 26); sparkle(884, 396, 14); sparkle(760, 214, 14);
  } else if (id === 'D') {
    // The chase: the dog hot on the egg's heels.
    sunburst(512, 430, '#8fdbe8', '#62c3d6', 14);
    floorStrip(800);
    shadow(296, 858, 130, 24, 0.36);
    egg(290, 850, 4.9, { t: 95, pace: 1, mood: 'worried' }, -0.07);
    shadow(770, 854, 220, 28, 0.34);
    c.save(); c.translate(806, 848); c.scale(3.2, 3.2); A.drawDog(c, { t: 120, phase: 'idle', f: 0, happy: false }); c.restore();
    sparkle(170, 250, 22); sparkle(250, 180, 12); sparkle(880, 210, 18);
  }

  // Shrink in steps for smooth edges.
  function shrink(src, size) {
    let cur = src;
    while (cur.width / 2 >= size) {
      const half = document.createElement('canvas'); half.width = cur.width / 2; half.height = cur.height / 2;
      const hc = half.getContext('2d'); hc.imageSmoothingQuality = 'high'; hc.drawImage(cur, 0, 0, half.width, half.height); cur = half;
    }
    if (cur.width !== size) {
      const out = document.createElement('canvas'); out.width = size; out.height = size;
      const oc = out.getContext('2d'); oc.imageSmoothingQuality = 'high'; oc.drawImage(cur, 0, 0, size, size); cur = out;
    }
    return cur;
  }
  return { big: shrink(cv, 512).toDataURL('image/png'), small: shrink(cv, 192).toDataURL('image/png') };
}

const save = (file, dataUrl) => fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));

(async () => {
  const [command, arg] = process.argv.slice(2);
  if (!['options', 'install'].includes(command) || !arg) {
    console.error('usage: node tools/make-icons.js options <folder> | install <A|B|C|D>'); process.exit(1);
  }
  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto('http://127.0.0.1:' + server.address().port + '/index.html');
  await page.waitForFunction(() => window.ER && ER.costumes && ER.art);

  if (command === 'install') {
    const out = await page.evaluate(paintInPage, arg.toUpperCase());
    save(path.join(ROOT, 'icons/icon-512.png'), out.big);
    save(path.join(ROOT, 'icons/icon-192.png'), out.small);
    console.log('icons/icon-512.png and icons/icon-192.png now show design ' + arg.toUpperCase());
  } else {
    fs.mkdirSync(arg, { recursive: true });
    const names = { A: 'On the track', B: 'Big jump', C: 'Knife hop', D: 'The chase' };
    const urls = {};
    for (const id of Object.keys(names)) {
      const out = await page.evaluate(paintInPage, id);
      save(path.join(arg, 'option-' + id + '.png'), out.big);
      urls[id] = out.big;
    }
    // One sheet: each design large, then as a phone would crop it, small.
    await page.setViewportSize({ width: 1640, height: 1010 });
    await page.setContent('<body style="margin:0;background:#2b2f3a;font:700 26px system-ui;color:#fff"><div style="display:flex;gap:24px;padding:28px">' +
      Object.keys(names).map(id =>
        '<div style="width:380px;text-align:center">' +
        '<img src="' + urls[id] + '" style="width:380px;height:380px;border-radius:84px;display:block">' +
        '<div style="margin:18px 0 14px">' + id + '. ' + names[id] + '</div>' +
        '<div style="display:flex;gap:18px;justify-content:center;align-items:center">' +
        '<img src="' + urls[id] + '" style="width:150px;height:150px;border-radius:50%">' +
        '<img src="' + urls[id] + '" style="width:96px;height:96px;border-radius:22px">' +
        '<img src="' + urls[id] + '" style="width:56px;height:56px;border-radius:13px">' +
        '</div>' +
        '<img src="' + urls[id] + '" style="width:380px;height:380px;display:block;margin-top:22px">' +
        '</div>').join('') + '</div></body>');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(arg, 'sheet.png') });
    console.log('designs written to ' + arg);
  }
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
