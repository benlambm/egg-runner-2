// Shared helpers for the rule checks.
'use strict';
const rules = require('../js/rules.js');
const TUNING = require('../js/tuning.js');

// An empty track: nothing is generated, the check places its own things.
function emptyRun(opts) {
  return rules.createRun(Object.assign({ seed: 1, empty: true }, opts || {}));
}

// Step the run for `ms`, calling each(run) before every step. Returns every
// event that happened.
function runFor(run, ms, each) {
  const events = [];
  const steps = Math.round(ms / run.T.STEP_MS);
  for (let i = 0; i < steps && !run.S.over; i++) {
    if (each) each(run);
    run.step();
    events.push(...run.drain());
  }
  events.push(...run.drain());
  return events;
}

// Step until test(run) is true (or `maxMs` passes). Returns the events.
function runUntil(run, test, maxMs) {
  const events = [];
  const steps = Math.round((maxMs || 60000) / run.T.STEP_MS);
  for (let i = 0; i < steps && !run.S.over && !test(run); i++) {
    run.step();
    events.push(...run.drain());
  }
  return events;
}

const count = (events, type) => events.filter(e => e.type === type).length;

// A simple player that only uses what is on screen. It dodges, jumps flat
// obstacles, jumps dog snaps and prefers lanes with no knife. If this bot is
// never hit, a clean escape always existed.
function bot(run, leaveTheDog) {
  const { S, T } = run, p = S.player;
  const touch = o => o.half + T.PLAYER_HALF_DEPTH;
  const obs = S.things.filter(o => o.type === 'obstacle' && !o.knocked);
  const beside = L => obs.some(o => o.lane === L && Math.abs(o.d - S.dist) <= touch(o) + 6);
  const ahead = obs.filter(o => o.d - S.dist > touch(o) + 6).sort((a, b) => a.d - b.d);
  const rowD = ahead.length ? ahead[0].d : Infinity;
  const row = ahead.filter(o => Math.abs(o.d - rowD) < 1);
  const gate = S.gates.find(g => g.d - S.dist > -T.KNIFE_HALF_DEPTH && g.d < rowD);

  const cost = L => {
    let c = Math.abs(L - p.lane);
    // The nearest danger decides: knives first if they come before the row.
    if (gate) { if (gate.knives.some(k => k.lane === L && !k.knocked)) c += 10; return c; }
    const o = row.find(r => r.lane === L);
    if (o) c += o.tall ? 100 : 0.4;
    return c;
  };
  const target = [-1, 0, 1].reduce((best, L) => (cost(L) < cost(best) ? L : best), p.lane);
  if (target !== p.lane) {
    const next = p.lane + Math.sign(target - p.lane);
    if (!beside(next)) run.input(next < p.lane ? 'left' : 'right');
  }
  // Jump a flat obstacle just before it arrives.
  const mine = row.find(r => r.lane === p.lane && !r.tall);
  if (mine && p.grounded && mine.d - S.dist <= touch(mine) + S.speed * 0.07) run.input('jump');
  // Jump the dog's snap (unless the check wants to handle the dog itself).
  if (leaveTheDog) return;
  const dog = S.dog;
  const lanesAway = (dog.side - p.lane) * dog.side;       // 0 = the dog's lane, 2 = the far lane
  if (dog.state === 'alongside' && dog.phase === 'windup' && lanesAway < T.DOG_BITE_LANES &&
      p.grounded && dog.phaseUntil - S.t <= 250) run.input('jump');
}

// A second copy of a run, taken at this moment, that can be played on
// separately. A run's state (run.S) is plain data, so the copy is simply a
// fresh run that is handed a copy of that data. `tuning` must be the same
// overrides the original was made with.
function copyRun(run, tuning) {
  const copy = rules.createRun({ seed: 0, empty: true, tuning });
  const data = JSON.parse(JSON.stringify(run.S));
  for (const key of Object.keys(data)) copy.S[key] = data[key];
  return copy;
}

