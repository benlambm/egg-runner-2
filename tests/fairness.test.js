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
  const seen = new Map(), snaps = new Map();
  for (let i = 0; i < ms / run.T.STEP_MS; i++) {
    run.S.spares = 99;
    run.step(); run.drain();
    for (const o of run.S.things) if (o.type === 'obstacle' && !seen.has(o.id)) seen.set(o.id, { d: o.d, lane: o.lane, tall: o.tall, kind: o.kind });
    // Each planned snap, with the stretch of track kept clear around it.
    for (const visit of run.S.dog.visits) for (const snap of visit.snaps) snaps.set(snap.windupD, snap);
  }
  const rows = [];
  for (const o of [...seen.values()].sort((a, b) => a.d - b.d)) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.d - o.d) < 1) last.items.push(o); else rows.push({ d: o.d, items: [o] });
  }
  return { rows, run, snaps: [...snaps.values()] };
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

test('the first row after a dog snap gets two-lane room when it leaves only one outer lane open', () => {
  // Around a snap the player may be in any lane: standing in the far lane,
  // or jumping in another. A row that leaves only one outer lane open then
  // puts somebody two lanes from the way through. It used to come as soon as
  // the dog's clear stretch ended, however many lanes had to be crossed.
  let cases = 0, others = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { rows, snaps, run } = courseRows(seed, 240000, NO_KNIVES);
    for (const snap of snaps) {
      const next = rows.find(row => row.d > snap.to);
      if (!next || rows.some(row => row.d >= snap.from && row.d <= snap.to)) continue;
      const open = [-1, 0, 1].filter(L => !next.items.some(o => o.lane === L && o.tall));
      const ms = (next.d - snap.to) / rules.speedAt(run.T, snap.to) * 1000;
      if (open.length === 1 && open[0] !== 0) {
        cases++;
        assert.ok(ms >= TUNING.GAP_TWO_LANE_EXTRA_MS - 1, 'seed ' + seed + ': only lane ' + open[0] + ' open ' + Math.round(ms) +
          ' ms after the clear stretch at ' + Math.round(snap.to));
      } else if (ms < 50) others++;
    }
  }
  assert.ok(cases > 30, 'cases: ' + cases);
  assert.ok(others > 30, 'other rows still follow a snap closely: ' + others);
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

// Every group of eggs a run lays out in `ms`: eggs in one lane, one spacing
// apart. Also every tall obstacle and every set of knives it lays out.
function eggGroups(seed, ms) {
  const run = rules.createRun({ seed, tuning: { MAX_SPARES: 99 } });
  const eggs = new Map(), talls = new Map(), knives = new Map();
  for (let i = 0; i < ms / run.T.STEP_MS; i++) {
    run.S.spares = 99;
    run.step(); run.drain();
    for (const o of run.S.things) {
      if (o.type === 'egg' && !eggs.has(o.id)) eggs.set(o.id, { d: o.d, lane: o.lane, golden: o.golden, row: o.row });
      if (o.type === 'obstacle' && o.tall && !talls.has(o.id)) talls.set(o.id, { d: o.d, lane: o.lane });
    }
    for (const g of run.S.gates) if (!knives.has(g.id)) knives.set(g.id, { d: g.d });
  }
  const groups = [];
  for (const e of [...eggs.values()].sort((a, b) => a.lane - b.lane || a.d - b.d)) {
    const last = groups[groups.length - 1];
    if (last && last.lane === e.lane && Math.abs(e.d - last.eggs[last.eggs.length - 1].d - TUNING.EGG_SPACING) < 1) last.eggs.push(e);
    else groups.push({ lane: e.lane, eggs: [e] });
  }
  return { groups, run, talls: [...talls.values()], knives: [...knives.values()] };
}

test('eggs never lead into a tall obstacle: there is time to step in before the first egg and out after the last', () => {
  // Whole eggs are treasure, never hazards. A tall obstacle in the eggs' own
  // lane must be far enough away, measured as travel TIME so that it holds
  // at top speed too. When the middle lane is blocked at the same spot the
  // step is two lanes, and the time allowed is longer.
  let near = 0, twoLanes = 0, least = Infinity;
  for (let seed = 1; seed <= 30; seed++) {
    const { groups, talls, run } = eggGroups(seed, 240000);
    for (const g of groups) {
      const first = g.eggs[0], last = g.eggs[g.eggs.length - 1];
      for (const o of talls) {
        if (o.lane !== g.lane || o.d < first.d - 1500 || o.d > last.d + 1500) continue;
        near++;
        const two = g.lane !== 0 && talls.some(x => x.lane === 0 && Math.abs(x.d - o.d) < 1);
        if (two) twoLanes++;
        const where = 'seed ' + seed + ', eggs in lane ' + g.lane + ' from ' + Math.round(first.d) + ' to ' + Math.round(last.d) + ', tall obstacle at ' + Math.round(o.d);
        assert.ok(o.d < first.d || o.d > last.d, where + ': inside the row');
        const before = o.d < first.d;
        const ms = before ? (first.d - o.d) / rules.speedAt(run.T, first.d) * 1000 : (o.d - last.d) / rules.speedAt(run.T, last.d) * 1000;
        const need = (before ? TUNING.EGG_CLEAR_BEFORE_MS : TUNING.EGG_CLEAR_AFTER_MS) + (two ? TUNING.GAP_TWO_LANE_EXTRA_MS : 0);
        assert.ok(ms >= need - 1, where + ': only ' + Math.round(ms) + ' ms ' + (before ? 'to step in' : 'to step out') + ', need ' + need);
        if (!before) { assert.ok(o.d - last.d >= TUNING.EGG_CLEAR_AFTER - 1, where); least = Math.min(least, ms); }
      }
    }
  }
  assert.ok(near > 2000 && twoLanes > 100, 'cases: ' + near + ', needing two lanes: ' + twoLanes);
  assert.ok(least < 600, 'the limit is really reached: closest ' + Math.round(least) + ' ms');
});

test('eggs are never placed near knives', () => {
  let sets = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const { groups, knives } = eggGroups(seed, 200000);
    sets += knives.length;
    for (const g of groups) for (const egg of g.eggs) for (const k of knives) {
      assert.ok(Math.abs(egg.d - k.d) >= 259, 'seed ' + seed + ': an egg ' + Math.round(Math.abs(egg.d - k.d)) + ' units from knives');
    }
  }
  assert.ok(sets > 100, 'sets of knives seen: ' + sets);
});

