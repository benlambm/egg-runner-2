// Time and numbers: odd frame times, any frame rate, and the exact edges of
// the forgiveness windows.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rules, TUNING, emptyRun, runFor, runUntil, bot } = require('./helpers.js');

const STEP = TUNING.STEP_MS;
const NO_KNIVES = { KNIFE_FIRST_MS: [1e9, 1e9] };

// ── run.update(ms): the game loop hands over real frame times ────────────

test('a frame time that is not a real positive number is ignored and never freezes the run', () => {
  for (const bad of [NaN, undefined, null, -5, -1000, -Infinity, 0, 'soon', {}]) {
    const run = emptyRun();
    run.update(bad);
    assert.equal(run.S.t, 0, 'update(' + String(bad) + ') moved the run');
    for (let frame = 0; frame < 60; frame++) run.update(1000 / 60);
    assert.ok(Math.abs(run.S.t - 1000) <= 2 * STEP, 'after update(' + String(bad) + ') a second of frames gave ' + run.S.t + ' ms');
    assert.ok(Number.isFinite(run.S.dist) && run.S.dist > 300);
  }
});

test('a huge frame time (a long pause) moves the run on by half a second at most and leaves no debt', () => {
  for (const huge of [600, 5000, 1e9, 1e300, Infinity]) {
    const run = emptyRun();
    run.update(huge);
    assert.ok(run.S.t > 0 && run.S.t <= 500 + 1e-6, 'update(' + huge + ') ran ' + run.S.t + ' ms');
    const after = run.S.t;
    run.update(1000 / 60);
    assert.ok(run.S.t - after <= 2 * STEP + 1e-6, 'no catching up afterwards');
  }
});

test('tiny frame times add up, and every frame rate keeps the same time', () => {
  const slow = emptyRun();
  for (let i = 0; i < 4000; i++) slow.update(0.25);
  assert.ok(Math.abs(slow.S.t - 1000) <= 2 * STEP, 'quarter-millisecond frames: ' + slow.S.t);
  for (const hz of [20, 24, 30, 50, 59.94, 60, 75, 90, 120, 144, 165, 240, 360]) {
    const run = emptyRun();
    const frames = Math.round(60000 * hz / 1000);
    for (let f = 0; f < frames; f++) run.update(1000 / hz);
    assert.ok(Math.abs(run.S.t - 60000) <= 2 * STEP, hz + ' frames a second: a minute of frames gave ' + run.S.t + ' ms');
  }
});

test('however the time is sliced into frames, the run comes out exactly the same', () => {
  // Nobody presses anything; the egg takes hits from a real course with
  // plenty of spares. Sliced into 30, 144 or uneven frames, the state after
  // the same number of steps must be identical.
  const make = () => rules.createRun({ seed: 8, spares: 99, tuning: { MAX_SPARES: 99 } });
  let hits = 0;
  for (const frameMs of [1000 / 30, 1000 / 144, 100, 3.1, 'uneven']) {
    const run = make(), byStep = make();
    let i = 0;
    while (run.S.t < 90000) run.update(frameMs === 'uneven' ? 2 + ((i++ * 37) % 60) : frameMs);
    const steps = Math.round(run.S.t / STEP);
    for (let n = 0; n < steps; n++) byStep.step();
    assert.deepEqual(JSON.parse(JSON.stringify(run.S)), JSON.parse(JSON.stringify(byStep.S)), 'frames of ' + frameMs);
    assert.deepEqual(run.drain(), byStep.drain(), 'the same events, frames of ' + frameMs);
    hits += 99 - run.S.spares;
  }
  assert.ok(hits > 20, 'the course did hit the egg: ' + hits);
});

test('the simple player is never hit whether it plays at 20, 30, 60 or 144 frames a second', () => {
  for (const hz of [20, 30, 60, 144]) {
    for (const seed of [3, 4]) {
      const run = rules.createRun({ seed, tuning: NO_KNIVES });
      for (let f = 0; f < 200000 * hz / 1000 && !run.S.over; f++) { bot(run); run.update(1000 / hz); run.drain(); }
      assert.equal(run.S.over, false, hz + ' Hz, seed ' + seed + ': hit by ' + run.S.cause + ' at ' + Math.round(run.S.t));
      assert.ok(run.S.t > 199000);
    }
  }
});

// ── presses ──────────────────────────────────────────────────────────────

test('a thousand presses in one instant: still three lanes and one jump', () => {
  const run = emptyRun();
  for (let i = 0; i < 1000; i++) run.input(['left', 'jump', 'right', 'right', 'jump', 'left', 'left'][i % 7]);
  assert.ok([-1, 0, 1].includes(run.S.player.lane));
  assert.equal(run.S.player.jumps, 1);
  runFor(run, 2000);
  assert.equal(run.S.player.jumps, 1, 'the presses made in the air were far too early to count');
  assert.equal(run.S.player.y, 0);
});

test('presses that mean nothing do nothing', () => {
  const run = emptyRun();
  for (const junk of [undefined, null, '', 'up', 'LEFT', 'Jump', 0, 1, -1, {}, []]) run.input(junk);
  assert.equal(run.S.player.lane, 0);
  assert.equal(run.S.player.grounded, true);
  assert.deepEqual(run.drain(), []);
});

test('presses after the run has ended do nothing', () => {
  const run = emptyRun();
  run.place.obstacle('toaster', 0, 300);
  runFor(run, 3000);
  assert.equal(run.S.over, true);
  const frozen = JSON.stringify(run.S);
  run.drain();
  run.input('left'); run.input('jump'); run.step(); run.update(100);
  assert.equal(JSON.stringify(run.S), frozen);
  assert.deepEqual(run.drain(), []);
});

