// The dog.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rules, TUNING, emptyRun, runFor, runUntil, count, bot } = require('./helpers.js');

// A run with only a dog visit on it, arriving on `side` after a short wait.
function dogRun(side, opts) {
  const run = emptyRun(opts);
  const visit = run.place.dog(1500, side);
  return { run, visit };
}
const untilWindup = run => runUntil(run, r => r.S.dog.phase === 'windup');

test('paw prints and a bark come about a second before the dog', () => {
  const { run } = dogRun(1);
  const events = runUntil(run, r => r.S.dog.state === 'warning');
  assert.equal(count(events, 'dogWarning'), 1);
  const warnedAt = run.S.t;
  runUntil(run, r => r.S.dog.state === 'alongside');
  assert.ok(Math.abs(run.S.t - warnedAt - TUNING.DOG_WARN_MS) < 60, 'warning lasted ' + (run.S.t - warnedAt));
});

test('it runs alongside for ten seconds', () => {
  const { run } = dogRun(-1);
  run.input('right');                                  // far side: safe throughout
  runUntil(run, r => r.S.dog.state === 'alongside');
  const arrived = run.S.t;
  runUntil(run, r => r.S.dog.state !== 'alongside');
  assert.ok(Math.abs(run.S.t - arrived - 10000) < 30, 'stayed ' + (run.S.t - arrived));
  assert.equal(TUNING.DOG_STAY_MS, 10000);
});

test('it snaps every couple of seconds, each time after a visible wind-up', () => {
  const { run } = dogRun(1);
  run.input('left');
  const times = [];
  let windupAt = null;
  for (let i = 0; i < 14000 / run.T.STEP_MS && !run.S.over; i++) {
    run.step();
    for (const e of run.drain()) {
      if (e.type === 'dogWindup') windupAt = run.S.t;
      if (e.type === 'dogSnap') {
        assert.ok(windupAt !== null, 'a wind-up came first');
        assert.ok(Math.abs(run.S.t - windupAt - TUNING.DOG_WINDUP_MS) < 20);
        times.push(run.S.t); windupAt = null;
      }
    }
  }
  assert.ok(times.length >= 4 && times.length <= 6, 'snaps: ' + times.length);
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    assert.ok(gap >= 1500 && gap <= 2500, 'gap between snaps ' + gap);
  }
});

for (const side of [-1, 1]) {
  const name = side < 0 ? 'left' : 'right';
  const dodge = side < 0 ? 'right' : 'left';

  test('dog on the ' + name + ': caught on the floor on its side', () => {
    const { run } = dogRun(side, { spares: 1 });
    run.input(name);
    const events = runUntil(run, r => r.S.spares === 0);
    assert.equal(events.filter(e => e.type === 'dogSnap' && e.caught).length, 1);
    assert.equal(events.filter(e => e.type === 'spareLost' && e.cause === 'dog').length, 1);
    assert.equal(run.S.over, false);
  });

  test('dog on the ' + name + ': it eats you if you have no spares', () => {
    const { run } = dogRun(side);
    run.input(name);
    runFor(run, 12000);
    assert.equal(run.S.over, true);
    assert.equal(run.S.cause, 'dog');
  });

  test('dog on the ' + name + ': its snap reaches the middle lane too', () => {
    const { run } = dogRun(side, { spares: 1 });
    const events = runUntil(run, r => r.S.spares === 0);      // standing in the middle lane
    assert.equal(run.S.player.lane, 0);
    assert.equal(events.filter(e => e.type === 'dogSnap' && e.caught).length, 1);
    assert.equal(events.filter(e => e.type === 'spareLost' && e.cause === 'dog').length, 1);
  });

  test('dog on the ' + name + ': in the middle lane with no spares it eats you', () => {
    const { run } = dogRun(side);
    runFor(run, 12000);
    assert.equal(run.S.over, true);
    assert.equal(run.S.cause, 'dog');
  });

  test('dog on the ' + name + ': safe in the air in the middle lane', () => {
    const { run } = dogRun(side);
    const events = runFor(run, 16000, r => {
      const dog = r.S.dog;
      if (dog.phase === 'windup' && r.S.player.grounded && dog.phaseUntil - r.S.t < 200) r.input('jump');
    });
    assert.equal(run.S.over, false);
    assert.equal(events.filter(e => e.type === 'dogSnap' && e.caught).length, 0);
  });

  test('dog on the ' + name + ': the far lane is the only safe place to stand', () => {
    const { run } = dogRun(side);
    run.input(dodge);
    runFor(run, 16000);
    assert.equal(run.S.over, false);
  });

  test('dog on the ' + name + ': safe in the air when it snaps', () => {
    const { run } = dogRun(side);
    run.input(name);
    const events = runFor(run, 16000, r => {
      const dog = r.S.dog;
      if (dog.phase === 'windup' && r.S.player.grounded && dog.phaseUntil - r.S.t < 200) r.input('jump');
    });
    assert.equal(run.S.over, false);
    assert.ok(count(events, 'dogSnap') >= 4);
    assert.equal(events.filter(e => e.type === 'dogSnap' && e.caught).length, 0);
  });
}

