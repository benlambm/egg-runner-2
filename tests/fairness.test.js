// The whole course: spacing, and proof by play that a clean escape exists.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rules, TUNING, runFor, bot } = require('./helpers.js');

const NO_KNIVES = { KNIFE_FIRST_MS: [1e9, 1e9] };
const NO_DOG = { DOG_FIRST_MS: [1e9, 1e9] };

// Every obstacle row a run generates in `ms`, in order.
function courseRows(seed, ms, tuning) {
  const run = rules.createRun({ seed, tuning: Object.assign({ MAX_SPARES: 99 }, tuning) });
  const seen = new Map();
  for (let i = 0; i < ms / run.T.STEP_MS; i++) {
    run.S.spares = 99;
    run.step(); run.drain();
    for (const o of run.S.things) if (o.type === 'obstacle' && !seen.has(o.id)) seen.set(o.id, { d: o.d, lane: o.lane, tall: o.tall, kind: o.kind });
  }
  const rows = [];
  for (const o of [...seen.values()].sort((a, b) => a.d - b.d)) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.d - o.d) < 1) last.items.push(o); else rows.push({ d: o.d, items: [o] });
  }
  return { rows, run };
}

test('the first obstacle leaves a quiet start', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { rows, run } = courseRows(seed, 8000);
    assert.ok(rows[0].d >= rules.advance(run.T, 0, TUNING.FIRST_OBSTACLE_MS) - 1, 'seed ' + seed);
  }
});

test('a row never blocks all three lanes', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { rows } = courseRows(seed, 200000);
    for (const row of rows) {
      assert.ok(row.items.length <= 2, 'seed ' + seed + ' row at ' + row.d);
      assert.equal(new Set(row.items.map(o => o.lane)).size, row.items.length);
    }
  }
});

test('rows are never closer than one jump (with margin) or one reaction time', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { rows, run } = courseRows(seed, 200000);
    const minMs = rules.minGapMs(run.T);
    assert.ok(minMs >= run.T.JUMP_AIR_MS * 1.1, 'gap covers a full jump');
    assert.ok(minMs >= 600, 'gap covers reaction time');
    for (let i = 1; i < rows.length; i++) {
      const v = rules.speedAt(run.T, rows[i].d);       // fastest speed across the gap
      const gapMs = (rows[i].d - rows[i - 1].d) / v * 1000;
      assert.ok(gapMs >= minMs - 1, 'seed ' + seed + ': gap of ' + gapMs.toFixed(0) + ' ms at ' + rows[i].d.toFixed(0));
    }
  }
});

test('if the only way through needs two lane changes, the gap is longer', () => {
  let cases = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { rows, run } = courseRows(seed, 200000, NO_KNIVES);
    const passable = row => [-1, 0, 1].filter(L => !row.items.some(o => o.lane === L && o.tall));
    for (let i = 1; i < rows.length; i++) {
      const from = passable(rows[i - 1]), to = passable(rows[i]);
      const far = from.some(a => Math.min(...to.map(b => Math.abs(a - b))) >= 2);
      if (!far) continue;
      cases++;
      const v = rules.speedAt(run.T, rows[i].d);
      const gapMs = (rows[i].d - rows[i - 1].d) / v * 1000;
      assert.ok(gapMs >= rules.minGapMs(run.T) + TUNING.GAP_TWO_LANE_EXTRA_MS - 1, 'seed ' + seed + ' gap ' + gapMs.toFixed(0));
    }
  }
  assert.ok(cases > 20, 'cases found: ' + cases);
});

test('all five obstacle kinds appear', () => {
  const { rows } = courseRows(3, 120000);
  const kinds = new Set(rows.flatMap(r => r.items.map(o => o.kind)));
  assert.deepEqual([...kinds].sort(), ['blender', 'butter', 'carton', 'knife', 'toaster']);
});