// ── a stronger proof than the bot: the grid player ─────────────────────
// The bot above has one set of habits, so it only proves that ITS way
// through is safe. This search asks the wider question: from EVERY position
// a careful player could be in, is there still a way out?
//
// The "grid player" is deliberately clumsy. It may press at most one thing
// every `slotMs` (a fifth of a second unless told otherwise), and only on
// that beat, so it can never double-tap or time anything finely. The search
// keeps every position such a player could have reached without being hit
// (which lane, where in a jump, whether a flat obstacle is already touching)
// and plays each one forward with the real rules.
//
// Just after every row of obstacles, every dog snap and every set of knives
// it takes stock: each position that was alive at the last stock-take must
// still have at least one way of being alive now. A position with none is a
// dead end: the player got there without a mistake and could not escape.
//
// The dog needs one more stock-take. Obstacles and knives can be seen long
// before they arrive, but nobody can know a snap is coming until the dog
// starts to wind up. So stock is also taken on the first beat after each
// wind-up begins: whatever the player happened to be doing at that moment,
// there must still be a way out. (A snap that lands before that first beat
// is reported too: the wind-up was too short for this player to answer.)
//
// opts.seed, opts.tuning   the course to check
// opts.run                 or: a run to carry on from (see copyRun)
// opts.ms                  how much of the run to check (default 4 minutes)
// opts.slotMs              the player's beat (default 200)
// opts.knives              'sure': standing under any knife of a set of one
//                          or two counts as a hit, so the player must find
//                          the free lane. Sets of three are left out: those
//                          are the luck the description allows. If unset,
//                          knives are ignored altogether, so use that only
//                          with knives switched off in the tuning.
// opts.farLaneOnly         being in the air does not save you from the dog,
//                          so only the far lane does
// opts.collect             the row id of a golden chain: a position that
//                          misses one of its eggs is dropped
//
// Returns { deadEnds, stockTakes, positions, alive, earned, path } where
// path is one set of presses (one per beat) that survives to the end.
function gridSearch(opts) {
  const tuning = opts.tuning || {};
  const slotMs = opts.slotMs || 200;
  // The master run only supplies the course. Its own egg is made unhittable
  // so it never knocks an obstacle away.
  const master = opts.run || rules.createRun({ seed: opts.seed, tuning });
  const T = master.T, M = master.S;
  M.player.blinkUntil = 1e15;
  // One spare run, re-filled for every try.
  const fork = rules.createRun({ seed: 1, empty: true, tuning });
  const F = fork.S;
  const steps = Math.round(slotMs / T.STEP_MS);
  const ahead = T.TOP_SPEED * slotMs / 1000 + 160;       // how much track one beat can cover
  const row = opts.collect ? M.rows[opts.collect] : null;

  // Fill the spare run with the track near the egg and one position.
  function setUp(pos, obstacles, eggs, gates) {
    F.t = M.t; F.dist = M.dist; F.speed = M.speed;
    F.score = 0; F.eggs = 0; F.spares = 0; F.over = false; F.cause = null; F.overAt = 0;
    F.player = Object.assign({}, pos.player);
    F.things = obstacles.map(o => {
      const f = pos.flags && pos.flags[o.id];
      return { id: o.id, type: 'obstacle', kind: o.kind, tall: o.tall, lane: o.lane, d: o.d, half: o.half,
               touchAt: f ? f.touchAt : null, jumped: f ? f.jumped : false, ghost: f ? f.ghost : false, knocked: null };
    });
    for (const e of eggs) {
      F.things.push({ id: e.id, type: 'egg', lane: e.lane, d: e.d, golden: e.lastOfRow, row: e.row, lastOfRow: e.lastOfRow,
                      taken: !!(pos.eggs && pos.eggs[e.id]), missed: false, faded: false });
    }
    F.rows = {};
    if (row) F.rows[opts.collect] = { size: row.size, taken: pos.taken, broken: false };
    // Knives that are always down: the lane under one is never a way out.
    F.gates = gates.map(g => ({ id: g.id, d: g.d, passed: true, knives: g.knives.map(k => (
      { lane: k.lane, rng: { seed: 1 }, phase: 'down', from: 0, until: 1e15, h: 0, knocked: null })) }));
    F.dog = Object.assign({}, M.dog, { visits: M.dog.visits.slice(0, 1) });
    F.trail = [];
    F.gen.on = false;
  }

  // What tells two positions apart: lane, the jump so far, a press that is
  // waiting for the landing, and any flat obstacle already touching.
  function describe(earned) {
    const p = F.player, pos = { player: Object.assign({}, p), flags: null, eggs: null, taken: 0, earned };
    let key = p.lane + (p.grounded ? ' floor' : ' ' + p.y.toFixed(3) + ' ' + p.vy.toFixed(2));
    if (!p.grounded) {
      const landsIn = (p.vy + Math.sqrt(p.vy * p.vy + 2 * T.GRAVITY * p.y)) / T.GRAVITY * 1000;
      if (F.t + landsIn - p.jumpPressedAt <= T.JUMP_BUFFER_MS + 2 * T.STEP_MS) key += ' press' + (F.t - p.jumpPressedAt).toFixed(1);
      // A press made during the dog's wind-up also waits for the landing.
      if (F.dog.phase === 'windup' && p.jumpPressedAt >= F.dog.windupAt) key += ' press for the dog';
    }
    for (const o of F.things) {
      if (o.type === 'egg') { if (o.taken) { pos.eggs = pos.eggs || {}; pos.eggs[o.id] = true; } continue; }
      if (o.touchAt == null && !o.ghost) continue;
      pos.flags = pos.flags || {};
      pos.flags[o.id] = { touchAt: o.touchAt, ghost: o.ghost, jumped: o.jumped };
      key += ' ' + o.id + (o.ghost ? 'cleared' : 'touch' + (F.t - o.touchAt).toFixed(1));
    }
    if (row) { pos.taken = F.rows[opts.collect].taken; key += ' eggs' + pos.taken + (earned ? ' earned' : ''); }
    pos.key = key;
    return pos;
  }

  let alive = [{ player: Object.assign({}, M.player, { blinkUntil: 0 }), flags: null, eggs: null, taken: 0, earned: false,
                 key: 'start', from: null, press: null, since: new Set([0]) }];
  let last = { why: 'start', t: M.t, positions: alive.slice(), track: '' };
  let due = null, unanswered = false, positions = 1, stockTakes = 0;
  const deadEnds = [], rowsPassed = new Set();
  const slots = Math.round((opts.ms || 240000) / slotMs);

  for (let slot = 0; slot < slots && alive.length; slot++) {
    const obstacles = M.things.filter(o => o.type === 'obstacle' && o.d > M.dist - 200 && o.d < M.dist + ahead);
    const eggs = row ? M.things.filter(o => o.type === 'egg' && o.row === opts.collect && o.d > M.dist - 200 && o.d < M.dist + ahead) : [];
    const gates = opts.knives === 'sure'
      ? M.gates.filter(g => g.knives.length < 3 && g.d > M.dist - 60 && g.d < M.dist + ahead) : [];
    const next = new Map();
    for (const pos of alive) {
      for (const press of [null, 'left', 'right', 'jump']) {
        if (press === 'left' && pos.player.lane === -1) continue;
        if (press === 'right' && pos.player.lane === 1) continue;
        setUp(pos, obstacles, eggs, gates);
        if (press) fork.input(press);
        let lost = false, earned = pos.earned;
        for (let i = 0; i < steps && !F.over; i++) fork.step();
        for (const e of fork.drain()) {
          if (e.type === 'egg' && e.earned) earned = true;
          if (opts.farLaneOnly && e.type === 'dogSnap' && (e.side - F.player.lane) * e.side < T.DOG_BITE_LANES) lost = true;
        }
        if (row && F.rows[opts.collect].broken) lost = true;
        if (F.over || lost) continue;
        const now = describe(earned), same = next.get(now.key);
        if (same) { for (const j of pos.since) same.since.add(j); continue; }
        now.from = pos; now.press = press; now.since = new Set(pos.since);
        next.set(now.key, now);
      }
    }
    alive = [...next.values()];
    positions = Math.max(positions, alive.length);

    // Move the course on by one beat and note what the egg passed.
    for (let i = 0; i < steps; i++) {
      master.step();
      for (const e of master.drain()) {
        if (e.type === 'dogWindup') { due = due || 'wind-up'; unanswered = true; }
        if (e.type === 'dogSnap') {
          due = due || 'snap';
          if (unanswered) deadEnds.push({ seed: opts.seed, t: Math.round(M.t), speed: Math.round(M.speed), tooFast: true, after: 'wind-up', before: 'snap' });
        }
        if (e.type === 'knivesPassed') due = due || 'knives';
      }
      for (const o of M.things) {
        if (o.type !== 'obstacle' || rowsPassed.has(o.id) || o.d + o.half + T.PLAYER_HALF_DEPTH >= M.dist) continue;
        rowsPassed.add(o.id); due = due || 'row';
      }
      M.player.blinkUntil = 1e15;
    }
    if (!alive.length) {
      deadEnds.push({ seed: opts.seed, t: Math.round(M.t), speed: Math.round(M.speed), nobody: true, after: last.why, track: last.track });
      break;
    }
    if (!due) continue;

    // Stock-take.
    stockTakes++;
    unanswered = false;
    const reached = new Set();
    for (const pos of alive) for (const j of pos.since) reached.add(j);
    last.positions.forEach((pos, j) => {
      if (reached.has(j)) return;
      deadEnds.push({ seed: opts.seed, t: Math.round(last.t), speed: Math.round(M.speed), after: last.why, before: due,
                      lane: pos.player.lane, inTheAir: !pos.player.grounded, height: Math.round(pos.player.y), track: last.track });
    });
    alive.forEach((pos, j) => { pos.since = new Set([j]); });
    last = { why: due, t: M.t, positions: alive.slice(),
             track: 'dog ' + M.dog.state + '/' + M.dog.phase + (M.dog.state === 'away' ? '' : ' on side ' + M.dog.side) + '; ahead: ' +
               M.things.filter(o => o.type === 'obstacle' && o.d > M.dist - 100 && o.d < M.dist + 1500)
                 .map(o => (o.tall ? 'tall' : 'flat') + ' in lane ' + o.lane + ' at ' + Math.round(o.d - M.dist)).join(', ') };
    due = null;
  }

  // One way through, as the presses made on each beat.
  const path = [];
  const winner = alive.find(pos => pos.earned) || alive[0];
  for (let pos = winner; pos && pos.from; pos = pos.from) path.unshift(pos.press);
  return { deadEnds, stockTakes, positions, alive: alive.length, earned: alive.some(pos => pos.earned), path, slotMs };
}

module.exports = { rules, TUNING, emptyRun, runFor, runUntil, count, bot, copyRun, gridSearch };
