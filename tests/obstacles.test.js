// Obstacles, hits, blinking and close calls.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TUNING, emptyRun, runFor, runUntil, count } = require('./helpers.js');

for (const kind of ['toaster', 'blender', 'carton']) {
  test('tall ' + kind + ': jumping does not clear it', () => {
    const run = emptyRun();
    const o = run.place.obstacle(kind, 0, 600);
    runUntil(run, r => o.d - r.S.dist < 60);
    run.input('jump');
    runFor(run, 1000);
    assert.equal(run.S.over, true);
    assert.equal(run.S.cause, 'obstacle');
  });
  test('tall ' + kind + ': changing lanes clears it', () => {
    const run = emptyRun();
    run.place.obstacle(kind, 0, 600);
    run.input('left');
    runFor(run, 3000);
    assert.equal(run.S.over, false);
  });
}

for (const kind of ['knife', 'butter']) {
  test('flat ' + kind + ': can be jumped', () => {
    const run = emptyRun();
    const o = run.place.obstacle(kind, 0, 600);
    runUntil(run, r => o.d - r.S.dist < 70);
    run.input('jump');
    runFor(run, 2000);
    assert.equal(run.S.over, false);
  });
  test('flat ' + kind + ': can be dodged', () => {
    const run = emptyRun();
    run.place.obstacle(kind, 0, 600);
    run.input('right');
    runFor(run, 3000);
    assert.equal(run.S.over, false);
  });
  test('flat ' + kind + ': hits if you do neither', () => {
    const run = emptyRun();
    run.place.obstacle(kind, 0, 600);
    runFor(run, 3000);
    assert.equal(run.S.over, true);
  });
}

test('a flat obstacle can be jumped at every speed, with room to spare', () => {
  // For each speed, find every moment a jump can start and still clear it.
  for (const d of [600, 20000, 60000, 100000]) {
    let good = 0;
    for (let lead = 0; lead <= 700; lead += 10) {      // ms before it arrives
      const run = emptyRun();
      run.S.dist = d - 1000;
      const o = run.place.obstacle('butter', 0, d);
      const arrive = (o.d - run.S.dist) / run.T.TOP_SPEED;   // rough, refined below
      void arrive;
      let jumped = false;
      runFor(run, 5000, r => {
        const msAway = (o.d - r.S.dist) / r.S.speed * 1000;
        if (!jumped && msAway <= lead) { r.input('jump'); jumped = true; }
      });
      if (!run.S.over) good += 10;
    }
    assert.ok(good >= 250, 'at distance ' + d + ' the jump window is only ' + good + ' ms');
  }
});

test('late press: a jump just after touching a flat obstacle still counts', () => {
  const run = emptyRun();
  const o = run.place.obstacle('butter', 0, 600);
  const touch = o.half + run.T.PLAYER_HALF_DEPTH;
  runUntil(run, r => o.d - r.S.dist <= touch);          // now touching
  runFor(run, run.T.LATE_JUMP_GRACE_MS - 30);
  run.input('jump');
  runFor(run, 2000);
  assert.equal(run.S.over, false);
});

test('a press later than the grace does not save you', () => {
  const run = emptyRun();
  const o = run.place.obstacle('butter', 0, 600);
  const touch = o.half + run.T.PLAYER_HALF_DEPTH;
  runUntil(run, r => o.d - r.S.dist <= touch);
  runFor(run, run.T.LATE_JUMP_GRACE_MS + 30);
  run.input('jump');
  runFor(run, 500);
  assert.equal(run.S.over, true);
});

test('flat obstacles cannot be run through at top speed', () => {
  const run = emptyRun();
  run.S.dist = 150000;
  run.place.obstacle('knife', 0, 151000);
  runFor(run, 3000);
  assert.equal(run.S.over, true);
});

test('a hit costs one spare, knocks the obstacle away, and starts the blink', () => {
  const run = emptyRun({ spares: 2 });
  const o = run.place.obstacle('toaster', 0, 600);
  const events = runUntil(run, r => r.S.spares < 2);
  assert.equal(run.S.spares, 1);
  assert.equal(run.S.over, false);
  assert.ok(o.knocked !== null, 'obstacle knocked away');
  assert.equal(count(events, 'spareLost'), 1);
  assert.equal(run.S.player.blinkUntil - run.S.t, TUNING.BLINK_MS);
});