test('a jump that has already landed does not save you', () => {
  const { run } = dogRun(1);
  run.input('right');
  untilWindup(run);
  // Jump far too early for the next snap.
  runUntil(run, r => r.S.dog.phase === 'idle');
  run.input('jump');
  runFor(run, 12000);
  assert.equal(run.S.over, true);
});

test('the dog cannot hurt you while you blink', () => {
  const { run } = dogRun(1, { spares: 1 });
  run.input('right');
  untilWindup(run);
  run.S.player.blinkUntil = run.S.t + 1000;
  const events = runUntil(run, r => r.S.dog.phase === 'snap');
  assert.equal(events.filter(e => e.type === 'dogSnap' && e.caught).length, 0);
  assert.equal(run.S.spares, 1);
});

test('in real runs the dog never comes early', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const run = rules.createRun({ seed, spares: 5, tuning: { MAX_SPARES: 99 } });
    run.S.spares = 99;
    runUntil(run, r => r.S.dog.state !== 'away', 90000);
    assert.ok(run.S.t >= TUNING.DOG_FIRST_MS[0] - TUNING.DOG_WARN_MS - 50, 'seed ' + seed + ' warned at ' + run.S.t);
    assert.ok(run.S.t <= TUNING.DOG_FIRST_MS[1] + 6000, 'seed ' + seed + ' first dog at ' + run.S.t);
  }
});

test('no obstacle ever arrives around a snap, so there is always a way out', () => {
  let snaps = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const run = rules.createRun({ seed, tuning: { MAX_SPARES: 99 } });
    run.S.spares = 99;
    for (let i = 0; i < 200000 / run.T.STEP_MS; i++) {
      run.S.spares = 99;
      run.step();
      for (const e of run.drain()) {
        if (e.type !== 'dogWindup') continue;
        snaps++;
        // From now until well after the snap, nothing but eggs may reach the egg.
        const until = rules.advance(run.T, run.S.dist, TUNING.DOG_WINDUP_MS + TUNING.DOG_CLEAR_AFTER_MS - 20);
        const inTheWay = run.S.things.filter(o => o.type === 'obstacle' && !o.knocked &&
          o.d > run.S.dist - 40 && o.d < until);
        assert.equal(inTheWay.length, 0, 'seed ' + seed + ' at ' + Math.round(run.S.t) + ' ms');
        const knives = run.S.gates.filter(g => g.d > run.S.dist - 40 && g.d < until);
        assert.equal(knives.length, 0, 'knives during a snap, seed ' + seed);
      }
    }
  }
  assert.ok(snaps > 300, 'snaps checked: ' + snaps);
});

test('the snap reaches exactly two lanes: the dog\'s lane and the middle', () => {
  assert.equal(TUNING.DOG_BITE_LANES, 2);
  for (const side of [-1, 1]) {
    for (const lane of [-1, 0, 1]) {
      const run = emptyRun({ spares: 1 });
      run.place.dog(1500, side);
      if (lane !== 0) run.input(lane < 0 ? 'left' : 'right');
      runUntil(run, r => r.S.dog.phase === 'snap');
      const bitten = run.S.spares === 0;
      assert.equal(bitten, lane !== -side, 'dog on ' + side + ', egg in lane ' + lane);
    }
  }
});

// ── one press always answers a wind-up ───────────────────────────────────

