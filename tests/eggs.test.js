// Whole eggs, golden eggs and spares.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TUNING, emptyRun, runFor, runUntil, count } = require('./helpers.js');

test('every whole egg scores 25 points and gives no protection', () => {
  const run = emptyRun();
  run.place.eggs(0, 400, 5, false);
  run.place.eggs(0, 1200, 1, false);
  const events = runFor(run, 5000);
  assert.equal(run.S.eggs, 6);
  assert.equal(count(events, 'egg'), 6);
  assert.equal(run.S.spares, 0);
  assert.equal(run.S.score - Math.floor(run.S.dist / TUNING.UNITS_PER_POINT), 6 * 25);
});

test('eggs can be grabbed in midair', () => {
  const run = emptyRun();
  const eggs = run.place.eggs(0, 500, 3, false);
  runUntil(run, r => eggs[0].d - r.S.dist < 80);
  run.input('jump');
  runFor(run, 1500);
  assert.equal(run.S.eggs, 3);
});

test('eggs in another lane are not collected', () => {
  const run = emptyRun();
  run.place.eggs(1, 400, 3, false);
  runFor(run, 3000);
  assert.equal(run.S.eggs, 0);
});

test('a full row plus its golden egg earns one spare', () => {
  const run = emptyRun();
  run.place.eggs(0, 400, 4, true);
  const events = runFor(run, 4000);
  assert.equal(run.S.eggs, 4);
  assert.equal(run.S.spares, 1);
  assert.equal(events.filter(e => e.type === 'egg' && e.earned).length, 1);
  assert.equal(run.S.score - Math.floor(run.S.dist / TUNING.UNITS_PER_POINT), 4 * 25, 'golden egg still scores 25');
});

test('miss one egg and the golden egg turns ordinary before you reach it', () => {
  const run = emptyRun();
  const eggs = run.place.eggs(0, 400, 4, true);
  run.input('left');                               // miss the first egg
  runUntil(run, r => eggs[0].missed);
  assert.equal(eggs[3].golden, false, 'turned ordinary');
  assert.ok(eggs[3].d - run.S.dist > 0, 'before the egg reaches it');
  run.input('right');
  const events = runFor(run, 3000);
  assert.equal(run.S.eggs, 3);
  assert.equal(run.S.spares, 0);
  assert.equal(events.filter(e => e.type === 'egg' && e.golden).length, 0);
  assert.equal(run.S.score - Math.floor(run.S.dist / TUNING.UNITS_PER_POINT), 3 * 25, 'it still scores as a whole egg');
});

test('missing the middle egg of a row also breaks it', () => {
  const run = emptyRun();
  const eggs = run.place.eggs(0, 400, 5, true);
  runUntil(run, r => eggs[1].taken);
  run.input('right');
  runUntil(run, r => eggs[2].missed);
  run.input('left');
  runFor(run, 3000);
  assert.equal(run.S.spares, 0);
});

test('skipping only the egg right before the golden one still turns it ordinary in time', () => {
  // The tightest case: every egg taken except the last whole one, then
  // straight back into the lane for the golden egg, at every speed.
  for (const d of [1000, 60000, 150000]) {
    const run = emptyRun();
    run.S.dist = d - 600;
    const eggs = run.place.eggs(0, d, 7, true), skipped = eggs[5], gold = eggs[6];
    runUntil(run, r => eggs[4].taken);
    run.input('left');                               // step out past the sixth egg…
    const events = runUntil(run, r => skipped.d - r.S.dist < -TUNING.EGG_REACH);
    run.input('right');                              // …and back in the instant it is out of reach
    assert.ok(gold.d - run.S.dist > TUNING.EGG_REACH, 'the golden egg is not yet in reach');
    events.push(...runFor(run, 1500));
    const where = 'at speed ' + Math.round(run.S.speed);
    assert.equal(skipped.taken, false, where);
    assert.equal(gold.taken, true, where + ': the last egg is still collected');
    assert.equal(run.S.spares, 0, where + ': but it gives no spare');
    assert.equal(events.filter(e => e.type === 'egg' && (e.golden || e.earned)).length, 0, where);
    assert.equal(events.filter(e => e.type === 'goldenLost').length, 1, where);
    assert.equal(run.S.eggs, 6, where);
  }
});

test('you can carry at most five spares, and a golden egg at five still scores', () => {
  const run = emptyRun({ spares: 5 });
  run.place.eggs(0, 400, 3, true);
  const events = runFor(run, 3000);
  assert.equal(run.S.spares, TUNING.MAX_SPARES);
  assert.equal(TUNING.MAX_SPARES, 5);
  assert.equal(run.S.eggs, 3);
  assert.equal(events.filter(e => e.type === 'egg' && e.full).length, 1);
  assert.equal(run.S.score - Math.floor(run.S.dist / TUNING.UNITS_PER_POINT), 75);
});

test('a run can never start with more than five spares, or fewer than none', () => {
  assert.equal(emptyRun({ spares: 99 }).S.spares, TUNING.MAX_SPARES);
  assert.equal(emptyRun({ spares: -3 }).S.spares, 0);
  assert.equal(emptyRun({}).S.spares, 0);
});

test('five golden rows fill the line; a sixth adds nothing', () => {
  const run = emptyRun();
  for (let i = 0; i < 6; i++) run.place.eggs(0, 400 + i * 500, 3, true);
  runFor(run, 12000);
  assert.equal(run.S.spares, 5);
  assert.equal(run.S.eggs, 18);
});

test('eggs are still collected while blinking', () => {
  const run = emptyRun({ spares: 1 });
  run.place.obstacle('toaster', 0, 500);
  run.place.eggs(0, 700, 3, false);
  runFor(run, 3000);
  assert.equal(run.S.eggs, 3);
});
