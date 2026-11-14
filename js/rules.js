/*
 * Egg Runner 2 — the rules.
 *
 * Everything that decides what happens in a run lives here: moving, jumping,
 * obstacles, eggs and spares, the dog, chopping knives, hits and scoring.
 * There is no drawing, sound or browser code in this file, so the automated
 * checks in /tests can play whole runs in Node.
 *
 * A run is plain data (run.S) advanced in fixed 1/120 s steps. The course is
 * laid out from a seed, so the same seed always gives the same course.
 *
 * Positions along the track are absolute distances `d`. The egg is at S.dist,
 * so something at `d` is `d - S.dist` ahead of it.
 */
(function (root) {
  'use strict';

  var BASE = (typeof module !== 'undefined' && module.exports)
    ? require('./tuning.js') : root.ER.TUNING;

  var TALL_KINDS = ['toaster', 'blender', 'carton'];
  var FLAT_KINDS = ['knife', 'butter'];
  var LANES = [-1, 0, 1];

  // ── small helpers ────────────────────────────────────────────────────
  // Seeded random numbers. The state is a number kept in a holder object so
  // a run stays plain data.
  function rnd(h) {
    h.seed = (h.seed + 0x6D2B79F5) >>> 0;
    var t = h.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function between(h, range) { return range[0] + rnd(h) * (range[1] - range[0]); }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function shuffled(h, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd(h) * (i + 1)), tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // ── pace ─────────────────────────────────────────────────────────────
  // Speed depends only on distance, so "where will the egg be in N ms" has an
  // exact answer. The dog and the knives use it to keep the track fair.
  function speedAt(T, d) {
    return Math.min(T.TOP_SPEED, T.START_SPEED + T.SPEED_GAIN * Math.max(0, d));
  }
  // Distance reached `ms` after being at distance `d`.
  function advance(T, d, ms) {
    var t = ms / 1000, k = T.SPEED_GAIN, v0 = T.START_SPEED;
    if (k <= 0) return d + v0 * t;
    var dTop = (T.TOP_SPEED - v0) / k;
    if (d < dTop) {
      var tTop = Math.log(T.TOP_SPEED / (v0 + k * d)) / k;
      if (t <= tTop) return (v0 / k + d) * Math.exp(k * t) - v0 / k;
      t -= tTop; d = dTop;
    }
    return d + T.TOP_SPEED * t;
  }
  // 0 at the start of a run, 1 once top speed is reached.
  function difficulty(T, d) {
    return clamp((speedAt(T, d) - T.START_SPEED) / Math.max(1, T.TOP_SPEED - T.START_SPEED), 0, 1);
  }
  function minGapMs(T) {
    return Math.max(T.JUMP_AIR_MS * T.GAP_JUMP_SAFETY, T.GAP_REACTION_MS);
  }

  // ── a new run ────────────────────────────────────────────────────────
  // opts.seed       course seed (number)
  // opts.tuning     overrides for individual tuning numbers
  // opts.spares     spares to start with (default 0)
  // opts.empty      no course is generated (tests and the menu backdrop
  //                 place their own things)
  // opts.eggsOnly   only eggs are generated (the menu backdrop)
  function createRun(opts) {
    opts = opts || {};
    var T = {}, key;
    for (key in BASE) T[key] = BASE[key];
    if (opts.tuning) for (key in opts.tuning) T[key] = opts.tuning[key];
    T.JUMP_AIR_MS = 2 * T.JUMP_SPEED / T.GRAVITY * 1000;

    var seed = (opts.seed === undefined ? 1 : opts.seed) >>> 0;
    var S = {
      t: 0,                       // ms since the run began
      dist: 0,                    // distance travelled
      speed: T.START_SPEED,
      score: 0,
      eggs: 0,                    // eggs collected
      spares: clamp(opts.spares || 0, 0, T.MAX_SPARES),
      over: false,
      cause: null,                // 'obstacle' | 'knife' | 'dog'
      overAt: 0,
      player: {
        lane: 0,                  // -1, 0, 1: the lane the rules use
        x: 0,                     // where it is drawn (slides after lane)
        y: 0, vy: 0,              // height off the floor
        grounded: true,
        jumpPressedAt: -1e9,      // last jump press that could not fire yet
        blinkUntil: 0,            // unhurtable until this time
        sweatUntil: 0,            // worried and sweating until this time
        calmUntil: 0,             // no new sweat before this time
        jumps: 0
      },
      things: [],                 // obstacles and eggs
      gates: [],                  // sets of chopping knives
      rows: {},                   // egg rows that end in a golden egg
      dog: {
        state: 'away',            // away | warning | alongside | leaving
        side: 1,                  // -1 left, 1 right
        phase: 'idle',            // idle | windup | snap
        phaseUntil: 0,
        windupAt: 0,              // when the current wind-up began
        arrivedAt: 0, leftAt: 0,
        snapIndex: 0,
        visits: []                // planned visits, nearest first
      },
      trail: [],                  // recent egg positions, for the spares line
      rngCourse: { seed: seed },
      rngLooks: { seed: (seed ^ 0x9E3779B9) >>> 0 },
      gen: {
        on: !opts.empty,
        eggsOnly: !!opts.eggsOnly,
        F: 0,                     // obstacles are decided up to here
        prevPassable: LANES.slice(),
        eggD: 600,                // eggs are decided up to here
        nextDogD: 0, nextKnifeD: 0,
        lastGateD: -1e9,
        gateCount: 0,
        zones: [],                // stretches where no obstacle may be placed
        nextId: 1
      }
    };
    S.gen.F = advance(T, 0, T.FIRST_OBSTACLE_MS) - speedAt(T, 0) * minGapMs(T) / 1000;
    S.gen.goldenFromD = advance(T, 0, T.GOLDEN_FIRST_MS);   // golden chains start here
    S.gen.nextDogD = advance(T, 0, between(S.rngCourse, T.DOG_FIRST_MS));
    S.gen.nextKnifeD = advance(T, 0, between(S.rngCourse, T.KNIFE_FIRST_MS));

    var events = [], sweep = 0;
    function emit(type, data) {
      var e = data || {}; e.type = type; events.push(e);
      if (events.length > 400) events.shift();
    }

    // ── laying out the course ──────────────────────────────────────────
    function inZone(d) {
      var z = S.gen.zones;
      for (var i = 0; i < z.length; i++) if (d >= z[i].from && d <= z[i].to) return z[i];
      return null;
    }
    // The dog's clear stretch that ends between two points on the track, if any.
    function snapEndingBetween(a, b) {
      var z = S.gen.zones, found = null;
      for (var i = 0; i < z.length; i++) {
        if (z[i].why === 'dog' && z[i].to >= a && z[i].to < b && (!found || z[i].to > found.to)) found = z[i];
      }
      return found;
    }
    function dogVisitNear(from, to) {
      var v = S.dog.visits, pad = 0;
      for (var i = 0; i < v.length; i++) {
        pad = speedAt(T, v[i].startD) * T.KNIFE_DOG_GAP_MS / 1000;
        if (to >= v[i].warnD - pad && from <= v[i].endD + pad) return v[i];
      }
      return null;
    }

    // The dog: one visit is planned in full the moment the course reaches
    // it. Every snap gets a stretch of track with no obstacles in it.
    function planDog(g, F) {
      var h = S.rngCourse;
      var startD = g.lastGateD > 0 ? Math.max(F, advance(T, g.lastGateD, T.KNIFE_DOG_GAP_MS)) : F;
      var visit = addDogVisit(startD, rnd(h) < 0.5 ? -1 : 1, h);
      g.nextDogD = advance(T, visit.endD, between(h, T.DOG_BETWEEN_MS));
    }
    function addDogVisit(startD, side, h) {
      h = h || S.rngCourse;
      var visit = {
        side: side,
        startD: startD,
        warnD: startD - speedAt(T, startD) * T.DOG_WARN_MS / 1000,
        endD: advance(T, startD, T.DOG_STAY_MS),
        snaps: []
      };
      var t = T.DOG_FIRST_SNAP_MS;
      while (t + T.DOG_WINDUP_MS + T.DOG_SNAP_MS <= T.DOG_STAY_MS - 250) {
        var windupD = advance(T, startD, t);
        var zone = {
          from: windupD - T.DOG_CLEAR_BEFORE,
          to: advance(T, windupD, T.DOG_WINDUP_MS + T.DOG_CLEAR_AFTER_MS),
          why: 'dog'
        };
        visit.snaps.push({ windupD: windupD, from: zone.from, to: zone.to });
        S.gen.zones.push(zone);
        t += T.DOG_WINDUP_MS + T.DOG_SNAP_MS + between(h, T.DOG_IDLE_MS);
      }
      S.dog.visits.push(visit);
      return visit;
    }

    // Chopping knives: a set over one, two or all three lanes.
    function placeGate(g, F) {
      var h = S.rngCourse, v = speedAt(T, F);
      var d = F + v * T.KNIFE_CLEAR_BEFORE_MS / 1000;
      var count = 1;
      if (g.gateCount >= T.KNIFE_EASY_GATES) {
        var r = rnd(h), c = T.KNIFE_COUNT_CHANCE;
        count = r < c[0] ? 1 : r < c[0] + c[1] ? 2 : 3;
      }
      var after = d + v * T.KNIFE_CLEAR_AFTER_MS / 1000;
      addGate(d, shuffled(h, LANES).slice(0, count), h);
      g.zones.push({ from: F, to: after, why: 'knives' });
      g.lastGateD = d;
      g.gateCount++;
      g.F = after;
      g.prevPassable = LANES.slice();
      g.nextKnifeD = advance(T, d, between(h, T.KNIFE_BETWEEN_MS));
    }

    function addGate(d, lanes, h) {
      h = h || S.rngCourse;
      var knives = [];
      for (var i = 0; i < lanes.length; i++) {
        knives.push(newKnife(lanes[i], Math.floor(rnd(h) * 4294967296)));
      }
      knives.sort(function (a, b) { return a.lane - b.lane; });
      var gate = { id: S.gen.nextId++, d: d, knives: knives, passed: false };
      S.gates.push(gate);
      return gate;
    }

    function newKnife(lane, seed) {
      var k = { lane: lane, rng: { seed: seed >>> 0 }, phase: 'up', from: S.t, until: S.t,
                h: 1, knocked: null };
      k.until = S.t + rnd(k.rng) * T.KNIFE_UP_MS[1];   // start out of step
      return k;
    }

    function addObstacle(kind, lane, d) {
      var tall = TALL_KINDS.indexOf(kind) >= 0;
      var o = {
        id: S.gen.nextId++, type: 'obstacle', kind: kind, tall: tall, lane: lane, d: d,
        half: tall ? T.TALL_HALF_DEPTH : T.FLAT_HALF_DEPTH,
        touchAt: null, jumped: false, ghost: false, knocked: null
      };
      S.things.push(o);
      return o;
    }

    // One row of obstacles: one or two lanes blocked, never all three.
    function placeRow(g) {
      var h = S.rngCourse, F = g.F, v = speedAt(T, F), p = difficulty(T, F);
      var count = rnd(h) < lerp(T.DOUBLE_ROW_CHANCE_START, T.DOUBLE_ROW_CHANCE_TOP, p) ? 2 : 1;
      var lanes = shuffled(h, LANES).slice(0, count), items = [], i;
      for (i = 0; i < lanes.length; i++) {
        var flat = rnd(h) < T.FLAT_CHANCE;
        var kinds = flat ? FLAT_KINDS : TALL_KINDS;
        items.push({ lane: lanes[i], tall: !flat, kind: kinds[Math.floor(rnd(h) * kinds.length)] });
      }
      // Lanes you can get through: open ones, and ones with a flat obstacle.
      var passable = LANES.filter(function (L) {
        for (var j = 0; j < items.length; j++) if (items[j].lane === L && items[j].tall) return false;
        return true;
      });
      // Does anyone coming out of the previous row need two lane changes?
      var twoLanes = false;
      for (i = 0; i < g.prevPassable.length; i++) {
        var best = 9;
        for (var q = 0; q < passable.length; q++) best = Math.min(best, Math.abs(passable[q] - g.prevPassable[i]));
        if (best >= 2) twoLanes = true;
      }
      var extra = between(h, [lerp(T.GAP_EXTRA_START_MS[0], T.GAP_EXTRA_TOP_MS[0], p),
                              lerp(T.GAP_EXTRA_START_MS[1], T.GAP_EXTRA_TOP_MS[1], p)]);
      var gapMs = minGapMs(T) + extra + (twoLanes ? T.GAP_TWO_LANE_EXTRA_MS : 0);
      var d = F + v * gapMs / 1000;
      // Keep clear of dog snaps and knives: slide the row past them.
      var zone, guard = 0;
      while (guard++ < 20) {
        if ((zone = inZone(d))) { d = zone.to + 1; continue; }
        // Around a snap the player may be in any lane: standing in the far
        // lane, or jumping in one of the others. If this is the first row
        // after a snap and it leaves only one outer lane open, somebody is
        // two lanes from the way through, and gets the same extra room as
        // two lane changes get between rows.
        zone = snapEndingBetween(F, d);
        if (!zone || passable.length !== 1 || passable[0] === 0) break;
        var least = zone.to + speedAt(T, zone.to) * T.GAP_TWO_LANE_EXTRA_MS / 1000;
        if (d >= least) break;
        d = least;
      }
      for (i = 0; i < items.length; i++) {
        addObstacle(items[i].kind, items[i].lane, d);
      }
      g.F = d;
      g.prevPassable = passable;
    }

    // n eggs in one lane starting at d0. With `golden`, the last one is gold.
    function addEggs(lane, d0, n, golden) {
      var rowId = golden ? S.gen.nextId++ : 0, made = [];
      if (golden) S.rows[rowId] = { size: n, taken: 0, broken: false };
      for (var i = 0; i < n; i++) {
        var e = {
          id: S.gen.nextId++, type: 'egg', lane: lane, d: d0 + i * T.EGG_SPACING,
          golden: !!golden && i === n - 1, row: rowId, lastOfRow: !!golden && i === n - 1,
          taken: false, missed: false, faded: false
        };
        S.things.push(e); made.push(e);
      }
      return made;
    }

    // Eggs: one alone, a short row, or now and then a longer chain that ends
    // in a golden egg. Golden eggs never appear any other way, and chains are
    // rare early in a run.
    function lanesFreeForEggs(d0, d1) {
      var v0 = speedAt(T, d0), v1 = speedAt(T, d1), i;
      for (i = 0; i < S.gates.length; i++) {
        if (S.gates[i].d > d0 - 260 && S.gates[i].d < d1 + 260) return [];   // keep clear of knives
      }
      // Is there a tall obstacle at this spot in this lane?
      function tallAt(lane, d) {
        for (var q = 0; q < S.things.length; q++) {
          var x = S.things[q];
          if (x.type === 'obstacle' && x.tall && x.lane === lane && Math.abs(x.d - d) < 1) return true;
        }
        return false;
      }
      return LANES.filter(function (L) {
        for (var j = 0; j < S.things.length; j++) {
          var o = S.things[j];
          if (o.lane !== L) continue;
          if (o.type === 'egg' && o.d > d0 - T.EGG_SPACING && o.d < d1 + T.EGG_SPACING) return false;
          if (o.type !== 'obstacle' || !o.tall) continue;
          // A tall obstacle in the eggs' lane. There must be time to step into
          // the lane once it has passed (before the first egg), and time to
          // step out of the lane before it arrives (after the last egg), so
          // that eggs never lead the player into it. If the lane beside is
          // blocked at the same spot the step is two lanes, which takes longer.
          var extra = (L !== 0 && tallAt(0, o.d)) ? T.GAP_TWO_LANE_EXTRA_MS : 0;
          var before = v0 * (T.EGG_CLEAR_BEFORE_MS + extra) / 1000;
          var after = Math.max(T.EGG_CLEAR_AFTER, v1 * (T.EGG_CLEAR_AFTER_MS + extra) / 1000);
          if (o.d > d0 - before && o.d < d1 + after) return false;
        }
        return true;
      });
    }
    function whole(h, range) { return range[0] + Math.floor(rnd(h) * (range[1] - range[0] + 1)); }
    function placeEggs(g) {
      var h = S.rngCourse, d0 = g.eggD, v = speedAt(T, d0), p = difficulty(T, d0);
      var chainChance = d0 >= g.goldenFromD ? lerp(T.GOLDEN_CHAIN_CHANCE_START, T.GOLDEN_CHAIN_CHANCE_TOP, p) : 0;
      var golden = rnd(h) < chainChance;
      var n = golden ? whole(h, T.GOLDEN_CHAIN_LENGTH) : rnd(h) < T.EGG_ROW_CHANCE ? whole(h, T.EGG_ROW_LENGTH) : 1;
      var d1 = d0 + (n - 1) * T.EGG_SPACING;
      var lanes = lanesFreeForEggs(d0, d1);
      if (!lanes.length && golden) {
        // No lane is clear for a whole chain here: lay a short plain row instead.
        golden = false;
        n = whole(h, T.EGG_ROW_LENGTH);
        d1 = d0 + (n - 1) * T.EGG_SPACING;
        lanes = lanesFreeForEggs(d0, d1);
      }
      if (lanes.length) addEggs(lanes[Math.floor(rnd(h) * lanes.length)], d0, n, golden);
      g.eggD = d1 + v * between(h, T.EGG_GROUP_GAP_MS) / 1000;
    }

    function generate() {
      var g = S.gen;
      if (!g.on) return;
      var horizon = S.dist + T.SEE_AHEAD + 900;
      var guard = 0;
      if (!g.eggsOnly) {
        while (g.F < horizon && guard++ < 200) {
          if (g.F >= g.nextDogD) { planDog(g, g.F); continue; }
          if (g.F >= g.nextKnifeD) {
            var v = speedAt(T, g.F);
            var visit = dogVisitNear(g.F, g.F + v * (T.KNIFE_CLEAR_BEFORE_MS + T.KNIFE_CLEAR_AFTER_MS) / 1000);
            if (visit) {
              g.nextKnifeD = advance(T, visit.endD, T.KNIFE_DOG_GAP_MS);
            } else {
              placeGate(g, g.F);
              continue;
            }
          }
          placeRow(g);
        }
      } else {
        g.F = horizon;
      }
      // Eggs follow a little behind, so they know which obstacles are near.
      guard = 0;
      var longest = Math.max(T.EGG_ROW_LENGTH[1], T.GOLDEN_CHAIN_LENGTH[1]) * T.EGG_SPACING;
      while (g.eggD + longest < g.F - 100 && guard++ < 200) placeEggs(g);
      // Forget zones the egg has passed.
      while (g.zones.length && g.zones[0].to < S.dist - 200) g.zones.shift();
    }

    // ── moving ─────────────────────────────────────────────────────────
    function doJump() {
      var p = S.player;
      p.grounded = false;
      p.vy = T.JUMP_SPEED;
      p.jumpPressedAt = -1e9;
      p.jumps++;
      emit('jump');
    }

    // The three things a player can do: 'left', 'right', 'jump'.
    function input(cmd) {
      if (S.over) return;
      var p = S.player;
      if (cmd === 'jump') {
        if (p.grounded) doJump();
        else p.jumpPressedAt = S.t;       // early press: fires on landing
        return;
      }
      var to = clamp(p.lane + (cmd === 'left' ? -1 : cmd === 'right' ? 1 : 0), -1, 1);
      if (to === p.lane) return;
      var from = p.lane;
      p.lane = to;
      emit('step', { lane: to });
      // Close call: you left a lane just before an obstacle arrived in it.
      var reach = S.speed * T.CLOSE_CALL_SWITCH_MS / 1000;
      for (var i = 0; i < S.things.length; i++) {
        var o = S.things[i];
        if (o.type !== 'obstacle' || o.knocked || o.lane !== from) continue;
        var rel = o.d - S.dist, touch = o.half + T.PLAYER_HALF_DEPTH;
        if (rel > -touch && rel < touch + reach) { closeCall('switch'); break; }
      }
    }

    function closeCall(how) {
      var p = S.player;
      if (S.t < p.calmUntil) return;      // still calm from the last one
      p.sweatUntil = S.t + T.SWEAT_MS;
      p.calmUntil = p.sweatUntil + between(S.rngLooks, T.CALM_MS);
      emit('closeCall', { how: how });
    }

    // ── getting hit ────────────────────────────────────────────────────
    // Returns true if the hit counted (it does not while blinking).
    function hit(cause, thing) {
      var p = S.player;
      if (S.t < p.blinkUntil) return false;
      if (S.spares > 0) {
        S.spares--;
        p.blinkUntil = S.t + T.BLINK_MS;
        if (thing) thing.knocked = S.t;   // whatever hit you is knocked away
        emit('spareLost', { cause: cause, spares: S.spares });
      } else {
        S.over = true;
        S.cause = cause;
        S.overAt = S.t;
        emit('over', { cause: cause });
      }
      return true;
    }

    // ── eggs ───────────────────────────────────────────────────────────
    function collect(egg) {
      egg.taken = true;
      S.eggs++;
      var earned = false, full = false;
      if (egg.row && S.rows[egg.row]) S.rows[egg.row].taken++;
      if (egg.golden) {
        if (S.spares < T.MAX_SPARES) { S.spares++; earned = true; }
        else full = true;
      }
      emit('egg', { lane: egg.lane, golden: !!egg.golden, earned: earned, full: full,
                    spares: S.spares, streak: egg.row ? S.rows[egg.row].taken : 1 });
    }
    function missed(egg) {
      egg.missed = true;
      var row = egg.row && S.rows[egg.row];
      if (!row || row.broken || egg.golden) return;
      row.broken = true;
      // The golden egg at the end of this row turns ordinary.
      for (var i = 0; i < S.things.length; i++) {
        var o = S.things[i];
        if (o.type === 'egg' && o.row === egg.row && o.golden) {
          o.golden = false; o.faded = true; o.fadedAt = S.t;
          emit('goldenLost', { lane: o.lane, d: o.d });
        }
      }
    }

    // ── knives ─────────────────────────────────────────────────────────
    function updateKnife(k, gate) {
      while (S.t >= k.until) {
        k.from = k.until;
        if (k.phase === 'up') { k.phase = 'chop'; k.until += T.KNIFE_CHOP_MS; }
        else if (k.phase === 'chop') {
          k.phase = 'down'; k.until += between(k.rng, T.KNIFE_DOWN_MS);
          if (!k.knocked) emit('chop', { ahead: gate.d - S.dist, lane: k.lane });
        }
        else if (k.phase === 'down') { k.phase = 'rise'; k.until += T.KNIFE_RISE_MS; }
        else { k.phase = 'up'; k.until += between(k.rng, T.KNIFE_UP_MS); }
      }
      var f = clamp((S.t - k.from) / Math.max(1, k.until - k.from), 0, 1);
      // h: 1 = fully raised, 0 = blade on the floor.
      k.h = k.phase === 'up' ? 1 : k.phase === 'chop' ? 1 - f * f
          : k.phase === 'down' ? 0 : f * f * (3 - 2 * f);
    }

    // ── the dog ────────────────────────────────────────────────────────
    function updateDog() {
      var dog = S.dog, p = S.player, visit = dog.visits[0];
      if (dog.state === 'leaving') {
        if (S.t - dog.leftAt > 900) dog.state = 'away';
        else return;
      }
      if (!visit) return;
      if (dog.state === 'away') {
        if (S.dist >= visit.warnD) {
          dog.state = 'warning'; dog.side = visit.side; dog.warnedAt = S.t;
          emit('dogWarning', { side: dog.side });
        }
      } else if (dog.state === 'warning') {
        if (S.dist >= visit.startD) {
          dog.state = 'alongside'; dog.phase = 'idle'; dog.arrivedAt = S.t; dog.snapIndex = 0;
          emit('dogArrive', { side: dog.side });
        }
      } else if (dog.state === 'alongside') {
        if (dog.phase === 'idle') {
          var snap = visit.snaps[dog.snapIndex];
          if (S.t - dog.arrivedAt >= T.DOG_STAY_MS) {
            dog.state = 'leaving'; dog.leftAt = S.t;
            dog.visits.shift();
            emit('dogLeave', { side: dog.side });
          } else if (snap && S.dist >= snap.windupD) {
            dog.phase = 'windup'; dog.windupAt = S.t; dog.phaseUntil = S.t + T.DOG_WINDUP_MS;
            emit('dogWindup', { side: dog.side });
          }
        } else if (dog.phase === 'windup') {
          if (S.t >= dog.phaseUntil) {
            // The bite reaches DOG_BITE_LANES lanes, counted from the dog's side
            // (two: its own lane and the middle). Safe in the air or beyond its reach.
            var lanesAway = (dog.side - p.lane) * dog.side;   // 0 = the dog's lane, 1 = middle, 2 = far lane
            var caught = p.grounded && lanesAway < T.DOG_BITE_LANES && S.t >= p.blinkUntil;
            dog.phase = 'snap'; dog.phaseUntil = S.t + T.DOG_SNAP_MS;
            emit('dogSnap', { side: dog.side, caught: caught });
            if (caught) hit('dog', null);
          }
        } else if (S.t >= dog.phaseUntil) {
          dog.phase = 'idle'; dog.snapIndex++;
        }
      }
    }

    // ── one tick ───────────────────────────────────────────────────────
    function step() {
      if (S.over) return;
      var dt = T.STEP_MS / 1000, p = S.player, i;
      S.t += T.STEP_MS;
      S.speed = speedAt(T, S.dist);
      S.dist += S.speed * dt;

      // Jumping.
      if (!p.grounded) {
        p.vy -= T.GRAVITY * dt;
        p.y += p.vy * dt;
        if (p.y <= 0) {
          p.y = 0; p.vy = 0; p.grounded = true;
          emit('land');
          // You can jump again the moment you land: a press made a little
          // before landing counts. A press made in the air after the dog began
          // winding up counts however early it came, so that answering a
          // wind-up with a jump always works, even from the middle of a jump.
          var forTheDog = S.dog.phase === 'windup' && p.jumpPressedAt >= S.dog.windupAt;
          if (forTheDog || S.t - p.jumpPressedAt <= T.JUMP_BUFFER_MS) doJump();
        }
      }
      // The drawn position slides after the lane.
      var targetX = p.lane * T.LANE_WIDTH;
      p.x += (targetX - p.x) * (1 - Math.exp(-T.STEP_MS / T.LANE_SLIDE_MS));
      if (Math.abs(targetX - p.x) < 0.3) p.x = targetX;

      generate();

      // Obstacles and eggs.
      var blinking = S.t < p.blinkUntil;
      for (i = 0; i < S.things.length && !S.over; i++) {
        var o = S.things[i], rel = o.d - S.dist;
        if (o.type === 'egg') {
          if (o.taken || o.missed) continue;
          if (o.lane === p.lane && Math.abs(rel) <= T.EGG_REACH) collect(o);   // on the floor or in midair
          else if (rel < -T.EGG_REACH) missed(o);
          continue;
        }
        if (o.knocked || o.ghost) continue;
        if (o.lane !== p.lane) { o.touchAt = null; continue; }
        var touching = Math.abs(rel) <= o.half + T.PLAYER_HALF_DEPTH;
        if (touching && blinking) { o.ghost = true; continue; }   // nothing can hurt you
        if (o.tall) { if (touching) hit('obstacle', o); continue; }
        // Flat obstacle. The egg is over it when high enough, or taking off.
        var over = p.y >= T.FLAT_CLEAR_HEIGHT || (!p.grounded && p.vy > 0);
        if (over && (touching || o.touchAt != null)) {
          // It passes underneath, or a late jump got the egg off it in time:
          // a close call. The late jump must count even when the obstacle has
          // already slid out from under the egg, which happens near top speed.
          // Otherwise the hit would wait and land when the egg came back down.
          o.touchAt = null;
          if (!o.jumped) { o.jumped = true; closeCall('jump'); }
        } else if (touching && o.touchAt == null) {
          if (rel <= 0) o.ghost = true;   // came down on its back half: cleared
          else o.touchAt = S.t;           // ran into it: a late jump can still save you
        }
        if (o.touchAt != null && !over && S.t - o.touchAt >= T.LATE_JUMP_GRACE_MS) {
          // While blinking nothing can hurt: the obstacle is let go for good,
          // so it cannot come back and hit once the blink is over.
          if (!hit('obstacle', o)) o.ghost = true;
        }
      }

      // Chopping knives. Jumping does not help: the blade comes from above.
      for (i = 0; i < S.gates.length && !S.over; i++) {
        var gate = S.gates[i], ahead = gate.d - S.dist;
        for (var k = 0; k < gate.knives.length; k++) {
          var knife = gate.knives[k];
          updateKnife(knife, gate);
          if (knife.knocked || knife.lane !== p.lane) continue;
          if (Math.abs(ahead) <= T.KNIFE_HALF_DEPTH && knife.h < T.KNIFE_DANGER_BELOW) hit('knife', knife);
        }
        if (!gate.passed && ahead < -T.KNIFE_HALF_DEPTH) { gate.passed = true; emit('knivesPassed'); }
      }

      if (!S.over) updateDog();

      S.score = Math.floor(S.dist / T.UNITS_PER_POINT) + S.eggs * T.EGG_POINTS;

      // Remember where the egg has been, for the line of spares.
      S.trail.push({ t: S.t, x: p.x, y: p.y });
      var keep = T.TRAIL_DELAY_MS * (T.MAX_SPARES + 1) + 100;
      while (S.trail.length && S.trail[0].t < S.t - keep) S.trail.shift();

      // Forget what is far behind.
      var cut = S.dist - T.DESPAWN_BEHIND;
      if (++sweep >= 30) {
        sweep = 0;
        S.things = S.things.filter(function (th) {
          if (th.d >= cut) return true;
          if (th.lastOfRow) delete S.rows[th.row];
          return false;
        });
      }
      while (S.gates.length && S.gates[0].d < cut) S.gates.shift();
    }

    // Advance by real time (any number of ms), in fixed steps.
    var carry = 0;
    function update(ms) {
      // A frame time that is not a real, positive number (a clock hiccup, or
      // a missing value) is ignored. Without this, one "not a number" would
      // stick in `carry` and the run would never move again, and a negative
      // one would freeze the run until it had been paid back.
      ms = Number(ms);
      if (!(ms > 0)) return;
      carry += ms;
      var n = 0;
      while (carry >= T.STEP_MS && n++ < 60) { step(); carry -= T.STEP_MS; }
      if (n >= 60) carry = 0;
    }

    function drain() { var out = events; events = []; return out; }

    generate();

    return { S: S, T: T, input: input, step: step, update: update, drain: drain,
             // Put things on the track by hand (used by the checks).
             place: { obstacle: addObstacle, eggs: addEggs, knives: addGate, dog: addDogVisit } };
  }

  var api = {
    createRun: createRun, speedAt: speedAt, advance: advance, minGapMs: minGapMs,
    TALL_KINDS: TALL_KINDS, FLAT_KINDS: FLAT_KINDS
  };
  root.ER = root.ER || {};
  root.ER.rules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