// How many steps a dog-only run takes to reach its first wind-up.
const STEPS_TO_WINDUP = (() => {
  const { run } = dogRun(1);
  let n = 0;
  while (run.S.dog.phase !== 'windup') { run.step(); n++; }
  return n;
})();
const WINDUP_STEPS = Math.round(TUNING.DOG_WINDUP_MS / TUNING.STEP_MS);

test('a jump pressed at any moment of a wind-up saves you, even from the middle of another jump', () => {
  // The egg may already be in the air when the wind-up starts (it has just
  // jumped a flat obstacle, say). A press made then used to be forgotten if
  // it came more than a moment before landing, and the dog caught the egg
  // as it touched down: the quicker the player, the worse it went.
  let fromTheAir = 0;
  for (let earlier = 0; earlier <= 72; earlier += 4) {        // an earlier jump, begun this many steps before the wind-up (0 = none)
    for (let into = 0; into < WINDUP_STEPS; into += 5) {      // the answering press, this many steps into the wind-up
      const { run } = dogRun(1);
      run.input('right');                                     // the dog's own lane
      const events = [];
      for (let i = 0; i < STEPS_TO_WINDUP + WINDUP_STEPS + 5; i++) {
        if (earlier && i === STEPS_TO_WINDUP - earlier) run.input('jump');
        if (i === STEPS_TO_WINDUP + into) { if (!run.S.player.grounded) fromTheAir++; run.input('jump'); }
        run.step();
        events.push(...run.drain());
      }
      const snap = events.find(e => e.type === 'dogSnap');
      assert.ok(snap, 'it snapped');
      assert.equal(snap.caught, false, 'earlier jump ' + earlier + ' steps before the wind-up, press ' + into + ' steps into it');
      assert.equal(run.S.over, false);
    }
  }
  assert.ok(fromTheAir > 40, 'presses made in the air: ' + fromTheAir);
});

test('a press made in the air before the wind-up began gets no extra time', () => {
  // Jump, press again a third of a second before landing (too early to
  // count), and only then does the dog start to wind up. The egg lands
  // during the wind-up and is still on the floor at the snap.
  const { run } = dogRun(1);
  run.input('right');
  const events = [];
  for (let i = 0; i < STEPS_TO_WINDUP + WINDUP_STEPS + 5 && !run.S.over; i++) {
    if (i === STEPS_TO_WINDUP - 40 || i === STEPS_TO_WINDUP - 1) run.input('jump');
    run.step();
    events.push(...run.drain());
  }
  assert.equal(run.S.player.jumps, 1, 'the early press did not become a second jump');
  assert.equal(events.find(e => e.type === 'dogSnap').caught, true);
});

test('in real runs, answering every wind-up with one jump press is always enough, however quick the player', () => {
  // The simple player deals with the obstacles and leaves the dog alone.
  // The dog is answered by one jump press a fixed time after each wind-up
  // begins, whatever the egg is doing at that moment.
  let snaps = 0, fromTheAir = 0;
  for (const reactMs of [0, 100, 200, 300, 400]) {
    for (let seed = 1; seed <= 5; seed++) {
      const run = rules.createRun({ seed, tuning: { KNIFE_FIRST_MS: [1e9, 1e9] } });
      let pressAt = null;
      for (let i = 0; i < 220000 / run.T.STEP_MS && !run.S.over; i++) {
        bot(run, true);
        if (pressAt !== null && run.S.t >= pressAt) {
          if (!run.S.player.grounded) fromTheAir++;
          run.input('jump'); pressAt = null;
        }
        run.step();
        for (const e of run.drain()) {
          if (e.type === 'dogWindup') pressAt = run.S.t + reactMs;
          if (e.type === 'dogSnap') { snaps++; assert.equal(e.caught, false, 'reaction ' + reactMs + ' ms, seed ' + seed + ', ' + Math.round(run.S.t) + ' ms in'); }
        }
      }
      assert.equal(run.S.over, false, 'reaction ' + reactMs + ' ms, seed ' + seed + ': ' + run.S.cause + ' at ' + Math.round(run.S.t));
    }
  }
  assert.ok(snaps > 400, 'snaps answered: ' + snaps);
  assert.ok(fromTheAir > 5, 'answered from the air: ' + fromTheAir);
});
