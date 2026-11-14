// The picture fits every screen, and screen size never changes the rules.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const view = require('../js/view.js');
const TUNING = require('../js/tuning.js');

const SCREENS = {
  'small phone': [320, 568], 'phone': [390, 844], 'tall phone': [360, 880],
  'phone on its side': [844, 390], 'small phone on its side': [568, 320],
  'tablet': [820, 1180], 'tablet on its side': [1180, 820], 'square': [800, 800],
  'laptop': [1366, 768], 'desktop': [1920, 1080], 'ultrawide': [3440, 1440], 'narrow window': [500, 1000]
};

for (const [name, [w, h]] of Object.entries(SCREENS)) {
  const L = view.layout(w, h);
  const at = (x, y, z) => view.project(L, x, y, z);

  test(name + ': the track is centred', () => {
    assert.equal(at(0, 0, 0).x, w / 2);
    assert.ok(Math.abs((at(-120, 0, 500).x + at(120, 0, 500).x) / 2 - w / 2) < 1e-9);
  });

  test(name + ': the egg, a full jump, and all five spares are on screen in every lane', () => {
    for (const lane of [-1, 0, 1]) {
      const x = lane * TUNING.LANE_WIDTH;
      const feet = at(x, 0, 0), top = at(x, 122 + 90, 0);
      assert.ok(feet.x - 34 * feet.s >= 0 && feet.x + 34 * feet.s <= w, 'egg inside the sides');
      assert.ok(top.y >= 0, 'top of a jump is on screen');
      assert.ok(feet.y <= h, 'feet on screen');
      const last = at(x, 0, -TUNING.TRAIL_GAP * TUNING.MAX_SPARES);
      assert.ok(last.y <= h, 'last spare on screen: ' + last.y + ' of ' + h);
      assert.ok(last.x - 16 * last.s >= 0 && last.x + 16 * last.s <= w, 'last spare inside the sides');
    }
  });

  test(name + ': things get smaller with distance and are never stretched', () => {
    let last = Infinity;
    for (let z = 0; z <= TUNING.SEE_AHEAD; z += 200) {
      const p = at(0, 0, z);
      assert.ok(p.s < last); last = p.s;
      // One scale for width and height: 100 units wide equals 100 units tall.
      const wide = at(100, 0, z).x - p.x, tall = p.y - at(0, 100, z).y;
      assert.ok(Math.abs(wide - tall) < 1e-9);
    }
  });

  test(name + ': things appear at the same distance as on every other screen', () => {
    assert.equal(L.seeAhead, TUNING.SEE_AHEAD);
    const far = at(0, 0, TUNING.SEE_AHEAD);
    assert.ok(far.y > L.farY && far.y < L.eggY, 'the appearing point is on screen, between wall and egg');
    assert.ok(far.y > 0 && far.y < h);
  });

  test(name + ': the dog is fully on screen on both sides', () => {
    for (const side of [-1, 1]) {
      const p = at(side * L.dogX, 0, TUNING.DOG_AHEAD);
      assert.ok(p.x - 72 * p.s >= 0 && p.x + 72 * p.s <= w, 'dog at ' + p.x);
    }
  });

  test(name + ': camera height stays inside its limits', () => {
    assert.ok(L.camH >= TUNING.CAM_HEIGHT[0] - 1e-9 && L.camH <= TUNING.CAM_HEIGHT[1] + 1e-9);
    assert.ok(L.vanishY > 0 && L.vanishY < h * 0.5);
  });
}