test('eggs are never placed inside a tall obstacle', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const run = rules.createRun({ seed, tuning: { MAX_SPARES: 99 } });
    for (let i = 0; i < 120000 / run.T.STEP_MS; i += 1) {
      run.S.spares = 99;
      run.step(); run.drain();
      if (i % 240) continue;
      const eggs = run.S.things.filter(o => o.type === 'egg');
      const talls = run.S.things.filter(o => o.type === 'obstacle' && o.tall);
      for (const e of eggs) for (const o of talls) {
        assert.ok(!(o.lane === e.lane && Math.abs(o.d - e.d) < TUNING.EGG_CLEAR_AFTER - 1), 'seed ' + seed + ' egg at ' + e.d);
      }
    }
  }
});

test('eggs come alone and in short rows, and some rows end in gold', () => {
  const run = rules.createRun({ seed: 9, tuning: { MAX_SPARES: 99 } });
  const eggs = new Map();
  for (let i = 0; i < 120000 / run.T.STEP_MS; i++) {
    run.S.spares = 99;
    run.step(); run.drain();
    for (const o of run.S.things) if (o.type === 'egg' && !eggs.has(o.id)) eggs.set(o.id, { d: o.d, lane: o.lane, golden: o.golden, row: o.row });
  }
  const all = [...eggs.values()];
  const goldenRows = new Set(all.filter(e => e.row).map(e => e.row));
  assert.ok(all.length > 100, 'eggs in two minutes: ' + all.length);
  assert.ok(goldenRows.size >= 8, 'golden rows: ' + goldenRows.size);
  for (const id of goldenRows) {
    const row = all.filter(e => e.row === id).sort((a, b) => a.d - b.d);
    assert.ok(row.length >= 3 && row.length <= 5);
    assert.equal(row.filter(e => e.golden).length, 1);
    assert.equal(row[row.length - 1].golden, true, 'the golden egg ends the row');
    assert.equal(new Set(row.map(e => e.lane)).size, 1, 'a row stays in one lane');
  }
});

test('proof by play: with no knives, a simple player is never hit (obstacles + dog)', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const run = rules.createRun({ seed, tuning: NO_KNIVES });
    runFor(run, 240000, bot);
    assert.equal(run.S.over, false, 'seed ' + seed + ' ended by ' + run.S.cause + ' at ' + Math.round(run.S.t) + ' ms');
    assert.ok(run.S.dist > 100000);
  }
});

test('proof by play: obstacles alone are never unfair either', () => {
  for (let seed = 100; seed <= 120; seed++) {
    const run = rules.createRun({ seed, tuning: Object.assign({}, NO_KNIVES, NO_DOG) });
    runFor(run, 240000, bot);
    assert.equal(run.S.over, false, 'seed ' + seed + ' at ' + Math.round(run.S.t) + ' ms');
  }
});

test('proof by play: in full runs the only hits are chops under three knives', () => {
  let hits = 0, gatesSeen = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const run = rules.createRun({ seed, tuning: { MAX_SPARES: 99 } });
    run.S.spares = 99;
    let lastGate = null;
    for (let i = 0; i < 240000 / run.T.STEP_MS; i++) {
      run.S.spares = 99;
      bot(run);
      const near = run.S.gates.find(g => Math.abs(g.d - run.S.dist) < 40);
      if (near) lastGate = near;
      run.step();
      for (const e of run.drain()) {
        if (e.type === 'knivesPassed') gatesSeen++;
        if (e.type !== 'spareLost') continue;
        hits++;
        assert.equal(e.cause, 'knife', 'seed ' + seed + ' hit by ' + e.cause + ' at ' + Math.round(run.S.t));
        assert.equal(lastGate.knives.length, 3, 'seed ' + seed + ': chopped where a free lane existed');
      }
    }
  }
  assert.ok(gatesSeen > 300);
  assert.ok(hits > 10, 'chops happen: ' + hits);
});

test('the same seed always lays out the same course', () => {
  const a = courseRows(42, 60000).rows, b = courseRows(42, 60000).rows, c = courseRows(43, 60000).rows;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});