test('eggs come alone, in short rows, and in longer chains', () => {
  const { groups } = eggGroups(9, 180000);
  const sizes = groups.map(g => g.eggs.length);
  assert.ok(sizes.filter(n => n === 1).length > 10, 'single eggs');
  assert.ok(sizes.filter(n => n >= TUNING.EGG_ROW_LENGTH[0] && n <= TUNING.EGG_ROW_LENGTH[1]).length > 10, 'short rows');
  assert.ok(sizes.filter(n => n >= TUNING.GOLDEN_CHAIN_LENGTH[0]).length >= 3, 'longer chains');
  assert.ok(Math.max(...sizes) <= TUNING.GOLDEN_CHAIN_LENGTH[1]);
});

test('a golden egg only ever comes at the end of a longer chain of whole eggs', () => {
  let chains = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { groups } = eggGroups(seed, 180000);
    for (const g of groups) {
      const golden = g.eggs.filter(e => e.golden);
      if (g.eggs.length < TUNING.GOLDEN_CHAIN_LENGTH[0]) {
        assert.equal(golden.length, 0, 'seed ' + seed + ': a golden egg in a group of ' + g.eggs.length);
        continue;
      }
      chains++;
      assert.ok(g.eggs.length >= 6 && g.eggs.length <= TUNING.GOLDEN_CHAIN_LENGTH[1], 'chain of ' + g.eggs.length);
      assert.equal(golden.length, 1, 'seed ' + seed + ': a chain has exactly one golden egg');
      assert.equal(g.eggs[g.eggs.length - 1].golden, true, 'the golden egg ends the chain');
      assert.equal(g.eggs.filter(e => !e.golden).length, g.eggs.length - 1, 'every other egg in it is a whole egg');
      assert.equal(new Set(g.eggs.map(e => e.row)).size, 1, 'the whole chain is one row');
    }
  }
  assert.ok(chains > 100, 'chains checked: ' + chains);
});

test('golden eggs are rare at the beginning and more common later', () => {
  let early = 0, late = 0, first = Infinity;
  const seeds = 40;
  for (let seed = 1; seed <= seeds; seed++) {
    const { groups, run } = eggGroups(seed, 240000);
    const minute = rules.advance(run.T, 0, 60000), lateFrom = rules.advance(run.T, 0, 180000);
    for (const g of groups) {
      const gold = g.eggs.find(e => e.golden);
      if (!gold) continue;
      first = Math.min(first, g.eggs[0].d);
      if (gold.d < minute) early++;
      if (gold.d >= lateFrom && gold.d < rules.advance(run.T, 0, 240000)) late++;
    }
    assert.ok(first >= rules.advance(run.T, 0, TUNING.GOLDEN_FIRST_MS) - 1, 'seed ' + seed + ': no golden chain before the first-golden time');
  }
  const earlyPerMin = early / seeds, latePerMin = late / seeds;
  assert.ok(earlyPerMin <= 2.5, 'golden eggs in the first minute: ' + earlyPerMin.toFixed(2));
  assert.ok(earlyPerMin >= 0.4, 'but not absent: ' + earlyPerMin.toFixed(2));
  assert.ok(latePerMin > earlyPerMin * 1.5, 'later ' + latePerMin.toFixed(2) + ' per minute against ' + earlyPerMin.toFixed(2) + ' early');
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
