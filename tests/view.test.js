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
