/*
 * Egg Runner 2 — drawing a frame.
 *
 * This file only LOOKS at a run (run.S) and draws it. It never changes the
 * rules. The order each frame is: back wall, floor, track, then every thing
 * from farthest to nearest, then sparkles and pop-up words.
 */
(function (root) {
  'use strict';
  var ER = root.ER, A = ER.art, V = ER.view, C = ER.costumes;

  var TRACK_HALF = ER.TUNING.LANE_WIDTH * 1.5;   // three lanes
  var FLOOR_TILE = 360;            // kitchen floor tiles beside the track
  var KNIFE_UP_Y = 215;            // height of a raised blade's bottom edge
  var BEAM_Y = 392;                // underside of the beam knives hang from
  var SCENERY_STEP = 380;          // spacing of clutter beside the track
  var SCENERY_ROWS = [305, 560, 880, 1260, 1700, 2200, 2760];
  var MAX_PARTICLES = 140;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function ease(t) { return t * t * (3 - 2 * t); }
  function hash(a, b, c) {
    var x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function createRenderer(canvas) {
    var ctx = canvas.getContext('2d');
    var T = ER.TUNING;
    var L = null, dpr = 1, res = 2, backdrop = null;
    var particles = [], popups = [];
    var lastNow = 0, landedAt = -1e9, lastSweat = 0, eggAt = { x: 0, y: 0, s: 1 };

    // ── fitting the screen ─────────────────────────────────────────────
    function resize() {
      var w = Math.max(200, canvas.clientWidth || root.innerWidth || 400);
      var h = Math.max(200, canvas.clientHeight || root.innerHeight || 700);
      dpr = Math.min(root.devicePixelRatio || 1, 2);          // sharper than this costs speed for no visible gain
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      L = V.layout(w, h, T);
      // Pictures are kept sharp enough for the nearest things on this screen.
      res = clamp(Math.ceil(L.sp * 1.35 * dpr * 2) / 2, 1, 4);
      backdrop = buildBackdrop();
    }

    function proj(x, y, z) { return V.project(L, x, y, z); }
    function floorY(z) { return L.vanishY + L.camH * L.sp * L.camBack / (z + L.camBack); }

    // ── the back wall (drawn once per screen size) ─────────────────────
    function buildBackdrop() {
      var k = L.farS, w = L.w, h = Math.ceil(L.farY) + 2;
      var cv = document.createElement('canvas');
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      var c = cv.getContext('2d');
      c.scale(dpr, dpr);
      function X(u) { return L.cx + u * k; }
      function Y(u) { return L.farY - u * k; }
      function box(x, y0, wd, ht, fill, stroke, r) {       // a box sitting at height y0
        A.rr(c, X(x - wd / 2), Y(y0 + ht), wd * k, ht * k, (r || 0) * k);
        A.paint(c, fill, stroke === undefined ? A.INK : stroke, Math.max(1, 14 * k));
      }
      var half = w / 2 / k + 200;                           // how much wall is visible
      var lw = Math.max(1, 14 * k);

      // Painted wall and tiled backsplash.
      c.fillStyle = A.grad(c, 0, 0, 0, h, ['#a9dce6', '#cfeef0']); c.fillRect(0, 0, w, h);
      c.fillStyle = '#f7fbfc'; c.fillRect(0, Y(1180), w, 420 * k);
      c.strokeStyle = '#cfe3e8'; c.lineWidth = Math.max(1, 6 * k);
      c.beginPath();
      for (var ty = 760; ty <= 1180; ty += 140) { c.moveTo(0, Y(ty)); c.lineTo(w, Y(ty)); }
      for (var tx = -Math.ceil(half / 140) * 140; tx <= half; tx += 140) { c.moveTo(X(tx), Y(760)); c.lineTo(X(tx), Y(1180)); }
      c.stroke();
      c.fillStyle = '#7cc3d1'; c.fillRect(0, Y(1200), w, 22 * k);

      // Windows, with shelves and clocks between them.
      for (var wx = -Math.ceil(half / 3000) * 3000; wx <= half; wx += 3000) {
        box(wx, 1270, 1180, 1100, '#ffffff', A.INK, 30);
        A.rr(c, X(wx - 530), Y(2310), 1060 * k, 980 * k, 14 * k);
        A.paint(c, A.grad(c, 0, Y(2310), 0, Y(1330), ['#6ec3ff', '#d8f2ff']), A.INK, lw * 0.7);
        A.oval(c, X(wx + 300), Y(2050), 110 * k, 110 * k); A.paint(c, '#ffe066', null);
        c.fillStyle = '#ffffff';
        A.oval(c, X(wx - 220), Y(1800), 130 * k, 70 * k); c.fill(); A.oval(c, X(wx - 110), Y(1850), 110 * k, 80 * k); c.fill();
        A.oval(c, X(wx - 20), Y(1790), 110 * k, 60 * k); c.fill();
        c.fillStyle = '#ffffff'; c.fillRect(X(wx - 20), Y(2310), 40 * k, 980 * k); c.fillRect(X(wx - 530), Y(1840), 1060 * k, 40 * k);
        box(wx, 1230, 1240, 50, '#ffffff', A.INK, 14);
        // Shelf and clock, halfway to the next window.
        var sx = wx + 1750;
        box(sx, 1500, 1000, 46, '#c98f55', A.INK, 10);
        var jars = ['#e5484d', '#ffd43b', '#59b34a', '#8253d8', '#ff8a3d'];
        for (var j = 0; j < 5; j++) box(sx - 380 + j * 190, 1546, 120, 150 + (j % 2) * 50, jars[j], A.INK, 24);
        A.oval(c, X(sx), Y(2060), 170 * k, 170 * k); A.paint(c, '#ffffff', A.INK, lw);
        c.beginPath(); c.moveTo(X(sx), Y(2060)); c.lineTo(X(sx), Y(2170)); c.moveTo(X(sx), Y(2060)); c.lineTo(X(sx + 70), Y(2020));
        A.paint(c, null, A.INK, lw);
      }

      // Cabinets along the wall, with an oven and a fridge now and then.
      var CAB = 3000 / 7;                                   // seven to a window
      for (var i = -Math.ceil(half / CAB); i <= Math.ceil(half / CAB); i++) {
        var cx = i * CAB, kind = ((i % 7) + 7) % 7;
        if (kind === 2) {                                    // fridge, just right of a window
          box(cx, 0, CAB - 12, 2400, A.grad(c, X(cx - 200), 0, X(cx + 200), 0, ['#f4f7fa', '#d9e0e8']), A.INK, 30);
          box(cx, 800, CAB - 12, 14, A.INK, null);
          box(cx - 150, 900, 30, 260, '#9aa5b1', A.INK, 14); box(cx - 150, 420, 30, 260, '#9aa5b1', A.INK, 14);
          continue;
        }
        box(cx, 0, CAB, 740, '#f4a259', A.INK, 0);
        if (kind === 5) {                                    // oven
          box(cx, 60, CAB - 60, 620, '#4a4f57', A.INK, 24);
          box(cx, 130, CAB - 150, 330, A.grad(c, 0, Y(460), 0, Y(130), ['#2a2f36', '#ffb54a']), A.INK, 16);
          box(cx, 500, CAB - 130, 34, '#cfd6de', A.INK, 14);
          for (var b = -1; b <= 1; b++) { A.oval(c, X(cx + b * 100), Y(610), 26 * k, 26 * k); A.paint(c, '#e6ebf0', A.INK, lw * 0.7); }
        } else if (kind === 4) {                             // drawers
          for (var d = 0; d < 3; d++) { box(cx, 80 + d * 215, CAB - 70, 185, '#f7b877', A.INK, 14); box(cx, 160 + d * 215, 130, 26, '#ffffff', A.INK, 12); }
        } else {                                             // doors
          box(cx - 105, 80, 180, 600, '#f7b877', A.INK, 14); box(cx + 105, 80, 180, 600, '#f7b877', A.INK, 14);
          A.oval(c, X(cx - 40), Y(420), 20 * k, 20 * k); A.paint(c, '#ffffff', A.INK, lw * 0.7);
          A.oval(c, X(cx + 40), Y(420), 20 * k, 20 * k); A.paint(c, '#ffffff', A.INK, lw * 0.7);
        }
        c.fillStyle = '#5b3a1e'; c.fillRect(X(cx - CAB / 2), Y(60), CAB * k, 60 * k);
        // Something on the counter above it.
        var item = ((i % 5) + 5) % 5;
        if (i === 0) continue;
        if (item === 0) { box(cx, 790, 200, 150, '#e5484d', A.INK, 50); box(cx + 130, 850, 80, 26, '#e5484d', A.INK, 12); box(cx, 940, 60, 40, '#3f444b', A.INK, 12); }
        else if (item === 2) { box(cx, 790, 260, 110, '#8253d8', A.INK, 20); A.oval(c, X(cx - 60), Y(930), 60 * k, 55 * k); A.paint(c, '#ff8a3d', A.INK, lw * 0.7); A.oval(c, X(cx + 50), Y(925), 55 * k, 50 * k); A.paint(c, '#e5484d', A.INK, lw * 0.7); }
        else if (item === 3) { box(cx, 790, 130, 170, '#59b34a', A.INK, 20); for (var u = -1; u <= 1; u++) box(cx + u * 36, 960, 18, 150, '#c98f55', A.INK, 8); }
      }
      // Counter top.
      c.fillStyle = '#fff8ea'; c.fillRect(0, Y(790), w, 50 * k);
      c.fillStyle = A.INK; c.fillRect(0, Y(790), w, Math.max(1, 10 * k)); c.fillRect(0, Y(742), w, Math.max(1, 10 * k));
      // The gap under the cabinets where the track comes out.
      var aw = (TRACK_HALF + 40) * k;
      c.beginPath(); c.moveTo(L.cx - aw, L.farY + 2); c.lineTo(L.cx - aw, Y(250));
      c.quadraticCurveTo(L.cx - aw, Y(430), L.cx, Y(430)); c.quadraticCurveTo(L.cx + aw, Y(430), L.cx + aw, Y(250));
      c.lineTo(L.cx + aw, L.farY + 2); c.closePath();
      A.paint(c, A.grad(c, 0, Y(430), 0, L.farY, ['#2a1c14', '#5b4130']), A.INK, lw);
      // Skirting line where wall meets floor.
      c.fillStyle = 'rgba(58,38,24,0.35)'; c.fillRect(0, L.farY - 1, w, 3);
      return cv;
    }

    // ── floor and track ────────────────────────────────────────────────
    function drawFloor(dist) {
      var w = L.w, h = L.h, zNear = -T.CAM_BACK + 60, zFar = T.FAR_WALL;
      ctx.fillStyle = '#f6e7c8';
      ctx.fillRect(0, L.farY, w, h - L.farY);
      // Bands of floor tiles sliding toward you.
      ctx.fillStyle = '#eddab5';
      var d0 = Math.floor((dist + zNear) / FLOOR_TILE) * FLOOR_TILE, d;
      for (d = d0; d < dist + zFar; d += FLOOR_TILE) {
        if (Math.round(d / FLOOR_TILE) & 1) continue;
        var yb = floorY(Math.max(zNear, d - dist)), yt = floorY(Math.min(zFar, d + FLOOR_TILE - dist));
        if (yt < h) ctx.fillRect(0, yt, w, Math.min(h, yb) - yt);
      }
      // Tile joints running away to the vanishing point.
      var sNear = L.sp * L.camBack / (zNear + L.camBack), yNear = floorY(zNear);
      var n = Math.ceil(w / 2 / L.farS / FLOOR_TILE) + 1;
      ctx.strokeStyle = 'rgba(190,160,110,0.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var i = -n; i <= n; i++) {
        var x = (i + 0.5) * FLOOR_TILE;
        if (Math.abs(x) < TRACK_HALF + 20) continue;
        ctx.moveTo(L.cx + x * L.farS, L.farY); ctx.lineTo(L.cx + x * sNear, yNear);
      }
      ctx.stroke();

      // The track: a three-lane checkered runner.
      function quad(x0, x1, z0, z1) {
        var a = proj(x0, 0, z1), b = proj(x1, 0, z1), c2 = proj(x1, 0, z0), e = proj(x0, 0, z0);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(e.x, e.y); ctx.closePath();
      }
      quad(-TRACK_HALF - 22, TRACK_HALF + 22, zNear, zFar); ctx.fillStyle = '#fff6e0'; ctx.fill();
      quad(-TRACK_HALF - 22, TRACK_HALF + 22, zNear, zFar); ctx.strokeStyle = 'rgba(58,38,24,0.5)'; ctx.lineWidth = 2; ctx.stroke();
      quad(-TRACK_HALF, TRACK_HALF, zNear, zFar); ctx.fillStyle = '#46b3c2'; ctx.fill();
      ctx.fillStyle = '#2f98aa';
      var LW = T.LANE_WIDTH;
      d0 = Math.floor((dist + zNear) / LW) * LW;
      for (d = d0; d < dist + zFar; d += LW) {
        var z0 = Math.max(zNear, d - dist), z1 = Math.min(zFar, d + LW - dist), row = Math.round(d / LW);
        if (z1 <= z0) continue;
        ctx.globalAlpha = clamp(1.25 - z0 / zFar, 0.3, 1);     // softer far away
        for (var lane = 0; lane < 3; lane++) {
          if ((row + lane) & 1) continue;
          quad(-TRACK_HALF + lane * LW, -TRACK_HALF + (lane + 1) * LW, z0, z1); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      // Lane lines.
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (var s = -1; s <= 1; s += 2) {
        var f = proj(s * LW / 2, 0, zFar), g = proj(s * LW / 2, 0, zNear);
        ctx.moveTo(f.x, f.y); ctx.lineTo(g.x, g.y);
      }
      ctx.stroke();
      // Distance haze, so far things arrive softly.
      var hz = (h - L.farY) * 0.2;
      var haze = ctx.createLinearGradient(0, L.farY, 0, L.farY + hz);
      haze.addColorStop(0, 'rgba(255,246,226,0.85)'); haze.addColorStop(1, 'rgba(255,246,226,0)');
      ctx.fillStyle = haze; ctx.fillRect(0, L.farY, w, hz);
    }

    function shadow(p, halfW, alpha) {
      ctx.fillStyle = 'rgba(60,38,20,' + (alpha === undefined ? 0.22 : alpha) + ')';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, halfW * p.s, halfW * 0.26 * p.s, 0, 0, 6.283); ctx.fill();
    }
    // How visible something at depth z is: fades in far away, fades out
    // once it is behind the egg so it never hides the egg or the spares.
    function visible(z) {
      var a = clamp((T.SEE_AHEAD - z) / T.FADE_IN, 0, 1);
      if (z < -30) a *= clamp(1 - (-30 - z) / 130, 0, 1);
      return a;
    }

    // ── one frame ──────────────────────────────────────────────────────
    // o.costume  what the egg wears      o.zoom  0..1 through the ending zoom
    // o.frozen   true while paused (nothing animates)
    function draw(run, now, o) {
      if (!L) resize();
      var S = run.S, p = S.player, dist = S.dist, i, z, q, a;
      var dt = o.frozen ? 0 : clamp(now - lastNow, 0, 60);
      lastNow = now;
      var clock = S.over ? S.overAt + (o.sinceOver || 0) : S.t;   // animation clock keeps ticking after the end

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var eg = proj(p.x, p.y, 0);
      eggAt.x = eg.x; eggAt.y = eg.y; eggAt.s = eg.s;
      if (o.zoom > 0) {
        var e = ease(clamp(o.zoom, 0, 1)), zoom = 1 + (T.ENDING_ZOOM - 1) * e;
        var fx = eg.x, fy = eg.y - 44 * eg.s;
        ctx.translate(fx + (L.cx - fx) * e, fy + (L.h * 0.5 - fy) * e);
        ctx.scale(zoom, zoom);
        ctx.translate(-fx, -fy);
      }
      ctx.drawImage(backdrop, 0, 0, L.w, backdrop.height / dpr);
      drawFloor(dist);
      drawBiteZone(S, clock);

      // Gather everything, then draw far to near.
      var list = [];
      // Clutter beside the track.
      var k0 = Math.floor((dist - T.CAM_BACK + 130) / SCENERY_STEP), k1 = Math.floor((dist + T.FAR_WALL - 60) / SCENERY_STEP);
      for (var r = 0; r < SCENERY_ROWS.length; r++) {
        if (SCENERY_ROWS[r] * L.farS > L.w / 2 + 60) break;       // this row is off screen
        for (var side = -1; side <= 1; side += 2) {
          for (var k = k0; k <= k1; k++) {
            var h1 = hash(k, side, r);
            if (h1 < 0.34) continue;
            var names = r < 2 ? A.SCENERY_NEAR : A.SCENERY_FAR;
            var name = names[Math.floor(hash(k, side, r + 9) * names.length)];
            z = k * SCENERY_STEP + hash(k, side, r + 5) * 200 - dist;
            if (z < -T.CAM_BACK + 130 || z > T.FAR_WALL - 60) continue;
            list.push({ z: z, kind: 'scenery', name: name, x: side * (SCENERY_ROWS[r] + (h1 - 0.5) * 150) });
          }
        }
      }
      for (i = 0; i < S.things.length; i++) {
        var th = S.things[i];
        z = th.d - dist;
        if (z > T.SEE_AHEAD || z < -T.CAM_BACK + 90) continue;
        if (th.type === 'egg') { if (!th.taken) list.push({ z: z, kind: 'egg', th: th }); }
        else list.push({ z: th.knocked ? Math.max(z, 20) : z, kind: 'obstacle', th: th });
      }
      for (i = 0; i < S.gates.length; i++) {
        z = S.gates[i].d - dist;
        if (z > T.SEE_AHEAD || z < -T.CAM_BACK + 90) continue;
        list.push({ z: z, kind: 'gate', gate: S.gates[i] });
      }
      if (S.dog.state !== 'away') list.push({ z: T.DOG_AHEAD, kind: 'dog' });
      list.push({ z: 0, kind: 'player' });
      for (i = 0; i < S.spares; i++) list.push({ z: -(i + 1) * T.TRAIL_GAP, kind: 'spare', i: i });
      list.sort(function (m, n) { return n.z - m.z; });

      for (i = 0; i < list.length; i++) {
        var it = list[i];
        z = it.z;
        if (it.kind === 'scenery') {
          q = proj(it.x, 0, z);
          var pic = A.PICS[it.name];
          if (Math.abs(q.x - L.cx) - pic.w * q.s / 2 > L.w / 2) continue;
          a = clamp((T.FAR_WALL - 60 - z) / 500, 0, 1);
          if (a <= 0) continue;
          ctx.globalAlpha = a;
          shadow(q, pic.w * 0.5);
          A.stamp(ctx, it.name, q.x, q.y, q.s, res);
          ctx.globalAlpha = 1;
        } else if (it.kind === 'obstacle') {
          drawObstacle(it.th, z, S, clock);
        } else if (it.kind === 'egg') {
          a = visible(z);
          if (a <= 0) continue;
          var bobY = 22 + Math.sin(clock * 0.005 + it.th.d * 0.02) * 6;
          q = proj(it.th.lane * T.LANE_WIDTH, bobY, z);
          ctx.globalAlpha = a;
          shadow(proj(it.th.lane * T.LANE_WIDTH, 0, z), 17, 0.18);
          var pulse = it.th.golden ? 1 + Math.sin(clock * 0.008) * 0.07 : 1;
          A.stamp(ctx, it.th.golden ? 'golden' : 'egg', q.x, q.y, q.s * pulse, res);
          ctx.globalAlpha = 1;
        } else if (it.kind === 'gate') {
          drawGate(it.gate, z, S, clock);
        } else if (it.kind === 'dog') {
          drawDogAt(S, clock, o);
        } else if (it.kind === 'player') {
          drawPlayer(S, clock, o, now);
        } else {
          drawSpare(S, it.i, clock);
        }
      }

      if (S.dog.state === 'warning') drawPawWarning(S, clock);
      drawParticles(dt);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (o.zoom > 0) {                                     // soft dark edges as it zooms
        var vg = ctx.createRadialGradient(L.cx, L.h / 2, Math.min(L.w, L.h) * 0.3, L.cx, L.h / 2, Math.max(L.w, L.h) * 0.75);
        vg.addColorStop(0, 'rgba(40,24,12,0)'); vg.addColorStop(1, 'rgba(40,24,12,' + (0.45 * clamp(o.zoom, 0, 1)) + ')');
        ctx.fillStyle = vg; ctx.fillRect(0, 0, L.w, L.h);
      }
    }

    function flyOff(knockedAt, clock, lane, id) {
      var t = clamp((clock - knockedAt) / 650, 0, 1);
      var dir = lane !== 0 ? lane : (id % 2 ? 1 : -1);
      return { t: t, dx: dir * t * 420, dy: Math.sin(t * Math.PI) * 190 + t * 60, rot: dir * t * 5, alpha: 1 - t * t };
    }

    function drawObstacle(th, z, S, clock) {
      var pic = A.PICS[th.kind], x = th.lane * T.LANE_WIDTH, q;
      if (th.knocked !== null) {
        var f = flyOff(th.knocked, clock, th.lane, th.id);
        if (f.t >= 1) return;
        q = proj(x + f.dx, pic.h / 2 + f.dy, z + f.t * 260);
        ctx.save(); ctx.globalAlpha = f.alpha; ctx.translate(q.x, q.y); ctx.rotate(f.rot);
        A.stamp(ctx, th.kind, 0, pic.h / 2 * q.s, q.s, res);
        ctx.restore();
        return;
      }
      var a = visible(z);
      if (a <= 0) return;
      q = proj(x, 0, z);
      ctx.globalAlpha = a;
      shadow(q, pic.w * 0.5);
      A.stamp(ctx, th.kind, q.x, q.y, q.s, res);
      ctx.globalAlpha = 1;
    }

    function drawGate(gate, z, S, clock) {
      var a = visible(z), i, q;
      if (a <= 0) return;
      ctx.globalAlpha = a;
      for (i = 0; i < gate.knives.length; i++) {
        var kn = gate.knives[i], x = kn.lane * T.LANE_WIDTH;
        if (kn.knocked !== null) {
          var f = flyOff(kn.knocked, clock, kn.lane, gate.id + i);
          if (f.t >= 1) continue;
          q = proj(x + f.dx, 80 + f.dy, z + f.t * 200);
          ctx.save(); ctx.globalAlpha = a * f.alpha; ctx.translate(q.x, q.y); ctx.rotate(f.rot);
          A.stamp(ctx, 'cleaver', 0, 80 * q.s, q.s, res);
          ctx.restore(); ctx.globalAlpha = a;
          continue;
        }
        var by = kn.h * KNIFE_UP_Y, down = kn.h < T.KNIFE_DANGER_BELOW;
        // Shadow on the floor: grows and reddens as the blade comes down.
        q = proj(x, 0, z);
        ctx.fillStyle = down ? 'rgba(200,40,40,0.38)' : 'rgba(60,38,20,' + (0.12 + 0.14 * (1 - kn.h)) + ')';
        ctx.beginPath(); ctx.ellipse(q.x, q.y, (30 + 22 * (1 - kn.h)) * q.s, (9 + 6 * (1 - kn.h)) * q.s, 0, 0, 6.283); ctx.fill();
        // The rod it slides on.
        var top = proj(x, BEAM_Y, z), mid = proj(x, by + 150, z);
        ctx.fillStyle = '#8f9aa6'; ctx.fillRect(top.x - 4 * q.s, top.y, 8 * q.s, mid.y - top.y);
        q = proj(x, by, z);
        A.stamp(ctx, 'cleaver', q.x, q.y, q.s, res);
        if (kn.phase === 'down' && clock - kn.from < 90) {    // thunk lines when it lands
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3 * q.s; ctx.lineCap = 'round';
          ctx.beginPath();
          for (var s = -1; s <= 1; s += 2) { ctx.moveTo(q.x + s * 48 * q.s, q.y - 4 * q.s); ctx.lineTo(q.x + s * 70 * q.s, q.y - 16 * q.s); }
          ctx.stroke();
        }
      }
      q = proj(0, 0, z);
      A.stamp(ctx, 'frame', q.x, q.y, q.s, res);
      ctx.globalAlpha = 1;
    }

    function drawDogAt(S, clock, o) {
      var dog = S.dog, side = dog.side, x = L.dogX, z = T.DOG_AHEAD, f = 0, phase = dog.phase;
      if (dog.state === 'warning') return;
      if (dog.state === 'alongside') {
        var tin = 1 - ease(clamp((S.t - dog.arrivedAt) / 450, 0, 1));
        x += tin * 700; z -= tin * 260;
        var len = phase === 'windup' ? T.DOG_WINDUP_MS : T.DOG_SNAP_MS;
        f = phase === 'idle' ? 0 : clamp(1 - (dog.phaseUntil - S.t) / len, 0, 1);
        // The snap reaches DOG_BITE_LANES lanes, so the lunge must be SEEN to
        // cross them: with two, the dog leaps over its own lane until its
        // jaws are in the middle lane, then springs back.
        if (phase === 'windup') x += 16 * f;                       // draws back first
        if (phase === 'snap') {
          var jawsAt = (1.5 - T.DOG_BITE_LANES) * T.LANE_WIDTH + 62;   // where the dog stands at full stretch
          var go = Math.sin(Math.min(1, f * 1.25) * Math.PI);
          x += (Math.min(x, jawsAt + 62) - x) * go; z -= 100 * go;
        }
      } else if (dog.state === 'leaving') {
        var out = ease(clamp((S.t - dog.leftAt) / 900, 0, 1));
        x += out * 800; z += out * 500; phase = 'idle';
      }
      var ate = S.over && S.cause === 'dog';
      var q = proj(side * x, 0, z);
      if (ate) { phase = 'idle'; q = proj(S.player.x + side * 80, 0, 6); }   // sitting where the egg was
      shadow(q, 62);
      ctx.save(); ctx.translate(q.x, q.y); ctx.scale(q.s * side, q.s);
      A.drawDog(ctx, { t: clock, phase: phase, f: f, happy: ate });
      ctx.restore();
    }

    // While the dog winds up, the lanes its snap will reach glow red on the
    // floor around the egg, so it is clear which lanes are about to be bitten
    // (two of them: the dog's lane and the middle). This is a warning the
    // player relies on: keep it obvious.
    function drawBiteZone(S, clock) {
      var dog = S.dog;
      if (dog.state !== 'alongside' || dog.phase === 'idle' || S.over) return;
      var f = dog.phase === 'windup' ? clamp(1 - (dog.phaseUntil - S.t) / T.DOG_WINDUP_MS, 0, 1) : 1;
      var LW = T.LANE_WIDTH, outer = dog.side * LW * 1.5, inner = outer - dog.side * LW * T.DOG_BITE_LANES;
      var a = proj(Math.min(outer, inner), 0, 250), b = proj(Math.max(outer, inner), 0, 250);
      var c2 = proj(Math.max(outer, inner), 0, -90), d = proj(Math.min(outer, inner), 0, -90);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(d.x, d.y); ctx.closePath();
      var pulse = dog.phase === 'snap' ? 0.5 : 0.14 + 0.26 * f + Math.sin(clock * 0.03) * 0.05;
      ctx.fillStyle = 'rgba(229,72,77,' + pulse.toFixed(3) + ')'; ctx.fill();
      ctx.strokeStyle = 'rgba(179,32,47,' + (0.35 + 0.4 * f).toFixed(3) + ')'; ctx.lineWidth = 3 * L.sp; ctx.stroke();
    }

    function drawPawWarning(S, clock) {
      var dog = S.dog, side = dog.side, n = 6;
      var prog = clamp((S.t - dog.warnedAt) / T.DOG_WARN_MS, 0, 1);
      for (var i = 0; i < n; i++) {
        if (prog < i / n) break;
        var q = proj(side * (L.dogX + 10 + (i % 2 ? 22 : -22)), 0, -40 + i * 58);
        var sp = A.sprite('paw', res);
        ctx.save(); ctx.translate(q.x, q.y); ctx.scale(q.s, q.s * 0.45);
        ctx.globalAlpha = clamp((prog - i / n) * 8, 0, 1);
        ctx.drawImage(sp.img, -sp.ox, -sp.oy + 30, sp.w, sp.h);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      // A badge at the screen edge on the side it is coming from.
      var bx = side > 0 ? L.w - 36 * L.sp - 8 : 36 * L.sp + 8, by = L.eggY - 190 * L.sp;
      var pulse = 1 + Math.sin(clock * 0.02) * 0.1, rad = 30 * L.sp * pulse;
      ctx.beginPath(); ctx.arc(bx, by, rad, 0, 6.283);
      ctx.fillStyle = '#fff8ea'; ctx.fill(); ctx.strokeStyle = '#e5484d'; ctx.lineWidth = 4 * L.sp; ctx.stroke();
      var ps = A.sprite('paw', res), k = rad / 42;
      ctx.drawImage(ps.img, bx - ps.ox * k, by - (ps.oy - 28) * k, ps.w * k, ps.h * k);
    }

    function drawPlayer(S, clock, o, now) {
      var p = S.player, ground = proj(p.x, 0, 0), q = proj(p.x, p.y, 0);
      var eaten = S.over && S.cause === 'dog';
      var air = p.grounded ? 0 : clamp(p.y / 110, 0.05, 1);
      shadow(ground, 30 * (1 - air * 0.45), 0.24 * (1 - air * 0.5));
      if (eaten) return;                                     // the dog has it
      var mood = S.over ? 'cracked' : S.t < p.sweatUntil ? 'worried' : 'happy';
      var sx = 1, sy = 1;
      if (!p.grounded) { var v = clamp(p.vy / T.JUMP_SPEED, -1, 1); sy = 1 + Math.abs(v) * 0.1; sx = 1 - Math.abs(v) * 0.07; }
      else { var since = S.t - landedAt; if (since < 130) { var sq = 1 - since / 130; sy = 1 - sq * 0.14; sx = 1 + sq * 0.12; } }
      var tilt = clamp((p.lane * T.LANE_WIDTH - p.x) * 0.004, -0.3, 0.3);
      ctx.save();
      if (!S.over && S.t < p.blinkUntil) ctx.globalAlpha = Math.floor(S.t / 90) % 2 ? 0.25 : 0.85;
      ctx.translate(q.x, q.y); ctx.rotate(tilt); ctx.scale(q.s * sx, q.s * sy);
      C.drawEgg(ctx, { costume: o.costume, mood: mood, t: clock, air: air, still: false });
      ctx.restore();
      // Sweat: tear-shaped drops flying off while worried.
      if (mood === 'worried' && !o.frozen && now - lastSweat > 85) {
        lastSweat = now;
        var dir = Math.random() < 0.5 ? -1 : 1;
        addParticle({ kind: 'drop', x: q.x + dir * 24 * q.s, y: q.y - 66 * q.s, vx: dir * (0.07 + Math.random() * 0.09) * q.s,
                      vy: -(0.1 + Math.random() * 0.12) * q.s, life: 520, size: 6 * q.s, grav: 0.0006 * q.s });
      }
    }

    function drawSpare(S, i, clock) {
      var want = S.t - (i + 1) * T.TRAIL_DELAY_MS, tr = S.trail, x = S.player.x, y = 0;
      for (var j = tr.length - 1; j >= 0; j--) { if (tr[j].t <= want) { x = tr[j].x; y = tr[j].y; break; } }
      if (tr.length && tr[0].t > want) { x = tr[0].x; y = tr[0].y; }
      var z = -(i + 1) * T.TRAIL_GAP;
      var hop = y > 0 ? 0 : Math.abs(Math.sin(clock * 0.021 + i * 1.3)) * 5;
      shadow(proj(x, 0, z), 12, 0.2);
      var q = proj(x, y + hop, z);
      A.stamp(ctx, 'spare', q.x, q.y, q.s, res);
    }

    // ── sparkles, shell bits, sweat and pop-up words ───────────────────
    function addParticle(pt) {
      if (particles.length >= MAX_PARTICLES) particles.shift();
      pt.max = pt.life; particles.push(pt);
    }
    function burst(x, y, n, kind, colors, speed, life) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * 6.283, sp = (0.3 + Math.random() * 0.7) * speed * L.sp;
        addParticle({ kind: kind, x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * 0.5 * L.sp,
                      life: life * (0.7 + Math.random() * 0.5), size: (4 + Math.random() * 4) * L.sp,
                      color: colors[i % colors.length], grav: 0.0009 * L.sp, rot: Math.random() * 6 });
      }
    }
    function drawParticles(dt) {
      var i, p, a;
      for (i = particles.length - 1; i >= 0; i--) {
        p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.vy += (p.grav || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        a = clamp(p.life / p.max * 1.6, 0, 1);
        ctx.globalAlpha = a;
        if (p.kind === 'drop') {
          var ang = Math.atan2(p.vy, p.vx) - Math.PI / 2;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
          ctx.beginPath(); ctx.moveTo(0, -p.size * 1.5); ctx.quadraticCurveTo(p.size, p.size * 0.3, 0, p.size * 0.8);
          ctx.quadraticCurveTo(-p.size, p.size * 0.3, 0, -p.size * 1.5);
          ctx.fillStyle = '#7fd1ff'; ctx.fill(); ctx.strokeStyle = '#2f7ff0'; ctx.lineWidth = 1.2; ctx.stroke();
          ctx.restore();
        } else if (p.kind === 'shell') {
          p.rot += dt * 0.012;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.beginPath(); ctx.moveTo(-p.size, 0); ctx.lineTo(0, -p.size * 0.8); ctx.lineTo(p.size, 0); ctx.lineTo(0, p.size * 0.6); ctx.closePath();
          ctx.fillStyle = p.color; ctx.fill(); ctx.strokeStyle = A.INK; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.restore();
        } else {
          ctx.fillStyle = p.color;
          A.star(ctx, p.x, p.y, p.size * (0.6 + a * 0.6), 4); ctx.fill();
        }
      }
      for (i = popups.length - 1; i >= 0; i--) {
        p = popups[i];
        p.life -= dt;
        if (p.life <= 0) { popups.splice(i, 1); continue; }
        p.y -= dt * 0.05 * L.sp;
        ctx.globalAlpha = clamp(p.life / 300, 0, 1);
        ctx.font = '900 ' + Math.round(p.size * L.sp) + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round'; ctx.lineWidth = 5 * L.sp; ctx.strokeStyle = '#ffffff'; ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y);
      }
      ctx.globalAlpha = 1;
    }

    // Effects the game asks for when things happen.
    var fx = {
      egg: function (golden) {
        burst(eggAt.x, eggAt.y - 44 * eggAt.s, golden ? 16 : 7, 'spark', golden ? ['#ffd43b', '#ffffff', '#ff8a3d'] : ['#ffffff', '#ffe680'], 0.22, 420);
      },
      popup: function (text, color, size) {
        var x = clamp(eggAt.x, 70 * L.sp, L.w - 70 * L.sp);
        popups.push({ text: text, x: x, y: eggAt.y - 110 * eggAt.s - popups.length * 8, life: 900, color: color || '#3a2618', size: size || 26 });
        if (popups.length > 6) popups.shift();
      },
      // Shell bits fly from the spare that cracked (number `index` in the
      // line), or from the egg itself when index is undefined.
      shell: function (index) {
        var q = index === undefined ? eggAt : proj(run0x(), 10, -(index + 1) * T.TRAIL_GAP);
        burst(q.x, q.y - 30 * q.s, 14, 'shell', ['#fffaf0', '#ffffff', '#ffe680'], 0.3, 600);
      },
      poof: function (lane, z) {
        var q = proj(lane * T.LANE_WIDTH, 40, z);
        burst(q.x, q.y, 8, 'spark', ['#cfd6de', '#ffffff'], 0.12 * q.s / L.sp, 380);
      },
      land: function (t) { landedAt = t; },
      clear: function () { particles.length = 0; popups.length = 0; landedAt = -1e9; }
    };
    function run0x() { return (eggAt.x - L.cx) / eggAt.s; }

    resize();
    return { resize: resize, draw: draw, fx: fx, layout: function () { return L; } };
  }

  ER.createRenderer = createRenderer;
})(typeof self !== 'undefined' ? self : globalThis);