test('nothing can hurt you while you blink', () => {
  const run = emptyRun({ spares: 1 });
  run.place.obstacle('toaster', 0, 600);
  runUntil(run, r => r.S.spares === 0);
  // A wall of obstacles arrives during the blink.
  const d = run.S.dist + run.S.speed * 0.7;
  for (const lane of [-1, 0, 1]) run.place.obstacle('carton', lane, d);
  runFor(run, 1400);
  assert.equal(run.S.over, false);
});

test('the blink lasts about a second and a half, then hits count again', () => {
  const run = emptyRun({ spares: 1 });
  run.place.obstacle('toaster', 0, 600);
  runUntil(run, r => r.S.spares === 0);
  const d = run.S.dist + run.S.speed * (TUNING.BLINK_MS + 300) / 1000;
  run.place.obstacle('toaster', 0, d);
  runFor(run, 3000);
  assert.equal(run.S.over, true);
});

test('a hit with no spares ends the run', () => {
  const run = emptyRun();
  run.place.obstacle('blender', 0, 600);
  const events = runFor(run, 3000);
  assert.equal(run.S.over, true);
  assert.equal(count(events, 'over'), 1);
});

test('the spares trail is only for show: an obstacle beside you costs nothing', () => {
  const run = emptyRun({ spares: 5 });
  run.input('left');
  runFor(run, 200);
  run.input('right');                // the trail is still sliding over from the left
  run.place.obstacle('toaster', -1, run.S.dist + 60);
  run.place.obstacle('toaster', 1, run.S.dist + 60);
  runFor(run, 2000);
  assert.equal(run.S.spares, 5);
});

test('close call: jumping over an obstacle makes the egg sweat for about a second', () => {
  const run = emptyRun();
  const o = run.place.obstacle('butter', 0, 600);
  runUntil(run, r => o.d - r.S.dist < 70);
  run.input('jump');
  const events = runUntil(run, r => r.S.player.sweatUntil > 0, 1000);
  assert.equal(count(events, 'closeCall'), 1);
  assert.equal(run.S.player.sweatUntil - run.S.t, TUNING.SWEAT_MS);
});

test('close call: a last-moment lane switch counts too', () => {
  const run = emptyRun();
  const o = run.place.obstacle('toaster', 0, 600);
  runUntil(run, r => (o.d - r.S.dist) / r.S.speed < 0.2);
  run.input('left');
  const events = run.drain();
  assert.equal(count(events, 'closeCall'), 1);
  runFor(run, 1000);
  assert.equal(run.S.over, false);
});

test('an early lane switch is not a close call', () => {
  const run = emptyRun();
  run.place.obstacle('toaster', 0, 900);
  run.input('left');
  const events = runFor(run, 3000);
  assert.equal(count(events, 'closeCall'), 0);
});

test('after sweating, the egg stays calm for 10 to 20 seconds', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const run = emptyRun({ seed });
    const sweatTimes = [];
    // A flat obstacle to jump every 1.2 seconds for a minute.
    let nextAt = 600;
    runFor(run, 60000, r => {
      if (r.S.dist + 800 > nextAt) { r.place.obstacle('butter', 0, nextAt); nextAt += r.S.speed * 1.2; }
      const mine = r.S.things.find(o => !o.jumped && o.d > r.S.dist);
      if (mine && r.S.player.grounded && (mine.d - r.S.dist) / r.S.speed < 0.2) r.input('jump');
    }).forEach(e => { if (e.type === 'closeCall') sweatTimes.push(run.S.t); });
    assert.equal(run.S.over, false);
    const p = run.S.player;
    assert.ok(p.calmUntil - p.sweatUntil >= TUNING.CALM_MS[0]);
    assert.ok(p.calmUntil - p.sweatUntil <= TUNING.CALM_MS[1]);
    // About 50 jumps in a minute, but only a handful of sweats.
    assert.ok(sweatTimes.length >= 3 && sweatTimes.length <= 6, 'sweats: ' + sweatTimes.length);
  }
});