// ── exactly at the edges of the forgiveness windows ──────────────────────

test('early press, to the step: every press inside the buffer fires on landing, none outside it', () => {
  // How many steps does one jump last?
  const probe = emptyRun();
  probe.input('jump');
  let air = 0;
  while (!probe.S.player.grounded) { probe.step(); air++; }
  for (let before = 1; before <= 30; before++) {              // steps before the landing step
    const run = emptyRun();
    run.input('jump');
    for (let i = 0; i < air - before; i++) run.step();
    assert.equal(run.S.player.grounded, false);
    run.input('jump');
    for (let i = 0; i < before; i++) run.step();
    const early = before * STEP;                                // ms between the press and the landing
    assert.equal(run.S.player.jumps, early <= TUNING.JUMP_BUFFER_MS ? 2 : 1, 'pressed ' + early.toFixed(1) + ' ms before landing');
    assert.equal(run.S.player.grounded, early > TUNING.JUMP_BUFFER_MS, 'pressed ' + early.toFixed(1) + ' ms before landing');
  }
});

test('the blink, to the step: an obstacle that first touches inside it is harmless, the next one is not', () => {
  for (const offset of [-3, -2, -1, 0, 1, 2, 3]) {              // steps before / after the blink ends
    const run = emptyRun({ spares: 1 });
    run.place.obstacle('toaster', 0, 500);
    runUntil(run, r => r.S.spares === 0);
    const blinkUntil = run.S.player.blinkUntil;
    assert.ok(Math.abs(blinkUntil - run.S.t - TUNING.BLINK_MS) < 1e-6);
    // Put a toaster where it will first touch `offset` steps from the end of the blink.
    const probe = emptyRun(); probe.S.dist = run.S.dist; probe.S.t = run.S.t;
    while (probe.S.t < blinkUntil + offset * STEP - 1e-6) probe.step();
    const o = run.place.obstacle('toaster', 0, probe.S.dist + 36 - 0.01);
    runFor(run, 3000);
    // A touch that begins while blinking never counts; one that begins at or after the end does.
    assert.equal(run.S.over, offset >= 0, 'first touch ' + offset + ' step(s) from the end of the blink (ghost: ' + o.ghost + ')');
  }
});

test('egg reach, to the unit: stepping into an egg\'s lane grabs it only while it is in reach', () => {
  for (const [ahead, grabbed] of [[TUNING.EGG_REACH + 30, true], [TUNING.EGG_REACH - 1, true], [0, true],
                                  [-(TUNING.EGG_REACH - 6), true], [-(TUNING.EGG_REACH + 1), false]]) {
    const run = emptyRun();
    const egg = run.place.eggs(1, 800, 1, false)[0];
    runUntil(run, r => egg.d - r.S.dist <= ahead);
    assert.equal(egg.taken, false);
    run.input('right');
    runFor(run, 600);
    assert.equal(egg.taken, grabbed, 'stepped in with the egg ' + ahead + ' units ahead');
    assert.equal(run.S.eggs, grabbed ? 1 : 0);
    assert.equal(egg.missed, !grabbed);
  }
});

test('egg reach, from the front: an egg is grabbed when it comes within reach, not before', () => {
  for (const d of [800, 60000, 150000]) {
    const run = emptyRun();
    run.S.dist = d - 700;
    const egg = run.place.eggs(0, d, 1, false)[0];
    let was = Infinity;                                     // how far ahead it was one step before being grabbed
    runUntil(run, r => { if (!egg.taken) was = egg.d - r.S.dist; return egg.taken; });
    const now = egg.d - run.S.dist;
    assert.ok(was > TUNING.EGG_REACH && now <= TUNING.EGG_REACH && now > 0, 'grabbed between ' + was.toFixed(1) + ' and ' + now.toFixed(1) + ' units ahead');
  }
});

test('the dog\'s bite, to the step: in the air at that instant is safe, landed on that very step is not', () => {
  // How many steps does one jump last, and on which step does the first bite land?
  const probe = emptyRun();
  probe.input('jump');
  let air = 0;
  while (!probe.S.player.grounded) { probe.step(); air++; }
  const dogOnly = () => { const run = emptyRun({ spares: 1 }); run.place.dog(1500, 1); return run; };
  const watch = dogOnly();
  let biteStep = 0;
  for (let i = 1; !biteStep; i++) { watch.step(); if (watch.drain().some(e => e.type === 'dogSnap')) biteStep = i; }

  for (const before of [1, 2, air - 3, air - 2, air - 1, air, air + 1, air + 2, air + 20]) {
    // The jump is pressed so that the bite lands on its `before`-th step.
    const run = dogOnly();
    let snap = null;
    for (let i = 1; i <= biteStep; i++) {
      if (i === biteStep - before + 1) run.input('jump');
      run.step();
      snap = run.drain().find(e => e.type === 'dogSnap') || snap;
    }
    assert.ok(snap, 'it snapped on the same step');
    const landed = before >= air;                       // the jump's last step is the landing
    assert.equal(snap.caught, landed, 'bite on step ' + before + ' of a ' + air + '-step jump');
    assert.equal(run.S.player.grounded, landed);
    assert.equal(run.S.spares, landed ? 0 : 1);
  }
});

test('events that nobody collects are capped, so a forgotten run cannot fill the memory', () => {
  const run = emptyRun();
  for (let i = 0; i < 2000; i++) { run.input('left'); run.input('right'); run.step(); }
  const events = run.drain();
  assert.equal(events.length, 400, 'events kept: ' + events.length);
  assert.equal(events[events.length - 1].type, 'step', 'the newest are the ones kept');
  assert.deepEqual(run.drain(), []);
});
