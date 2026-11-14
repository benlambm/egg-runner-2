// Chopping knives.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rules, TUNING, emptyRun, runFor, runUntil, count } = require('./helpers.js');

// Hold a knife's blade in one position for the whole check.
function freeze(knife, h) {
  knife.phase = h < 0.5 ? 'down' : 'up';
  knife.from = 0; knife.until = 1e12; knife.h = h;
}

test('a blade that is down hits you as you pass beneath it', () => {
  const run = emptyRun();
  const gate = run.place.knives(600, [0]);
  freeze(gate.knives[0], 0);
  runFor(run, 3000);
  assert.equal(run.S.over, true);
  assert.equal(run.S.cause, 'knife');
});

test('a blade that is up lets you through', () => {
  const run = emptyRun();
  const gate = run.place.knives(600, [0]);
  freeze(gate.knives[0], 1);
  const events = runFor(run, 3000);
  assert.equal(run.S.over, false);
  assert.equal(count(events, 'knivesPassed'), 1);
});

test('jumping does not help', () => {
  const run = emptyRun();
  const gate = run.place.knives(600, [0]);
  freeze(gate.knives[0], 0);
  runUntil(run, r => gate.d - r.S.dist < 90);
  run.input('jump');
  runFor(run, 600);
  assert.equal(run.S.over, true);
  assert.equal(run.S.cause, 'knife');
});

test('a lane with no knife over it is always safe', () => {
  for (const safe of [-1, 0, 1]) {
    const run = emptyRun();
    const lanes = [-1, 0, 1].filter(L => L !== safe);
    const gate = run.place.knives(600, lanes);
    gate.knives.forEach(k => freeze(k, 0));
    if (safe !== 0) run.input(safe < 0 ? 'left' : 'right');
    runFor(run, 3000);
    assert.equal(run.S.over, false, 'lane ' + safe);
  }
});

test('a chop is a hit like any other: it costs one spare and knocks the knife away', () => {
  const run = emptyRun({ spares: 3 });
  const gate = run.place.knives(600, [0]);
  freeze(gate.knives[0], 0);
  const events = runFor(run, 3000);
  assert.equal(run.S.spares, 2);
  assert.equal(run.S.over, false);
  assert.ok(gate.knives[0].knocked !== null);
  assert.equal(events.filter(e => e.type === 'spareLost' && e.cause === 'knife').length, 1);
});

test('knives chop up and down with an uneven rhythm', () => {
  const run = emptyRun();
  const gate = run.place.knives(1e9, [-1, 0, 1]);
  const chops = { '-1': [], 0: [], 1: [] };
  let low = 0, steps = 0;
  for (let i = 0; i < 120000 / run.T.STEP_MS; i++) {
    run.step();
    for (const e of run.drain()) if (e.type === 'chop') chops[e.lane].push(run.S.t);
    for (const k of gate.knives) { steps++; if (k.h < TUNING.KNIFE_DANGER_BELOW) low++; }
  }
  for (const lane of [-1, 0, 1]) {
    const gaps = chops[lane].slice(1).map((t, i) => t - chops[lane][i]);
    assert.ok(gaps.length > 40, 'chops in two minutes: ' + gaps.length);
    const min = Math.min(...gaps), max = Math.max(...gaps);
    assert.ok(max - min > 500, 'rhythm is uneven: ' + min + ' to ' + max);
    assert.ok(min >= TUNING.KNIFE_UP_MS[0] + TUNING.KNIFE_DOWN_MS[0] + TUNING.KNIFE_RISE_MS + TUNING.KNIFE_CHOP_MS - 20);
  }
  // The three knives are out of step with each other.
  assert.notDeepEqual(chops[-1].slice(0, 5), chops[0].slice(0, 5));
  // Mostly up: the blade is dangerous well under half the time.
  const share = low / steps;
  assert.ok(share > 0.12 && share < 0.4, 'share of time the blade is down: ' + share.toFixed(2));
});

test('when knives cover every lane, getting through is luck', () => {
  let hits = 0, clean = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const run = emptyRun({ seed });
    run.S.rngCourse.seed = seed * 7919;
    run.place.knives(3000 + (seed % 7) * 130, [-1, 0, 1]);
    runFor(run, 12000);
    if (run.S.over) hits++; else clean++;
  }
  assert.ok(hits > 20, 'sometimes it gets you: ' + hits + ' of 200');
  assert.ok(clean > 100, 'usually it does not: ' + clean + ' of 200');
});

