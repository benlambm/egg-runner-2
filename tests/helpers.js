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
function bot(run) {
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
  // Jump the dog's snap.
  const dog = S.dog;
  if (dog.state === 'alongside' && dog.phase === 'windup' && p.lane === dog.side &&
      p.grounded && dog.phaseUntil - S.t <= 250) run.input('jump');
}

module.exports = { rules, TUNING, emptyRun, runFor, runUntil, count, bot };
