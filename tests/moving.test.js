// Moving, jumping and pace.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rules, TUNING, emptyRun, runFor, runUntil, count } = require('./helpers.js');

test('there are exactly three lanes', () => {
  const run = emptyRun();
  assert.equal(run.S.player.lane, 0);
  run.input('left'); run.input('left'); run.input('left');
  assert.equal(run.S.player.lane, -1);
  run.input('right'); run.input('right'); run.input('right'); run.input('right');
  assert.equal(run.S.player.lane, 1);
});

test('a lane change counts the instant it is pressed', () => {
  const run = emptyRun();
  run.input('right');
  assert.equal(run.S.player.lane, 1);
});

test('a jump lasts one air time and lands back on the floor', () => {
  const run = emptyRun();
  run.input('jump');
  assert.equal(run.S.player.grounded, false);
  let top = 0;
  const events = runUntil(run, r => { top = Math.max(top, r.S.player.y); return r.S.player.grounded; }, 2000);
  assert.ok(Math.abs(run.S.t - run.T.JUMP_AIR_MS) < 2 * run.T.STEP_MS, 'air time ' + run.S.t);
  assert.ok(top > 110 && top < 130, 'height ' + top);
  assert.equal(count(events, 'land'), 1);
});

test('early press: a jump pressed just before landing fires on landing', () => {
  const run = emptyRun();
  run.input('jump');
  runFor(run, run.T.JUMP_AIR_MS - run.T.JUMP_BUFFER_MS + 20);
  assert.equal(run.S.player.grounded, false);
  run.input('jump');                       // still in the air
  runUntil(run, r => r.S.player.jumps === 2, 400);
  assert.equal(run.S.player.jumps, 2);
  assert.equal(run.S.player.grounded, false, 'second jump started on the landing frame');
  assert.ok(run.S.t <= run.T.JUMP_AIR_MS + 2 * run.T.STEP_MS);
});

test('a jump pressed far too early is forgotten', () => {
  const run = emptyRun();
  run.input('jump');
  runFor(run, 100);
  run.input('jump');
  runFor(run, 1200);
  assert.equal(run.S.player.jumps, 1);
});

test('you can jump again the moment you land', () => {
  const run = emptyRun();
  run.input('jump');
  runUntil(run, r => r.S.player.grounded, 2000);
  run.input('jump');
  assert.equal(run.S.player.grounded, false);
  assert.equal(run.S.player.jumps, 2);
});

test('the run starts gently, speeds up, and stops at top speed', () => {
  const run = emptyRun();
  assert.equal(run.S.speed, TUNING.START_SPEED);
  let last = 0, never = true;
  for (let s = 0; s < 240; s++) {
    runFor(run, 1000);
    if (run.S.speed < last) never = false;
    last = run.S.speed;
  }
  assert.ok(never, 'speed never drops');
  assert.equal(run.S.speed, TUNING.TOP_SPEED);
});

test('predicted distance matches the distance actually run', () => {
  const run = emptyRun();
  for (const ms of [1000, 30000, 120000, 200000]) {
    const fresh = emptyRun();
    runFor(fresh, ms);
    const predicted = rules.advance(fresh.T, 0, ms);
    assert.ok(Math.abs(predicted - fresh.S.dist) < fresh.S.dist * 0.002 + 5, ms + ' ms: ' + predicted + ' vs ' + fresh.S.dist);
  }
  assert.ok(run);
});

test('score is distance plus 25 for every egg', () => {
  const run = emptyRun();
  run.place.eggs(0, 400, 3, false);
  runFor(run, 3000);
  assert.equal(run.S.eggs, 3);
  assert.equal(run.S.score, Math.floor(run.S.dist / TUNING.UNITS_PER_POINT) + 75);
});
