// Fuzzing: many runs with random courses and random, clumsy or perfectly
// mistimed presses. After EVERY step a list of things that must always be
// true is checked, and every hit is checked against a plain statement of
// when that kind of hit is allowed (and the other way round: when a hit must
// happen). These statements are written from DESCRIPTION.md, not copied from
// rules.js, so they do not share its blind spots.
//
// The default run takes a few seconds. For a much longer soak:
//     ER_LONG=1 npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rules, TUNING, bot } = require('./helpers.js');

const LONG = !!process.env.ER_LONG;

// Our own random numbers, so the same seed always presses the same things.
function dice(seed) {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Every number anywhere in the state must be a real, finite number.
function badNumbers(x, path, out) {
  if (typeof x === 'number') { if (!Number.isFinite(x)) out.push(path + ' = ' + x); return out; }
  if (x && typeof x === 'object') for (const k of Object.keys(x)) badNumbers(x[k], path + '.' + k, out);
  return out;
}

// How each style of player presses. Returns the presses for this step.
const STYLES = {
  still: () => [],
  sparse: (run, roll) => (roll() < 0.03 ? [['left', 'right', 'jump'][Math.floor(roll() * 3)]] : []),
  // Several presses in the same instant, including nonsense.
  mash: (run, roll) => {
    const out = [];
    for (let n = Math.floor(roll() * 4); n > 0; n--) out.push(['left', 'right', 'jump', 'jump', 'up', undefined][Math.floor(roll() * 6)]);
    return out;
  },
  // Presses aimed at the worst moments: a jump anywhere from just before a
  // flat obstacle touches to well after, and anything during a dog wind-up.
  mistimed: (run, roll, memo) => {
    const { S, T } = run, p = S.player, out = [];
    const flat = S.things.find(o => o.type === 'obstacle' && !o.tall && !o.knocked && o.lane === p.lane &&
      o.d - S.dist > -40 && o.d - S.dist < 400);
    if (flat) {
      if (memo.id !== flat.id) { memo.id = flat.id; memo.done = false; memo.offset = (roll() * 2 - 0.5) * 0.14 * S.speed; }
      if (!memo.done && flat.d - S.dist <= flat.half + T.PLAYER_HALF_DEPTH - memo.offset) { out.push('jump'); memo.done = true; }
    } else if (roll() < 0.01) out.push(['left', 'right', 'jump'][Math.floor(roll() * 3)]);
    if (S.dog.phase === 'windup' && roll() < 0.05) out.push(['jump', 'left', 'right'][Math.floor(roll() * 3)]);
    return out;
  }
};

// Play one run and return everything that went wrong (an empty list is good).
// keepAlive: top the spares up so the run lasts the full time.
function fuzz(seed, style, ms, keepAlive, tuning) {
  const run = rules.createRun({ seed, spares: keepAlive ? 3 : 2, tuning });
  const { S, T } = run, p = S.player;
  const roll = dice(seed * 31 + style.length), memo = {};
  const wrong = [];
  const fail = what => { if (wrong.length < 5) wrong.push('seed ' + seed + ', ' + style + ', ' + Math.round(S.t) + ' ms, speed ' + Math.round(S.speed) + ': ' + what); };
  const touchOf = o => o.half + T.PLAYER_HALF_DEPTH;
  const graceSteps = Math.round(T.LATE_JUMP_GRACE_MS / T.STEP_MS);
  // How much may be remembered at once. Changed tuning can fairly need more
  // (a longer view holds more things), so those runs get a looser limit.
  const roomy = tuning ? 4 : 1;
  const trailMost = Math.ceil((T.TRAIL_DELAY_MS * (T.MAX_SPARES + 1) + 100) / T.STEP_MS) + 3;

  const taken = new Set(), wasGolden = new Map();
  const recent = [];                       // the last few steps: lane, and whether the egg was up
  let expectedJumps = 0, waitingPress = null;
  let warnedAt = null, arrivedAt = null, lastSnapAt = null, windupAt = Infinity, windupSeen = false;
  const seen = { hits: { obstacle: 0, knife: 0, dog: 0 }, eggs: 0, golden: 0, goldenLost: 0, visits: 0, snaps: 0, over: false };
  const steps = Math.round(ms / T.STEP_MS);

  for (let i = 0; i < steps && !S.over; i++) {
    for (const press of STYLES[style](run, roll, memo)) {
      const onFloor = p.grounded;
      run.input(press);
      if (press === 'jump') { if (onFloor) expectedJumps++; else waitingPress = S.t; }
    }
    const was = { t: S.t, dist: S.dist, score: S.score, eggs: S.eggs, spares: S.spares, blinkUntil: p.blinkUntil,
                  jumps: p.jumps, dog: S.dog.state, phase: S.dog.phase };
    const touchBefore = new Map();
    for (const o of S.things) if (o.type === 'obstacle' && !o.tall) touchBefore.set(o.id, o.touchAt);

    run.step();
    const events = run.drain();
    const blinking = S.t < was.blinkUntil;             // still blinking during this step

    // ── the egg itself ──
    if (p.lane !== -1 && p.lane !== 0 && p.lane !== 1) fail('lane is ' + p.lane);
    if (!(p.y >= 0)) fail('height is ' + p.y);
    if (p.grounded && p.y !== 0) fail('on the floor at height ' + p.y);
    if (!(S.spares >= 0 && S.spares <= T.MAX_SPARES && Number.isInteger(S.spares))) fail('spares: ' + S.spares);
    if (!(S.dist > was.dist)) fail('distance did not grow');
    if (S.score < was.score) fail('score went down');
    if (Math.abs(S.t - was.t - T.STEP_MS) > 1e-6) fail('time moved by ' + (S.t - was.t));

    // ── jumps: one per press on the floor, one per press just before landing ──
    for (const e of events) {
      if (e.type !== 'land') continue;
      // …or, however early, one made in the air after the dog began the
      // wind-up it is still in.
      const forTheDog = was.phase === 'windup' && waitingPress !== null && waitingPress >= windupAt;
      if (waitingPress !== null && (forTheDog || S.t - waitingPress <= T.JUMP_BUFFER_MS)) expectedJumps++;
      waitingPress = null;
    }
    if (p.jumps !== expectedJumps) { fail('jumps made: ' + p.jumps + ', expected ' + expectedJumps); expectedJumps = p.jumps; }
    const up = p.y >= T.FLAT_CLEAR_HEIGHT || (!p.grounded && p.vy > 0);
    recent.push({ lane: p.lane, up });
    if (recent.length > graceSteps + 2) recent.shift();

    // ── hits ──
    let lost = 0, ended = 0, earned = 0;
    for (const e of events) {
      if (e.type === 'egg' && e.earned) earned++;
      if (e.type !== 'spareLost' && e.type !== 'over') continue;
      if (e.type === 'spareLost') lost++; else ended++;
      seen.hits[e.cause]++;
      if (blinking) fail('hit by ' + e.cause + ' while blinking');
      if (e.type === 'over' && was.spares !== 0) fail('the run ended with ' + was.spares + ' spare(s) left');
      if (e.type === 'over' && S.cause !== e.cause) fail('cause says ' + S.cause + ', event says ' + e.cause);
      if (e.cause === 'obstacle') {
        // Which obstacle? With a spare it is the one knocked away just now.
        // With none it is the one in the egg's lane that is touching (tall)
        // or has been touching (flat). Ones already knocked away or let go
        // earlier do not count.
        const hitBy = S.things.filter(o => o.type === 'obstacle' && o.lane === p.lane &&
          (e.type === 'spareLost' ? o.knocked === S.t
            : !o.knocked && !o.ghost && (o.tall ? Math.abs(o.d - S.dist) <= touchOf(o) : o.touchAt != null)));
        if (hitBy.length !== 1) { fail('hit by ' + hitBy.length + ' obstacles at once'); continue; }
        const o = hitBy[0], away = o.d - S.dist;
        if (o.tall) {
          if (Math.abs(away) > touchOf(o)) fail('a tall obstacle hit from ' + Math.round(away) + ' units away');
        } else {
          // A flat one hits only at the end of the late-jump grace, and only
          // if the egg stayed down and in its lane for the whole of it.
          const touchedAt = touchBefore.get(o.id) != null ? touchBefore.get(o.id) : o.touchAt;
          const waited = S.t - touchedAt;
          if (!(waited >= T.LATE_JUMP_GRACE_MS - 1e-6 && waited <= T.LATE_JUMP_GRACE_MS + T.STEP_MS + 1e-6)) {
            fail('a flat obstacle hit ' + Math.round(waited) + ' ms after it first touched, from ' + Math.round(away) + ' units away');
          }
          if (recent.slice(-graceSteps).some(r => r.up || r.lane !== o.lane)) fail('a flat obstacle hit although the egg had jumped or stepped away');
        }
      } else if (e.cause === 'knife') {
        const gate = S.gates.find(g => Math.abs(g.d - S.dist) <= T.KNIFE_HALF_DEPTH);
        const knife = gate && gate.knives.find(k => k.lane === p.lane);
        if (!knife) fail('chopped with no knife overhead');
        else if (!(knife.h < T.KNIFE_DANGER_BELOW)) fail('chopped by a raised knife (height ' + knife.h.toFixed(2) + ')');
      } else if (e.cause === 'dog') {
        const snap = events.find(x => x.type === 'dogSnap');
        if (!snap || !snap.caught) fail('bitten with no snap');
        else if ((snap.side - p.lane) * snap.side >= T.DOG_BITE_LANES) fail('bitten beyond the snap\'s reach, in lane ' + p.lane);
        if (was.phase !== 'windup') fail('bitten with no wind-up');
        if (!p.grounded) fail('bitten in the air');
      } else fail('unknown cause ' + e.cause);
    }
    if (lost + ended > 1) fail(lost + ended + ' hits in one step');
    // The other way round: the egg cannot be inside a tall obstacle and get
    // away with it. Either it was hit, or it is blinking and the obstacle
    // has been let go.
    if (!S.over && !lost) {
      for (const o of S.things) {
        if (o.type === 'obstacle' && o.tall && o.lane === p.lane && !o.knocked && !o.ghost && Math.abs(o.d - S.dist) <= touchOf(o)) {
          fail('inside a tall ' + o.kind + ' and not hit');
        }
      }
    }
    if (S.spares !== was.spares - lost + earned) fail('spares went ' + was.spares + ' to ' + S.spares + ' with ' + lost + ' lost and ' + earned + ' earned');
    if (S.over !== (ended === 1)) fail('over is ' + S.over + ' after ' + ended + ' ending hit(s)');
    if (S.over) seen.over = true;

    // ── eggs ──
    let newlyTaken = 0;
    for (const o of S.things) {
      if (o.type !== 'egg') continue;
      const away = o.d - S.dist;
      if (o.taken && o.missed) fail('an egg both taken and missed');
      if (o.taken && !taken.has(o.id)) {
        taken.add(o.id); newlyTaken++;
        if (o.lane !== p.lane || Math.abs(away) > T.EGG_REACH) fail('an egg grabbed from ' + Math.round(away) + ' units away, in lane ' + o.lane);
        // The last egg of a chain counts as golden only if every egg of the
        // chain was taken, and always if they were.
        if (o.lastOfRow) {
          const chain = S.rows[o.row], whole = !!chain && chain.taken === chain.size;
          if (o.golden !== whole || !events.some(e => e.type === 'egg' && e.golden === whole && e.streak === chain.taken)) {
            fail('the last egg of a chain was ' + (o.golden ? 'golden' : 'ordinary') + ' with ' + chain.taken + ' of ' + chain.size + ' eggs taken');
          }
        }
      }
      if (!o.taken && !o.missed && !S.over && o.lane === p.lane && Math.abs(away) <= T.EGG_REACH) fail('an egg in reach was not collected');
      if (o.missed && !(away < -T.EGG_REACH)) fail('an egg counted as missed while still ahead');
      if (o.golden) {
        if (!o.lastOfRow) fail('a golden egg that is not the last of its chain');
        const chain = S.rows[o.row];
        if (!chain) fail('a golden egg with no chain');
        else if (chain.broken) fail('a golden egg in a chain with a missed egg');
        else if (chain.size < T.GOLDEN_CHAIN_LENGTH[0] || chain.size > T.GOLDEN_CHAIN_LENGTH[1]) fail('a golden egg on a chain of ' + chain.size);
        if (o.d < rules.advance(T, 0, T.GOLDEN_FIRST_MS)) fail('a golden egg before the first-golden time');
        wasGolden.set(o.id, true);
      } else if (wasGolden.get(o.id) && !o.taken) {
        // It turned ordinary: an egg of its chain must really have gone by.
        wasGolden.set(o.id, false);
        if (!S.things.some(x => x.type === 'egg' && x.row === o.row && x.id !== o.id && x.missed)) fail('a golden egg turned ordinary with no egg missed');
      }
    }
    const eggEvents = events.filter(e => e.type === 'egg');
    if (eggEvents.length !== newlyTaken || S.eggs !== taken.size) fail('eggs: ' + S.eggs + ' counted, ' + taken.size + ' really taken');
    seen.eggs += newlyTaken;
    for (const e of eggEvents) {
      if (e.golden) seen.golden++;
      if (e.earned || e.full) {
        if (!e.golden) fail('a whole egg gave a spare');
        if (e.earned === e.full) fail('earned and full at once');
      } else if (e.golden) fail('a golden egg gave nothing');
    }
    seen.goldenLost += events.filter(e => e.type === 'goldenLost').length;
    if (S.score !== Math.floor(S.dist / T.UNITS_PER_POINT) + S.eggs * T.EGG_POINTS) fail('score is not distance plus eggs');

    // ── the dog ──
    for (const e of events) {
      if (e.type === 'dogWarning') { if (was.dog !== 'away') fail('a warning while the dog is ' + was.dog); warnedAt = S.t; }
      if (e.type === 'dogArrive') {
        if (warnedAt === null || S.t - warnedAt < T.DOG_WARN_MS - 2 * T.STEP_MS) fail('the dog arrived ' + (S.t - warnedAt) + ' ms after its warning');
        if (S.t < T.DOG_FIRST_MS[0] - 50) fail('the dog arrived early in the run');
        arrivedAt = S.t; lastSnapAt = null; warnedAt = null; seen.visits++;
      }
      if (e.type === 'dogWindup') {
        if (arrivedAt === null) fail('a wind-up with no dog');
        else if (S.t - arrivedAt < T.DOG_FIRST_SNAP_MS - 30) fail('a wind-up only ' + Math.round(S.t - arrivedAt) + ' ms after arriving');
        windupAt = S.t; windupSeen = true;
        // Nothing but eggs may reach the egg from now until well after the snap.
        const until = rules.advance(T, S.dist, T.DOG_WINDUP_MS + T.DOG_CLEAR_AFTER_MS - 20);
        if (S.things.some(o => o.type === 'obstacle' && !o.knocked && o.d > S.dist - 20 && o.d < until)) fail('an obstacle inside the dog\'s clear stretch');
        if (S.gates.some(g => g.d > S.dist - 20 && g.d < until)) fail('knives inside the dog\'s clear stretch');
      }
      if (e.type === 'dogSnap') {
        seen.snaps++;
        if (!windupSeen || Math.abs(S.t - windupAt - T.DOG_WINDUP_MS) > 2 * T.STEP_MS) fail('a snap ' + (S.t - windupAt) + ' ms after its wind-up');
        if (lastSnapAt !== null && (S.t - lastSnapAt < 1500 || S.t - lastSnapAt > 2500)) fail('snaps ' + Math.round(S.t - lastSnapAt) + ' ms apart');
        const reach = (e.side - p.lane) * e.side < T.DOG_BITE_LANES;
        if (e.caught !== (reach && p.grounded && !blinking && S.t >= was.blinkUntil)) fail('snap caught=' + e.caught + ' in lane ' + p.lane + (p.grounded ? ' on the floor' : ' in the air'));
        lastSnapAt = S.t; windupSeen = false;
      }
      if (e.type === 'dogLeave') {
        const stayed = S.t - arrivedAt;
        if (stayed < T.DOG_STAY_MS - 1 || stayed > T.DOG_STAY_MS + 100) fail('the dog stayed ' + Math.round(stayed) + ' ms');
        arrivedAt = null;
      }
    }
    if (arrivedAt !== null && !S.over && S.t - arrivedAt > T.DOG_STAY_MS + T.DOG_WINDUP_MS + T.DOG_SNAP_MS + 100) fail('the dog never left');
    // (With the standard numbers knives also keep clear of the warning. A
    // warning made longer than KNIFE_DOG_GAP_MS can overlap them, which is
    // harmless, so changed tuning is only held to the visit itself.)
    const visiting = tuning ? S.dog.state === 'alongside' : S.dog.state !== 'away';
    if (visiting && S.gates.some(g => Math.abs(g.d - S.dist) < 100)) fail('knives arrived during a dog visit');

    // ── nothing piles up ──
    if (S.things.length > 80 * roomy || S.gates.length > 3 * roomy || Object.keys(S.rows).length > 6 * roomy ||
        S.gen.zones.length > 14 * roomy || S.trail.length > trailMost || S.dog.visits.length > 2 * roomy) {
      fail('piling up: ' + S.things.length + ' things, ' + S.gates.length + ' gates, ' + Object.keys(S.rows).length + ' chains, ' +
           S.gen.zones.length + ' zones, ' + S.trail.length + ' trail, ' + S.dog.visits.length + ' visits');
    }
    if (i % 240 === 0 || S.over) { const bad = badNumbers(S, 'S', []); if (bad.length) fail('not a number: ' + bad.slice(0, 3).join(', ')); }

    if (keepAlive && S.spares < 1) S.spares = 1;
  }
  return { wrong, seen };
}

test('thousands of seconds of random play: every always-true rule holds after every step', () => {
  const seeds = LONG ? 300 : 9, ms = LONG ? 240000 : 150000;
  const total = { obstacle: 0, knife: 0, dog: 0, eggs: 0, golden: 0, goldenLost: 0, visits: 0, snaps: 0, over: 0 };
  for (let seed = 1; seed <= seeds; seed++) {
    for (const style of Object.keys(STYLES)) {
      const { wrong, seen } = fuzz(seed, style, ms, true);
      assert.deepEqual(wrong, []);
      for (const k of ['obstacle', 'knife', 'dog']) total[k] += seen.hits[k];
      for (const k of ['eggs', 'golden', 'goldenLost', 'visits', 'snaps']) total[k] += seen[k];
    }
  }
  // The fuzz really did exercise everything.
  assert.ok(total.obstacle > 500 && total.knife > 5 && total.dog > 30, JSON.stringify(total));
  assert.ok(total.eggs > 500 && total.golden > 3 && total.goldenLost > 50 && total.snaps > 300, JSON.stringify(total));
});

test('random play with no help: the run ends only on a hit with no spares left', () => {
  let ended = 0;
  for (let seed = 100; seed < (LONG ? 500 : 140); seed++) {
    const style = Object.keys(STYLES)[seed % 4];
    const { wrong, seen } = fuzz(seed, style, 120000, false);
    assert.deepEqual(wrong, []);
    if (seen.over) ended++;
  }
  assert.ok(ended > 20, 'runs that ended: ' + ended);
});

test('half and double every tuning number: nothing crashes or breaks an always-true rule', () => {
  // The dog's snap spacing check above is written for the standard rhythm,
  // so numbers that set that rhythm are skipped here (they are covered by
  // the dog's own checks).
  const skip = ['JUMP_AIR_MS', 'STEP_MS', 'DOG_IDLE_MS', 'DOG_WINDUP_MS', 'DOG_SNAP_MS'];
  const whole = ['MAX_SPARES', 'KNIFE_EASY_GATES', 'DOG_BITE_LANES'];
  const tries = [{ DOG_BITE_LANES: 1 }, { DOG_BITE_LANES: 3 }];
  for (const key of Object.keys(TUNING)) {
    if (skip.includes(key)) continue;
    for (const by of [0.5, 2]) {
      const v = TUNING[key];
      const to = Array.isArray(v) ? v.map(x => x * by) : whole.includes(key) ? Math.round(v * by) : v * by;
      // A chain length must stay a whole number of eggs.
      tries.push({ [key]: key.endsWith('_LENGTH') ? to.map(Math.round) : to });
    }
  }
  let n = 0;
  for (const tuning of tries) {
    const seed = 1 + (n++ % 7);
    const { wrong } = fuzz(seed, LONG || n % 2 ? 'sparse' : 'mistimed', LONG ? 200000 : 60000, true, tuning);
    assert.deepEqual(wrong, [], 'with ' + JSON.stringify(tuning));
  }
});

test('thirty minutes of play: nothing piles up and every number stays sane', () => {
  const run = rules.createRun({ seed: 5 });
  const { S, T } = run;
  let most = { things: 0, gates: 0, chains: 0, zones: 0, trail: 0, visits: 0 };
  for (let i = 0; i < 30 * 60 * 1000 / T.STEP_MS; i++) {
    if (i % 3 === 0) bot(run);
    run.step();
    if (i % 500 === 0) run.drain();                   // sometimes nobody collects the events for a while
    if (S.spares < 1) S.spares = 1;
    most.things = Math.max(most.things, S.things.length); most.gates = Math.max(most.gates, S.gates.length);
    most.chains = Math.max(most.chains, Object.keys(S.rows).length); most.zones = Math.max(most.zones, S.gen.zones.length);
    most.trail = Math.max(most.trail, S.trail.length); most.visits = Math.max(most.visits, S.dog.visits.length);
  }
  assert.equal(S.over, false);
  assert.ok(Math.abs(S.t - 1800000) < 1, 'thirty minutes played: ' + S.t);
  assert.ok(most.things <= 80 && most.gates <= 3 && most.chains <= 6 && most.zones <= 14 && most.trail <= 90 && most.visits <= 2, JSON.stringify(most));
  assert.deepEqual(badNumbers(S, 'S', []), []);
  assert.ok(run.drain().length <= 400, 'uncollected events are capped');
  assert.ok(JSON.stringify(S).length < 30000, 'the whole state is still small');
});
