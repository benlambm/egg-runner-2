// Fairness, checked harder than the bot can: from EVERY position a careful
// player could be in, there is still a way out.
//
// These use the "grid player" search in helpers.js. It is a clumsy player
// (one press every fifth of a second at most), and the search follows every
// position that player could reach without being hit, not just one
// favourite route. If any of those positions ever has no escape, the check
// names the seed, the time and what was on the track.
//
// The default run takes a few seconds. For a much longer soak:
//     ER_LONG=1 npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rules, TUNING, bot, runFor, copyRun, gridSearch } = require('./helpers.js');

const LONG = !!process.env.ER_LONG;
const NO_KNIVES = { KNIFE_FIRST_MS: [1e9, 1e9] };
const say = deadEnds => deadEnds.length + ' dead end(s), first: ' + JSON.stringify(deadEnds[0]);

test('from every careful position there is a way out: obstacles and the dog', () => {
  let stockTakes = 0, positions = 0;
  for (let seed = 1; seed <= (LONG ? 150 : 8); seed++) {
    const found = gridSearch({ seed, tuning: NO_KNIVES, ms: 240000 });
    assert.equal(found.deadEnds.length, 0, say(found.deadEnds));
    assert.ok(found.alive > 0);
    stockTakes += found.stockTakes; positions = Math.max(positions, found.positions);
  }
  // The search really did look at many positions at many rows.
  assert.ok(stockTakes > 1200, 'stock-takes: ' + stockTakes);
  assert.ok(positions >= 15, 'most positions followed at once: ' + positions);
});

test('…and with knives: a lane with no knife over it can always be reached in time', () => {
  for (let seed = 1; seed <= (LONG ? 100 : 6); seed++) {
    const found = gridSearch({ seed, ms: 240000, knives: 'sure' });
    assert.equal(found.deadEnds.length, 0, say(found.deadEnds));
  }
});

test('the dog: the far lane alone is always a way out, even from two lanes away', () => {
  // Here being in the air does NOT save the player, so every snap has to be
  // met standing in the far lane, whatever rows come just before and after.
  for (let seed = 1; seed <= (LONG ? 100 : 6); seed++) {
    const found = gridSearch({ seed, tuning: NO_KNIVES, ms: 240000, farLaneOnly: true });
    assert.equal(found.deadEnds.length, 0, say(found.deadEnds));
  }
});

test('the dog: a snap that reaches one lane, or all three, still leaves a way out', () => {
  // One lane: the middle is safe too. Three lanes: only a jump saves you.
  for (let seed = 1; seed <= (LONG ? 40 : 3); seed++) {
    const one = gridSearch({ seed, tuning: Object.assign({ DOG_BITE_LANES: 1 }, NO_KNIVES), ms: 240000 });
    assert.equal(one.deadEnds.length, 0, 'one lane: ' + say(one.deadEnds));
  }
  // With no safe lane the player must be free to re-jump the instant it
  // lands, so this one is checked with a quicker beat, and by the bot.
  for (let seed = 1; seed <= (LONG ? 20 : 1); seed++) {
    const three = gridSearch({ seed, tuning: Object.assign({ DOG_BITE_LANES: 3 }, NO_KNIVES), ms: LONG ? 240000 : 90000, slotMs: 100 });
    assert.equal(three.deadEnds.length, 0, 'three lanes: ' + say(three.deadEnds));
  }
  for (let seed = 1; seed <= 6; seed++) {
    const run = rules.createRun({ seed, tuning: Object.assign({ DOG_BITE_LANES: 3 }, NO_KNIVES) });
    runFor(run, 150000, bot);
    assert.equal(run.S.over, false, 'three lanes, bot, seed ' + seed + ': ' + run.S.cause + ' at ' + Math.round(run.S.t));
  }
});

test('a way out exists at top speed from the very first second, and with a gentler ramp', () => {
  const flatOut = gridSearch({ seed: 4, tuning: Object.assign({ START_SPEED: TUNING.TOP_SPEED }, NO_KNIVES), ms: 120000 });
  assert.equal(flatOut.deadEnds.length, 0, say(flatOut.deadEnds));
  const gentle = gridSearch({ seed: 4, tuning: Object.assign({ SPEED_GAIN: TUNING.SPEED_GAIN / 2 }, NO_KNIVES), ms: 120000 });
  assert.equal(gentle.deadEnds.length, 0, say(gentle.deadEnds));
});

test('a slower player, one press every 300 ms, still always has a way out', () => {
  // This is what first went wrong for slower players: a row right after a
  // snap that needed two lane changes. (At 350 ms a few dead ends remain,
  // all of them a single step that has to be made within about 300 ms.)
  for (let seed = 1; seed <= (LONG ? 100 : 8); seed++) {
    const found = gridSearch({ seed, tuning: NO_KNIVES, ms: 240000, slotMs: 300 });
    assert.equal(found.deadEnds.length, 0, say(found.deadEnds));
  }
});

test('a quicker player is no worse off', { skip: !LONG && 'set ER_LONG=1 to run' }, () => {
  for (const slotMs of [100, 150]) {
    for (let seed = 1; seed <= 30; seed++) {
      const found = gridSearch({ seed, tuning: NO_KNIVES, ms: 240000, slotMs });
      assert.equal(found.deadEnds.length, 0, slotMs + ' ms beat: ' + say(found.deadEnds));
    }
  }
});