test('real runs: first knives are single, later sets can cover every lane', () => {
  let triples = 0, sets = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const run = rules.createRun({ seed, tuning: { MAX_SPARES: 99 } });
    const seen = new Map();
    for (let i = 0; i < 180000 / run.T.STEP_MS; i++) {
      run.S.spares = 99;
      run.step(); run.drain();
      for (const g of run.S.gates) if (!seen.has(g.id)) seen.set(g.id, { n: g.knives.length, t: run.S.t, d: g.d });
    }
    const gates = [...seen.values()];
    assert.ok(gates.length >= 5, 'seed ' + seed + ' had ' + gates.length + ' sets of knives');
    for (let i = 0; i < TUNING.KNIFE_EASY_GATES; i++) assert.equal(gates[i].n, 1, 'seed ' + seed + ' set ' + i);
    const firstArrives = gates[0].d;
    assert.ok(firstArrives >= rules.advance(run.T, 0, TUNING.KNIFE_FIRST_MS[0]), 'not before the first-knife time');
    sets += gates.length;
    triples += gates.filter(g => g.n === 3).length;
  }
  assert.ok(triples > 0 && triples < sets * 0.4, triples + ' of ' + sets + ' sets cover every lane');
});

test('no obstacle sits near a set of knives, so any lane can be chosen', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const run = rules.createRun({ seed, tuning: { MAX_SPARES: 99 } });
    const checked = new Set();
    for (let i = 0; i < 200000 / run.T.STEP_MS; i++) {
      run.S.spares = 99;
      run.step(); run.drain();
      for (const g of run.S.gates) {
        const ahead = g.d - run.S.dist;
        if (checked.has(g.id) || ahead > 1200) continue;
        checked.add(g.id);
        const v = run.S.speed;
        const near = run.S.things.filter(o => o.type === 'obstacle' &&
          o.d > g.d - v * (TUNING.KNIFE_CLEAR_BEFORE_MS - 30) / 1000 &&
          o.d < g.d + v * (TUNING.KNIFE_CLEAR_AFTER_MS - 30) / 1000);
        assert.equal(near.length, 0, 'seed ' + seed + ' knives at ' + Math.round(g.d));
      }
    }
  }
});

test('knives and the dog are kept apart: none from the warning until well after it has left', () => {
  let sets = 0, visits = 0, closest = Infinity;
  for (let seed = 1; seed <= 30; seed++) {
    const run = rules.createRun({ seed, tuning: { MAX_SPARES: 99 } });
    const knifeTimes = [], dogTimes = [];
    let warned = null, arrived = null;
    for (let i = 0; i < 240000 / run.T.STEP_MS; i++) {
      run.S.spares = 99;
      run.step();
      for (const e of run.drain()) {
        if (e.type === 'knivesPassed') knifeTimes.push(run.S.t);
        if (e.type === 'dogWarning') warned = run.S.t;
        if (e.type === 'dogArrive') arrived = run.S.t;
        if (e.type === 'dogLeave') dogTimes.push({ warned, arrived, left: run.S.t });
      }
    }
    sets += knifeTimes.length; visits += dogTimes.length;
    for (const k of knifeTimes) for (const dog of dogTimes) {
      const gap = k < dog.arrived ? dog.arrived - k : k > dog.left ? k - dog.left : 0;
      closest = Math.min(closest, gap);
      assert.ok(gap >= TUNING.KNIFE_DOG_GAP_MS - 60, 'seed ' + seed + ': knives at ' + Math.round(k) + ' ms, dog there from ' +
        Math.round(dog.arrived) + ' to ' + Math.round(dog.left));
      assert.ok(k < dog.warned || k > dog.left, 'seed ' + seed + ': knives during the warning');
    }
  }
  assert.ok(sets > 300 && visits > 100, sets + ' sets of knives, ' + visits + ' visits');
  assert.ok(closest < TUNING.KNIFE_DOG_GAP_MS + 1500, 'the limit is really reached: closest ' + Math.round(closest) + ' ms');
});