// Everything that must be true of the picture on a screen of w by h.
function problems(w, h) {
  const L = view.layout(w, h), out = [];
  const at = (x, y, z) => view.project(L, x, y, z);
  const tiny = 1e-6;
  for (const [name, value] of Object.entries(L)) if (!Number.isFinite(value)) out.push(name + ' is ' + value);
  if (!(L.sp > 0)) out.push('scale ' + L.sp);
  if (!(L.camH >= TUNING.CAM_HEIGHT[0] - tiny && L.camH <= TUNING.CAM_HEIGHT[1] + tiny)) out.push('camera height ' + L.camH);
  if (!(L.vanishY >= 0 && L.vanishY < L.farY && L.farY < L.eggY && L.eggY <= h)) out.push('horizon, wall and egg out of order');
  if (at(0, 0, 0).x !== w / 2) out.push('track not centred');
  for (const lane of [-1, 0, 1]) {
    const x = lane * TUNING.LANE_WIDTH, feet = at(x, 0, 0), last = at(x, 0, -TUNING.TRAIL_GAP * TUNING.MAX_SPARES);
    if (!(feet.x - 34 * feet.s >= -tiny && feet.x + 34 * feet.s <= w + tiny)) out.push('egg off the side in lane ' + lane);
    if (!(at(x, 122 + 90, 0).y >= -tiny)) out.push('top of a jump off the screen');
    if (!(last.y <= h + tiny && last.x - 16 * last.s >= -tiny && last.x + 16 * last.s <= w + tiny)) out.push('last spare off the screen in lane ' + lane);
  }
  for (const side of [-1, 1]) {
    const dog = at(side * L.dogX, 0, TUNING.DOG_AHEAD);
    if (!(dog.x - 72 * dog.s >= -tiny && dog.x + 72 * dog.s <= w + tiny)) out.push('dog off the screen');
  }
  const appear = at(0, 0, TUNING.SEE_AHEAD);
  if (!(appear.y > L.farY && appear.y < L.eggY) || L.seeAhead !== TUNING.SEE_AHEAD) out.push('things appear at the wrong place');
  const wide = at(100, 0, 700).x - at(0, 0, 700).x, tall = at(0, 0, 700).y - at(0, 100, 700).y;
  if (Math.abs(wide - tall) > 1e-9 * Math.max(1, wide)) out.push('stretched');
  return out;
}

test('odd screens: tiny, huge, very narrow, very wide and half-pixel sizes all get a sound picture', () => {
  const odd = [[100, 100], [200, 200], [200, 2000], [2000, 200], [240, 320], [280, 653], [320, 1024], [300, 1200],
               [904, 2316], [1080, 2640], [4000, 300], [5120, 1440], [7680, 4320], [100000, 100000], [390.5, 844.33]];
  for (const [w, h] of odd) assert.deepEqual(problems(w, h), [], w + ' by ' + h);
});

test('every size a window can be dragged to gets a sound picture', () => {
  for (let w = 200; w <= 4000; w += 37) {
    for (let h = 200; h <= 3000; h += 41) assert.deepEqual(problems(w, h), [], w + ' by ' + h);
  }
});

test('a size of zero, a missing size or a nonsense size never gives "not a number"', () => {
  for (const [w, h] of [[0, 0], [0, 500], [500, 0], [NaN, 500], [500, NaN], [undefined, undefined], [-100, 500],
                        [500, -100], [Infinity, 500], [500, Infinity], [0.2, 0.2], [1, 1]]) {
    const L = view.layout(w, h);
    for (const [name, value] of Object.entries(L)) assert.ok(Number.isFinite(value), 'layout(' + w + ', ' + h + ').' + name + ' is ' + value);
    assert.ok(L.sp > 0 && L.w >= 1 && L.h >= 1);
    const p = view.project(L, 120, 50, 400);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.s));
  }
});

test('a bigger screen shows more kitchen, not more track', () => {
  const phone = view.layout(390, 844), desktop = view.layout(1920, 1080);
  // Kitchen visible to the side of the track, in game units, where the egg is.
  const sideUnits = L => (L.w / 2) / L.sp - TUNING.LANE_WIDTH * 1.5;
  assert.ok(sideUnits(desktop) > sideUnits(phone) * 5);
  // …but the distance at which things appear is identical.
  assert.equal(phone.seeAhead, desktop.seeAhead);
});

test('the rules never look at the screen', () => {
  const fs = require('node:fs'), path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '../js/rules.js'), 'utf8');
  for (const word of ['window', 'document', 'innerWidth', 'innerHeight', 'canvas', 'layout', 'devicePixelRatio']) {
    assert.ok(!new RegExp('\\b' + word + '\\b').test(src), 'rules.js mentions ' + word);
  }
});