// ── the search itself is checked, so it cannot pass for the wrong reason ──

test('the way through that the search finds really works in a normal run', () => {
  for (const seed of [2, 9]) {
    const found = gridSearch({ seed, tuning: NO_KNIVES, ms: 200000 });
    assert.equal(found.path.length, 1000);
    const run = rules.createRun({ seed, tuning: NO_KNIVES });
    const steps = Math.round(found.slotMs / run.T.STEP_MS);
    let pressed = 0;
    for (const press of found.path) {
      if (press) { run.input(press); pressed++; }
      for (let i = 0; i < steps; i++) run.step();
      run.drain();
    }
    assert.equal(run.S.over, false, 'seed ' + seed + ': the found route was hit by ' + run.S.cause + ' at ' + Math.round(run.S.t));
    assert.ok(Math.abs(run.S.t - 200000) < 1);
    assert.ok(pressed > 50, 'it had to press things: ' + pressed);
  }
});

test('the search does find dead ends when a course is made unfair on purpose', () => {
  // Rows far closer together than one jump.
  const cramped = gridSearch({ seed: 3, ms: 60000, tuning: Object.assign({ GAP_JUMP_SAFETY: 0.2, GAP_REACTION_MS: 120, GAP_EXTRA_START_MS: [0, 0], GAP_EXTRA_TOP_MS: [0, 0], GAP_TWO_LANE_EXTRA_MS: 0, DOUBLE_ROW_CHANCE_START: 0.9 }, NO_KNIVES) });
  assert.ok(cramped.deadEnds.length > 0, 'cramped rows went unnoticed');
  // A wind-up too short to answer, from a snap that reaches every lane.
  let caught = 0;
  for (let seed = 1; seed <= 3; seed++) {
    caught += gridSearch({ seed, ms: 60000, tuning: Object.assign({ DOG_WINDUP_MS: 100, DOG_BITE_LANES: 3, DOG_FIRST_MS: [5000, 6000] }, NO_KNIVES) }).deadEnds.length;
  }
  assert.ok(caught > 0, 'a wind-up nobody could answer went unnoticed');
});

test('a copied run plays out exactly like the original', () => {
  const tuning = { MAX_SPARES: 9 };
  const a = rules.createRun({ seed: 11, tuning, spares: 9 });
  runFor(a, 47000, bot);
  const b = copyRun(a, tuning);
  for (let i = 0; i < 60000 / a.T.STEP_MS; i++) {
    for (const run of [a, b]) { if (i % 5 === 0) bot(run); run.step(); run.drain(); }
  }
  assert.ok(a.S.t > 100000);
  assert.deepEqual(JSON.parse(JSON.stringify(b.S)), JSON.parse(JSON.stringify(a.S)));
});

// ── golden chains ────────────────────────────────────────────────────────

test('every golden chain can really be collected, egg by egg, without being hit', () => {
  // For each chain a run lays out, start a second or so before its first
  // egg and ask whether the grid player can take every egg, end with the
  // golden one, and still be alive afterwards. Chains run through flat
  // obstacles, dog visits and the stretch before knives.
  let chains = 0, withObstacles = 0;
  for (let seed = 1; seed <= (LONG ? 100 : 12); seed++) {
    const master = rules.createRun({ seed });
    const M = master.S, done = new Set();
    for (let i = 0; i < 240000 / master.T.STEP_MS; i++) {
      M.player.blinkUntil = 1e15;                    // a ghost: it only reads the course
      master.step(); master.drain();
      if (i % 24) continue;
      for (const egg of M.things) {
        if (egg.type !== 'egg' || !egg.row || done.has(egg.row)) continue;
        const chain = M.things.filter(o => o.type === 'egg' && o.row === egg.row).sort((x, y) => x.d - y.d);
        const first = chain[0], last = chain[chain.length - 1];
        if (first.d - M.dist > M.speed * 1.5) continue;
        done.add(egg.row);
        chains++;
        if (M.things.some(o => o.type === 'obstacle' && o.lane === first.lane && o.d > first.d && o.d < last.d)) withObstacles++;
        const ms = (last.d - M.dist) / M.speed * 1000 + 1200;
        const found = gridSearch({ run: copyRun(master, {}), ms, collect: egg.row, knives: 'sure' });
        assert.ok(found.earned, 'seed ' + seed + ': the chain of ' + chain.length + ' in lane ' + first.lane + ' at ' + Math.round(first.d) +
          ' (' + Math.round(M.t) + ' ms in) cannot be collected');
      }
    }
  }
  assert.ok(chains >= 100, 'chains checked: ' + chains);
  assert.ok(withObstacles >= 10, 'chains with a flat obstacle in their lane: ' + withObstacles);
});

test('the chain check does notice a chain that cannot be collected', () => {
  const build = blocked => {
    const run = rules.createRun({ seed: 1, empty: true });
    const eggs = run.place.eggs(0, 1200, 6, true);
    // Two toasters standing right around the third egg: it cannot be reached.
    if (blocked) for (const off of [-20, 20]) run.place.obstacle('toaster', 0, eggs[2].d + off);
    return { run, row: eggs[0].row };
  };
  const open = build(false), shut = build(true);
  assert.equal(gridSearch({ run: open.run, ms: 6000, collect: open.row }).earned, true);
  assert.equal(gridSearch({ run: shut.run, ms: 6000, collect: shut.row }).earned, false);
});
