/*
 * Egg Runner 2 — drawing a frame.
 *
 * This file only LOOKS at a run (run.S) and draws it. It never changes the
 * rules. The order each frame is: far wall, floor, track, then every thing
 * from farthest to nearest, then sparkles, pop-up words and a little
 * atmosphere on top.
 *
 * What keeps it fast, on phones and on very big screens alike:
 *   - Anything that does not move is painted ONCE into a hidden picture (the
 *     far wall, the lit floor, the track's edges) and simply copied each
 *     frame. Only the parts that slide toward you are drawn fresh.
 *   - The far wall changes with the time of day, but slowly, so its light
 *     is re-mixed about once a second and the sky in its windows a few
 *     times a second, never every frame.
 *   - Very large, very sharp screens are drawn with fewer pixels than they
 *     have (see MAX_PIXELS and MAX_DETAIL). On a cartoon it is hard to
 *     tell, and it keeps the game smooth.
 *
 * Light comes from the upper left, so shadows fall a little to the right.
 */
(function (root) {
  'use strict';
  var ER = root.ER, A = ER.art, V = ER.view, C = ER.costumes;

  var TAU = Math.PI * 2;
  var LANE = ER.TUNING.LANE_WIDTH;
  var TRACK_HALF = LANE * 1.5;     // three lanes
  var KERB = 22;                   // the pale raised edge either side of the track
  var FLOOR_TILE = 360;            // kitchen floor tiles beside the track
  var KNIFE_UP_Y = 215;            // height of a raised blade's bottom edge
  var BEAM_Y = 390;                // underside of the beam knives hang from
  var SCENERY_STEP = 380;          // spacing of clutter beside the track
  var SCENERY_ROWS = [400, 640, 920, 1280, 1700, 2200, 2760];
  var MAX_PARTICLES = 170;
  var MAX_PIXELS = 2300000;        // most real pixels the game will draw. A bigger
                                   // or sharper screen is drawn a little softer
                                   // instead of slower.
  var MAX_DETAIL = 2.5;            // most real pixels per game unit, where the egg
                                   // stands. The pictures hold no finer detail.
  var WALL_REPEAT = 2400;          // the far wall repeats this often (wall units)
  var MIX_EVERY_MS = 1200;         // how often the far wall's light is re-mixed
  var SKY_EVERY_MS = 250;          // how often the sky in each window is redrawn
  var FLOOR = '#f6e7c8';
  var INK = '#3a2618';

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function ease(t) { return t * t * (3 - 2 * t); }
  function step01(a, b, v) { return ease(clamp((v - a) / (b - a), 0, 1)); }
  function hash(a, b, c) {
    var x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
    return x - Math.floor(x);
  }
  function rgba(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')'; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, (a[3] === undefined ? 1 : a[3]) + ((b[3] === undefined ? 1 : b[3]) - (a[3] === undefined ? 1 : a[3])) * t]; }
  function makeCanvas(w, h) {
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w)); cv.height = Math.max(1, Math.round(h));
    return cv;
  }
  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function starPath(c, x, y, r, points) {
    for (var i = 0; i < points * 2; i++) {
      var a = -Math.PI / 2 + i * Math.PI / points, rad = i % 2 ? r * 0.42 : r;
      c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    c.closePath();
  }
  // The outline of the egg's shell, in the egg's own units (see costumes.js).
  function shellPath(c) {
    var cx = 0, cy = -46, rx = 31, ry = 40;
    c.beginPath();
    c.moveTo(cx, cy - ry);
    c.bezierCurveTo(cx + rx * 0.74, cy - ry, cx + rx, cy - ry * 0.08, cx + rx, cy + ry * 0.28);
    c.bezierCurveTo(cx + rx, cy + ry * 0.74, cx + rx * 0.56, cy + ry, cx, cy + ry);
    c.bezierCurveTo(cx - rx * 0.56, cy + ry, cx - rx, cy + ry * 0.74, cx - rx, cy + ry * 0.28);
    c.bezierCurveTo(cx - rx, cy - ry * 0.08, cx - rx * 0.74, cy - ry, cx, cy - ry);
    c.closePath();
  }
  // A soft round blob that fades to nothing at its edge. Drawn once, then
  // stamped at any size: this is how shadows, glows and dust stay cheap.
  function makeBlob(color, stops) {
    var cv = makeCanvas(64, 64), c = cv.getContext('2d');
    var g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (var i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], rgba(color, stops[i + 1]));
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    return cv;
  }

  // A few drawing shortcuts tied to one hidden picture. `px` is the size of
  // one real pixel in that picture's units, so thin lines never vanish.
  function pen(c, px) {
    var P = {
      hair: function (u) { return Math.max(u, 0.85 * px); },
      box: function (x, y, w, h, fill) { c.fillStyle = fill; c.fillRect(x, y, w, h); },
      rr: function (x, y, w, h, r) { roundRect(c, x, y, w, h, r); },
      disc: function (x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry === undefined ? rx : ry, 0, 0, TAU); },
      poly: function (pts) {
        c.beginPath(); c.moveTo(pts[0], pts[1]);
        for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
        c.closePath();
      },
      lg: function (x0, y0, x1, y1, stops) {
        var g = c.createLinearGradient(x0, y0, x1, y1);
        for (var i = 0; i < stops.length; i++) g.addColorStop(i / (stops.length - 1), stops[i]);
        return g;
      },
      fill: function (f) { c.fillStyle = f; c.fill(); },
      line: function (col, w) { c.strokeStyle = col; c.lineWidth = P.hair(w); c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); },
      seg: function (x0, y0, x1, y1, col, w) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); P.line(col, w); },
      // A soft oval of light (or of anything else) that fades out at its edge.
      glow: function (x, y, rx, ry, color, a) {
        c.save(); c.translate(x, y); c.scale(rx, ry);
        var g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, rgba(color, a)); g.addColorStop(0.4, rgba(color, a * 0.62)); g.addColorStop(1, rgba(color, 0));
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.fill();
        c.restore();
      }
    };
    return P;
  }

  // ── the slow loop: how the far kitchen looks at each time of day ─────
  // The loop runs from 0 to 1: 0 morning, 0.25 afternoon, 0.5 sunset,
  // 0.75 night, and 1 is morning again.
  //
  // The wall itself is painted in four lights, one for each of those
  // moments, and the game fades between neighbours.
  //   tint   colour the whole wall is multiplied by (white = no change)
  //   bloom  light spilling in around the windows (colour, strength)
  //   lamps  how bright the lamps, cabinet lights and oven glow are (0..1)
  //   haze   colour of the soft haze where the far floor meets the wall
  //   shine  colour and strength of the windows' reflection on the floor
  var LIGHTS = [
    { tint: '#e6f0ff', bloom: [235, 246, 255], bloomA: 0.20, lamps: 0,    haze: [240, 247, 255], shine: [255, 255, 255], shineA: 0.30 },   // morning: cool and fresh
    { tint: '#fffaf0', bloom: [255, 250, 225], bloomA: 0.14, lamps: 0,    haze: [255, 247, 228], shine: [255, 252, 236], shineA: 0.34 },   // afternoon: bright
    { tint: '#ffc8a2', bloom: [255, 168, 88],  bloomA: 0.30, lamps: 0.42, haze: [255, 226, 196], shine: [255, 176, 96],  shineA: 0.42 },   // sunset: warm orange
    { tint: '#99a2de', bloom: [150, 172, 255], bloomA: 0.10, lamps: 1,    haze: [226, 228, 252], shine: [176, 196, 255], shineA: 0.16 }    // night: dusky blue, lamps on
  ];
  // What shows through the windows. Each row: where on the loop, sky at the
  // top, sky at the bottom, far hills, near hills, clouds (with see-through).
  var SKY = [
    [0.00, [112, 190, 242], [224, 243, 250], [156, 208, 156], [112, 186, 114], [255, 255, 255, 0.95]],
    [0.25, [64, 158, 240],  [190, 230, 255], [144, 204, 134], [98, 180, 100],  [255, 255, 255, 0.95]],
    [0.40, [92, 160, 232],  [255, 228, 180], [152, 196, 122], [106, 170, 94],  [255, 246, 228, 0.95]],
    [0.50, [118, 102, 200], [255, 160, 92],  [150, 104, 98],  [112, 72, 86],   [255, 172, 132, 0.92]],
    [0.57, [58, 60, 140],   [226, 112, 122], [84, 62, 106],   [60, 46, 90],    [200, 120, 150, 0.75]],
    [0.65, [20, 28, 80],    [46, 60, 126],   [36, 44, 96],    [28, 34, 80],    [92, 102, 172, 0.55]],
    [0.75, [15, 22, 66],    [38, 52, 112],   [30, 38, 88],    [24, 30, 72],    [82, 94, 162, 0.5]],
    [0.88, [28, 42, 104],   [92, 92, 168],   [44, 56, 108],   [34, 44, 92],    [112, 118, 182, 0.55]],
    [0.94, [96, 134, 214],  [255, 188, 158], [118, 130, 142], [88, 110, 118],  [255, 198, 182, 0.85]],
    [1.00, [112, 190, 242], [224, 243, 250], [156, 208, 156], [112, 186, 114], [255, 255, 255, 0.95]]
  ];
  function skyAt(p) {
    var i = 0;
    while (i < SKY.length - 2 && p >= SKY[i + 1][0]) i++;
    var a = SKY[i], b = SKY[i + 1], t = clamp((p - a[0]) / (b[0] - a[0]), 0, 1);
    return { top: mix(a[1], b[1], t), bot: mix(a[2], b[2], t), far: mix(a[3], b[3], t), near: mix(a[4], b[4], t), cloud: mix(a[5], b[5], t) };
  }
  // Clouds: [where along the sky, how high, how big]. Two layers drift at
  // different speeds (wall units per millisecond) on their own steady
  // clock, so they keep moving at any hour and never jump when the loop
  // wraps round. Each layer's pattern repeats after `span`.
  var CLOUDS_NEAR = { span: WALL_REPEAT * 3, speed: 0.009, list: [[300, 1150, 1.0], [1500, 1470, 1.2], [2500, 1090, 0.8], [3500, 1230, 1.1], [4300, 1560, 1.0], [5200, 1120, 0.9], [6100, 1380, 1.2], [6800, 1200, 0.8]] };
  var CLOUDS_FAR = { span: WALL_REPEAT * 1.5, speed: 0.005, list: [[400, 1050, 0.55], [1300, 1290, 0.6], [2200, 1010, 0.5], [3000, 1640, 0.65]] };

  function createRenderer(canvas) {
    // The game paints every pixel every frame, so the canvas does not need
    // to be see-through. Saying so lets the browser show it faster.
    var ctx = canvas.getContext('2d', { alpha: false }) || canvas.getContext('2d');
    var T = ER.TUNING;
    var L = null, dpr = 1, res = 2;
    var screenSharp = 0;                 // the screen's own pixel ratio, as last seen
    var W = 1, H = 1;                    // canvas size in real pixels
    var floorTop = 0, stripPx = 1;       // real-pixel row where the floor starts; height of the far-floor haze strip
    var stale = true;                    // the hidden pictures need repainting (new screen size)

    // Hidden pictures (rebuilt when the screen size changes).
    var floorPic = null;                 // lit floor with the track's still parts
    var wallPlain = null, wallLit = null, wallInfo = null;   // the wall before any time of day is applied
    var wallAt = [null, null, null, null];                   // …and in each of the four lights
    var back = null, backCtx = null;     // the wall as it looks right now…
    var stripNow = null;                 // …and the haze and reflection on the far floor below it
    var vignette = null;
    var popupPics = {}, popupCount = 0;

    // Small soft pictures stamped all over the place.
    var shadowPic = makeBlob([56, 32, 62], [0, 0.95, 0.4, 0.8, 0.72, 0.36, 1, 0]);
    var dangerPic = makeBlob([222, 36, 50], [0, 0.95, 0.45, 0.8, 0.75, 0.34, 1, 0]);
    var goldPic = makeBlob([255, 214, 70], [0, 0.9, 0.35, 0.55, 1, 0]);
    var puffPic = makeBlob([255, 250, 238], [0, 0.9, 0.5, 0.6, 1, 0]);
    var dustPic = makeBlob([250, 240, 220], [0, 0.95, 0.55, 0.7, 1, 0]);
    // Steam is white, and so are the wall tiles behind it, so a steam puff
    // gets a cool blue-grey rim to show up against them.
    var steamPic = (function () {
      var cv = makeCanvas(64, 64), c = cv.getContext('2d'), g = c.createRadialGradient(28, 26, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(244,250,255,0.95)'); g.addColorStop(0.74, 'rgba(176,206,232,0.8)');
      g.addColorStop(0.9, 'rgba(150,186,220,0.35)'); g.addColorStop(1, 'rgba(150,186,220,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
      return cv;
    })();

    // The renderer's own clocks. Both stand still while the game is paused.
    var lastNow = 0;
    var animT = 0;                       // ms of animation so far (steam, effects, shake)
    var loopMs = 0;                      // where the slow loop is, in ms
    var pinned = null;                   // 0..1 when a developer has pinned the loop
    var mixedAt = -1e9, mixedPhase = -1; // when the wall's light was last re-mixed
    var skyDrawnAt = -1e9;               // when the sky in the windows was last redrawn
    var framesSincePaint = 0;

    var particles = [], popups = [];
    var landedAt = -1e9, lastSweat = 0;
    var eggAt = { x: 0, y: 0, s: 1 }, feetAt = { x: 0, y: 0, s: 1 };
    var shakeAmp = 0, shakeLen = 1, shakeEnd = -1;
    var flashEnd = -1;
    var seen = { run: null, lane: 0, dogPhase: 'idle', knives: null };   // last frame's state, to spot changes
    var calm = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
    function reducedMotion() { return !!(calm && calm.matches); }

    // ── fitting the screen ─────────────────────────────────────────────
    function resize() {
      var w = Math.max(200, canvas.clientWidth || root.innerWidth || 400);
      var h = Math.max(200, canvas.clientHeight || root.innerHeight || 700);
      var sharp = root.devicePixelRatio || 1;
      // Browsers often report the same size several times in a row (turning
      // a phone does). Nothing to do then.
      if (L && w === L.w && h === L.h && sharp === screenSharp) return;
      screenSharp = sharp;
      L = V.layout(w, h, T);
      // How many real pixels to draw per screen unit. Three limits, each
      // there to keep the game fast: sharper than 2x gains nothing you can
      // see; a very large screen is capped by its total pixel count; and
      // where the picture is shown very big (a tablet held upright), the
      // art has no finer detail to show than MAX_DETAIL pixels per unit.
      dpr = Math.max(0.5, Math.min(sharp, 2, Math.sqrt(MAX_PIXELS / (w * h)), MAX_DETAIL / L.sp));
      W = canvas.width = Math.round(w * dpr);
      H = canvas.height = Math.round(h * dpr);
      // Pictures are kept sharp enough for the nearest things on this screen.
      res = clamp(Math.ceil(L.sp * 1.35 * dpr * 2) / 2, 1, 4);
      floorTop = clamp(Math.floor(L.farY * dpr), 1, H - 2);
      stripPx = Math.max(2, Math.round((H - floorTop) * 0.26));
      stale = true;                                       // repaint the hidden pictures at the next frame
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = FLOOR; ctx.fillRect(0, 0, W, H);    // never show a blank screen in between
    }

    function scaleAt(z) { return L.sp * L.camBack / (z + L.camBack); }
    function proj(x, y, z) { return V.project(L, x, y, z); }
    function wallX(u) { return L.cx + u * L.farS; }       // wall units to screen
    function wallY(u) { return L.farY - u * L.farS; }
    // Draw on a hidden picture in wall units: x across from the middle, y UP from the floor.
    function wallView(c) { c.setTransform(L.farS * dpr, 0, 0, -L.farS * dpr, L.cx * dpr, L.farY * dpr); }

    function repaint() {
      stale = false;
      floorPic = paintFloor();
      wallPlain = makeCanvas(W, floorTop);
      wallInfo = paintWall(wallPlain.getContext('2d'));
      wallLit = null;
      wallAt = [null, null, null, null];
      back = makeCanvas(W, floorTop); backCtx = back.getContext('2d');
      stripNow = makeCanvas(W, stripPx);
      vignette = null; popupPics = {}; popupCount = 0;
      mixedAt = -1e9; framesSincePaint = 0;
    }

    // ── the floor, painted once ────────────────────────────────────────
    // Everything about the floor that does not slide: its light, the tile
    // joints that run away from you, and the track's edges and colour.
    function paintFloor() {
      // The light is all soft gradients, so it is painted at a quarter of
      // the size and stretched: four times less work when the screen
      // changes shape, and it looks the same.
      var small = makeCanvas(Math.ceil(W / 4), Math.ceil((H - floorTop) / 4)), c = small.getContext('2d');
      c.setTransform(dpr / 4, 0, 0, dpr / 4, 0, -floorTop / 4);
      var w = L.w, h = L.h + 2, y0 = floorTop / dpr - 1, fh = h - y0, g, i, side;
      var sFar = L.farS, sBot = (h - L.vanishY) / L.camH, yFar = L.farY - 1;
      var E = TRACK_HALF + KERB;
      function lane(xa, xb, fill) {            // a strip of floor between two distances from the middle, far wall to the bottom of the screen
        c.beginPath();
        c.moveTo(L.cx + xa * sFar, yFar); c.lineTo(L.cx + xb * sFar, yFar);
        c.lineTo(L.cx + xb * sBot, h); c.lineTo(L.cx + xa * sBot, h); c.closePath();
        c.fillStyle = fill; c.fill();
      }

      // Cream tiles: palest far away, a little deeper near your feet.
      g = c.createLinearGradient(0, y0, 0, h);
      g.addColorStop(0, '#fdf3dc'); g.addColorStop(0.3, '#f9ebd0'); g.addColorStop(0.7, '#f4e2c2'); g.addColorStop(1, '#efd9b4');
      c.fillStyle = g; c.fillRect(-2, y0, w + 4, fh + 2);
      // The light falls away gently toward the sides of a wide screen.
      var start = Math.max(260 * L.sp, w * 0.2);
      if (start < w / 2 - 4) {
        for (side = -1; side <= 1; side += 2) {
          g = c.createLinearGradient(L.cx + side * start, 0, L.cx + side * w / 2, 0);
          g.addColorStop(0, 'rgba(212,160,108,0)'); g.addColorStop(1, 'rgba(212,160,108,0.3)');
          c.fillStyle = g;
          c.fillRect(side < 0 ? -2 : L.cx + start, y0, w / 2 - start + 2, fh + 2);
        }
      }
      // A brighter pool of light down the middle.
      c.save(); c.translate(L.cx, y0 + fh * 0.2); c.scale(Math.max(w * 0.4, 340 * L.sp), fh * 0.66);
      g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, 'rgba(255,253,242,0.62)'); g.addColorStop(0.5, 'rgba(255,253,242,0.28)'); g.addColorStop(1, 'rgba(255,253,242,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.fill(); c.restore();
      // Two faint warm shafts of light slanting in from the upper left.
      var ax = L.cx - w * 0.2, ay = y0 + fh * 0.16, nx = -0.5, ny = 0.866, wd = Math.max(70, fh * 0.2);
      for (i = 0; i < 2; i++) {
        var bx = ax + i * wd * 2.7 * 0.866, by = ay + i * wd * 2.7 * 0.5;
        g = c.createLinearGradient(bx - nx * wd, by - ny * wd, bx + nx * wd, by + ny * wd);
        g.addColorStop(0, 'rgba(255,240,196,0)'); g.addColorStop(0.5, 'rgba(255,240,196,' + (0.2 - i * 0.07) + ')'); g.addColorStop(1, 'rgba(255,240,196,0)');
        c.fillStyle = g; c.fillRect(-2, y0, w + 4, fh + 2);
      }
      // Darker toward the two near corners, so the eye stays on the track.
      for (side = -1; side <= 1; side += 2) {
        var vr = Math.max(w * 0.5, fh * 0.75);
        g = c.createRadialGradient(side < 0 ? 0 : w, h, 0, side < 0 ? 0 : w, h, vr);
        g.addColorStop(0, 'rgba(150,92,70,0.3)'); g.addColorStop(1, 'rgba(150,92,70,0)');
        c.fillStyle = g; c.fillRect(side < 0 ? -2 : w - vr, h - vr, vr + 2, vr + 2);
      }

      // Now the full-size picture: the stretched light, then the crisp parts.
      var cv = makeCanvas(W, H - floorTop);
      c = cv.getContext('2d', { alpha: false }) || cv.getContext('2d');
      c.drawImage(small, 0, 0, small.width * 4, small.height * 4);
      c.setTransform(dpr, 0, 0, dpr, 0, -floorTop);
      // Tile joints running away to the vanishing point: a dark line with a
      // thin bright one beside it, which is what makes tiles look glossy.
      var n = Math.ceil(w / 2 / sFar / FLOOR_TILE) + 1;
      for (i = -n; i <= n; i++) {
        var x = (i + 0.5) * FLOOR_TILE;
        if (Math.abs(x) < E + 30) continue;
        lane(x - 3.5, x + 3.5, 'rgba(170,122,72,0.42)');
        lane(x + 3.5, x + 7.5, 'rgba(255,255,255,0.5)');
      }

      // The track. First its soft shadow on the floor (wider on the right,
      // away from the light), then the pale raised edge, then the runner.
      for (i = 0; i < 6; i++) lane(-(E + 6 + i * 8), E + 10 + i * 13, 'rgba(126,74,40,0.05)');
      lane(-E, E, '#fff8e8');
      lane(-E, -E + 5, '#ffffff');                 // lit outer edge
      lane(E - 1, E + 6, '#d6bb8e');               // shaded outer edge
      lane(-TRACK_HALF - 6, -TRACK_HALF, '#e8d3ab');
      lane(TRACK_HALF, TRACK_HALF + 6, '#f1e2c2');
      g = c.createLinearGradient(0, yFar, 0, h);
      g.addColorStop(0, '#74ccd6'); g.addColorStop(0.18, '#55bbc8'); g.addColorStop(0.55, '#46b3c2'); g.addColorStop(1, '#3da8b9');
      lane(-TRACK_HALF, TRACK_HALF, g);
      lane(-LANE / 2, LANE / 2, 'rgba(255,255,255,0.06)');   // the middle lane catches a touch more light
      lane(-TRACK_HALF, -TRACK_HALF + 5, '#2b8799');
      lane(TRACK_HALF - 5, TRACK_HALF, '#2b8799');
      return cv;
    }

    // ── the far wall, painted once ─────────────────────────────────────
    // The far end of the kitchen in plain daylight, with clear glass in the
    // windows so the sky can be drawn behind them later. Measured in "wall
    // units" (the same units as the track): x across from the middle, y up
    // from the floor. The kitchen is egg-sized, so the wall is huge: the
    // worktop is about ten eggs up.
    //
    // The wall repeats every WALL_REPEAT units. One repeat, left to right:
    // cooker with a kettle, a clock, cupboards, a big window, a lamp, wall
    // cupboards, then a fridge (or a tall larder in every other repeat).
    // The track comes out of a dark arch under the middle window.
    //
    // Returns where the lamps, clocks and so on ended up, for the lighting.
    function paintWall(c) {
      var s = L.farS * dpr, px = 1 / s, p = pen(c, px);
      var half = L.w / 2 / L.farS + 80, top = Math.max(L.farY / L.farS + 40, 1500);
      var info = { lamps: [], strips: [], ovens: [], clocks: [], steams: [], windows: [], half: half, top: top };
      var m, m0 = -Math.ceil((half + WALL_REPEAT / 2) / WALL_REPEAT);
      wallView(c);

      // Painted wall, a picture rail high up, and a tiled splashback.
      p.box(-half, 0, half * 2, top, p.lg(0, 1150, 0, 1950, ['#a2d6e2', '#b7e3eb', '#c4eaf0']));
      p.box(-half, 1990, half * 2, top, '#d4f0f4');
      p.box(-half, 1976, half * 2, 14, 'rgba(60,130,150,0.22)'); p.box(-half, 1990, half * 2, 30, '#f2fbfc');
      var TH = 111.4, TW = TH * 2, r, i, x;
      p.box(-half, 796, half * 2, TH * 3, p.lg(0, 796, 0, 1130, ['#ecf5f8', '#f9fdfe']));
      for (r = 0; r < 3; r++) {
        for (i = Math.floor(-half / TW) - 1; i * TW < half; i++) {
          var hh = hash(i, r, 5);
          if (hh > 0.9) p.box(i * TW + (r % 2) * TH, 796 + r * TH, TW, TH, '#cfe9f0');
          else if (hh < 0.06) p.box(i * TW + (r % 2) * TH, 796 + r * TH, TW, TH, '#ffecb8');
        }
      }
      c.beginPath();
      for (r = 1; r < 3; r++) { c.moveTo(-half, 796 + r * TH); c.lineTo(half, 796 + r * TH); }
      for (r = 0; r < 3; r++) {
        for (i = Math.floor(-half / TW) - 1; i * TW < half; i++) { x = i * TW + (r % 2) * TH; c.moveTo(x, 796 + r * TH); c.lineTo(x, 796 + (r + 1) * TH); }
      }
      p.line('#bfd9e2', 6);
      p.box(-half, 1122, half * 2, 8, 'rgba(40,110,130,0.2)');
      p.box(-half, 1130, half * 2, 26, '#72bdcc'); p.box(-half, 1150, half * 2, 6, '#a6dbe5');

      // Shared pieces.
      function door(x, y, w, h) {                      // a panelled door, lit from the upper left
        p.rr(x, y, w, h, 12);
        p.fill(p.lg(x, y + h, x + w, y, ['#fcc388', '#f4a259', '#e68b3f'])); p.line('#b7632a', 7);
        var q = Math.min(w, h) * 0.17;
        p.rr(x + q, y + q, w - 2 * q, h - 2 * q, 8);
        p.fill(p.lg(x, y + h, x + w, y, ['#f3a25a', '#ee964a', '#e7893b']));
        c.beginPath(); c.moveTo(x + q, y + q); c.lineTo(x + q, y + h - q); c.lineTo(x + w - q, y + h - q); p.line('rgba(150,70,20,0.6)', 7);
        c.beginPath(); c.moveTo(x + q, y + q); c.lineTo(x + w - q, y + q); c.lineTo(x + w - q, y + h - q); p.line('rgba(255,226,184,0.85)', 6);
      }
      function handle(x, y, tall) {
        var w = tall ? 20 : 104, h = tall ? 104 : 20;
        p.rr(x - w / 2 + 6, y - h / 2 - 6, w, h, 10); p.fill('rgba(140,60,10,0.4)');
        p.rr(x - w / 2, y - h / 2, w, h, 10); p.fill(p.lg(x - w / 2, y + h / 2, x + w / 2, y - h / 2, ['#ffffff', '#ffe6bf'])); p.line('#b98a52', 5);
      }
      function carcass(xa, xb) {
        p.box(xa, 55, xb - xa, 690, p.lg(0, 745, 0, 55, ['#f09a4c', '#e88a3d']));
        p.box(xa, 0, xb - xa, 55, p.lg(0, 55, 0, 0, ['#48281c', '#7c4c32']));     // the dark recess at floor level
      }
      function doors(xa, xb) {
        carcass(xa, xb);
        var g = 16, w = (xb - xa - g * 3) / 2;
        door(xa + g, 84, w, 620); door(xa + g * 2 + w, 84, w, 620);
        handle(xa + g + w - 34, 566, true); handle(xa + g * 2 + w + 34, 566, true);
      }
      function drawers(xa, xb) {
        carcass(xa, xb);
        for (var d = 0; d < 3; d++) { door(xa + 16, 84 + d * 212, xb - xa - 32, 196); handle((xa + xb) / 2, 84 + d * 212 + 98, false); }
      }
      function oven(xa, xb) {
        var xc = (xa + xb) / 2, w = xb - xa, b;
        carcass(xa, xb);
        p.rr(xa + 14, 62, w - 28, 676, 18); p.fill(p.lg(xa, 738, xb, 62, ['#737c9c', '#565e7e', '#424966'])); p.line('#2e3450', 8);
        p.rr(xa + 34, 630, w - 68, 84, 12); p.fill(p.lg(0, 714, 0, 630, ['#3d4360', '#2e3450']));
        for (b = -1.5; b <= 1.5; b++) {
          p.disc(xc + b * 74, 672, 21); p.fill(p.lg(xc + b * 74 - 20, 692, xc + b * 74 + 20, 652, ['#ffffff', '#c3cde4'])); p.line('#282d46', 4);
        }
        p.rr(xa + 44, 128, w - 88, 404, 22); p.fill('#2a2440'); p.line('#252a44', 7);
        p.rr(xa + 62, 148, w - 124, 364, 14); p.fill(p.lg(0, 512, 0, 148, ['#3e2c4a', '#7c4238', '#f29a3e', '#ffd070']));   // the glow inside
        p.seg(xa + 72, 296, xb - 72, 296, 'rgba(70,30,30,0.55)', 6); p.seg(xa + 72, 396, xb - 72, 396, 'rgba(70,30,30,0.4)', 6);
        c.save(); p.rr(xa + 62, 148, w - 124, 364, 14); c.clip();
        p.poly([xa + 84, 512, xa + 150, 512, xa + 96, 148, xa + 62, 148]); p.fill('rgba(255,255,255,0.14)'); c.restore();
        p.rr(xa + 52, 558, w - 104, 36, 18); p.fill(p.lg(0, 594, 0, 558, ['#f6f9ff', '#b6c4e0', '#7b8ab0', '#dbe4f4'])); p.line('#485378', 5);
      }
      function kettle(x, y) {                          // spout to the left, so the steam rises into the hood
        p.poly([x - 60, y + 64, x - 130, y + 128, x - 112, y + 146, x - 50, y + 104]); p.fill('#cf3a44'); p.line('#8f1f33', 6);
        c.beginPath(); c.moveTo(x - 56, y + 118); c.bezierCurveTo(x - 64, y + 232, x + 64, y + 232, x + 56, y + 118); p.line('#3a2a44', 22); p.line('#6a5672', 8);
        c.beginPath(); c.moveTo(x - 88, y); c.bezierCurveTo(x - 94, y + 98, x - 54, y + 154, x, y + 154);
        c.bezierCurveTo(x + 54, y + 154, x + 94, y + 98, x + 88, y); c.closePath();
        p.fill(p.lg(x - 80, y + 150, x + 80, y, ['#ff938d', '#e5484d', '#ad2848'])); p.line('#8f1f33', 7);
        p.box(x - 90, y - 2, 180, 18, '#6c2a3e');
        p.disc(x, y + 162, 16, 12); p.fill('#3a2a44');
        p.disc(x - 40, y + 96, 12, 30); p.fill('rgba(255,255,255,0.5)');
      }
      function jar(x, w, h, col, dark, lid) {
        p.rr(x - w / 2, 798, w, h, 14); p.fill(p.lg(x - w / 2, 0, x + w / 2, 0, [col, col, dark])); p.line(dark, 6);
        p.rr(x - w / 2 + 12, 798 + h * 0.3, w - 24, h * 0.34, 6); p.fill('rgba(255,255,255,0.75)');
        p.rr(x - w / 2 - 5, 798 + h - 6, w + 10, 26, 8); p.fill(lid); p.line(dark, 5);
        p.box(x - w / 2 + 8, 806, 9, h - 24, 'rgba(255,255,255,0.4)');
      }
      function leaves(x, y, n, size, seed) {
        var cols = ['#6cc56a', '#4caf50', '#3d9648'];
        for (var k = 0; k < n; k++) {
          var a = (k / (n - 1) - 0.5) * 2.2, len = size * (0.75 + hash(k, seed, 3) * 0.5);
          c.save(); c.translate(x + Math.sin(a) * size * 0.25, y); c.rotate(-a);
          p.disc(0, len * 0.55, size * 0.2, len * 0.55); p.fill(cols[k % 3]); p.line('#2f7d3c', 4); c.restore();
        }
      }
      function pot(x, y, w, h, light, mid, dark) {
        p.poly([x - w * 0.4, y, x + w * 0.4, y, x + w / 2, y + h, x - w / 2, y + h]); p.fill(p.lg(x - w / 2, 0, x + w / 2, 0, [light, mid, dark])); p.line(dark, 5);
        p.rr(x - w / 2 - 6, y + h - 8, w + 12, 20, 6); p.fill(mid); p.line(dark, 5);
      }

      // Behind: things fixed to the wall.
      function backOf(x0, m) {
        var odd = (m % 2) !== 0, k, a, xa;
        // The tall cupboard to the left casts a soft shadow onto this stretch of wall.
        p.box(x0 - 1000, 796, 90, 1094, p.lg(x0 - 1000, 0, x0 - 910, 0, ['rgba(40,80,120,0.3)', 'rgba(40,80,120,0)']));
        // Window frame and sill.
        p.box(x0 - 548, 800, 1096, 38, p.lg(0, 838, 0, 800, ['rgba(50,90,130,0.3)', 'rgba(50,90,130,0)']));
        p.rr(x0 - 514, 850, 1028, 940, 20); p.fill(p.lg(x0 - 514, 1790, x0 + 514, 850, ['#ffffff', '#f4f2fc', '#dedbf2'])); p.line('#a5a2cf', 8);
        p.rr(x0 - 548, 836, 1096, 46, 14); p.fill(p.lg(0, 882, 0, 836, ['#ffffff', '#e2dff3'])); p.line('#a5a2cf', 7);
        // A clock, or a rail of cooking tools.
        if (!odd) {
          p.disc(x0 - 686, 1091, 110); p.fill('rgba(40,90,115,0.26)');
          p.disc(x0 - 700, 1105, 110); p.fill(p.lg(x0 - 780, 1185, x0 - 620, 1025, ['#ff8d88', '#e5484d', '#b02a48'])); p.line('#8f1f33', 7);
          p.disc(x0 - 700, 1105, 88); p.fill(p.lg(x0 - 760, 1165, x0 - 640, 1045, ['#ffffff', '#fff3dc'])); p.line('#c9a37a', 4);
          for (k = 0; k < 12; k++) {
            a = k * TAU / 12;
            p.seg(x0 - 700 + Math.sin(a) * (k % 3 ? 76 : 68), 1105 + Math.cos(a) * (k % 3 ? 76 : 68), x0 - 700 + Math.sin(a) * 82, 1105 + Math.cos(a) * 82, '#8a6a58', k % 3 ? 5 : 9);
          }
          info.clocks.push({ x: x0 - 700, y: 1105 });
        } else {
          p.seg(x0 - 836, 1196, x0 - 566, 1196, '#6f80a4', 16); p.seg(x0 - 836, 1200, x0 - 566, 1200, '#e6eefa', 6);
          p.seg(x0 - 790, 1190, x0 - 790, 1030, '#b97a44', 14); p.disc(x0 - 790, 1000, 34, 40); p.fill('#c98f55'); p.line('#8a5a2b', 6);
          p.seg(x0 - 700, 1190, x0 - 700, 1050, '#e5484d', 14); p.rr(x0 - 730, 950, 60, 104, 12); p.fill('#e5484d'); p.line('#8f1f33', 6);
          p.seg(x0 - 610, 1190, x0 - 610, 1060, '#59b34a', 14); p.disc(x0 - 610, 1010, 30, 50); p.line('#3d8a3a', 9);
        }
        // Cooker hood, with a light under it.
        xa = x0 - 1000;
        p.box(xa, 1196, 400, 64, p.lg(0, 1260, 0, 1196, ['rgba(40,90,115,0.28)', 'rgba(40,90,115,0)']));
        p.box(xa + 112, 1390, 176, top, p.lg(xa + 112, 0, xa + 288, 0, ['#dfe8f6', '#f8fbff', '#b4c2dc']));
        p.poly([xa + 6, 1262, xa + 394, 1262, xa + 326, 1402, xa + 74, 1402]);
        p.fill(p.lg(xa, 0, xa + 400, 0, ['#ecf2fb', '#c3d0e6', '#f8fbff', '#a7b6d2'])); p.line('#788aae', 7);
        p.box(xa + 6, 1250, 388, 14, '#6c7ea4'); p.box(xa + 70, 1246, 260, 9, '#fff3d0');
        info.strips.push({ x: xa + 200, y: 1250, w: 280 });
        // Wall cupboards, with a strip light underneath.
        xa = x0 + 600;
        p.box(xa, 1176, 400, 84, p.lg(0, 1260, 0, 1176, ['rgba(40,90,115,0.32)', 'rgba(40,90,115,0)']));
        p.box(xa, 1260, 400, 612, p.lg(0, 1872, 0, 1260, ['#f6aa63', '#e88a3d']));
        door(xa + 14, 1282, 180, 570); door(xa + 206, 1282, 180, 570);
        handle(xa + 164, 1352, true); handle(xa + 236, 1352, true);
        p.box(xa - 8, 1868, 416, 24, '#fcc388'); p.box(xa + 10, 1252, 380, 11, '#fff3d0');
        info.strips.push({ x: xa + 200, y: 1250, w: 380 });
      }

      // In front: cupboards, worktop, and what stands on it.
      function frontOf(x0, m) {
        var odd = (m % 2) !== 0, xa = x0 + 1000, kind = ((m % 3) + 3) % 3;
        oven(x0 - 1000, x0 - 600);
        doors(x0 - 600, x0 - 240);
        if (m === 0) carcass(x0 - 240, x0 + 240); else doors(x0 - 240, x0 + 240);
        doors(x0 + 240, x0 + 600);
        drawers(x0 + 600, x0 + 1000);
        // Dark under the worktop's overhang, then the worktop itself.
        p.box(x0 - 1000, 630, 2000, 115, p.lg(0, 745, 0, 630, ['rgba(116,44,8,0.5)', 'rgba(116,44,8,0)']));
        p.box(x0 - 1004, 740, 2008, 36, p.lg(0, 776, 0, 740, ['#f1e2c6', '#d6be98']));
        p.box(x0 - 1004, 774, 2008, 26, '#fffaf0');
        p.box(x0 - 1004, 736, 2008, p.hair(6), '#ad8c62');
        // Fridge, or a tall larder cupboard.
        if (!odd) {
          p.rr(xa + 8, 0, 384, 1884, 30); p.fill(p.lg(xa, 0, xa + 400, 0, ['#fdfeff', '#eef3fc', '#d5ddf1', '#bdc8e3'])); p.line('#8292bd', 8);
          p.box(xa + 10, 1206, 380, 14, '#93a3c8'); p.box(xa + 10, 1196, 380, 10, 'rgba(255,255,255,0.85)');
          p.rr(xa + 44, 1292, 30, 330, 15); p.fill(p.lg(xa + 44, 0, xa + 74, 0, ['#f8fbff', '#a7b6d6', '#7a89b0'])); p.line('#58668e', 5);
          p.rr(xa + 44, 770, 30, 370, 15); p.fill(p.lg(xa + 44, 0, xa + 74, 0, ['#f8fbff', '#a7b6d6', '#7a89b0'])); p.line('#58668e', 5);
          p.rr(xa + 186, 876, 136, 168, 6); p.fill('#fffdf5'); p.line('#b7c1d8', 4);          // a child's drawing
          p.disc(xa + 286, 1004, 19); p.fill('#ffd43b');
          c.beginPath(); c.moveTo(xa + 198, 908); c.quadraticCurveTo(xa + 228, 956, xa + 254, 908); c.quadraticCurveTo(xa + 284, 956, xa + 312, 908); p.line('#59b34a', 10);
          p.disc(xa + 254, 1050, 14); p.fill('#e5484d');                                       // …and the magnets that hold it
          p.rr(xa + 128, 1084, 44, 44, 9); p.fill('#8253d8'); p.disc(xa + 336, 1126, 17); p.fill('#2f7ff0');
          p.rr(xa + 246, 1404, 64, 64, 10); p.fill('#59b34a'); p.rr(xa + 140, 1492, 76, 52, 10); p.fill('#ffd43b');
          p.box(xa + 10, 0, 380, 46, p.lg(0, 46, 0, 0, ['#6f7ea8', '#54628a']));
        } else {
          p.box(xa + 4, 55, 392, 1832, p.lg(0, 1887, 0, 55, ['#f3a055', '#e88a3d']));
          p.box(xa + 4, 0, 392, 55, p.lg(0, 55, 0, 0, ['#48281c', '#7c4c32']));
          door(xa + 18, 84, 174, 1100); door(xa + 208, 84, 174, 1100); door(xa + 18, 1212, 174, 650); door(xa + 208, 1212, 174, 650);
          handle(xa + 164, 1090, true); handle(xa + 236, 1090, true); handle(xa + 164, 1300, true); handle(xa + 236, 1300, true);
          p.box(xa - 6, 1884, 412, 24, '#fcc388');
        }
        // Hob and kettle over the cooker.
        p.rr(x0 - 986, 798, 372, 15, 6); p.fill('#343a58');
        kettle(x0 - 846, 813);
        info.steams.push({ x: x0 - 972, y: 958 });
        info.ovens.push({ x: x0 - 800, y: 330 });
        // A table lamp.
        p.rr(x0 + 640, 798, 100, 22, 10); p.fill(p.lg(x0 + 640, 0, x0 + 740, 0, ['#a996e0', '#6a54b0'])); p.line('#4a3a88', 5);
        p.box(x0 + 681, 818, 18, 122, p.lg(x0 + 681, 0, x0 + 699, 0, ['#c2b2f0', '#6a54b0']));
        p.poly([x0 + 596, 932, x0 + 784, 932, x0 + 752, 1100, x0 + 628, 1100]);
        p.fill(p.lg(x0 + 600, 1096, x0 + 780, 932, ['#fff6d6', '#ffe19a', '#f2be62'])); p.line('#c08a32', 6);
        info.lamps.push({ x: x0 + 690, y: 1012 });
        // Something beside the lamp.
        if (kind === 0) {
          jar(x0 + 842, 92, 168, '#ff7b7f', '#b02a48', '#fff3dc'); jar(x0 + 944, 84, 130, '#ffe066', '#c9921a', '#fff3dc');
        } else if (kind === 1) {
          p.rr(x0 + 800, 798, 190, 16, 6); p.fill('#c98f55'); p.line('#8a5a2b', 5);
          p.rr(x0 + 814, 812, 162, 100, 46); p.fill(p.lg(x0 + 814, 912, x0 + 976, 812, ['#f2c27a', '#d99a4e', '#b06f30'])); p.line('#8a5223', 6);
          p.seg(x0 + 860, 880, x0 + 874, 850, '#fbe3b4', 7); p.seg(x0 + 900, 884, x0 + 914, 854, '#fbe3b4', 7); p.seg(x0 + 940, 880, x0 + 954, 850, '#fbe3b4', 7);
        } else {
          leaves(x0 + 890, 880, 7, 150, m); pot(x0 + 890, 798, 120, 96, '#8ecbf2', '#5aa9e6', '#3a78c0');
        }
        info.windows.push(x0);
      }

      // Last: clear the glass, then whatever stands in front of it.
      function glassOf(x0, m) {
        var panes = [[x0 - 470, 880, 453, 425], [x0 + 17, 880, 453, 425], [x0 - 470, 1337, 453, 413], [x0 + 17, 1337, 453, 413]], k, q;
        for (k = 0; k < 4; k++) {
          q = panes[k];
          c.clearRect(q[0], q[1], q[2], q[3]);
          c.save(); c.beginPath(); c.rect(q[0], q[1], q[2], q[3]); c.clip();
          // The frame is deep: its top and left inner edges are in shadow.
          p.box(q[0], q[1] + q[3] - 14, q[2], 14, 'rgba(70,84,150,0.34)'); p.box(q[0], q[1], 12, q[3], 'rgba(70,84,150,0.26)');
          // Light catching the glass.
          p.poly([q[0] + 70, q[1], q[0] + 150, q[1], q[0] + 330, q[1] + q[3], q[0] + 250, q[1] + q[3]]); p.fill('rgba(255,255,255,0.13)');
          p.poly([q[0] + 190, q[1], q[0] + 214, q[1], q[0] + 394, q[1] + q[3], q[0] + 370, q[1] + q[3]]); p.fill('rgba(255,255,255,0.1)');
          c.restore();
        }
        // A striped frill along the top of the window.
        for (k = 0; k < 10; k++) {
          c.beginPath(); c.rect(x0 - 470 + k * 94, 1700, 94, 56); c.ellipse(x0 - 423 + k * 94, 1700, 47, 40, 0, 0, TAU);
          p.fill(k % 2 ? '#fff6ee' : '#ee6a6e');
        }
        p.box(x0 - 470, 1660, 940, 96, p.lg(0, 1756, 0, 1660, ['rgba(120,40,70,0.22)', 'rgba(120,40,70,0)']));
        if (m === 0) {
          // A bowl of fruit on the worktop, and herbs on the sill.
          p.disc(x0 - 388, 884, 34); p.fill('#ff8a3d'); p.line('#c25a17', 5);
          p.disc(x0 - 330, 896, 38); p.fill('#e5484d'); p.line('#a3243a', 5);
          p.disc(x0 - 286, 880, 30); p.fill('#ffd43b'); p.line('#c9921a', 5);
          c.beginPath(); c.moveTo(x0 - 440, 874); c.bezierCurveTo(x0 - 424, 786, x0 - 256, 786, x0 - 240, 874); c.closePath();
          p.fill(p.lg(x0 - 440, 0, x0 - 240, 0, ['#8cc0f6', '#2f7ff0', '#1f58b8'])); p.line('#1a4a9c', 6);
          leaves(x0 + 404, 962, 6, 96, 1); pot(x0 + 404, 882, 96, 84, '#f6a27c', '#de7445', '#a8452a');
        } else {
          // A tap over the sink, and herbs.
          c.beginPath(); c.moveTo(x0 - 60, 800); c.lineTo(x0 - 60, 960); c.quadraticCurveTo(x0 - 60, 1050, x0 + 30, 1050); c.quadraticCurveTo(x0 + 100, 1050, x0 + 100, 980);
          p.line('#6f80a4', 36); p.line('#dfe8f6', 14);
          p.rr(x0 - 110, 800, 100, 30, 10); p.fill('#8a9abc'); p.line('#58668e', 5);
          leaves(x0 + 380 - (m % 2 ? 760 : 0), 962, 6, 96, m + 2); pot(x0 + 380 - (m % 2 ? 760 : 0), 882, 96, 84, '#f6a27c', '#de7445', '#a8452a');
        }
      }

      for (m = m0; m <= -m0; m++) backOf(m * WALL_REPEAT, m);
      for (m = m0; m <= -m0; m++) frontOf(m * WALL_REPEAT, m);
      for (m = m0; m <= -m0; m++) glassOf(m * WALL_REPEAT, m);

      // The dark arch where the track comes out, with a little egg sign over it.
      var aw = TRACK_HALF + KERB + 18;
      function archPath(grow) {
        c.beginPath(); c.moveTo(-aw - grow, -4); c.lineTo(-aw - grow, 250);
        c.quadraticCurveTo(-aw - grow, 430 + grow, 0, 430 + grow); c.quadraticCurveTo(aw + grow, 430 + grow, aw + grow, 250);
        c.lineTo(aw + grow, -4); c.closePath();
      }
      archPath(26); p.fill(p.lg(-aw, 460, aw, 0, ['#ffdcae', '#f7b877', '#e08a44'])); p.line('#b7632a', 7);
      archPath(0); p.fill(p.lg(0, 430, 0, 0, ['#1d1224', '#33202e', '#553430'])); p.line('#3a2018', 7);
      c.save(); archPath(0); c.clip();
      p.poly([-TRACK_HALF, -4, TRACK_HALF, -4, TRACK_HALF * 0.55, 190, -TRACK_HALF * 0.55, 190]); p.fill(p.lg(0, 190, 0, 0, ['rgba(60,150,170,0)', 'rgba(70,170,186,0.55)']));
      p.box(-aw, 250, 46, 200, 'rgba(0,0,0,0.25)'); p.box(-aw, 0, 30, 440, 'rgba(0,0,0,0.22)');   // the lit side is the right one
      c.restore();
      p.rr(-92, 512, 184, 150, 26); p.fill(p.lg(-92, 662, 92, 512, ['#fffaf0', '#f3e2c2'])); p.line('#b7632a', 7);
      // (The egg outline is written the usual way up, so turn the picture back over for it.)
      c.setTransform(s * 1.3, 0, 0, s * 1.3, L.cx * dpr, (L.farY - 528 * L.farS) * dpr); shellPath(c);
      c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = '#c9a37a'; c.lineWidth = 5; c.stroke();
      wallView(c);

      // Soften the whole wall a touch (it is a long way off) and darken its
      // top corners. "source-atop" paints only where the wall already is, so
      // the glass stays clear.
      c.globalCompositeOperation = 'source-atop';
      p.box(-half, 0, half * 2, top, 'rgba(255,248,236,0.09)');
      p.box(-half, 0, half * 2, 420, p.lg(0, 0, 0, 420, ['rgba(255,244,222,0.2)', 'rgba(255,244,222,0)']));
      p.box(-half, 0, half * 2, 70, p.lg(0, 0, 0, 70, ['rgba(72,30,24,0.5)', 'rgba(72,30,24,0)']));   // soft shadow where wall meets floor
      p.glow(-half + 80, top - 40, half * 0.9, top * 0.8, [30, 70, 110], 0.26);
      p.glow(half - 80, top - 40, half * 0.9, top * 0.8, [30, 70, 110], 0.26);
      c.globalCompositeOperation = 'source-over';
      return info;
    }

    // The wall as lamp light would show it: warm, and only around the lamps.
    function paintLit() {
      var cv = makeCanvas(W, floorTop), c = cv.getContext('2d'), p = pen(c, 1 / (L.farS * dpr)), i, q;
      c.drawImage(wallPlain, 0, 0);
      c.globalCompositeOperation = 'multiply'; c.fillStyle = '#ffe2ae'; c.fillRect(0, 0, W, floorTop);
      // Keep only the pools of light.
      var mask = makeCanvas(W, floorTop), mc = mask.getContext('2d'), mp = pen(mc, 1);
      wallView(mc);
      for (i = 0; i < wallInfo.lamps.length; i++) { q = wallInfo.lamps[i]; mp.glow(q.x, q.y - 40, 620, 560, [255, 255, 255], 1); }
      for (i = 0; i < wallInfo.strips.length; i++) { q = wallInfo.strips[i]; mp.glow(q.x, q.y - 230, q.w * 0.95, 430, [255, 255, 255], 1); }
      for (i = 0; i < wallInfo.ovens.length; i++) { q = wallInfo.ovens[i]; mp.glow(q.x, q.y - 60, 420, 420, [255, 255, 255], 0.8); }
      c.globalCompositeOperation = 'destination-in'; c.drawImage(mask, 0, 0);
      c.globalCompositeOperation = 'source-over';
      return cv;
    }

    // The wall in one of the four lights (see LIGHTS), plus the strip of
    // haze and reflection that lies on the far floor in that light.
    function paintWallAt(n) {
      var K = LIGHTS[n], cv = makeCanvas(W, floorTop + stripPx), c = cv.getContext('2d'), p = pen(c, 1 / (L.farS * dpr)), i, q, k = K.lamps;
      c.drawImage(wallPlain, 0, 0);
      c.globalCompositeOperation = 'multiply'; c.fillStyle = K.tint; c.fillRect(0, 0, W, floorTop);
      // Daylight (or moonlight) spilling in around each window.
      wallView(c); c.globalCompositeOperation = 'lighter';
      for (i = 0; i < wallInfo.windows.length; i++) p.glow(wallInfo.windows[i], 1280, 1150, 900, K.bloom, K.bloomA);
      if (k > 0) {
        if (!wallLit) wallLit = paintLit();
        c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = k;
        c.drawImage(wallLit, 0, 0);
        c.globalAlpha = 1; wallView(c); c.globalCompositeOperation = 'lighter';
        for (i = 0; i < wallInfo.lamps.length; i++) {
          q = wallInfo.lamps[i];
          p.glow(q.x, q.y, 300, 280, [255, 200, 110], 0.5 * k); p.glow(q.x, q.y, 110, 96, [255, 246, 214], 0.9 * k);
        }
        for (i = 0; i < wallInfo.strips.length; i++) {
          q = wallInfo.strips[i];
          p.glow(q.x, q.y - 40, q.w * 0.75, 150, [255, 222, 150], 0.55 * k); p.glow(q.x, q.y, q.w * 0.55, 26, [255, 250, 226], 0.95 * k);
        }
        for (i = 0; i < wallInfo.ovens.length; i++) {
          q = wallInfo.ovens[i];
          p.glow(q.x, q.y, 300, 300, [255, 136, 40], 0.5 * k); p.glow(q.x, q.y, 160, 150, [255, 214, 120], 0.55 * k);
        }
      }
      // Put the clear glass back (the steps above painted over it).
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-in'; c.drawImage(wallPlain, 0, 0);
      c.globalCompositeOperation = 'source-over';

      // The far-floor strip, just below the wall.
      var y0 = floorTop, hp = stripPx, g, cxp = L.cx * dpr;
      c.save(); c.beginPath(); c.rect(0, y0, W, hp); c.clip();
      // A glossy floor mirrors the wall above it, upside down…
      var srcH = Math.min(y0, hp);
      c.setTransform(1, 0, 0, -1, 0, 2 * y0); c.globalAlpha = 0.5;
      c.drawImage(cv, 0, y0 - srcH, W, srcH, 0, y0 - srcH, W, srcH);
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
      // …and the bright windows most of all.
      g = c.createLinearGradient(0, y0, 0, y0 + hp);
      g.addColorStop(0, rgba(K.shine, K.shineA)); g.addColorStop(1, rgba(K.shine, K.shineA * 0.5));
      c.fillStyle = g;
      for (i = 0; i < wallInfo.windows.length; i++) {
        for (q = 0; q < 3; q++) c.fillRect(cxp + (wallInfo.windows[i] - 470 - q * 50) * L.farS * dpr, y0, (940 + q * 100) * L.farS * dpr, hp);
      }
      // The reflection fades with distance from the wall…
      c.globalCompositeOperation = 'destination-out';
      g = c.createLinearGradient(0, y0, 0, y0 + hp * 0.9);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.7)'); g.addColorStop(1, 'rgba(0,0,0,1)');
      c.fillStyle = g; c.fillRect(0, y0, W, hp);
      // …and the track is a mat, not a mirror.
      var e0 = (TRACK_HALF + KERB + 4) * L.farS * dpr, e1 = (TRACK_HALF + KERB + 4) * ((y0 + hp) / dpr - L.vanishY) / L.camH * dpr;
      c.fillStyle = '#000'; c.beginPath(); c.moveTo(cxp - e0, y0); c.lineTo(cxp + e0, y0); c.lineTo(cxp + e1, y0 + hp); c.lineTo(cxp - e1, y0 + hp); c.closePath(); c.fill();
      c.globalCompositeOperation = 'source-over';
      // Distance haze, so far things arrive softly.
      g = c.createLinearGradient(0, y0, 0, y0 + hp);
      g.addColorStop(0, rgba(K.haze, 0.5)); g.addColorStop(0.35, rgba(K.haze, 0.26)); g.addColorStop(1, rgba(K.haze, 0));
      c.fillStyle = g; c.fillRect(0, y0, W, hp);
      // A soft shadow where the wall meets the floor.
      var sh = Math.max(5 * dpr, hp * 0.12);
      g = c.createLinearGradient(0, y0, 0, y0 + sh);
      g.addColorStop(0, 'rgba(88,44,34,0.5)'); g.addColorStop(0.4, 'rgba(88,44,34,0.2)'); g.addColorStop(1, 'rgba(88,44,34,0)');
      c.fillStyle = g; c.fillRect(0, y0, W, sh);
      c.restore();
      return cv;
    }
    function wallFor(n) { return wallAt[n] || (wallAt[n] = paintWallAt(n)); }

    // ── the wall right now ─────────────────────────────────────────────
    // Fade between the two nearest of the four lights, then paint the sky
    // BEHIND the wall, so it shows only through the clear glass.
    //
    // None of this is done every frame, because the loop is far too slow
    // for anyone to see the steps. The whole wall is re-mixed about once a
    // second. In between, only the sky in the windows is redrawn, a few
    // times a second, so the clouds drift smoothly.
    var mixN = 0, mixF = 0;              // which two lights the wall is between, and how far
    function mixBackdrop(phase) {
      var c = backCtx, i;
      mixN = Math.floor(phase * 4) % 4; mixF = phase * 4 - Math.floor(phase * 4);
      c.setTransform(1, 0, 0, 1, 0, 0);
      // "copy" replaces what was there; "lighter" adds. A share of one
      // picture plus the rest of the other is an exact cross-fade.
      // Each of the four pictures holds the wall with its strip of far
      // floor underneath: draw the wall part into one picture, and the
      // strip (shifted up by the wall's height) into the other.
      var sc = stripNow.getContext('2d');
      c.globalCompositeOperation = sc.globalCompositeOperation = 'copy'; c.globalAlpha = sc.globalAlpha = 1 - mixF;
      c.drawImage(wallFor(mixN), 0, 0); sc.drawImage(wallFor(mixN), 0, -floorTop);
      if (mixF > 0.003) {
        c.globalCompositeOperation = sc.globalCompositeOperation = 'lighter'; c.globalAlpha = sc.globalAlpha = mixF;
        c.drawImage(wallFor((mixN + 1) % 4), 0, 0); sc.drawImage(wallFor((mixN + 1) % 4), 0, -floorTop);
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      for (i = 0; i < wallInfo.windows.length; i++) paintSky(phase, i, false);

      // Clock hands. One loop is one whole day, so the hands go round
      // twice for the hour and twenty-four times for the minutes.
      wallView(c);
      var hours = 7 + phase * 24, ha = hours / 12 * TAU, ma = (hours % 1) * TAU, p = pen(c, 1 / (L.farS * dpr));
      for (i = 0; i < wallInfo.clocks.length; i++) {
        var ck = wallInfo.clocks[i];
        p.seg(ck.x, ck.y, ck.x + Math.sin(ha) * 44, ck.y + Math.cos(ha) * 44, INK, 13);
        p.seg(ck.x, ck.y, ck.x + Math.sin(ma) * 68, ck.y + Math.cos(ma) * 68, INK, 9);
        p.disc(ck.x, ck.y, 10); p.fill('#e5484d');
      }
      c.setTransform(1, 0, 0, 1, 0, 0);
    }

    // The view through window number `w`: hills, drifting clouds, the sun
    // or moon, stars and sky. `again` = this window already has a sky from
    // earlier, so put the bare wall back first.
    function paintSky(phase, w, again) {
      var c = backCtx, s = L.farS * dpr, x0 = wallInfo.windows[w], i, j, x, g;
      var skyTop = Math.min(1752, wallInfo.top);
      // The window's place in whole pixels, so no seam is left at its edge.
      var px0 = Math.max(0, Math.floor(L.cx * dpr + (x0 - 474) * s)), px1 = Math.min(W, Math.ceil(L.cx * dpr + (x0 + 474) * s));
      var py0 = Math.max(0, Math.floor((L.farY - skyTop * L.farS) * dpr) - 1), py1 = Math.min(floorTop, Math.ceil((L.farY - 874 * L.farS) * dpr));
      if (px1 <= px0 || py1 <= py0) return;
      var sky = skyAt(phase), night = step01(0.54, 0.66, phase) * (1 - step01(0.86, 0.95, phase));
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.beginPath(); c.rect(px0, py0, px1 - px0, py1 - py0); c.clip();
      if (again) {
        c.clearRect(px0, py0, px1 - px0, py1 - py0);
        c.globalAlpha = 1 - mixF; c.drawImage(wallFor(mixN), px0, py0, px1 - px0, py1 - py0, px0, py0, px1 - px0, py1 - py0);
        if (mixF > 0.003) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = mixF; c.drawImage(wallFor((mixN + 1) % 4), px0, py0, px1 - px0, py1 - py0, px0, py0, px1 - px0, py1 - py0); }
        c.globalAlpha = 1;
      }
      wallView(c);
      c.globalCompositeOperation = 'destination-over';        // "paint behind what is already there"
      // Nearest first, because each new thing goes behind the last.
      var v = hash(w, 3, 1) * 40;
      c.fillStyle = rgba(sky.near, 1);
      c.beginPath(); c.moveTo(x0 - 480, 870); c.lineTo(x0 - 480, 905 + v); c.bezierCurveTo(x0 - 300, 950 + v, x0 - 150, 890, x0 + 20, 915);
      c.bezierCurveTo(x0 + 200, 945, x0 + 330, 960 - v, x0 + 480, 925); c.lineTo(x0 + 480, 870); c.closePath(); c.fill();
      c.fillStyle = rgba(sky.far, 1);
      c.beginPath(); c.moveTo(x0 - 480, 870); c.lineTo(x0 - 480, 960 - v); c.bezierCurveTo(x0 - 330, 930, x0 - 200, 985, x0 - 40, 975);
      c.bezierCurveTo(x0 + 120, 965, x0 + 250, 925 + v, x0 + 480, 990); c.lineTo(x0 + 480, 870); c.closePath(); c.fill();
      // Clouds drift on their own steady clock, at any hour.
      c.fillStyle = rgba(sky.cloud, sky.cloud[3].toFixed(3));
      var layers = [CLOUDS_NEAR, CLOUDS_FAR];
      for (j = 0; j < 2; j++) {
        var lay = layers[j], drift = (animT * lay.speed) % lay.span;
        for (i = 0; i < lay.list.length; i++) {
          var cl = lay.list[i], k = cl[2], reach = 474 + 190 * k;
          // Where this cloud is now, wrapped so it comes round again; skip it unless it is in this window.
          var u = cl[0] + drift;
          for (x = u + Math.ceil((x0 - reach - u) / lay.span) * lay.span; x < x0 + reach; x += lay.span) {
            c.beginPath();
            c.ellipse(x, cl[1], 150 * k, 46 * k, 0, 0, TAU); c.ellipse(x - 70 * k, cl[1] + 34 * k, 76 * k, 52 * k, 0, 0, TAU);
            c.ellipse(x + 40 * k, cl[1] + 50 * k, 90 * k, 64 * k, 0, 0, TAU); c.ellipse(x + 120 * k, cl[1] + 26 * k, 60 * k, 40 * k, 0, 0, TAU);
            c.fill();
          }
        }
      }
      if (x0 === 0) {
        // The sun crosses the middle window and sets; then the moon does the same.
        var day = phase > 0.9 ? phase - 1 : phase, su = (day + 0.10) / 0.66, sx, sy;
        if (su > 0 && su < 1) {
          c.globalAlpha = Math.min(1, su * 14, (1 - su) * 14);            // its glow fades in and out, never pops
          sx = -300 + 600 * su; sy = 820 + 372 * Math.sin(Math.PI * su);
          var low = 1 - clamp(Math.sin(Math.PI * su) * 2.2, 0, 1);         // 1 near the horizon
          var core = mix([255, 246, 196], [255, 150, 70], low), halo = mix([255, 232, 130], [255, 120, 60], low);
          c.fillStyle = rgba(core, 1); c.beginPath(); c.arc(sx, sy, 56, 0, TAU); c.fill();
          g = c.createRadialGradient(sx, sy, 40, sx, sy, 230);
          g.addColorStop(0, rgba(halo, 0.75)); g.addColorStop(0.4, rgba(halo, 0.25)); g.addColorStop(1, rgba(halo, 0));
          c.fillStyle = g; c.beginPath(); c.arc(sx, sy, 230, 0, TAU); c.fill();
        }
        var mu = (phase - 0.6) / 0.32;
        if (mu > 0 && mu < 1) {
          c.globalAlpha = Math.min(1, mu * 14, (1 - mu) * 14);
          sx = -300 + 600 * mu; sy = 830 + 350 * Math.sin(Math.PI * mu);
          c.fillStyle = 'rgba(206,214,240,0.9)';
          c.beginPath(); c.arc(sx - 14, sy + 12, 11, 0, TAU); c.arc(sx + 18, sy - 8, 8, 0, TAU); c.arc(sx + 6, sy + 24, 6, 0, TAU); c.fill();
          c.fillStyle = '#f6f8ff'; c.beginPath(); c.arc(sx, sy, 46, 0, TAU); c.fill();
          g = c.createRadialGradient(sx, sy, 36, sx, sy, 190);
          g.addColorStop(0, 'rgba(200,214,255,0.5)'); g.addColorStop(1, 'rgba(200,214,255,0)');
          c.fillStyle = g; c.beginPath(); c.arc(sx, sy, 190, 0, TAU); c.fill();
        }
        c.globalAlpha = 1;
      }
      // Stars, twinkling a little.
      if (night > 0.01) {
        for (j = 0; j < 16; j++) {
          var tw = 0.6 + 0.4 * Math.sin(animT * 0.004 + j * 2.4 + w);
          c.fillStyle = 'rgba(255,255,236,' + (night * tw).toFixed(3) + ')';
          c.beginPath(); starPath(c, x0 - 450 + hash(w, j, 7) * 900, 1000 + hash(j, w, 11) * 730, 9 + hash(j, w, 13) * 9, 4); c.fill();
        }
      }
      // The sky itself, right at the back.
      g = c.createLinearGradient(0, 880, 0, Math.max(skyTop, 1200));
      g.addColorStop(0, rgba(sky.bot, 1)); g.addColorStop(1, rgba(sky.top, 1));
      c.fillStyle = g; c.fillRect(x0 - 480, 866, 960, skyTop - 860);
      c.restore();
      c.globalCompositeOperation = 'source-over';
    }

    // ── one frame ──────────────────────────────────────────────────────
    // o.costume  what the egg wears      o.zoom  0..1 through the ending zoom
    // o.frozen   true while paused (nothing animates)
    var zk = 1, ex = 0, ey = 0;          // this frame's view: zoom and offset, in real pixels
    function viewUnits() { ctx.setTransform(dpr * zk, 0, 0, dpr * zk, ex, ey); }   // draw in screen units
    function viewPixels() { ctx.setTransform(zk, 0, 0, zk, ex, ey); }             // copy hidden pictures pixel for pixel

    function draw(run, now, o) {
      if (!L) resize();
      if (stale) repaint();
      var S = run.S, p = S.player, dist = S.dist, i, z, q, a;
      var dt = o.frozen ? 0 : clamp(now - lastNow, 0, 60);
      lastNow = now;
      animT += dt;
      // The slow loop has its own clock. It keeps going across runs and
      // menus, and stands still while the game is paused.
      if (pinned === null) loopMs = (loopMs + dt) % T.BACKDROP_LOOP_MS;
      var phase = pinned === null ? loopMs / T.BACKDROP_LOOP_MS : pinned;
      var clock = S.over ? S.overAt + (o.sinceOver || 0) : S.t;   // animation clock keeps ticking after the end
      var pace = clamp((S.speed - T.START_SPEED) / (T.TOP_SPEED - T.START_SPEED), 0, 1);

      var eg = proj(p.x, p.y, 0), ft = proj(p.x, 0, 0);
      eggAt.x = eg.x; eggAt.y = eg.y; eggAt.s = eg.s;
      feetAt.x = ft.x; feetAt.y = ft.y; feetAt.s = ft.s;
      if (!o.frozen) notice(run, S);

      // Where the view sits this frame: the ending zoom, and any shake.
      zk = 1; ex = 0; ey = 0;
      if (o.zoom > 0) {
        var e = ease(clamp(o.zoom, 0, 1));
        var fx0 = eg.x, fy0 = eg.y - 44 * eg.s;
        zk = 1 + (T.ENDING_ZOOM - 1) * e;
        ex = (fx0 + (L.cx - fx0) * e - zk * fx0) * dpr; ey = (fy0 + (L.h * 0.5 - fy0) * e - zk * fy0) * dpr;
      }
      if (animT < shakeEnd) {
        var sk = (shakeEnd - animT) / shakeLen * shakeAmp * dpr;
        ex += Math.round(Math.sin(animT * 0.11) * sk); ey += Math.round(Math.cos(animT * 0.17) * sk * 0.5);
      }
      if (zk !== 1) {
        // Zoomed in, the picture is bigger than the screen. Never slide it
        // so far that an edge shows: with the egg in a side lane on a
        // narrow screen, the egg simply ends up a little off-centre.
        ex = clamp(ex, W - zk * W, 0); ey = clamp(ey, H - zk * H, 0);
      } else if (ex || ey) {
        // The shake slides the picture a few pixels, which would leave a
        // bare strip at one or two edges. Paint just those strips first,
        // from the still picture.
        var pad = Math.ceil(6 * dpr) + 2, fh = H - floorTop;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(back, 0, 0, W, pad, 0, 0, W, pad);
        ctx.drawImage(floorPic, 0, fh - pad, W, pad, 0, H - pad, W, pad);
        ctx.drawImage(back, 0, 0, pad, floorTop, 0, 0, pad, floorTop); ctx.drawImage(back, W - pad, 0, pad, floorTop, W - pad, 0, pad, floorTop);
        ctx.drawImage(floorPic, 0, 0, pad, fh, 0, floorTop, pad, fh); ctx.drawImage(floorPic, W - pad, 0, pad, fh, W - pad, floorTop, pad, fh);
      }

      // Far wall. Its light is re-mixed only now and then (see mixBackdrop).
      if (mixedAt < -1e8 || (!o.frozen && animT - mixedAt >= MIX_EVERY_MS) || (pinned !== null && pinned !== mixedPhase)) {
        mixBackdrop(phase); mixedAt = skyDrawnAt = animT; mixedPhase = phase;
      } else if (!o.frozen && animT - skyDrawnAt >= SKY_EVERY_MS) {
        for (i = 0; i < wallInfo.windows.length; i++) paintSky(phase, i, true);
        skyDrawnAt = animT;
      } else if (++framesSincePaint > 3) {
        // Paint the other lights one at a time over the next few frames,
        // so none of them has to be made in the middle of a busy moment.
        for (i = 0; i < 4; i++) if (!wallAt[i]) { wallFor(i); break; }
        if (i === 4 && wallPlain) { wallPlain = null; wallLit = null; }   // all four made: the plain one is no longer needed
      }
      viewPixels();
      ctx.drawImage(back, 0, 0);
      viewUnits();
      drawSteam();

      viewPixels();
      ctx.drawImage(floorPic, 0, floorTop);
      viewUnits();
      drawFloor(dist);
      viewPixels();
      ctx.drawImage(stripNow, 0, floorTop);
      viewUnits();
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
            // Keep a clear aisle beside the track: it is where the dog
            // runs, and it lets the things ON the track stand out.
            var sx = Math.max(SCENERY_ROWS[r] + (h1 - 0.5) * 150, T.DOG_SIDE + 78 + A.PICS[name].w / 2);
            list.push({ z: z, kind: 'scenery', name: name, x: side * sx });
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
          if (Math.abs(q.x - L.cx) - pic.w * q.s * 0.7 > L.w / 2) continue;
          a = clamp((T.FAR_WALL - 60 - z) / 500, 0, 1);
          if (a <= 0) continue;
          ctx.globalAlpha = a;
          stamp(it.name, q.x, q.y, q.s, 1);
          ctx.globalAlpha = 1;
        } else if (it.kind === 'obstacle') {
          drawObstacle(it.th, z, S, clock);
        } else if (it.kind === 'egg') {
          drawEggPickup(it.th, z, clock);
        } else if (it.kind === 'gate') {
          drawGate(it.gate, z, S, clock);
        } else if (it.kind === 'dog') {
          drawDogAt(S, clock, o);
        } else if (it.kind === 'player') {
          drawPlayer(S, clock, o, now, pace);
        } else {
          drawSpare(S, it.i, clock);
        }
      }

      if (S.dog.state === 'warning') drawPawWarning(S, clock);
      drawParticles(dt);
      drawAir(pace, S);

      if (o.zoom > 0) {                                     // soft dark edges as it zooms
        if (!vignette) vignette = paintVignette();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = clamp(o.zoom, 0, 1);
        ctx.drawImage(vignette, 0, 0, W, H);
        ctx.globalAlpha = 1;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // The dark edges for the ending, painted small once and stretched.
    function paintVignette() {
      var cv = makeCanvas(96, 96), c = cv.getContext('2d');
      var g = c.createRadialGradient(48, 48, 20, 48, 48, 70);
      g.addColorStop(0, 'rgba(44,22,30,0)'); g.addColorStop(0.55, 'rgba(44,22,30,0.14)'); g.addColorStop(1, 'rgba(44,22,30,0.6)');
      c.fillStyle = g; c.fillRect(0, 0, 96, 96);
      return cv;
    }

    // Spot the moments worth an effect by comparing with the last frame.
    function notice(run, S) {
      var p = S.player, dog = S.dog, i, j, q;
      if (seen.run !== run) {                                // a different run: nothing "just happened"
        seen.run = run; seen.lane = p.lane; seen.dogPhase = dog.phase;
        seen.knives = typeof WeakMap === 'function' ? new WeakMap() : null;
        return;
      }
      if (p.lane !== seen.lane && !S.over) {                 // lane change: a quick swoosh behind the egg
        var dir = p.lane > seen.lane ? 1 : -1;
        for (i = 0; i < 4; i++) {
          addParticle({ kind: 'streak', x: eggAt.x - dir * (16 + i * 5) * eggAt.s, y: eggAt.y - (22 + i * 17) * eggAt.s,
                        vx: dir * 0.1 * eggAt.s, vy: 0, len: -dir * (40 + (i % 2) * 22) * eggAt.s, life: 170 + i * 15, size: 3.5 * eggAt.s });
        }
      }
      seen.lane = p.lane;
      if (dog.phase === 'snap' && seen.dogPhase !== 'snap' && dog.state === 'alongside') {   // the jaws shut
        var jx = dog.side * ((1.5 - T.DOG_BITE_LANES) * LANE + 24);
        q = proj(jx, 78, T.DOG_AHEAD - 90);
        burst(q.x, q.y, 9, 'spark', ['#ffffff', '#ffe680', '#ffffff'], 0.3, 300);
        addParticle({ kind: 'ring', x: q.x, y: q.y, r0: 10 * q.s, r1: 74 * q.s, life: 240, color: '#ffffff', size: 7 * q.s });
        addParticle({ kind: 'flash', x: q.x, y: q.y, life: 130, size: 60 * q.s });
      }
      seen.dogPhase = dog.phase;
      if (seen.knives) {                                     // a blade landing: dust, and a tiny shake if it is close
        for (i = 0; i < S.gates.length; i++) {
          var gate = S.gates[i], z = gate.d - S.dist;
          for (j = 0; j < gate.knives.length; j++) {
            var kn = gate.knives[j], was = seen.knives.get(kn);
            if (kn.phase === 'down' && was && was !== 'down' && kn.knocked === null && z < T.SEE_AHEAD && z > -200) {
              q = proj(kn.lane * LANE, 0, z);
              for (var d = -1; d <= 1; d += 2) {
                addParticle({ kind: 'dust', x: q.x + d * 34 * q.s, y: q.y - 4 * q.s, vx: d * 0.11 * q.s, vy: -0.03 * q.s, life: 300, size: 15 * q.s });
                addParticle({ kind: 'dust', x: q.x + d * 14 * q.s, y: q.y - 2 * q.s, vx: d * 0.05 * q.s, vy: -0.05 * q.s, life: 240, size: 11 * q.s });
              }
              if (z < 420) shake(2.5 * (1 - Math.max(0, z) / 600), 120);
            }
            seen.knives.set(kn, kn.phase);
          }
        }
      }
    }
    // A very small screen shake: never more than 6 pixels or 180 ms, and
    // none at all for players who have asked their device for less motion.
    function shake(amp, ms) {
      if (reducedMotion()) return;
      if (animT < shakeEnd && amp < shakeAmp) return;
      shakeAmp = Math.min(amp, 6); shakeLen = Math.min(ms, 180); shakeEnd = animT + shakeLen;
    }

    // ── floor and track: the parts that slide toward you ───────────────
    function drawFloor(dist) {
      var E = TRACK_HALF + KERB, zFar = T.FAR_WALL, d, d0, z0, z1, sa, sb, ya, yb, row, lane, x0, x1;
      // No need to draw floor that is below the bottom of the screen.
      var zNear = Math.max(-T.CAM_BACK + 60, L.sp * L.camBack * L.camH / (L.h + 10 - L.vanishY) - L.camBack);
      var left = -8, right = L.w + 8;
      function across(za, zb) {                 // a band of floor either side of the track, between two distances
        sa = scaleAt(za); sb = scaleAt(zb); ya = L.vanishY + L.camH * sa; yb = L.vanishY + L.camH * sb;
        ctx.moveTo(left, yb); ctx.lineTo(L.cx - E * sb, yb); ctx.lineTo(L.cx - E * sa, ya); ctx.lineTo(left, ya); ctx.closePath();
        ctx.moveTo(right, yb); ctx.lineTo(L.cx + E * sb, yb); ctx.lineTo(L.cx + E * sa, ya); ctx.lineTo(right, ya); ctx.closePath();
      }
      function patch(xa, xb, za, zb) {           // a four-sided patch of track
        sa = scaleAt(za); sb = scaleAt(zb); ya = L.vanishY + L.camH * sa; yb = L.vanishY + L.camH * sb;
        ctx.moveTo(L.cx + xa * sb, yb); ctx.lineTo(L.cx + xb * sb, yb); ctx.lineTo(L.cx + xb * sa, ya); ctx.lineTo(L.cx + xa * sa, ya); ctx.closePath();
      }

      // Every other row of floor tiles is a shade deeper…
      d0 = Math.floor((dist + zNear) / FLOOR_TILE) * FLOOR_TILE;
      ctx.beginPath();
      for (d = d0; d < dist + zFar; d += FLOOR_TILE) {
        if (Math.round(d / FLOOR_TILE) & 1) continue;
        z0 = Math.max(zNear, d - dist); z1 = Math.min(zFar, d + FLOOR_TILE - dist);
        if (z1 > z0) across(z0, z1);
      }
      ctx.fillStyle = 'rgba(190,138,82,0.14)'; ctx.fill();
      // …with a joint between rows: a dark line and a bright one beside it.
      ctx.beginPath();
      for (d = d0; d < dist + zFar; d += FLOOR_TILE) { z0 = d - dist; if (z0 > zNear + 6 && z0 < zFar - 6) across(z0 - 4, z0 + 4); }
      ctx.fillStyle = 'rgba(166,118,70,0.4)'; ctx.fill();
      ctx.beginPath();
      for (d = d0; d < dist + zFar; d += FLOOR_TILE) { z0 = d - dist; if (z0 > zNear + 12 && z0 < zFar - 6) across(z0 - 10, z0 - 4); }
      ctx.fillStyle = 'rgba(255,255,255,0.42)'; ctx.fill();

      // The runner's checks: the darker squares, drawn over the lit teal.
      d0 = Math.floor((dist + zNear) / LANE) * LANE;
      ctx.beginPath();
      for (d = d0; d < dist + zFar; d += LANE) {
        z0 = Math.max(zNear, d - dist); z1 = Math.min(zFar, d + LANE - dist); row = Math.round(d / LANE);
        if (z1 <= z0) continue;
        for (lane = 0; lane < 3; lane++) {
          if ((row + lane) & 1) continue;
          x0 = -TRACK_HALF + lane * LANE; x1 = x0 + LANE;
          patch(x0 + (lane === 0 ? 5 : 0), x1 - (lane === 2 ? 5 : 0), z0, z1);
        }
      }
      ctx.fillStyle = 'rgba(36,138,158,0.74)'; ctx.fill();
      // Stitches along the pale edges: they rush past and sell the speed.
      ctx.beginPath();
      for (d = d0; d < dist + zFar; d += LANE) {
        z0 = d - dist + 24; z1 = d - dist + 84;
        if (z0 < zNear || z1 > zFar) continue;
        patch(-TRACK_HALF - 15, -TRACK_HALF - 8, z0, z1); patch(TRACK_HALF + 8, TRACK_HALF + 15, z0, z1);
      }
      ctx.fillStyle = 'rgba(214,160,92,0.6)'; ctx.fill();
      // Lane lines, so the three lanes are obvious at a glance.
      ctx.beginPath();
      patch(-LANE / 2 - 3.5, -LANE / 2 + 3.5, zNear, zFar); patch(LANE / 2 - 3.5, LANE / 2 + 3.5, zNear, zFar);
      ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.fill();
    }

    // Steam curling up from each kettle. Drawn every frame because it
    // moves quickly; it is only a few soft puffs.
    function drawSteam() {
      if (!wallInfo) return;
      for (var i = 0; i < wallInfo.steams.length; i++) {
        var st = wallInfo.steams[i], x = wallX(st.x), y = wallY(st.y);
        if (x < -40 || x > L.w + 40) continue;
        for (var j = 0; j < 4; j++) {
          var u = (animT / 2800 + j / 4 + i * 0.37) % 1, r = (30 + u * 58) * L.farS;
          ctx.globalAlpha = Math.min(1, Math.sin(Math.PI * u) * 1.5) * 0.85;
          ctx.drawImage(steamPic, x + (Math.sin(u * 5 + j * 2 + i) * 20 + u * 40) * L.farS - r, y - u * 270 * L.farS - r, r * 2, r * 2);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Stamp the ready-drawn picture `name` with its floor point at (x, y),
    // at `s` screen units per game unit. Far-away things are tiny on screen,
    // so they are stamped from half-, quarter- or eighth-size copies of the
    // picture: that is quicker, and they shimmer less as they slide along.
    //
    // `shade` asks for the picture with its floor shadow already painted
    // under it (1 = the soft shadow clutter gets, 2 = the firmer one that
    // grounds a hazard). A thing and its shadow then cost one stamp
    // instead of two or three, which matters with a kitchen full of clutter.
    var plainPics = {}, shadedPics = {};
    function smaller(entry, level) {
      if (entry.levels[level]) return entry.levels[level];
      var from = level ? smaller(entry, level - 1) : entry.img;
      var cv = makeCanvas(Math.ceil(from.width / 2), Math.ceil(from.height / 2));
      cv.getContext('2d').drawImage(from, 0, 0, cv.width, cv.height);
      return (entry.levels[level] = cv);
    }
    function shaded(name, sp, firm) {
      var w = A.PICS[name].w;
      // Room for the shadow, which reaches a little past the picture to the right and below.
      var left = Math.max(sp.ox, w * 0.55 + 2), right = Math.max(sp.w - sp.ox, w * 0.69 + 2), below = Math.max(sp.h - sp.oy, w * 0.15 + 2);
      var cv = makeCanvas(Math.ceil((left + right) * res), Math.ceil((sp.oy + below) * res)), c = cv.getContext('2d');
      c.scale(res, res);
      function blob(wd, alpha, squash) {                    // the same shape shadow() draws
        c.globalAlpha = alpha;
        c.drawImage(shadowPic, left + wd * 0.07 - wd * 0.6, sp.oy - wd * 0.07 - wd * squash, wd * 1.2, wd * squash * 2);
      }
      blob(w, firm ? 0.34 : 0.3, 0.2);
      if (firm) blob(w * 0.66, 0.3, 0.12);                  // a tighter, darker one right where it stands
      c.globalAlpha = 1;
      if (firm) {
        c.drawImage(sp.img, left - sp.ox, 0, sp.w, sp.h);
      } else {
        // Clutter is background. js/art.js already washes each clutter picture
        // toward the floor's colour (its `soft` flag), so it is stamped as it is:
        // washing it again here made it look faded.
        c.drawImage(sp.img, left - sp.ox, 0, sp.w, sp.h);
      }
      return { from: sp.img, img: cv, levels: [], ox: left, oy: sp.oy, w: cv.width / res, h: cv.height / res };
    }
    function stamp(name, x, y, s, shade) {
      var sp = A.sprite(name, res), set = shade ? shadedPics : plainPics, key = shade ? name + shade : name, e = set[key];
      if (!e || e.from !== sp.img) {                         // first use, or the picture has been redrawn
        e = set[key] = shade ? shaded(name, sp, shade === 2) : { from: sp.img, img: sp.img, levels: [], ox: sp.ox, oy: sp.oy, w: sp.w, h: sp.h };
      }
      var shrink = res / (s * dpr * zk);                    // picture pixels per screen pixel
      ctx.drawImage(shrink >= 2.5 ? smaller(e, shrink >= 10 ? 2 : shrink >= 5 ? 1 : 0) : e.img, x - e.ox * s, y - e.oy * s, e.w * s, e.h * s);
    }

    // A soft shadow on the floor under something `w` units wide, standing
    // at the point p. It sits a little to the right, away from the light.
    function shadow(p, w, alpha, squash) {
      var hw = w * 0.6 * p.s, hh = w * (squash || 0.2) * p.s;
      ctx.globalAlpha = alpha;
      ctx.drawImage(shadowPic, p.x + w * 0.07 * p.s - hw, p.y - w * 0.07 * p.s - hh, hw * 2, hh * 2);
      ctx.globalAlpha = 1;
    }
    // How visible something at depth z is: fades in far away, fades out
    // once it is behind the egg so it never hides the egg or the spares.
    function visible(z) {
      var a = clamp((T.SEE_AHEAD - z) / T.FADE_IN, 0, 1);
      if (z < -30) a *= clamp(1 - (-30 - z) / 130, 0, 1);
      return a;
    }

    function flyOff(knockedAt, clock, lane, id) {
      var t = clamp((clock - knockedAt) / 650, 0, 1);
      var dir = lane !== 0 ? lane : (id % 2 ? 1 : -1);
      return { t: t, dx: dir * t * 440, dy: Math.sin(t * Math.PI) * 200 + t * 60, rot: dir * t * 6.5, alpha: 1 - t * t, grow: 1 + t * 0.15 };
    }

    function drawObstacle(th, z, S, clock) {
      var pic = A.PICS[th.kind], x = th.lane * LANE, q;
      if (th.knocked !== null) {                             // knocked away: it spins off to the side
        var f = flyOff(th.knocked, clock, th.lane, th.id);
        if (f.t >= 1) return;
        shadow(proj(x + f.dx, 0, z + f.t * 260), pic.w * (1 - f.t * 0.5), 0.22 * f.alpha);
        q = proj(x + f.dx, pic.h / 2 + f.dy, z + f.t * 260);
        ctx.save(); ctx.globalAlpha = f.alpha; ctx.translate(q.x, q.y); ctx.rotate(f.rot);
        stamp(th.kind, 0, pic.h / 2 * q.s * f.grow, q.s * f.grow);
        ctx.restore();
        return;
      }
      var a = visible(z);
      if (a <= 0) return;
      q = proj(x, 0, z);
      ctx.globalAlpha = a;
      stamp(th.kind, q.x, q.y, q.s, 2);
      ctx.globalAlpha = 1;
    }

    // An egg waiting on the track. Golden ones sit in a pool of gold light
    // with a few twinkles, so they are easy to spot from far away.
    function drawEggPickup(th, z, clock) {
      var a = visible(z), x = th.lane * LANE, q, g;
      if (a <= 0) return;
      var bobY = 22 + Math.sin(clock * 0.005 + th.d * 0.02) * 6;
      g = proj(x, 0, z);
      q = proj(x, bobY, z);
      if (th.golden) {
        var beat = 0.5 + 0.5 * Math.sin(clock * 0.008), r = (58 + beat * 10) * q.s;
        ctx.globalAlpha = a * (0.55 + beat * 0.25);
        ctx.drawImage(goldPic, g.x - 62 * g.s, g.y - 20 * g.s, 124 * g.s, 40 * g.s);
        ctx.drawImage(goldPic, q.x - r, q.y - 30 * q.s - r, r * 2, r * 2);
        shadow(g, 38, 0.22 * a);
        ctx.globalAlpha = a;
        stamp('golden', q.x, q.y, q.s * (1 + (beat - 0.5) * 0.14));
        ctx.fillStyle = '#ffffff';
        for (var i = 0; i < 3; i++) {
          var ph = clock * 0.004 + i * 2.1, tw = Math.max(0, Math.sin(ph * 1.7 + i));
          if (tw < 0.1) continue;
          ctx.beginPath(); starPath(ctx, q.x + Math.cos(ph) * 34 * q.s, q.y - (32 + Math.sin(ph * 1.3) * 30) * q.s, 8 * tw * q.s, 4); ctx.fill();
        }
      } else {
        shadow(g, 36, 0.3 * a);
        ctx.globalAlpha = a;
        stamp('egg', q.x, q.y, q.s);
      }
      ctx.globalAlpha = 1;
    }

    function drawGate(gate, z, S, clock) {
      var a = visible(z), i, q, g;
      if (a <= 0) return;
      // The frame's two posts stand on the floor.
      shadow(proj(-226, 0, z), 54, 0.3 * a); shadow(proj(226, 0, z), 54, 0.3 * a);
      for (i = 0; i < gate.knives.length; i++) {
        var kn = gate.knives[i], x = kn.lane * LANE;
        if (kn.knocked !== null) {
          var f = flyOff(kn.knocked, clock, kn.lane, gate.id + i);
          if (f.t >= 1) continue;
          q = proj(x + f.dx, 80 + f.dy, z + f.t * 200);
          ctx.save(); ctx.globalAlpha = a * f.alpha; ctx.translate(q.x, q.y); ctx.rotate(f.rot);
          stamp('cleaver', 0, 80 * q.s, q.s);
          ctx.restore();
          continue;
        }
        var by = kn.h * KNIFE_UP_Y, low = 1 - kn.h;
        // The blade's shadow on the floor is a warning: it grows as the
        // blade comes down, and turns red while the blade is low enough
        // to hit.
        g = proj(x, 0, z);
        var danger = kn.h < T.KNIFE_DANGER_BELOW ? 1 : clamp((0.8 - kn.h) / (0.8 - T.KNIFE_DANGER_BELOW), 0, 1) * 0.55;
        var hw = (40 + 30 * low) * g.s, hh = (12 + 9 * low) * g.s;
        ctx.globalAlpha = a * (0.2 + 0.22 * low) * (1 - danger);
        ctx.drawImage(shadowPic, g.x - hw, g.y - hh, hw * 2, hh * 2);
        if (danger > 0) {
          ctx.globalAlpha = a * danger * 0.78;
          ctx.drawImage(dangerPic, g.x - hw * 1.15, g.y - hh * 1.15, hw * 2.3, hh * 2.3);
          if (danger === 1) {                                // a hard red core, so it reads even when tiny
            ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#d6242e';
            ctx.beginPath(); ctx.ellipse(g.x, g.y, hw * 0.8, hh * 0.72, 0, 0, TAU); ctx.fill();
          }
        }
        ctx.globalAlpha = a;
        // The rod it slides on.
        var top = proj(x, BEAM_Y, z), mid = proj(x, by + 150, z);
        ctx.fillStyle = '#7f8db0'; ctx.fillRect(top.x - 4.5 * g.s, top.y, 9 * g.s, mid.y - top.y);
        ctx.fillStyle = '#dfe6f4'; ctx.fillRect(top.x - 3 * g.s, top.y, 2.6 * g.s, mid.y - top.y);
        q = proj(x, by, z);
        stamp('cleaver', q.x, q.y, q.s);
        if (kn.phase === 'down' && clock - kn.from < 110) {   // thunk lines when it lands
          var t = (clock - kn.from) / 110;
          ctx.globalAlpha = a * (1 - t * 0.6);
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.5 * q.s; ctx.lineCap = 'round';
          ctx.beginPath();
          for (var s = -1; s <= 1; s += 2) {
            ctx.moveTo(q.x + s * (50 + t * 10) * q.s, q.y - 5 * q.s); ctx.lineTo(q.x + s * (72 + t * 22) * q.s, q.y - (17 + t * 8) * q.s);
            ctx.moveTo(q.x + s * (54 + t * 10) * q.s, q.y + 3 * q.s); ctx.lineTo(q.x + s * (80 + t * 22) * q.s, q.y + 4 * q.s);
          }
          ctx.stroke();
          ctx.globalAlpha = a;
        }
      }
      q = proj(0, 0, z);
      ctx.globalAlpha = a;
      stamp('frame', q.x, q.y, q.s);
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
        if (phase === 'snap') {
          var jawsAt = (1.5 - T.DOG_BITE_LANES) * LANE + 62;       // where the dog stands at full stretch
          var go = Math.sin(Math.min(1, f * 1.25) * Math.PI);
          x += (Math.min(x, jawsAt + 62) - x) * go; z -= 100 * go;
        }
      } else if (dog.state === 'leaving') {
        var out = ease(clamp((S.t - dog.leftAt) / 900, 0, 1));
        x += out * 800; z += out * 500; phase = 'idle';
      }
      var ate = S.over && S.cause === 'dog';
      var q = proj(side * x, 0, z);
      // After it wins it sits right where the egg was (its picture is not
      // centred on its feet, hence the 30), so the ending zoom can frame it
      // even on a narrow screen.
      if (ate) { phase = 'idle'; q = proj(S.player.x + side * 30, 0, 6); }
      // The dog's picture is not centred on its feet, so nor is its shadow.
      ctx.globalAlpha = 0.36;
      ctx.drawImage(shadowPic, q.x - (side * 26 + 92) * q.s, q.y - 26 * q.s, 184 * q.s, 46 * q.s);
      ctx.globalAlpha = 1;
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
      var outer = dog.side * LANE * 1.5, inner = outer - dog.side * LANE * T.DOG_BITE_LANES;
      var xa = Math.min(outer, inner), xb = Math.max(outer, inner);
      var a = proj(xa, 0, 250), b = proj(xb, 0, 250), c2 = proj(xb, 0, -90), d = proj(xa, 0, -90);
      var pulse = dog.phase === 'snap' ? 0.56 : 0.18 + 0.28 * f + Math.sin(clock * 0.03) * 0.05;
      // A soft red glow that spills a little past the lanes…
      ctx.globalAlpha = clamp(pulse * 1.3, 0, 1);
      ctx.drawImage(dangerPic, a.x - (b.x - a.x) * 0.1, a.y - (d.y - a.y) * 0.2, (b.x - a.x) * 1.2, (d.y - a.y) * 1.4);
      ctx.globalAlpha = 1;
      // …and the exact lanes, hard-edged, on top.
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(d.x, d.y); ctx.closePath();
      ctx.fillStyle = 'rgba(229,72,77,' + pulse.toFixed(3) + ')'; ctx.fill();
      ctx.strokeStyle = 'rgba(179,32,47,' + (0.45 + 0.45 * f).toFixed(3) + ')'; ctx.lineWidth = 3.5 * L.sp; ctx.lineJoin = 'round'; ctx.stroke();
      // Chevrons pointing the way the bite travels.
      var dirn = -dog.side, mid = (xa + xb) / 2, n;
      ctx.beginPath();
      for (n = -1; n <= 1; n++) {
        var cxw = mid + n * LANE * 0.55 + dirn * ((clock * 0.12) % (LANE * 0.55));
        if (cxw < xa + 14 || cxw > xb - 14) continue;
        var p1 = proj(cxw - dirn * 14, 0, 150), p2 = proj(cxw + dirn * 14, 0, 80), p3 = proj(cxw - dirn * 14, 0, 10);
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y);
      }
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 + 0.4 * f).toFixed(3) + ')'; ctx.lineWidth = 5 * L.sp; ctx.lineCap = 'round'; ctx.stroke();
    }

    function drawPawWarning(S, clock) {
      var dog = S.dog, side = dog.side, n = 6;
      var prog = clamp((S.t - dog.warnedAt) / T.DOG_WARN_MS, 0, 1);
      var sp = A.sprite('paw', res);
      // Prints appear one after another along the side the dog will run on.
      for (var i = 0; i < n; i++) {
        if (prog < i / n) break;
        var q = proj(side * (L.dogX + 10 + (i % 2 ? 22 : -22)), 0, -40 + i * 58);
        var pop = clamp((prog - i / n) * 9, 0, 1), k = 0.6 + 0.4 * pop + Math.sin(pop * Math.PI) * 0.25;
        ctx.save(); ctx.translate(q.x, q.y); ctx.scale(q.s * k, q.s * 0.45 * k);
        ctx.globalAlpha = pop;
        ctx.drawImage(sp.img, -sp.ox, -sp.oy + 30, sp.w, sp.h);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      // A badge at the screen edge on the side it is coming from.
      var rad0 = 32 * L.sp, bx = side > 0 ? L.w - rad0 - 12 : rad0 + 12, by = L.eggY - 190 * L.sp;
      var beat = 0.5 + 0.5 * Math.sin(clock * 0.02), rad = rad0 * (0.94 + beat * 0.12);
      ctx.globalAlpha = 0.3;
      ctx.drawImage(shadowPic, bx - rad * 1.2 + 3, by - rad * 1.2 + 6, rad * 2.4, rad * 2.4);
      ctx.globalAlpha = 1 - beat;                             // a ring that keeps spreading out from it
      ctx.beginPath(); ctx.arc(bx, by, rad0 * (1.05 + beat * 0.5), 0, TAU);
      ctx.strokeStyle = '#e5484d'; ctx.lineWidth = 3 * L.sp; ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(bx, by, rad, 0, TAU);
      ctx.fillStyle = '#fff8ea'; ctx.fill(); ctx.strokeStyle = '#e5484d'; ctx.lineWidth = 5 * L.sp; ctx.stroke();
      ctx.beginPath(); ctx.arc(bx, by, rad - 5 * L.sp, 0, TAU);
      ctx.strokeStyle = 'rgba(179,32,47,0.25)'; ctx.lineWidth = 2 * L.sp; ctx.stroke();
      var kk = rad / 42;
      ctx.drawImage(sp.img, bx - sp.ox * kk, by - (sp.oy - 28) * kk, sp.w * kk, sp.h * kk);
    }

    function drawPlayer(S, clock, o, now, pace) {
      var p = S.player, q = proj(p.x, p.y, 0);
      var eaten = S.over && S.cause === 'dog';
      var air = p.grounded ? 0 : clamp(p.y / 110, 0.05, 1);
      // The egg's shadow shrinks and fades as it jumps.
      if (!eaten) {
        shadow(feetAt, 64 * (1 - air * 0.42), 0.4 * (1 - air * 0.55));
        shadow(feetAt, 40 * (1 - air * 0.6), 0.34 * (1 - air), 0.13);
      }
      if (eaten) return;                                     // the dog has it
      var mood = S.over ? 'cracked' : S.t < p.sweatUntil ? 'worried' : 'happy';
      var sx = 1, sy = 1, vy = 0;
      if (!p.grounded) { vy = clamp(p.vy / T.JUMP_SPEED, -1, 1); sy = 1 + Math.abs(vy) * 0.1; sx = 1 - Math.abs(vy) * 0.07; }
      else { var since = S.t - landedAt; if (since < 130) { var sq = 1 - since / 130; sy = 1 - sq * 0.14; sx = 1 + sq * 0.12; } }
      var lean = clamp((p.lane * LANE - p.x) / LANE, -1, 1);
      // The costume leans the egg itself on the `lean` hint (see costumes.js), so
      // only a small tilt is added here; a big one on top looked like falling over.
      var tilt = clamp(lean * 0.2, -0.14, 0.14);
      ctx.save();
      if (!S.over && S.t < p.blinkUntil) ctx.globalAlpha = Math.floor(S.t / 90) % 2 ? 0.25 : 0.85;
      ctx.translate(q.x, q.y); ctx.rotate(tilt); ctx.scale(q.s * sx, q.s * sy);
      // vy, lean and pace are hints the costume can use for flapping capes and the like.
      C.drawEgg(ctx, { costume: o.costume, mood: mood, t: clock, air: air, still: false, vy: vy, lean: lean, pace: pace });
      if (animT < flashEnd) {                                // just been hit: a brief white flash
        ctx.globalAlpha = clamp((flashEnd - animT) / 150, 0, 1) * 0.9;
        shellPath(ctx); ctx.fillStyle = '#ffffff'; ctx.fill();
      }
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
      shadow(proj(x, 0, z), 26 * (1 - clamp(y / 110, 0, 1) * 0.4), 0.34 * (1 - clamp(y / 110, 0, 1) * 0.5));
      var q = proj(x, y + hop, z);
      stamp('spare', q.x, q.y, q.s);
    }

    // ── sparkles, shell bits, dust, sweat and pop-up words ─────────────
    function addParticle(pt) {
      if (particles.length >= MAX_PARTICLES) particles.shift();
      pt.max = pt.life; particles.push(pt);
    }
    function burst(x, y, n, kind, colors, speed, life) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * TAU, sp = (0.3 + Math.random() * 0.7) * speed * L.sp;
        addParticle({ kind: kind, x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * 0.5 * L.sp,
                      life: life * (0.7 + Math.random() * 0.5), size: (4 + Math.random() * 4) * L.sp,
                      color: colors[i % colors.length], grav: 0.0009 * L.sp, rot: Math.random() * 6 });
      }
    }
    // The words are drawn once into a small picture and then stamped,
    // because drawing outlined letters every frame is slow.
    function popupPic(text, color, size) {
      var key = text + '|' + color + '|' + size, s = popupPics[key];
      if (s) return s;
      if (++popupCount > 14) { popupPics = {}; popupCount = 1; }
      var k = dpr * 1.25, fpx = Math.max(8, Math.round(size * L.sp * k));
      var font = '900 ' + fpx + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
      var cv = makeCanvas(8, 8), c = cv.getContext('2d');
      c.font = font;
      var pad = Math.ceil(fpx * 0.34);
      cv.width = Math.ceil(c.measureText(text).width) + pad * 2; cv.height = Math.ceil(fpx * 1.25) + pad * 2;
      c = cv.getContext('2d');
      c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
      var x = cv.width / 2, y = cv.height / 2;
      c.lineWidth = fpx * 0.38; c.strokeStyle = 'rgba(80,44,30,0.28)'; c.strokeText(text, x, y + fpx * 0.08);
      c.lineWidth = fpx * 0.26; c.strokeStyle = '#ffffff'; c.strokeText(text, x, y);
      c.fillStyle = color; c.fillText(text, x, y);
      s = popupPics[key] = { img: cv, w: cv.width / k, h: cv.height / k };
      return s;
    }
    function drawParticles(dt) {
      var i, p, a, t, r;
      for (i = particles.length - 1; i >= 0; i--) {
        p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.vy += (p.grav || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        t = 1 - p.life / p.max;
        a = clamp(p.life / p.max * 1.6, 0, 1);
        ctx.globalAlpha = a;
        if (p.kind === 'drop') {
          var ang = Math.atan2(p.vy, p.vx) - Math.PI / 2;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
          ctx.beginPath(); ctx.moveTo(0, -p.size * 1.5); ctx.quadraticCurveTo(p.size, p.size * 0.3, 0, p.size * 0.8);
          ctx.quadraticCurveTo(-p.size, p.size * 0.3, 0, -p.size * 1.5);
          ctx.fillStyle = '#8fd8ff'; ctx.fill(); ctx.strokeStyle = '#2f7ff0'; ctx.lineWidth = 1.2; ctx.stroke();
          ctx.restore();
        } else if (p.kind === 'shell') {
          p.rot += dt * 0.012;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.beginPath(); ctx.moveTo(-p.size, 0); ctx.lineTo(-p.size * 0.2, -p.size * 0.9); ctx.lineTo(p.size, -p.size * 0.1); ctx.lineTo(p.size * 0.3, p.size * 0.7); ctx.closePath();
          ctx.fillStyle = p.color; ctx.fill(); ctx.strokeStyle = '#b79a72'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.restore();
        } else if (p.kind === 'dust') {                        // a soft puff that swells as it fades
          r = p.size * (0.7 + t * 1.5);
          ctx.globalAlpha = (1 - t) * 0.85;
          ctx.drawImage(dustPic, p.x - r, p.y - r * 0.7, r * 2, r * 1.4);
        } else if (p.kind === 'flash') {
          r = p.size * (0.5 + t * 1.1);
          ctx.globalAlpha = (1 - t) * 0.9;
          ctx.drawImage(puffPic, p.x - r, p.y - r, r * 2, r * 2);
        } else if (p.kind === 'ring') {                        // a ring that spreads and thins
          ctx.globalAlpha = (1 - t) * (1 - t);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * (1 - (1 - t) * (1 - t)), 0, TAU);
          ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, p.size * (1 - t * 0.7)); ctx.stroke();
        } else if (p.kind === 'streak') {
          ctx.globalAlpha = (1 - t) * 0.8;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.len * (1 - t * 0.5), p.y);
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = p.size; ctx.lineCap = 'round'; ctx.stroke();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath(); starPath(ctx, p.x, p.y, p.size * (0.6 + a * 0.6), 4); ctx.fill();
        }
      }
      // Pop-up words: they bounce in, drift up, then fade.
      for (i = popups.length - 1; i >= 0; i--) {
        p = popups[i];
        p.life -= dt;
        if (p.life <= 0) { popups.splice(i, 1); continue; }
        p.y -= dt * 0.05 * L.sp;
        t = p.max - p.life;
        var k = t < 110 ? 0.5 + 0.8 * (t / 110) : t < 230 ? 1.3 - 0.3 * ((t - 110) / 120) : 1;
        var pic = popupPic(p.text, p.color, p.size), w = pic.w * k, h = pic.h * k;
        ctx.globalAlpha = clamp(p.life / 300, 0, 1);
        ctx.drawImage(pic.img, p.x - w / 2, p.y - h / 2, w, h);
      }
      ctx.globalAlpha = 1;
    }

    // A little atmosphere over everything: dust motes drifting in the
    // light, and streaks at the screen's edges once the run is fast. Both
    // are faint and stay away from the track, so they never hide a hazard.
    function drawAir(pace, S) {
      var i, w = L.w, top = L.farY * 0.35, span = L.eggY - top;
      ctx.fillStyle = 'rgba(255,250,224,0.5)';
      ctx.beginPath();
      for (i = 0; i < 9; i++) {
        var u = (hash(i, 1, 2) + animT * 0.000012 * (1 + (i % 3))) % 1, v = (hash(i, 4, 6) + animT * 0.000008 * (1 + (i % 2))) % 1;
        var mx = u * w * 0.8 + Math.sin(animT * 0.0007 + i) * 10, my = top + v * span * 0.7 + u * span * 0.2;
        if (Math.abs(mx - L.cx) < (TRACK_HALF + 60) * L.sp * 0.7) continue;      // not over the track
        ctx.moveTo(mx, my); ctx.arc(mx, my, (1.2 + (i % 3) * 0.6) * Math.max(1, L.sp), 0, TAU);
      }
      ctx.fill();
      if (pace > 0.55 && !S.over && !reducedMotion()) {
        var strength = (pace - 0.55) / 0.45, floorH = L.h - L.farY;
        ctx.lineCap = 'round';
        for (i = 0; i < 10; i++) {
          var side = i % 2 ? 1 : -1, f = (animT * 0.0016 + hash(i, 8, 3)) % 1;
          var ty = L.farY + floorH * (0.1 + hash(i, 2, 9) * 0.42), tx = side > 0 ? w + 20 : -20;
          var t0 = 0.72 + f * 0.28, t1 = t0 + 0.07 + strength * 0.06;
          ctx.beginPath();
          ctx.moveTo(L.cx + (tx - L.cx) * t0, L.vanishY + (ty - L.vanishY) * t0); ctx.lineTo(L.cx + (tx - L.cx) * t1, L.vanishY + (ty - L.vanishY) * t1);
          // A faint warm line under a white one, so it shows on the pale floor too.
          ctx.globalAlpha = Math.sin(Math.PI * f) * 0.22 * strength;
          ctx.strokeStyle = '#b07a4a'; ctx.lineWidth = 4.2 * L.sp; ctx.stroke();
          ctx.globalAlpha = Math.sin(Math.PI * f) * 0.6 * strength;
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * L.sp; ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }

    // Effects the game asks for when things happen.
    var fx = {
      // An egg was collected: sparkles and a spreading ring. A golden egg
      // gets more of everything.
      egg: function (golden) {
        var x = eggAt.x, y = eggAt.y - 44 * eggAt.s, s = eggAt.s;
        burst(x, y, golden ? 18 : 7, 'spark', golden ? ['#ffd43b', '#ffffff', '#ff8a3d'] : ['#ffffff', '#ffe680'], golden ? 0.3 : 0.22, golden ? 520 : 420);
        addParticle({ kind: 'ring', x: x, y: y, r0: 14 * s, r1: (golden ? 96 : 56) * s, life: golden ? 420 : 280, color: golden ? '#ffd43b' : '#ffffff', size: (golden ? 9 : 5) * s });
        if (golden) {
          addParticle({ kind: 'ring', x: x, y: y, r0: 8 * s, r1: 62 * s, life: 520, color: '#ffffff', size: 5 * s });
          addParticle({ kind: 'flash', x: x, y: y, life: 200, size: 70 * s });
        }
      },
      popup: function (text, color, size) {
        var x = clamp(eggAt.x, 70 * L.sp, L.w - 70 * L.sp), y = eggAt.y - 112 * eggAt.s, i, p, rows = 0;
        size = size || 26;
        // Eggs in a row would pile the same words on top of each other.
        // Instead, the words already showing just bounce again.
        for (i = 0; i < popups.length; i++) {
          p = popups[i];
          if (p.text === text && p.max - p.life < 450) { p.life = p.max; p.x = x; return; }
          if (p.max - p.life < 700) rows += p.size * 1.05 * L.sp;       // newer words sit above older ones
        }
        popups.push({ text: text, x: x, y: y - rows, life: 900, max: 900, color: color || '#3a2618', size: size });
        if (popups.length > 6) popups.shift();
      },
      // Shell bits fly from the spare that cracked (number `index` in the
      // line), or from the egg itself when index is undefined. Either way
      // the egg has just been hit, so it flashes white and the screen
      // gives a very small shake.
      shell: function (index) {
        var q = index === undefined ? eggAt : proj((eggAt.x - L.cx) / eggAt.s, 10, -(index + 1) * T.TRAIL_GAP);
        burst(q.x, q.y - 30 * q.s, 14, 'shell', ['#fffaf0', '#ffffff', '#ffe680'], 0.3, 600);
        addParticle({ kind: 'flash', x: q.x, y: q.y - 24 * q.s, life: 170, size: 46 * q.s });
        addParticle({ kind: 'ring', x: q.x, y: q.y - 24 * q.s, r0: 8 * q.s, r1: 56 * q.s, life: 260, color: '#ffffff', size: 5 * q.s });
        flashEnd = animT + 150;
        shake(5, 170);
      },
      poof: function (lane, z) {
        var q = proj(lane * LANE, 40, z);
        burst(q.x, q.y, 8, 'spark', ['#cfd6de', '#ffffff'], 0.12 * q.s / L.sp, 380);
        addParticle({ kind: 'dust', x: q.x, y: q.y, vx: 0, vy: -0.02 * q.s, life: 320, size: 22 * q.s });
      },
      // The egg has landed from a jump: a squash (see drawPlayer) and two
      // little puffs of dust kicked out sideways.
      land: function (t) {
        landedAt = t;
        for (var d = -1; d <= 1; d += 2) {
          addParticle({ kind: 'dust', x: feetAt.x + d * 16 * feetAt.s, y: feetAt.y - 3 * feetAt.s, vx: d * 0.09 * feetAt.s, vy: -0.025 * feetAt.s, life: 300, size: 13 * feetAt.s });
          addParticle({ kind: 'dust', x: feetAt.x + d * 6 * feetAt.s, y: feetAt.y - 2 * feetAt.s, vx: d * 0.045 * feetAt.s, vy: -0.04 * feetAt.s, life: 230, size: 9 * feetAt.s });
        }
      },
      clear: function () { particles.length = 0; popups.length = 0; landedAt = -1e9; shakeEnd = -1; flashEnd = -1; }
    };

    // For developers: pin the slow loop at one point (0 morning, 0.25
    // afternoon, 0.5 sunset, 0.75 night), or pass null to let it run on
    // from there. tools/shots.js uses this for its DAY option.
    function setBackdropTime(f) {
      if (f === null || f === undefined || isNaN(f)) {
        if (pinned !== null) loopMs = pinned * T.BACKDROP_LOOP_MS;
        pinned = null;
      } else {
        pinned = f - Math.floor(f);
      }
      mixedAt = -1e9;
    }

    resize();
    return { resize: resize, draw: draw, fx: fx, layout: function () { return L; }, setBackdropTime: setBackdropTime };
  }

  ER.createRenderer = createRenderer;
})(typeof self !== 'undefined' ? self : globalThis);
