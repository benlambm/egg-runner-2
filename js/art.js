/*
 * Egg Runner 2 — the pictures.
 *
 * Every picture in the game is drawn here with canvas shapes; there are no
 * image files. Pictures are drawn in the game's units with (0, 0) at the
 * point where the thing touches the floor, x to the right and y DOWN (so
 * "up" is negative y).
 *
 * The look is a polished toy kitchen. Three rules keep every picture
 * looking like it belongs to the same game:
 *
 *   1. One warm light shines from the UPPER LEFT. So every thing is lightest
 *      at its upper left, its true colour in the middle, and darker and a
 *      little cooler at its lower right, with a thin strip of light bounced
 *      up from the floor just inside that lower-right edge. Shadows are
 *      never grey: the dark side of a red thing is deep red-purple, of a
 *      white thing soft blue-lilac.
 *   2. The camera looks down the track from behind and above. So things are
 *      drawn from a little above: you can see the top of the toaster, the
 *      lid of a tin, the soup in a pot. A round top is drawn as a flat oval.
 *   3. Outlines are a dark shade of the thing's own colour, not one black
 *      ink for everything. The shared ink (INK) is kept for faces.
 *
 * Shadows on the floor are NOT drawn here. render.js draws those, so they
 * can follow the thing as it moves.
 *
 * Things that never change shape (obstacles, eggs, clutter) are drawn once
 * into a small off-screen canvas and then stamped at whatever size the
 * distance calls for. That is what keeps phones fast, and it is why these
 * pictures can afford lots of careful shading.
 */
(function (root) {
  'use strict';

  var INK = '#3a2618';          // ink for faces (eyes, mouths) and the tiniest details
  var TAU = Math.PI * 2, PI = Math.PI;
  var K = 0.4;                  // a round top, seen from our camera, is this tall for each unit of half-width

  // ── drawing helpers ──────────────────────────────────────────────────
  function rr(c, x, y, w, h, r) { c.beginPath(); rrMore(c, x, y, w, h, r); }
  // The same rounded box, added to the path already being built.
  function rrMore(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function poly(c, pts) {
    c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath();
  }
  function oval(c, x, y, rx, ry, rot) { c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
  // The same oval, added to the path already being built. Painting several
  // shapes as one path is quicker than painting them one at a time, which
  // matters for the dog because it is drawn fresh every frame.
  function ovalMore(c, x, y, rx, ry, rot) {
    rot = rot || 0;
    c.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); c.ellipse(x, y, rx, ry, rot, 0, TAU);
  }
  function paint(c, fill, stroke, lw) {
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke !== null) { c.strokeStyle = stroke || INK; c.lineWidth = lw || 3; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
  }
  function grad(c, x0, y0, x1, y1, stops) {
    var g = c.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i++) g.addColorStop(i / (stops.length - 1), stops[i]);
    return g;
  }
  function radial(c, x, y, r0, r1, stops) {
    var g = c.createRadialGradient(x, y, r0, x, y, r1);
    for (var i = 0; i < stops.length; i++) g.addColorStop(i / (stops.length - 1), stops[i]);
    return g;
  }
  function shine(c, x, y, w, h) {
    rr(c, x, y, w, h, w / 2); paint(c, 'rgba(255,255,255,0.6)', null);
  }
  // An egg outline: rounder at the bottom, narrower at the top.
  function eggPath(c, cx, cy, rx, ry) {
    c.beginPath();
    c.moveTo(cx, cy - ry);
    c.bezierCurveTo(cx + rx * 0.74, cy - ry, cx + rx, cy - ry * 0.08, cx + rx, cy + ry * 0.28);
    c.bezierCurveTo(cx + rx, cy + ry * 0.74, cx + rx * 0.56, cy + ry, cx, cy + ry);
    c.bezierCurveTo(cx - rx * 0.56, cy + ry, cx - rx, cy + ry * 0.74, cx - rx, cy + ry * 0.28);
    c.bezierCurveTo(cx - rx, cy - ry * 0.08, cx - rx * 0.74, cy - ry, cx, cy - ry);
    c.closePath();
  }
  function star(c, x, y, r, points) {
    c.beginPath();
    for (var i = 0; i < points * 2; i++) {
      var a = -Math.PI / 2 + i * Math.PI / points, rad = i % 2 ? r * 0.45 : r;
      c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    c.closePath();
  }
  function label(c, text, x, y, size, color) {
    c.font = '900 ' + size + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(text, x, y);
  }

  // ── helpers for light and shade ──────────────────────────────────────
  // '#rrggbb' as a see-through colour.
  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  // A colour blend whose steps sit where you say: [place, colour, place, colour…].
  function gradAt(c, x0, y0, x1, y1, st) {
    var g = c.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < st.length; i += 2) g.addColorStop(st[i], st[i + 1]);
    return g;
  }
  function line(c, pts, color, w) {
    c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    paint(c, null, color, w);
  }
  // The side of an upright round thing (a tin, a mug) seen from a little
  // above: a strip whose bottom edge bows toward you. (x, yT) and (x, yB) are
  // the middles of its top and bottom ovals; rT and rB are their half-widths.
  // With `cap` the far edge of the top oval is included, which gives the
  // whole outline of the thing. Without it you get just the wall facing you.
  function wall(c, x, yT, rT, yB, rB, cap, k) {
    k = k || K;
    c.beginPath();
    c.moveTo(x - rT, yT); c.lineTo(x - rB, yB);
    c.ellipse(x, yB, rB, rB * k, 0, PI, 0, true);
    c.lineTo(x + rT, yT);
    c.ellipse(x, yT, rT, rT * k, 0, 0, PI, !!cap);
    c.closePath();
  }
  // Only the near half of an oval: for stripes that wrap around a round thing.
  function frontArc(c, x, y, r, k) { c.beginPath(); c.ellipse(x, y, r, r * (k || K), 0, 0, PI); }

  // Families of colour. l = lit side, m = the true colour, d = shadow side,
  // b = light bounced back up from the floor, k = outline.
  var RED    = { l: '#ff9a8c', m: '#e5484d', d: '#a3223f', b: '#ee7f8e', k: '#741531' };
  var YELLOW = { l: '#fff5b5', m: '#ffd43b', d: '#e8961a', b: '#ffe58f', k: '#9a5a06' };
  var ORANGE = { l: '#ffc592', m: '#f47c3c', d: '#c2452a', b: '#ffa873', k: '#8a2a16' };
  var GREEN  = { l: '#aee486', m: '#59b34a', d: '#2b8250', b: '#8fd486', k: '#1d5a37' };
  var BLUE   = { l: '#8cc0ff', m: '#2f7ff0', d: '#2450b5', b: '#6fa5f5', k: '#1a3a85' };
  var PURPLE = { l: '#bca2f4', m: '#8253d8', d: '#5730a5', b: '#a384ea', k: '#3b2073' };
  var WHITE  = { l: '#ffffff', m: '#f7f6fd', d: '#c2c0ea', b: '#f6eef4', k: '#4a487e' };
  var CREAM  = { l: '#fffaf0', m: '#f5e6c8', d: '#cfb3a6', b: '#f7e6cf', k: '#8a5f38' };
  var WOOD   = { l: '#f0c58a', m: '#cc9257', d: '#9a5c3a', b: '#dba873', k: '#6b3a1e' };
  var CLAY   = { l: '#f8ac80', m: '#dd7146', d: '#a84a38', b: '#ee936b', k: '#742a1c' };
  var PINK   = { l: '#ffd3e3', m: '#ff9ec2', d: '#e0609a', b: '#ffb3cf', k: '#a82e68' };
  var DARK   = { l: '#8a90b8', m: '#4f5480', d: '#2f3156', b: '#6d73a0', k: '#1f2038' };   // dark plastic and iron
  var STEEL_K = '#3c4868';      // outline for chrome and steel
  var GLASS_K = '#35638f';      // outline for clear glass

  // Left-to-right shading for an upright round thing between x0 and x1.
  function side(c, x0, x1, p) {
    return gradAt(c, x0, 0, x1, 0, [0, p.m, 0.2, p.l, 0.5, p.m, 0.86, p.d, 1, p.b]);
  }
  // The same for bare metal: bright, with the dark stripe a shiny tin shows.
  function metal(c, x0, x1) {
    return gradAt(c, x0, 0, x1, 0, [0, '#a6b6cc', 0.14, '#f6fbff', 0.3, '#cbd8e8', 0.46, '#eef4fa', 0.66, '#93a4c0', 0.88, '#6c7ca1', 1, '#aab7ce']);
  }
  // Shading for a ball-like thing centred on (x, y): lit from the upper left.
  function ball(c, x, y, r, p) {
    var g = c.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.06, x, y, r * 1.08);
    g.addColorStop(0, p.l); g.addColorStop(0.45, p.m); g.addColorStop(0.88, p.d); g.addColorStop(1, p.d);
    return g;
  }
  // The thin strip of bounced light just inside an edge. `path` draws the
  // shape; the strip fades in from (x0, y0) toward (x1, y1).
  function rimLight(c, path, x0, y0, x1, y1, col, w) {
    c.save(); path(); c.clip();
    path();
    c.strokeStyle = gradAt(c, x0, y0, x1, y1, [0, rgba(col, 0), 0.5, rgba(col, 0), 1, rgba(col, 0.9)]);
    c.lineWidth = w || 8; c.lineJoin = 'round'; c.stroke();
    c.restore();
  }
  // A soft white gleam.
  function gleam(c, x, y, rx, ry, rot, a) { oval(c, x, y, rx, ry, rot); paint(c, 'rgba(255,255,255,' + (a === undefined ? 0.85 : a) + ')', null); }
  // A leaf growing from (x, y), pointing up before it is turned by `rot`.
  function leaf(c, x, y, len, wid, rot, p) {
    c.save(); c.translate(x, y); c.rotate(rot);
    c.beginPath(); c.moveTo(0, 0);
    c.bezierCurveTo(-wid, -len * 0.3, -wid * 0.85, -len * 0.8, 0, -len);
    c.bezierCurveTo(wid * 0.85, -len * 0.8, wid, -len * 0.3, 0, 0); c.closePath();
    paint(c, gradAt(c, -wid, -len, wid, 0, [0, p.l, 0.5, p.m, 1, p.d]), p.k, 2.5);
    line(c, [0, -3, 0, -len * 0.82], rgba(p.k, 0.55), 1.5);
    c.restore();
  }

  // ── the pictures ─────────────────────────────────────────────────────
  // Each entry: w = width, h = height above the floor, d = room below the
  // floor line, and draw(c). Everything drawn must stay inside that box.
  // (0, 0) is the middle of the thing's FRONT edge on the floor.
  var PICS = {};

  // Tall obstacles (cannot be jumped) ···································
  // A slice of toast standing in its slot, seen from the front and a
  // little above, so its top crust shows.
  function toastSlice(c, x, top, bot) {
    var w = 13.5;
    function slice(dy) {
      c.beginPath();
      c.moveTo(x - w, bot); c.lineTo(x - w, top + 13 + dy);
      c.bezierCurveTo(x - w - 4, top + 5 + dy, x - w + 1, top + dy, x - w + 7, top + dy);
      c.lineTo(x + w - 7, top + dy);
      c.bezierCurveTo(x + w - 1, top + dy, x + w + 4, top + 5 + dy, x + w, top + 13 + dy);
      c.lineTo(x + w, bot); c.closePath();
    }
    slice(-4); paint(c, '#c47a30', '#7a4212', 2.5);
    slice(0); paint(c, gradAt(c, x - w, top, x + w, bot, [0, '#ffe6b0', 0.5, '#f6c77c', 1, '#dd9a4c']), '#7a4212', 2.5);
    rr(c, x - w + 4.5, top + 6.5, w * 2 - 9, bot - top - 10, 5); paint(c, 'rgba(196,122,48,0.5)', null);
  }
  PICS.toaster = { w: 112, h: 100, d: 4, draw: function (c) {
    var body = function () { rr(c, -46, -72, 92, 68, 16); };
    // Little feet.
    rr(c, -38, -9, 17, 10, 3.5); paint(c, DARK.m, DARK.k, 2.5);
    rr(c, 21, -9, 17, 10, 3.5); paint(c, DARK.m, DARK.k, 2.5);
    // The push-down lever on the side.
    rr(c, 40, -53, 14, 18, 5.5); paint(c, gradAt(c, 40, -53, 54, -35, [0, RED.l, 0.45, RED.m, 1, RED.d]), RED.k, 2.5);
    rr(c, 43.5, -50.5, 6, 3.4, 1.7); paint(c, 'rgba(255,255,255,0.75)', null);
    // The chrome body. Chrome shows the room in bands: pale sky above, a
    // dark line where wall meets floor, and the warm floor below.
    body(); c.fillStyle = gradAt(c, 0, -72, 0, -4, [0, '#ffffff', 0.27, '#f2f9ff', 0.5, '#c3d6ea', 0.6, '#97abc8',
      0.635, '#62759b', 0.67, '#8c9bb9', 0.71, '#f6dfc0', 0.9, '#dcb999', 1, '#a78e9c']); c.fill();
    // …and, across it, the light from the left and the shade on the right.
    body(); c.fillStyle = gradAt(c, -46, 0, 46, 0, [0, 'rgba(255,255,255,0.6)', 0.3, 'rgba(255,255,255,0)',
      0.6, 'rgba(52,62,130,0)', 0.93, 'rgba(52,62,130,0.42)', 1, 'rgba(120,130,190,0.2)']); c.fill();
    body(); paint(c, null, STEEL_K, 3);
    // The top, with its two slots.
    rr(c, -41.5, -70, 83, 18, 9); paint(c, gradAt(c, -41, 0, 41, 0, [0, '#ffffff', 0.6, '#e9f2fb', 1, '#c5d2e8']), '#8fa1c0', 1.5);
    rr(c, -35.5, -66.5, 32, 10, 5); paint(c, DARK.d, DARK.k, 1.5);
    rr(c, 3.5, -66.5, 32, 10, 5); paint(c, DARK.d, DARK.k, 1.5);
    toastSlice(c, -19.5, -92, -60.5); toastSlice(c, 19.5, -88, -60.5);
    // Browning dial.
    oval(c, 24, -25, 7.5, 7.5); paint(c, gradAt(c, 17, -32, 31, -18, [0, DARK.l, 1, DARK.d]), DARK.k, 2.5);
    line(c, [24, -25, 24, -30.5], '#ffffff', 2);
    // A tall gleam.
    rr(c, -38.5, -48, 6.5, 27, 3.2); paint(c, 'rgba(255,255,255,0.9)', null);
    rr(c, -29.5, -48, 3, 14, 1.5); paint(c, 'rgba(255,255,255,0.7)', null);
  } };

  PICS.blender = { w: 100, h: 134, d: 4, draw: function (c) {
    // Glass handle, behind the jug.
    c.beginPath(); c.moveTo(25, -99); c.bezierCurveTo(50, -98, 49, -63, 22, -60);
    paint(c, null, GLASS_K, 11.5); paint(c, null, '#cfeaf9', 6); paint(c, null, 'rgba(255,255,255,0.7)', 1.8);
    // The red base, wider at the floor.
    wall(c, 0, -40, 24.5, -12.4, 31, true); paint(c, side(c, -31, 31, RED), RED.k, 3);
    oval(c, 0, -40, 24.5, 9.8); paint(c, '#f0676a', RED.k, 2);
    oval(c, 0, -42.5, 21.5, 8.6); paint(c, DARK.d, DARK.k, 2);
    oval(c, 0, -18.5, 8, 7.4); paint(c, gradAt(c, -8, -26, 8, -11, [0, '#ffffff', 1, '#ffd0d4']), RED.k, 2.5);
    line(c, [0, -18.5, 0, -24], RED.k, 2);
    gleam(c, -19, -20, 2.6, 9, 0.2, 0.55);
    // The jug: clear glass, so the pink drink shows through.
    wall(c, 0, -106, 30, -45, 21, true); paint(c, 'rgba(214,240,252,0.7)', null);
    wall(c, 0, -84, 26.2, -45.4, 20.4, false);
    paint(c, gradAt(c, -27, 0, 27, 0, [0, '#ff8fb2', 0.22, '#ffc0d4', 0.5, '#ff7fa7', 0.88, '#de4580', 1, '#f0709c']), null);
    oval(c, 0, -84, 26.2, 10.5); paint(c, '#ffcbdb', '#e25a8f', 1.5);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    oval(c, 8, -68, 2.6, 2.6); c.fill(); oval(c, 13, -58, 1.8, 1.8); c.fill(); oval(c, -4, -56, 2, 2); c.fill();
    c.strokeStyle = rgba(GLASS_K, 0.55); c.lineWidth = 1.5; c.lineCap = 'round';
    for (var y = -92; y <= -62; y += 10) { c.beginPath(); c.moveTo(11, y + 3.2); c.lineTo(19, y); c.stroke(); }
    line(c, [-25.5, -99, -19.2, -52], 'rgba(255,255,255,0.9)', 3);
    line(c, [-16.5, -98, -12, -58], 'rgba(255,255,255,0.4)', 6);
    line(c, [25, -97, 18.7, -53], 'rgba(255,255,255,0.65)', 2);
    wall(c, 0, -106, 30, -45, 21, true); paint(c, null, GLASS_K, 3);
    // Lid and knob.
    wall(c, 0, -113, 31.5, -105.5, 31.5, true); paint(c, side(c, -31.5, 31.5, DARK), DARK.k, 3);
    oval(c, 0, -113, 31.5, 12.6); paint(c, gradAt(c, -31, -125, 31, -101, [0, DARK.l, 0.6, DARK.m, 1, DARK.d]), DARK.k, 2);
    wall(c, 0, -124, 9, -116.5, 10.5, true); paint(c, side(c, -10, 10, DARK), DARK.k, 2.5);
    oval(c, 0, -124, 9, 3.6); paint(c, DARK.l, DARK.k, 1.5);
  } };

  PICS.carton = { w: 80, h: 138, d: 4, draw: function (c) {
    var k = '#253a80';
    var front = function () { rr(c, -31, -98, 62, 98, 3.5); };
    // The folded strip along the very top.
    rr(c, -25, -134.5, 50, 15, 2.5); paint(c, gradAt(c, -25, 0, 25, 0, [0, '#ffffff', 0.6, '#f1f3ff', 1, '#d0d6f4']), k, 2.5);
    line(c, [-25, -127.5, 25, -127.5], '#aab4e2', 1.5);
    // The sloping front of the roof, with a red cap.
    poly(c, [-31, -98, 31, -98, 25, -121, -25, -121]);
    paint(c, gradAt(c, -31, -121, 31, -98, [0, '#ffffff', 0.5, '#eef1ff', 1, '#c9d0f1']), k, 2.5);
    wall(c, 11, -112.5, 8, -108.5, 8, true); paint(c, side(c, 3, 19, RED), RED.k, 2);
    oval(c, 11, -112.5, 8, 3.2); paint(c, RED.l, RED.k, 1.5);
    // The front: white, with cool shade down its right side.
    front(); c.fillStyle = gradAt(c, -31, 0, 31, 0, [0, '#ffffff', 0.5, '#f5f6ff', 0.9, '#c4caee', 1, '#d9dcf5']); c.fill();
    c.save(); front(); c.clip();
    c.fillStyle = gradAt(c, -31, 0, 31, 0, [0, '#5a9cff', 0.45, BLUE.m, 1, BLUE.d]); c.fillRect(-32, -81, 64, 41);
    c.fillStyle = '#2b2a55';                                 // cow patches
    oval(c, -21, -11, 13, 10, 0.3); c.fill(); oval(c, -12, -19, 7, 6); c.fill();
    oval(c, 17, -24, 9, 7, -0.4); c.fill(); oval(c, 27, -3, 10, 7); c.fill();
    c.restore();
    label(c, 'MILK', 0, -59.5, 21, '#ffffff');
    front(); paint(c, null, k, 3);
  } };

  // Flat obstacles (can be jumped) ······································
  // A kitchen knife lying on the floor, blade to the left.
  PICS.knife = { w: 118, h: 30, d: 4, draw: function (c) {
    var blade = function () {
      c.beginPath(); c.moveTo(13, -25); c.lineTo(-26, -24); c.quadraticCurveTo(-48, -22, -56, -13);
      c.quadraticCurveTo(-28, -2, 13, -1.5); c.closePath();
    };
    blade(); c.fillStyle = gradAt(c, 0, -25, 0, -1, [0, '#ffffff', 0.3, '#e2eef9', 0.52, '#b2c4dc', 0.6, '#7386aa', 0.66, '#aab9d2', 1, '#dbe6f2']); c.fill();
    // The ground edge of the blade catches the light.
    c.beginPath(); c.moveTo(-56, -13); c.quadraticCurveTo(-28, -2, 13, -1.5); c.lineTo(13, -8.5); c.quadraticCurveTo(-26, -9, -56, -13); c.closePath();
    paint(c, '#ffffff', '#8fa1c0', 1.2);
    blade(); paint(c, null, STEEL_K, 3);
    // Handle, with its metal collar and rivets.
    rr(c, 16, -26.5, 40, 25.5, 9); paint(c, gradAt(c, 0, -27, 0, -1, [0, '#7d6a9a', 0.35, '#4d3d68', 1, '#2c2145']), '#1c1430', 3);
    rr(c, 20, -24, 30, 4, 2); paint(c, 'rgba(255,255,255,0.3)', null);
    rr(c, 9.5, -27, 9, 26.5, 2.5); paint(c, gradAt(c, 0, -27, 0, -1, [0, '#f6fbff', 0.6, '#b2c4dc', 1, '#8496b6']), STEEL_K, 2.5);
    c.fillStyle = '#e9f1f9';
    oval(c, 27, -13.5, 2.8, 2.8); c.fill(); oval(c, 37, -13.5, 2.8, 2.8); c.fill(); oval(c, 47, -13.5, 2.8, 2.8); c.fill();
  } };

  // A pat of butter on a little dish.
  PICS.butter = { w: 110, h: 46, d: 4, draw: function (c) {
    oval(c, 0, -11.2, 52, 13.5); paint(c, '#b4bce6', WHITE.k, 2.5);                 // the dish's thickness
    oval(c, 0, -14, 52, 13.5); paint(c, gradAt(c, -52, 0, 52, 0, [0, '#ffffff', 0.6, '#f4f5ff', 1, '#cdd2f2']), WHITE.k, 2.5);
    oval(c, 0, -14, 45, 10.8); paint(c, null, '#8cc0ff', 2);
    oval(c, 0, -13.5, 38, 8.3); paint(c, '#e4e8fa', null);
    var pat = function () { rr(c, -34, -42, 68, 33, 6); };
    pat(); c.fillStyle = gradAt(c, -34, -28, 34, -9, [0, '#ffe066', 0.5, '#ffcf33', 1, '#f0a81c']); c.fill();
    rimLight(c, pat, 0, -30, 34, -9, '#ffe58f', 7);
    rr(c, -33, -41, 66, 14.5, 5.5); paint(c, gradAt(c, -33, 0, 33, 0, [0, '#fffbd0', 0.6, '#fff0a0', 1, '#ffe27a']), null);   // the top
    line(c, [-31, -26.5, 31, -26.5], 'rgba(255,255,255,0.8)', 1.5);
    c.beginPath(); c.moveTo(15, -9.5); c.lineTo(15, -26.5); c.lineTo(13, -41); paint(c, null, '#d48a10', 1.8);   // one slice cut
    rr(c, -27, -38, 22, 4.5, 2.2); paint(c, 'rgba(255,255,255,0.9)', null);
    pat(); paint(c, null, YELLOW.k, 3);
  } };

  // Eggs ··································································
  // A plain egg shape, shaded: used for the whole egg, the golden egg and
  // the little spares. p is a colour family, lw the outline width.
  function shell(c, cy, rx, ry, p, lw) {
    var path = function () { eggPath(c, 0, cy, rx, ry); };
    var g = c.createRadialGradient(-rx * 0.4, cy - ry * 0.42, ry * 0.08, 0, cy + ry * 0.08, ry * 1.22);
    g.addColorStop(0, p.l); g.addColorStop(0.42, p.m); g.addColorStop(0.86, p.d); g.addColorStop(1, p.d);
    path(); c.fillStyle = g; c.fill();
    rimLight(c, path, 0, cy - ry * 0.1, rx * 0.8, cy + ry * 0.9, p.b, rx * 0.34);
    path(); paint(c, null, p.k, lw);
    gleam(c, -rx * 0.42, cy - ry * 0.46, rx * 0.19, ry * 0.25, 0.5, 0.95);
  }
  var SHELL = { l: '#ffffff', m: '#fefcff', d: '#c4c0ec', b: '#fff3df', k: '#4a467c' };
  var GOLD  = { l: '#fffbd6', m: '#ffd43b', d: '#e88a00', b: '#ffe894', k: '#8a4a00' };
  PICS.egg = { w: 52, h: 62, d: 4, draw: function (c) { shell(c, -29, 21, 27, SHELL, 3); } };
  PICS.golden = { w: 96, h: 86, d: 14, draw: function (c) {
    var glow = c.createRadialGradient(0, -30, 12, 0, -30, 43);
    glow.addColorStop(0, 'rgba(255,224,90,0.85)'); glow.addColorStop(0.55, 'rgba(255,214,70,0.35)'); glow.addColorStop(1, 'rgba(255,214,70,0)');
    oval(c, 0, -30, 43, 43); paint(c, glow, null);
    shell(c, -30, 23, 29, GOLD, 3);
    c.fillStyle = '#ffffff'; c.strokeStyle = '#f0a000'; c.lineWidth = 1.2; c.lineJoin = 'round';
    star(c, 18, -55, 9.5, 4); c.fill(); c.stroke(); star(c, -22, -12, 6.5, 4); c.fill(); c.stroke();
    star(c, 27, -22, 4, 4); c.fill();
  } };
  // A spare: a little egg with a face and feet, like a duckling.
  PICS.spare = { w: 32, h: 38, d: 4, draw: function (c) {
    rr(c, -10, -5, 8.5, 5.5, 2.7); paint(c, '#ff9f2e', '#a8500a', 1.5);
    rr(c, 1.5, -5, 8.5, 5.5, 2.7); paint(c, '#ff9f2e', '#a8500a', 1.5);
    shell(c, -19.5, 12, 15.5, SHELL, 2.5);
    c.fillStyle = 'rgba(255,120,130,0.4)'; oval(c, -7.6, -16.5, 2.4, 1.7); c.fill(); oval(c, 7.6, -16.5, 2.4, 1.7); c.fill();
    c.fillStyle = INK; oval(c, -4.3, -20.5, 2, 2.4); c.fill(); oval(c, 4.3, -20.5, 2, 2.4); c.fill();
    c.fillStyle = '#ffffff'; oval(c, -4.9, -21.4, 0.7, 0.7); c.fill(); oval(c, 3.7, -21.4, 0.7, 0.7); c.fill();
    c.beginPath(); c.arc(0, -18, 3, 0.15 * PI, 0.85 * PI); paint(c, null, INK, 1.5);
  } };

  // Chopping knives ······················································
  // The wooden frame they hang from: two posts and a beam. Nothing may be
  // drawn between the posts, because the knives hang there.
  PICS.frame = { w: 520, h: 426, d: 6, draw: function (c) {
    var s, x, i;
    for (s = -1; s <= 1; s += 2) {
      x = s * 226;
      // Post: light down its left edge, shade down its right.
      rr(c, x - 12, -402, 24, 402, 4);
      paint(c, gradAt(c, x - 12, 0, x + 12, 0, [0, WOOD.l, 0.22, '#dba468', 0.7, WOOD.m, 0.9, WOOD.d, 1, WOOD.b]), WOOD.k, 3);
      c.strokeStyle = rgba(WOOD.k, 0.28); c.lineWidth = 1.5; c.lineCap = 'round';      // grain
      for (i = 0; i < 6; i++) { c.beginPath(); c.moveTo(x - 5 + (i % 3) * 5, -370 + i * 58); c.lineTo(x - 5 + (i % 3) * 5, -330 + i * 58); c.stroke(); }
      // Foot.
      rr(c, x - 25, -13, 50, 16, 5); paint(c, gradAt(c, x - 25, -13, x + 25, 3, [0, '#c98a52', 0.5, '#a9683c', 1, '#7e4630']), WOOD.k, 3);
      rr(c, x - 21, -11, 42, 3.5, 1.7); paint(c, 'rgba(255,225,170,0.6)', null);
    }
    // Beam: lit along the top, shaded underneath.
    rr(c, -252, -421, 504, 31, 7);
    paint(c, gradAt(c, 0, -421, 0, -390, [0, '#f6d29a', 0.2, '#e0aa6c', 0.7, WOOD.m, 0.9, WOOD.d, 1, '#b97a4c']), WOOD.k, 3);
    c.strokeStyle = rgba(WOOD.k, 0.25); c.lineWidth = 1.5;
    for (i = 0; i < 9; i++) { c.beginPath(); c.moveTo(-232 + i * 54, -411 + (i % 3) * 5); c.lineTo(-196 + i * 54, -411 + (i % 3) * 5); c.stroke(); }
    // Steel plates where the posts join the beam, and where each knife's rod passes.
    var plates = [-226, -120, 0, 120, 226];
    for (i = 0; i < plates.length; i++) {
      var big = Math.abs(plates[i]) > 200, hw = big ? 17 : 11;
      rr(c, plates[i] - hw, -416, hw * 2, 21, 3.5);
      paint(c, gradAt(c, plates[i] - hw, -416, plates[i] + hw, -395, [0, '#f6fbff', 0.5, '#b7c6dc', 1, '#7f90b3']), STEEL_K, 2);
      c.fillStyle = STEEL_K;
      oval(c, plates[i] - hw + 6, -405.5, 2.2, 2.2); c.fill(); oval(c, plates[i] + hw - 6, -405.5, 2.2, 2.2); c.fill();
    }
  } };
  // The chopping knife. The cutting edge (the blade's bottom) is at y = 0.
  PICS.cleaver = { w: 96, h: 168, d: 4, draw: function (c) {
    var blade = function () {
      c.beginPath(); c.moveTo(-35, -105); c.lineTo(36, -105); c.quadraticCurveTo(42, -105, 42, -99);
      c.lineTo(42, -8); c.quadraticCurveTo(0, 5, -41, -8); c.lineTo(-41, -99); c.quadraticCurveTo(-41, -105, -35, -105); c.closePath();
    };
    // Wooden handle with brass rivets.
    rr(c, -9.5, -164, 19, 62, 7.5); paint(c, gradAt(c, -9.5, 0, 9.5, 0, [0, '#b9683c', 0.3, '#d4854e', 0.6, '#9c4d2c', 1, '#6e2f22']), '#431a14', 3);
    rr(c, -6, -159, 3.5, 44, 1.7); paint(c, 'rgba(255,220,180,0.5)', null);
    c.fillStyle = '#ffd97a'; oval(c, 0, -148, 2.8, 2.8); c.fill(); oval(c, 0, -124, 2.8, 2.8); c.fill();
    rr(c, -12, -112, 24, 11, 3.5); paint(c, gradAt(c, -12, 0, 12, 0, [0, '#f6fbff', 0.5, '#b7c6dc', 1, '#7f90b3']), STEEL_K, 2.5);
    // The big blade: polished steel, with slanting reflections.
    blade(); c.fillStyle = gradAt(c, -41, -105, 42, -5, [0, '#ffffff', 0.2, '#dfeaf6', 0.4, '#a9bcd6', 0.47, '#f4f9fd',
      0.56, '#c9d8ea', 0.8, '#8c9fbf', 1, '#6f80a8']); c.fill();
    // The sharpened strip along the bottom is brightest of all.
    c.beginPath(); c.moveTo(-41, -8); c.quadraticCurveTo(0, 5, 42, -8); c.lineTo(42, -24); c.quadraticCurveTo(0, -12, -41, -24); c.closePath();
    paint(c, gradAt(c, -41, 0, 42, 0, [0, '#ffffff', 0.7, '#eaf2fa', 1, '#b9c8de']), null);
    c.beginPath(); c.moveTo(-41, -24); c.quadraticCurveTo(0, -12, 42, -24); paint(c, null, '#8395b8', 1.5);
    rr(c, -33, -97, 7, 60, 3.5); paint(c, 'rgba(255,255,255,0.75)', null);
    blade(); paint(c, null, STEEL_K, 3);
    c.beginPath(); c.moveTo(-37, -7); c.quadraticCurveTo(0, 5, 38, -7); paint(c, null, '#ffffff', 2);
    // The hanging hole really is a hole: you can see through it.
    c.save(); c.globalCompositeOperation = 'destination-out'; oval(c, 27, -89, 5.5, 5.5); c.fillStyle = '#000'; c.fill(); c.restore();
    oval(c, 27, -89, 5.5, 5.5); paint(c, null, STEEL_K, 2.5);
  } };

  // Paw print, seen from straight above. render.js lays it flat on the
  // floor, and also shows it on the warning badge.
  PICS.paw = { w: 60, h: 60, d: 0, draw: function (c) {
    var mud = 'rgba(112,64,30,0.82)', edge = 'rgba(74,38,14,0.55)';
    c.beginPath(); c.moveTo(0, -32); c.bezierCurveTo(10, -32, 20, -22, 20, -12);
    c.bezierCurveTo(20, -2, 11, -1, 6, -4); c.quadraticCurveTo(0, -7.5, -6, -4);
    c.bezierCurveTo(-11, -1, -20, -2, -20, -12); c.bezierCurveTo(-20, -22, -10, -32, 0, -32); c.closePath();
    paint(c, mud, edge, 1.5);
    var toes = [-19.5, -35, 6.3, 8.2, -0.45, -7, -46.5, 6.6, 8.8, -0.12, 7, -46.5, 6.6, 8.8, 0.12, 19.5, -35, 6.3, 8.2, 0.45];
    for (var i = 0; i < toes.length; i += 5) { oval(c, toes[i], toes[i + 1], toes[i + 2], toes[i + 3], toes[i + 4]); paint(c, mud, edge, 1.5); }
  } };

  // Kitchen clutter beside the track ····································
  // These are scenery, never hazards. `soft: true` lays a faint wash of the
  // floor's colour over the finished picture, so clutter sits back a little
  // and the things on the track stand out more.
  PICS.apple = { w: 100, h: 110, d: 4, soft: true, draw: function (c) {
    var body = function () {
      c.beginPath(); c.moveTo(0, -78);
      c.bezierCurveTo(14, -92, 46, -84, 46, -50); c.bezierCurveTo(46, -22, 28, -2, 14, -2);
      c.bezierCurveTo(8, -2, 5, -5, 0, -5); c.bezierCurveTo(-5, -5, -8, -2, -14, -2);
      c.bezierCurveTo(-28, -2, -46, -22, -46, -50); c.bezierCurveTo(-46, -84, -14, -92, 0, -78); c.closePath();
    };
    body(); c.fillStyle = ball(c, 0, -44, 46, RED); c.fill();
    rimLight(c, body, 0, -40, 40, -4, RED.b, 9);
    body(); paint(c, null, RED.k, 2.5);
    oval(c, 0, -78, 13, 4.5); paint(c, rgba(RED.k, 0.45), null);                    // the dip the stalk grows from
    c.beginPath(); c.moveTo(0, -77); c.quadraticCurveTo(1, -93, 9, -101); paint(c, null, '#4a2a12', 6); paint(c, null, '#8a5a2b', 3);
    leaf(c, 6, -92, 30, 10, 1.15, GREEN);
    gleam(c, -22, -60, 6.5, 12, 0.5, 0.6); gleam(c, -27, -41, 2.5, 4, 0.3, 0.45);
  } };

  PICS.can = { w: 84, h: 104, d: 4, soft: true, draw: function (c) {
    var R = 33, yB = -R * K, yT = -86, k = '#4a3a5c';
    wall(c, 0, yT, R, yB, R, true); paint(c, metal(c, -R, R), null);
    wall(c, 0, yT + 10, R, yB - 9, R, false); paint(c, side(c, -R, R, RED), null);  // the paper label
    oval(c, 0, -43, 19, 14.5); paint(c, gradAt(c, -19, 0, 19, 0, [0, YELLOW.l, 0.5, YELLOW.m, 1, '#f0b020']), RED.k, 1.5);
    label(c, 'SOUP', 0, -42.5, 13, RED.k);
    c.strokeStyle = 'rgba(60,72,104,0.5)'; c.lineWidth = 1.2;
    frontArc(c, 0, yT + 5, R); c.stroke(); frontArc(c, 0, yB - 4.5, R); c.stroke();
    wall(c, 0, yT, R, yB, R, true); paint(c, null, k, 2.5);
    oval(c, 0, yT, R, R * K); paint(c, gradAt(c, -R, yT - 13, R, yT + 13, [0, '#ffffff', 0.5, '#d5e0ee', 1, '#a4b3cc']), k, 2);
    oval(c, 0, yT, R - 6, (R - 6) * K); paint(c, null, '#8fa1c0', 1.5);
    oval(c, 5, yT, 7, 3); paint(c, '#eef4fa', '#7f90b3', 1.5);
  } };

  PICS.jar = { w: 84, h: 114, d: 4, soft: true, draw: function (c) {
    var R = 32, yB = -R * K;
    var glass = function () {
      c.beginPath(); c.moveTo(-25, -92); c.quadraticCurveTo(-R, -86, -R, -74); c.lineTo(-R, yB);
      c.ellipse(0, yB, R, R * K, 0, PI, 0, true); c.lineTo(R, -74); c.quadraticCurveTo(R, -86, 25, -92); c.closePath();
    };
    glass(); paint(c, 'rgba(214,240,252,0.72)', null);
    wall(c, 0, -70, R - 1.6, yB - 0.6, R - 1.6, false);                              // the jam inside
    paint(c, gradAt(c, -R, 0, R, 0, [0, '#c93a5c', 0.22, '#ef6f86', 0.5, '#c2304f', 0.88, '#861a45', 1, '#a83a62']), null);
    oval(c, 0, -70, R - 1.6, (R - 1.6) * K); paint(c, '#e86a84', '#a3223f', 1.5);
    // Paper label, wrapped round the front.
    c.beginPath(); c.ellipse(0, -55, R, R * K, 0, PI - 0.78, 0.78, true); c.ellipse(0, -29, R, R * K, 0, 0.78, PI - 0.78, false); c.closePath();
    paint(c, gradAt(c, -23, 0, 23, 0, [0, '#fffdf4', 0.7, '#fbf0d8', 1, '#e6d2c0']), '#8a5f38', 1.8);
    label(c, 'JAM', 0, -29.5, 14, '#a3223f');
    line(c, [-R + 4.5, -76, -R + 4.5, -22], 'rgba(255,255,255,0.85)', 3);
    line(c, [R - 4, -76, R - 4, -24], 'rgba(255,255,255,0.5)', 1.8);
    glass(); paint(c, null, GLASS_K, 2.5);
    // Gold screw lid.
    wall(c, 0, -99, 28, -91, 28, true); paint(c, side(c, -28, 28, YELLOW), YELLOW.k, 2.5);
    oval(c, 0, -99, 28, 11.2); paint(c, gradAt(c, -28, -110, 28, -88, [0, '#fffbe0', 0.5, YELLOW.m, 1, '#f0a820']), YELLOW.k, 2);
    oval(c, 0, -99, 20, 8); paint(c, null, 'rgba(154,90,6,0.4)', 1.2);
  } };

  PICS.bottle = { w: 64, h: 168, d: 4, soft: true, draw: function (c) {
    var R = 22, yB = -R * K;
    var glass = function () {
      c.beginPath(); c.moveTo(-8, -148); c.lineTo(-8, -116); c.bezierCurveTo(-8, -100, -R, -102, -R, -84); c.lineTo(-R, yB);
      c.ellipse(0, yB, R, R * K, 0, PI, 0, true); c.lineTo(R, -84); c.bezierCurveTo(R, -102, 8, -100, 8, -116); c.lineTo(8, -148); c.closePath();
    };
    glass(); c.fillStyle = gradAt(c, -R, 0, R, 0, [0, '#3f9b58', 0.2, '#b6e89a', 0.42, '#6cc060', 0.82, '#23734a', 1, '#55ab6c']); c.fill();
    c.save(); glass(); c.clip();                                                    // golden oil showing through the green
    c.fillStyle = 'rgba(255,214,60,0.3)'; c.fillRect(-R, -92, R * 2, 92);
    c.restore();
    c.beginPath(); c.ellipse(0, -66, R, R * K, 0, PI - 0.72, 0.72, true); c.ellipse(0, -34, R, R * K, 0, 0.72, PI - 0.72, false); c.closePath();
    paint(c, gradAt(c, -17, 0, 17, 0, [0, '#fffdf4', 0.7, '#fbf0d8', 1, '#e2d3c0']), '#8a5f38', 1.8);
    label(c, 'OIL', 0, -37.5, 13, GREEN.k);
    line(c, [-R + 4, -84, -R + 4, -14], 'rgba(255,255,255,0.75)', 2.6);
    line(c, [-4.5, -144, -4.5, -118], 'rgba(255,255,255,0.7)', 2);
    glass(); paint(c, null, GREEN.k, 2.5);
    rr(c, -10.5, -152, 21, 7, 3); paint(c, side(c, -10, 10, GREEN), GREEN.k, 2);
    wall(c, 0, -161, 7, -151, 7, true); paint(c, side(c, -7, 7, WOOD), WOOD.k, 2);  // cork
    oval(c, 0, -161, 7, 2.8); paint(c, WOOD.l, WOOD.k, 1.5);
  } };

  PICS.sack = { w: 132, h: 138, d: 4, soft: true, draw: function (c) {
    var body = function () {
      c.beginPath(); c.moveTo(-34, -102);
      c.bezierCurveTo(-60, -88, -66, -40, -53, -13); c.bezierCurveTo(-48, -1, -24, 1, 0, 1);
      c.bezierCurveTo(24, 1, 48, -1, 53, -13); c.bezierCurveTo(66, -40, 60, -88, 34, -102); c.closePath();
    };
    // The gathered cloth above the string.
    c.beginPath(); c.moveTo(-33, -100); c.bezierCurveTo(-40, -112, -47, -122, -44, -130);
    c.quadraticCurveTo(-22, -137, 0, -131); c.quadraticCurveTo(22, -137, 44, -130);
    c.bezierCurveTo(47, -122, 40, -112, 33, -100); c.closePath();
    paint(c, gradAt(c, -44, -132, 44, -100, [0, CREAM.l, 0.5, CREAM.m, 1, CREAM.d]), CREAM.k, 2.5);
    c.strokeStyle = rgba(CREAM.k, 0.45); c.lineWidth = 1.5; c.lineCap = 'round';
    for (var i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 13, -106); c.lineTo(i * 17, -125); c.stroke(); }
    body(); c.fillStyle = ball(c, 0, -50, 62, CREAM); c.fill();
    rimLight(c, body, 0, -50, 50, -6, CREAM.b, 10);
    body(); paint(c, null, CREAM.k, 2.5);
    c.fillStyle = RED.m; c.fillRect(-36, -77, 72, 3); c.fillRect(-36, -34, 72, 3);    // printed stripes
    label(c, 'FLOUR', 0, -54, 21, '#a85a30');
    rr(c, -37, -108, 74, 10, 5); paint(c, gradAt(c, 0, -108, 0, -98, [0, WOOD.l, 1, WOOD.d]), WOOD.k, 2);   // string
    c.strokeStyle = rgba(WOOD.k, 0.6); c.lineWidth = 1.3;
    for (i = -4; i <= 4; i++) { c.beginPath(); c.moveTo(i * 8 - 2, -99.5); c.lineTo(i * 8 + 2, -106.5); c.stroke(); }
  } };

  PICS.pot = { w: 172, h: 114, d: 4, soft: true, draw: function (c) {
    var R = 58, yT = -84, rB = 54, yB = -rB * K;
    // Handles.
    rr(c, -84, -80, 30, 13, 6.5); paint(c, gradAt(c, 0, -80, 0, -67, [0, DARK.l, 0.5, DARK.m, 1, DARK.d]), DARK.k, 2.5);
    rr(c, 54, -80, 30, 13, 6.5); paint(c, gradAt(c, 0, -80, 0, -67, [0, DARK.l, 0.5, DARK.m, 1, DARK.d]), DARK.k, 2.5);
    wall(c, 0, yT, R, yB, rB, true); paint(c, side(c, -R, R, ORANGE), ORANGE.k, 2.5);
    gleam(c, -43, -50, 4.5, 20, 0.04, 0.5);
    // The open top: cream rim, the far inside wall, and tomato soup.
    oval(c, 0, yT, R, R * K); paint(c, gradAt(c, -R, 0, R, 0, [0, '#fffaf0', 0.6, '#ffe9cf', 1, '#f0c4a0']), ORANGE.k, 2.5);
    var inner = function () { oval(c, 0, yT + 0.5, R - 6, (R - 6) * K); };
    inner(); paint(c, gradAt(c, -R, 0, R, 0, [0, '#b84a30', 1, '#8a2a2a']), null);
    c.save(); inner(); c.clip();
    oval(c, 0, yT + 8, R - 6, (R - 6) * K); paint(c, gradAt(c, -R, 0, R, 0, [0, '#ff7a55', 0.5, '#ee5540', 1, '#c93a3a']), '#a3223f', 1.5);
    c.beginPath(); c.moveTo(-26, yT + 9); c.bezierCurveTo(-14, yT + 2, -2, yT + 16, 12, yT + 9); paint(c, null, 'rgba(255,240,215,0.85)', 2.5);
    c.restore();
    inner(); paint(c, null, ORANGE.k, 1.8);
    // A wooden spoon standing in the soup, leaning on the far rim.
    line(c, [20, -78, 64, -107], WOOD.k, 10); line(c, [20, -78, 64, -107], WOOD.m, 5.5); line(c, [23, -81.5, 62, -107.5], WOOD.l, 1.5);
    oval(c, 19, -77, 8, 3.2); paint(c, 'rgba(255,240,215,0.5)', null);          // a ripple where it goes in
  } };

  PICS.mug = { w: 112, h: 88, d: 4, soft: true, draw: function (c) {
    var X = -8, R = 35, yT = -70, rB = 32.5, yB = -rB * K;
    c.beginPath(); c.moveTo(X + 30, -58); c.bezierCurveTo(X + 62, -62, X + 62, -22, X + 28, -24);
    paint(c, null, BLUE.k, 15); paint(c, null, BLUE.m, 9.5); paint(c, null, BLUE.l, 2);
    wall(c, X, yT, R, yB, rB, true); paint(c, side(c, X - R, X + R, BLUE), BLUE.k, 2.5);
    c.fillStyle = '#ffffff'; star(c, X - 2, -37, 15, 5); c.fill();
    gleam(c, X - 25, -42, 3.5, 17, 0.03, 0.55);
    oval(c, X, yT, R, R * K); paint(c, gradAt(c, X - R, 0, X + R, 0, [0, '#d6e8ff', 0.6, BLUE.l, 1, '#5d97ee']), BLUE.k, 2.5);
    var inner = function () { oval(c, X, yT + 0.5, R - 5, (R - 5) * K); };
    inner(); paint(c, BLUE.d, null);
    c.save(); inner(); c.clip();
    oval(c, X, yT + 5.5, R - 5, (R - 5) * K); paint(c, gradAt(c, X - R, 0, X + R, 0, [0, '#b9763f', 0.5, '#9a5a2e', 1, '#6e3a22']), '#5a2a16', 1.5);   // cocoa
    rr(c, X - 15, yT + 1, 11, 8, 3.5); paint(c, '#ffffff', '#c9b8c8', 1.2); rr(c, X + 1, yT + 4, 11, 8, 3.5); paint(c, '#fff3f6', '#c9b8c8', 1.2);   // marshmallows
    c.restore();
    inner(); paint(c, null, BLUE.k, 1.8);
  } };

  PICS.cheese = { w: 116, h: 80, d: 4, soft: true, draw: function (c) {
    var k = '#a85f08', i;
    // The top slopes down to the right; you can see it from above.
    poly(c, [-54, -58, 54, -26, 46, -42, -46, -75]); paint(c, gradAt(c, -50, -75, 50, -30, [0, '#fff2ae', 0.6, '#ffe07a', 1, '#ffd060']), k, 2.5);
    oval(c, -18, -57, 7, 3.4, 0.28); paint(c, '#f2b030', null); oval(c, 22, -39, 5, 2.4, 0.28); paint(c, '#f2b030', null);
    var front = function () { poly(c, [-54, 0, 54, 0, 54, -26, -54, -58]); };
    front(); c.fillStyle = gradAt(c, -54, -58, 54, 0, [0, '#ffd75a', 0.5, '#ffc23e', 1, '#f29a22']); c.fill();
    var holes = [-30, -24, 10, 9, 6, -15, 8, 7, 34, -12, 5.5, 5, -40, -7, 4.5, 4, -8, -36, 5, 4.5];
    for (i = 0; i < holes.length; i += 4) {
      oval(c, holes[i], holes[i + 1], holes[i + 2], holes[i + 3]);
      paint(c, gradAt(c, holes[i] - holes[i + 2], holes[i + 1] - holes[i + 3], holes[i] + holes[i + 2], holes[i + 1] + holes[i + 3], [0, '#d9780f', 0.6, '#f0a020', 1, '#ffc850']), 'rgba(168,95,8,0.6)', 1.2);
    }
    rimLight(c, front, 0, -30, 54, 0, '#ffd98a', 7);
    front(); paint(c, null, k, 2.5);
    line(c, [-52, -56.5, 52, -24.5], 'rgba(255,255,255,0.75)', 1.5);
  } };

  // A ripe tomato, for the crate.
  function tomato(c, x, y, r) {
    oval(c, x, y, r, r * 0.92); paint(c, ball(c, x, y, r, RED), RED.k, 2.2);
    c.fillStyle = GREEN.m; star(c, x, y - r * 0.62, r * 0.42, 5); c.fill(); c.strokeStyle = GREEN.k; c.lineWidth = 1.2; c.stroke();
    gleam(c, x - r * 0.42, y - r * 0.3, r * 0.14, r * 0.26, 0.5, 0.6);
  }
  PICS.crate = { w: 172, h: 128, d: 4, soft: true, draw: function (c) {
    var i, y;
    // Inside and far edge.
    poly(c, [-76, -80, 76, -80, 66, -106, -66, -106]); paint(c, '#7a4428', WOOD.k, 2.5);
    rr(c, -67, -110, 134, 8, 3); paint(c, gradAt(c, 0, -110, 0, -102, [0, WOOD.l, 1, WOOD.m]), WOOD.k, 2.2);
    tomato(c, -40, -102, 19); tomato(c, 2, -105, 20); tomato(c, 42, -101, 19);
    tomato(c, -20, -90, 19); tomato(c, 24, -89, 19);
    poly(c, [-78, -80, -70, -80, -61, -108, -68, -108]); paint(c, WOOD.l, WOOD.k, 2.2);
    poly(c, [78, -80, 70, -80, 61, -108, 68, -108]); paint(c, WOOD.d, WOOD.k, 2.2);
    // The front: three planks between two corner posts.
    rr(c, -76, -82, 152, 82, 3); paint(c, '#6b3a1e', null);
    for (i = 0; i < 3; i++) {
      y = -82 + i * 28;
      rr(c, -76, y, 152, 25, 3); paint(c, gradAt(c, -76, y, 76, y + 25, [0, WOOD.l, 0.35, '#dba468', 0.8, WOOD.m, 1, '#b3744a']), WOOD.k, 2.2);
      line(c, [-50, y + 8 + i * 3, -6, y + 8 + i * 3], rgba(WOOD.k, 0.25), 1.3); line(c, [12, y + 16 - i * 2, 52, y + 16 - i * 2], rgba(WOOD.k, 0.25), 1.3);
    }
    for (i = -1; i <= 1; i += 2) {
      rr(c, i * 69 - 8, -84, 16, 84, 3);
      paint(c, gradAt(c, i * 69 - 8, 0, i * 69 + 8, 0, [0, '#e2ad70', 0.6, '#b97a48', 1, WOOD.d]), WOOD.k, 2.5);
      c.fillStyle = rgba(WOOD.k, 0.7);
      for (y = -70; y <= -14; y += 28) { oval(c, i * 69, y, 1.8, 1.8); c.fill(); }
    }
  } };

  PICS.plant = { w: 148, h: 188, d: 4, soft: true, draw: function (c) {
    var LEAF2 = { l: '#8fdc8a', m: '#3f9e58', d: '#1f7350', k: GREEN.k };
    // Pot: narrower at the floor, with a thick rim.
    wall(c, 0, -70, 38, -12, 30, true); paint(c, side(c, -38, 38, CLAY), CLAY.k, 2.5);
    wall(c, 0, -84, 43, -70, 43, true); paint(c, side(c, -43, 43, CLAY), CLAY.k, 2.5);
    oval(c, 0, -84, 43, 17.2); paint(c, gradAt(c, -43, 0, 43, 0, [0, '#ffc7a0', 0.6, CLAY.l, 1, CLAY.m]), CLAY.k, 2.2);
    oval(c, 0, -83.5, 36, 14.2); paint(c, '#5e3220', CLAY.k, 1.5);
    // Leaves, the far ones first.
    leaf(c, -10, -84, 66, 15, -1.12, LEAF2); leaf(c, 10, -84, 66, 15, 1.12, LEAF2);
    leaf(c, -6, -86, 86, 17, -0.62, GREEN); leaf(c, 6, -86, 86, 17, 0.66, LEAF2);
    leaf(c, -3, -86, 98, 17, -0.22, LEAF2); leaf(c, 4, -86, 96, 17, 0.26, GREEN);
    leaf(c, 0, -84, 78, 16, 0.02, GREEN);
    leaf(c, -12, -80, 50, 13, -1.5, GREEN); leaf(c, 12, -80, 50, 13, 1.5, LEAF2);
  } };

  PICS.bowl = { w: 124, h: 68, d: 4, soft: true, draw: function (c) {
    var k2 = 0.36, rB = 58, yB = -rB * k2, rT = 47, yT = -46, i;
    wall(c, 0, yT, rT, yB, rB, true, k2); paint(c, side(c, -rB, rB, PURPLE), PURPLE.k, 2.5);
    label(c, 'DOG', 0, -19, 20, '#ffffff');
    oval(c, 0, yT, rT, rT * k2); paint(c, gradAt(c, -rT, 0, rT, 0, [0, '#e2d6ff', 0.6, PURPLE.l, 1, '#9a78e6']), PURPLE.k, 2.5);
    var inner = function () { oval(c, 0, yT + 0.5, rT - 6, (rT - 6) * k2); };
    inner(); paint(c, PURPLE.d, null);
    c.save(); inner(); c.clip();                                                    // dog biscuits
    var bits = [-26, 4, -12, 8, 2, 3, 16, 8, 28, 4, -18, 12, -4, 13, 10, 14, 24, 12, -32, 10, 34, 10];
    for (i = 0; i < bits.length; i += 2) { oval(c, bits[i], yT + bits[i + 1], 8, 5.5); paint(c, i % 4 ? '#c98a52' : '#b0703c', '#6b3a1e', 1.3); }
    c.restore();
    inner(); paint(c, null, PURPLE.k, 1.8);
  } };

  PICS.carrot = { w: 118, h: 78, d: 4, soft: true, draw: function (c) {
    c.save(); c.translate(-54, -4); c.rotate(-0.46);                                 // it lies pointing down-left
    leaf(c, 84, 0, 34, 8, PI / 2 - 0.55, GREEN); leaf(c, 84, 0, 34, 8, PI / 2 + 0.5, GREEN); leaf(c, 84, 0, 40, 9, PI / 2 - 0.02, { l: '#8fdc8a', m: '#3f9e58', d: '#1f7350', k: GREEN.k });
    var body = function () {
      c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(20, -7, 60, -14, 80, -13);
      c.bezierCurveTo(91, -12, 91, 12, 80, 13); c.bezierCurveTo(60, 13, 20, 5, 0, 0); c.closePath();
    };
    body(); c.fillStyle = gradAt(c, 40, -14, 46, 13, [0, ORANGE.l, 0.35, '#ff8f3d', 0.8, '#e2622a', 1, ORANGE.b]); c.fill();
    c.strokeStyle = rgba(ORANGE.k, 0.5); c.lineWidth = 1.5; c.lineCap = 'round';
    var rings = [22, -4, 3, 36, 3, 8, 50, -9, -3, 62, 2, 9, 72, -11, -5];
    for (var i = 0; i < rings.length; i += 3) { c.beginPath(); c.moveTo(rings[i], rings[i + 1]); c.lineTo(rings[i] + 1.5, rings[i + 2]); c.stroke(); }
    body(); paint(c, null, ORANGE.k, 2.5);
    line(c, [30, -6.5, 70, -9.5], 'rgba(255,255,255,0.5)', 2);
    c.restore();
  } };

  PICS.cupcake = { w: 84, h: 104, d: 4, soft: true, draw: function (c) {
    var i;
    // Paper case, pleated.
    wall(c, 0, -44, 31, -9.6, 24, true); paint(c, side(c, -31, 31, YELLOW), YELLOW.k, 2.5);
    c.strokeStyle = rgba(YELLOW.k, 0.4); c.lineWidth = 1.5; c.lineCap = 'round';
    for (i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 9, -40 + (9 - i * i) * 1.2); c.lineTo(i * 7, -5 + (9 - i * i) * 0.8); c.stroke(); }
    // Three swirls of icing and a cherry on top.
    var blob = function (y, rx, ry) { oval(c, 0, y, rx, ry); paint(c, ball(c, 0, y, rx, PINK), PINK.k, 2.5); };
    blob(-50, 35, 15); blob(-65, 26, 13); blob(-78, 16, 10);
    c.beginPath(); c.moveTo(-28, -53); c.quadraticCurveTo(-6, -43, 24, -51); paint(c, null, 'rgba(255,255,255,0.55)', 2.2);
    c.beginPath(); c.moveTo(-19, -68); c.quadraticCurveTo(-3, -60, 16, -66); paint(c, null, 'rgba(255,255,255,0.55)', 2);
    var bits = [-20, -48, 0.5, BLUE.m, 6, -47, -0.6, '#ffffff', 21, -55, 0.9, YELLOW.m, -9, -62, -0.3, YELLOW.m, 12, -70, 0.4, BLUE.m, -24, -58, 1.2, '#ffffff'];
    for (i = 0; i < bits.length; i += 4) { c.save(); c.translate(bits[i], bits[i + 1]); c.rotate(bits[i + 2]); rr(c, -3.2, -1.3, 6.4, 2.6, 1.3); paint(c, bits[i + 3], null); c.restore(); }
    c.beginPath(); c.moveTo(1, -92); c.quadraticCurveTo(3, -100, 10, -101); paint(c, null, '#4a2a12', 2.2);
    oval(c, 0, -88, 8.5, 8); paint(c, ball(c, 0, -88, 8.5, RED), RED.k, 2.2);
    gleam(c, -3, -91, 1.6, 2.6, 0.5, 0.8);
  } };

  // A pot of kitchen tools: whisk, spatula and wooden spoon.
  PICS.utensils = { w: 96, h: 152, d: 4, soft: true, draw: function (c) {
    var R = 31, yT = -68, rB = 29, yB = -rB * K, i;
    oval(c, 0, yT, R, R * K); paint(c, '#8f8ac0', WHITE.k, 2.5);                     // the dark inside of the pot
    // Spatula.
    line(c, [5, -62, 12, -120], DARK.k, 7); line(c, [5, -62, 12, -120], DARK.l, 3.5);
    c.save(); c.translate(13, -128); c.rotate(0.1);
    rr(c, -11.5, -20, 23, 29, 5); paint(c, gradAt(c, -11, -20, 11, 9, [0, RED.l, 0.4, RED.m, 1, RED.d]), RED.k, 2.5);
    c.strokeStyle = RED.k; c.lineWidth = 2; c.lineCap = 'round';
    for (i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 5.5, -13); c.lineTo(i * 5.5, 1); c.stroke(); }
    c.restore();
    // Wooden spoon.
    line(c, [14, -62, 30, -112], WOOD.k, 9); line(c, [14, -62, 30, -112], WOOD.m, 5);
    oval(c, 33, -124, 10, 14, 0.3); paint(c, gradAt(c, 23, -138, 43, -110, [0, WOOD.l, 0.5, WOOD.m, 1, WOOD.d]), WOOD.k, 2.5);
    oval(c, 32, -124, 6, 9.5, 0.3); paint(c, 'rgba(154,92,58,0.45)', null);
    // Whisk: a steel handle and a balloon of wires.
    line(c, [-9, -62, -19, -100], STEEL_K, 9); line(c, [-9, -62, -19, -100], '#c5d2e4', 5); line(c, [-11, -66, -20, -99], '#ffffff', 1.5);
    for (i = 0; i < 3; i++) {
      oval(c, -24.6, -122, [12, 7.5, 2.5][i], 23, -0.24);
      c.strokeStyle = STEEL_K; c.lineWidth = 3; c.stroke(); c.strokeStyle = '#dbe5f2'; c.lineWidth = 1.3; c.stroke();
    }
    // The pot itself, in front of the tools, with two blue stripes.
    var front = function () { wall(c, 0, yT, R, yB, rB, false); };
    front(); paint(c, side(c, -R, R, WHITE), null);
    c.save(); front(); c.clip();
    c.strokeStyle = BLUE.m; c.lineWidth = 4.5; frontArc(c, 0, -56, R); c.stroke();
    c.strokeStyle = BLUE.l; c.lineWidth = 2.2; frontArc(c, 0, -48, R); c.stroke();
    c.restore();
    front(); paint(c, null, WHITE.k, 2.5);
    gleam(c, -21, -36, 2.6, 12, 0.03, 0.8);
  } };

  PICS.colander = { w: 156, h: 96, d: 4, soft: true, draw: function (c) {
    var k2 = 0.36, R = 62, yT = -66, i, j;
    var LEM = { l: '#fffbc0', m: '#ffe14a', d: '#e3a81a', b: '#fff0a0', k: '#9a6a06' };
    // Handles.
    rr(c, -76, -68, 20, 11, 5.5); paint(c, GREEN.m, GREEN.k, 2.5); rr(c, 56, -68, 20, 11, 5.5); paint(c, GREEN.d, GREEN.k, 2.5);
    // The inside, with lemons heaped in it.
    oval(c, 0, yT, R, R * k2); paint(c, gradAt(c, -R, 0, R, 0, [0, '#2b8250', 1, '#1d5a37']), GREEN.k, 2.5);
    var lemons = [-26, -72, 18, 0.2, 6, -78, 19, -0.15, 34, -71, 17, 0.3];
    for (i = 0; i < lemons.length; i += 4) {
      oval(c, lemons[i], lemons[i + 1], lemons[i + 2], lemons[i + 2] * 0.74, lemons[i + 3]);
      paint(c, ball(c, lemons[i], lemons[i + 1], lemons[i + 2], LEM), LEM.k, 2.2);
      gleam(c, lemons[i] - 7, lemons[i + 1] - 5, 3.2, 2, -0.4, 0.6);
    }
    // The foot it stands on, then the bowl facing you.
    wall(c, 0, -19, 27, -11.5, 31, true, k2); paint(c, side(c, -31, 31, { l: GREEN.m, m: GREEN.d, d: GREEN.k, b: GREEN.d }), GREEN.k, 2.5);
    var front = function () {
      c.beginPath(); c.moveTo(-R, yT); c.bezierCurveTo(-R + 2, -36, -40, -20, -27, -19);
      c.ellipse(0, -19, 27, 27 * k2, 0, PI, 0, true);
      c.bezierCurveTo(40, -20, R - 2, -36, R, yT); c.ellipse(0, yT, R, R * k2, 0, 0, PI, false); c.closePath();
    };
    front(); c.fillStyle = side(c, -R, R, GREEN); c.fill();
    // The draining holes, in rows that curve round the bowl.
    c.fillStyle = rgba(GREEN.k, 0.8);
    for (j = 0; j < 3; j++) {
      var n = [3, 3, 2][j], yy = [-36, -27, -19][j];
      for (i = -n; i <= n; i++) {
        var px = i * 13, py = yy - 8 + Math.sqrt(Math.max(0, 1 - (px / (R + 6)) * (px / (R + 6)))) * 8;
        oval(c, px, py, 3, 2.3); c.fill();
      }
    }
    rimLight(c, front, 0, -40, R, -14, GREEN.b, 8);
    front(); paint(c, null, GREEN.k, 2.5);
    gleam(c, -44, -38, 3.5, 10, 0.35, 0.5);
  } };

  PICS.pear = { w: 82, h: 108, d: 4, soft: true, draw: function (c) {
    var PEAR = { l: '#eef7a6', m: '#b4d94e', d: '#63a53c', b: '#d2ea86', k: '#3f6d1e' };
    var body = function () {
      c.beginPath(); c.moveTo(0, -88);
      c.bezierCurveTo(12, -88, 16, -74, 18, -62); c.bezierCurveTo(22, -48, 38, -40, 38, -22);
      c.bezierCurveTo(38, -6, 20, -1, 0, -1); c.bezierCurveTo(-20, -1, -38, -6, -38, -22);
      c.bezierCurveTo(-38, -40, -22, -48, -18, -62); c.bezierCurveTo(-16, -74, -12, -88, 0, -88); c.closePath();
    };
    body(); c.fillStyle = ball(c, 0, -36, 46, PEAR); c.fill();
    c.save(); body(); c.clip();                                                    // a rosy patch where the sun caught it
    oval(c, 22, -30, 20, 24); paint(c, radial(c, 22, -30, 2, 22, ['rgba(255,120,90,0.4)', 'rgba(255,120,90,0)']), null);
    c.restore();
    rimLight(c, body, 0, -30, 34, -2, PEAR.b, 9);
    body(); paint(c, null, PEAR.k, 2.5);
    oval(c, 0, -87, 6, 2.2); paint(c, rgba(PEAR.k, 0.45), null);
    c.beginPath(); c.moveTo(0, -86); c.quadraticCurveTo(0, -97, 6, -103); paint(c, null, '#4a2a12', 5.5); paint(c, null, '#8a5a2b', 2.6);
    leaf(c, 3, -95, 24, 8, 1.2, GREEN);
    c.fillStyle = rgba(PEAR.k, 0.28);
    var dots = [-10, -14, 6, -20, -20, -28, 12, -40, -6, -44, 2, -62, -8, -70, 22, -14];
    for (var i = 0; i < dots.length; i += 2) { oval(c, dots[i], dots[i + 1], 1.1, 1.1); c.fill(); }
    gleam(c, -17, -36, 5, 10, 0.35, 0.6); gleam(c, -7, -72, 2.6, 6, 0.2, 0.5);
  } };

  // ── stamping ─────────────────────────────────────────────────────────
  var cache = {}, cacheRes = 0;
  // Returns the ready-drawn picture `name` at `res` pixels per unit.
  function sprite(name, res) {
    if (res !== cacheRes) { cache = {}; cacheRes = res; }
    var s = cache[name];
    if (s) return s;
    var p = PICS[name], pad = 5;
    var cv = document.createElement('canvas');
    // Rounded up to a multiple of 8 pixels, so the picture can be halved
    // cleanly three times for the smaller copies below.
    cv.width = Math.ceil((p.w + pad * 2) * res / 8) * 8;
    cv.height = Math.ceil((p.h + p.d + pad * 2) * res / 8) * 8;
    var c = cv.getContext('2d');
    c.scale(res, res);
    c.translate(p.w / 2 + pad, p.h + pad);
    p.draw(c);
    if (p.soft) {                                            // clutter: sit back a little (see above)
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = 'rgba(246,231,200,0.2)'; c.fillRect(0, 0, cv.width, cv.height);
    }
    s = cache[name] = { img: cv, ox: p.w / 2 + pad, oy: p.h + pad, w: cv.width / res, h: cv.height / res, res: res, small: [] };
    return s;
  }
  // A far-away thing is drawn much smaller than its picture. Squeezing a big
  // picture down a long way in one go makes it sparkle and crawl as it
  // moves, so we keep half, quarter and eighth-size copies (each made by
  // halving the one before, which stays smooth) and stamp from the copy
  // nearest the size needed. Copies are only made when first wanted.
  var SMALLEST = 3;
  function smaller(sp, n) {
    var im = sp.small[n - 1];
    if (im) return im;
    var from = n === 1 ? sp.img : smaller(sp, n - 1);
    im = document.createElement('canvas');
    im.width = from.width / 2; im.height = from.height / 2;
    im.getContext('2d').drawImage(from, 0, 0, im.width, im.height);
    sp.small[n - 1] = im;
    return im;
  }
  // Stamp `name` with its floor point at (x, y), `s` pixels per unit.
  function stamp(c, name, x, y, s, res, flipX) {
    var sp = sprite(name, res), img = sp.img;
    // How many real screen pixels one unit will cover, counting whatever
    // scaling the canvas already has (sharp screens, the ending zoom).
    var m = c.getTransform ? c.getTransform() : null;
    var px = s * (m ? Math.sqrt(m.a * m.a + m.b * m.b) : (root.devicePixelRatio || 1));
    var n = 0;
    while (n < SMALLEST && px * 2 <= res) { px *= 2; n++; }
    if (n) img = smaller(sp, n);
    if (flipX) {
      c.save(); c.translate(x, y); c.scale(-1, 1);
      c.drawImage(img, -sp.ox * s, -sp.oy * s, sp.w * s, sp.h * s);
      c.restore();
    } else {
      c.drawImage(img, x - sp.ox * s, y - sp.oy * s, sp.w * s, sp.h * s);
    }
  }

  // ── the dog (drawn fresh every frame because it moves) ───────────────
  // Drawn for a dog on the RIGHT of the track, so its head faces left
  // toward the egg. o.t = time in ms, o.phase = idle | windup | snap,
  // o.f = how far through that phase (0..1), o.happy = it just ate.
  //
  // Everything that moves is driven by o.t and o.f only, so a paused game
  // shows a still dog. It is drawn with plain shapes and just two colour
  // blends, because this runs every frame.
  //
  // One trick keeps it quick: an outlined oval or box is painted as TWO
  // fills, a slightly bigger one in the outline colour and then the thing
  // itself on top. It looks just like "fill, then draw the outline", but
  // browsers draw a thin curved outline several times slower than a fill.
  function ovalOn(c, x, y, rx, ry, rot, fill, k, lw) {
    var e = lw / 2;
    oval(c, x, y, rx + e, ry + e, rot); paint(c, k, null);
    oval(c, x, y, rx - e, ry - e, rot); paint(c, fill, null);
  }
  function boxOn(c, x, y, w, h, r, fill, k, lw) {
    var e = lw / 2;
    rr(c, x - e, y - e, w + lw, h + lw, r + e); paint(c, k, null);
    rr(c, x + e, y + e, w - lw, h - lw, r - e); paint(c, fill, null);
  }
  var FUR = '#dc9449', FUR_L = '#f6bf7c', FUR_D = '#b0622f', FUR_K = '#6b3413';
  var MUZZLE = '#fde8c4', MUZZLE_D = '#eec796', EAR = '#9c5527';
  function drawDog(c, o) {
    var t = o.t || 0, ph = o.phase, f = o.f || 0, happy = !!o.happy, i;
    var W = ph === 'windup' ? f : 0;                                    // how far through the wind-up
    // In the snap render.js carries the dog out across the lanes and back;
    // `go` rises and falls in step with that, so the pose stretches to match.
    var go = ph === 'snap' ? Math.sin(Math.min(1, f * 1.25) * PI) : 0;
    var trot = happy ? 0 : ph === 'windup' ? Math.max(0, 1 - W * 5) : ph === 'snap' ? 0 : 1;
    var planted = 1 - trot;
    var run = t * 0.022;
    var bob = Math.abs(Math.sin(run)) * 4 * trot;
    var shake = W > 0 ? Math.sin(t * 0.09) * (1 + 2.5 * W) : 0;         // trembling with excitement
    var by = W * 9 - bob - go * 12;                                     // crouch down, bob, lift in the leap
    var sx = 1 + go * 0.16 + W * 0.03, sy = 1 - go * 0.12 - W * 0.05;   // squash in the crouch, stretch in the leap
    var lean = -0.14 * W, cl = Math.cos(lean), sl = Math.sin(lean);     // chest down, tail end up: ready to pounce
    var fur = gradAt(c, -14, -96, 30, -28, [0, FUR_L, 0.45, FUR, 1, FUR_D]);

    // Draw something that rides on the body (it squashes and leans with it)…
    function body(fn) {
      c.save(); c.translate(6 + shake * 0.4, -60 + by); c.rotate(lean); c.scale(sx, sy); c.translate(-6, 60); fn(); c.restore();
    }
    // …and work out where one point of the body has got to.
    function at(x, y) {
      var dx = (x - 6) * sx, dy = (y + 60) * sy;
      return [6 + shake * 0.4 + dx * cl - dy * sl, -60 + by + dx * sl + dy * cl];
    }
    // A straight limb `w` wide from (x0, y0) to (x1, y1), added to the path
    // as a plain four-cornered strip, with a rounded far end if asked. The
    // square end is always tucked under something (the body, the head).
    // (Both pieces go round the same way, so they join up without a gap.)
    function strip(x0, y0, x1, y1, w, round) {
      var dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / len * w / 2, ny = dx / len * w / 2;
      c.moveTo(x0 - nx, y0 - ny); c.lineTo(x1 - nx, y1 - ny); c.lineTo(x1 + nx, y1 + ny); c.lineTo(x0 + nx, y0 + ny); c.closePath();
      if (round) { c.moveTo(x1 + w / 2, y1); c.arc(x1, y1, w / 2, 0, TAU); }
    }
    // A front leg and a back leg, painted together. hxF and hxB are where
    // they join the body; stepF and stepB keep the pair out of step.
    function legs(hxF, stepF, hxB, stepB, color, paw) {
      var L = [], feet = [], n, hx, a, hip, fx, fy, front;
      for (n = 0; n < 2; n++) {
        front = n === 0; hx = front ? hxF : hxB; a = run + (front ? stepF : stepB); hip = at(hx, -48);
        fx = hx + Math.sin(a) * 12 * trot + planted * (front ? -5 - 6 * W : 5 + 3 * W);
        fy = -Math.max(0, Math.cos(a)) * 8 * trot;
        if (go > 0) { fx += (front ? -32 : 28) * go; fy -= (front ? 20 : 5) * go; }   // reaching forward, pushing off behind
        L.push(hip[0], hip[1], fx, fy - 8.5);
        feet.push(fx - 3, fy - 7.4);
      }
      c.beginPath(); strip(L[0], L[1], L[2], L[3], 16, true); strip(L[4], L[5], L[6], L[7], 16, true); paint(c, FUR_K, null);
      c.beginPath(); strip(L[0], L[1], L[2], L[3], 10.5, true); strip(L[4], L[5], L[6], L[7], 10.5, true); paint(c, color, null);
      c.beginPath(); ovalMore(c, feet[0], feet[1], 11.25, 7.25); ovalMore(c, feet[2], feet[3], 11.25, 7.25); paint(c, FUR_K, null);
      c.beginPath(); ovalMore(c, feet[0], feet[1], 8.75, 4.75); ovalMore(c, feet[2], feet[3], 8.75, 4.75); paint(c, paw, null);
    }

    // Tail: wags when trotting, stands stiff in the wind-up, streams behind in the leap.
    var tailA = happy ? -0.25 + Math.sin(t * 0.045) * 0.45
              : ph === 'windup' ? -0.3 + 0.2 * (1 - W) + Math.sin(t * 0.09) * 0.1
              : ph === 'snap' ? -0.3 + go * 1.4
              : -0.3 + Math.sin(t * 0.03) * 0.5;
    body(function () {
      c.save(); c.translate(51, -74); c.rotate(tailA);
      c.beginPath(); c.moveTo(0, 4); c.quadraticCurveTo(11, -15, 4, -35); paint(c, null, FUR_K, 14); paint(c, null, FUR, 8.5);
      c.beginPath(); c.moveTo(6.3, -27); c.quadraticCurveTo(6, -31, 4, -35); paint(c, null, MUZZLE, 8.5);
      c.restore();
    });
    // The two legs on the far side are darker, so they sit back.
    legs(-25, 0, 35, PI, '#a55a2a', MUZZLE_D);

    // Where the head is: pulled back in the wind-up, thrust out in the snap.
    var hx = shake + 12 * W - 23 * go;
    var hy = by * 0.9 - 5 * W + 3 * go - (trot ? Math.sin(run * 2 + 1) * 1.2 : 0);
    var tilt = 0.28 * W - 0.1 * go + (happy ? 0.1 : 0);                 // nose up as it rears back
    // Neck, so the head never comes away from the body when it lunges.
    var nk = at(-20, -68);
    c.beginPath(); strip(nk[0], nk[1], -44 + hx, -92 + hy, 46); paint(c, FUR_K, null);
    c.beginPath(); strip(nk[0], nk[1], -44 + hx, -92 + hy, 40); paint(c, FUR, null);

    body(function () {
      var shape = function () {
        c.beginPath(); c.moveTo(-42, -62);
        c.bezierCurveTo(-44, -92, -8, -96, 14, -92); c.bezierCurveTo(44, -88, 62, -76, 58, -54);
        c.bezierCurveTo(56, -34, 30, -28, 6, -30); c.bezierCurveTo(-20, -30, -40, -38, -42, -62); c.closePath();
      };
      shape(); c.fillStyle = fur; c.fill();
      c.beginPath(); c.moveTo(-37, -47); c.bezierCurveTo(-32, -36, -18, -30.5, 6, -30.5);   // pale tummy, hugging the underside
      c.quadraticCurveTo(24, -29.5, 36, -32.5); c.quadraticCurveTo(8, -43, -37, -47); paint(c, MUZZLE, null);
      oval(c, 24, -79.5, 17, 9.5, -0.2); paint(c, EAR, null);           // a darker patch on its back
      shape(); paint(c, null, FUR_K, 3);
    });
    legs(-10, PI, 47, 0, '#cb7f3d', MUZZLE);
    // Shoulder and haunch: they cover the tops of the near legs, so the
    // legs grow out of the body instead of looking stuck on.
    body(function () {
      c.beginPath(); ovalMore(c, 43, -53, 14, 17, 0.15); ovalMore(c, -11, -53, 11.5, 14, -0.1); paint(c, fur, null);
      c.beginPath(); c.ellipse(43, -53, 14, 17, 0.15, PI * 0.62, PI * 1.5);
      c.moveTo(-17.2, -41.5); c.ellipse(-11, -53, 11.5, 14, -0.1, PI * 0.72, PI * 1.45);
      paint(c, null, 'rgba(107,52,19,0.55)', 2.4);
    });

    // Collar and name tag.
    c.save(); c.translate(-33 + hx * 0.5, -66 + (by + hy) * 0.5); c.rotate(0.6 + tilt * 0.5);
    boxOn(c, -6.5, -15, 13, 30, 6.5, RED.m, RED.k, 2.5);
    ovalOn(c, -1, 19, 5.8, 5.8, 0, YELLOW.m, YELLOW.k, 2);
    c.restore();

    // The head, turning about the top of the neck.
    c.save(); c.translate(-40 + hx, -84 + hy); c.rotate(tilt); c.translate(40, 84);
    var earA = Math.sin(run) * 0.12 * trot - 0.9 * W - 1.35 * go + (happy ? Math.sin(t * 0.02) * 0.08 : 0);
    // Far ear.
    c.save(); c.translate(-61, -119); c.rotate(-0.55 + earA * 0.6);
    ovalOn(c, 0, 8, 8, 14, 0, '#7d3f1c', FUR_K, 2.5); c.restore();
    // The mouth. Idle: open a little, panting. Wind-up: dropping wide. Snap: shut.
    var jaw = happy ? 0.16 : ph === 'windup' ? 0.24 + 0.72 * W : ph === 'snap' ? 0 : 0.22 + 0.06 * Math.sin(t * 0.012);
    var HX = -56, HY = -82;
    if (jaw > 0.03) {
      c.beginPath(); c.moveTo(HX + 4, HY); c.lineTo(-103, HY);
      c.lineTo(HX - 46 * Math.cos(jaw) - 2 * Math.sin(jaw), HY + 46 * Math.sin(jaw) - 2 * Math.cos(jaw)); c.closePath();
      paint(c, '#8f1d38', jaw > 0.3 ? FUR_K : null, 2.5);
      if (jaw > 0.3) {                                                  // small, rounded top teeth
        c.beginPath(); rrMore(c, -101, HY - 3, 7, 11, 3); rrMore(c, -91, HY - 3, 7, 10, 3); paint(c, '#ffffff', '#b9a48c', 1.2);
      }
    }
    c.save(); c.translate(HX, HY); c.rotate(-jaw);
    if (jaw > 0.3) {
      c.beginPath(); rrMore(c, -42, -9.5, 6.5, 9, 2.8); rrMore(c, -33, -9, 6.5, 8, 2.8); paint(c, '#ffffff', '#b9a48c', 1.2);
      ovalOn(c, -22, -5, 17, 6, 0, '#ff7b93', '#c9405f', 1.5);          // tongue inside the open mouth
    }
    boxOn(c, -46, -4, 50, 13, 6.5, MUZZLE_D, FUR_K, 2.5);
    if (!W && ph !== 'snap') {                                          // tongue lolling out
      var lol = happy ? 3 * Math.sin(t * 0.02) : 2 * Math.sin(t * 0.012);
      c.save(); c.translate(-33, -1); c.rotate(jaw + (happy ? 0.25 : 0));
      boxOn(c, -8, 0, 16, 21 + lol, 8, '#ff7b93', '#c9405f', 2.2);
      line(c, [0, 4, 0, 13 + lol], '#e0506f', 1.5);
      c.restore();
    }
    c.restore();
    // Skull, then the pale muzzle and the nose.
    ovalOn(c, -48, -99, 30, 29, 0, gradAt(c, -70, -126, -30, -72, [0, FUR_L, 0.5, FUR, 1, FUR_D]), FUR_K, 3);
    oval(c, -43, -91, 6.5, 4.2); paint(c, 'rgba(255,120,130,0.4)', null);       // rosy cheek
    boxOn(c, -108, -105, 62, 25, 12.5, MUZZLE, FUR_K, 3);
    rr(c, -98, -102, 34, 5, 2.5); paint(c, 'rgba(255,255,255,0.7)', null);
    c.beginPath(); c.moveTo(-61, -80.5); c.quadraticCurveTo(-50, -81, -48, -90); paint(c, null, FUR_K, 2.5);   // smile
    oval(c, -107, -98, 9.5, 8); paint(c, INK, null);
    gleam(c, -110, -101.5, 3, 1.9, -0.4, 0.7);
    c.beginPath(); ovalMore(c, -88, -89, 1.3, 1.3); ovalMore(c, -81, -86, 1.3, 1.3); ovalMore(c, -89, -84, 1.3, 1.3); paint(c, EAR, null);
    // Eyes: bright and round; squeezed shut in the snap; happy arcs after eating.
    if (happy) {
      c.beginPath(); c.arc(-55, -108, 7, PI * 1.12, PI * 1.88); paint(c, null, INK, 3);
      c.beginPath(); c.arc(-71, -108, 5, PI * 1.12, PI * 1.88); paint(c, null, INK, 3);
    } else if (ph === 'snap') {
      line(c, [-49, -115, -61, -109.5, -49, -104], INK, 3); line(c, [-66, -114, -75, -109.5, -66, -105], INK, 3);
    } else {
      var wide = 1 + 0.12 * W;
      c.beginPath(); ovalMore(c, -71.5, -110, 5.5 * wide + 1.15, 7 * wide + 1.15); ovalMore(c, -55, -110, 8 * wide + 1.15, 9.5 * wide + 1.15); paint(c, INK, null);
      c.beginPath(); ovalMore(c, -71.5, -110, 5.5 * wide - 1.15, 7 * wide - 1.15); ovalMore(c, -55, -110, 8 * wide - 1.15, 9.5 * wide - 1.15); paint(c, '#ffffff', null);
      c.beginPath(); ovalMore(c, -73.5, -109.5, 2.9, 3.4); ovalMore(c, -58, -109.5, 4.2, 4.8); paint(c, INK, null);
      c.beginPath(); ovalMore(c, -59.5, -111.5, 1.6, 1.6); ovalMore(c, -74.5, -111, 1.1, 1.1); paint(c, '#ffffff', null);
    }
    if (W > 0 || ph === 'snap') {                                       // eyebrows come down: it means business
      line(c, [-66, -119, -47, -126], INK, 3.5); line(c, [-80, -119, -68, -124], INK, 3.5);
    }
    // Near ear: flops when trotting, flies up in the wind-up and back in the leap.
    c.save(); c.translate(-31, -119); c.rotate(-0.2 + earA);
    c.beginPath(); c.moveTo(-9, -2); c.bezierCurveTo(-17, 16, -11, 42, 1, 42); c.bezierCurveTo(13, 42, 17, 16, 9, -2);
    c.quadraticCurveTo(0, -8, -9, -2); c.closePath(); paint(c, EAR, FUR_K, 3);
    line(c, [-5, 6, -6, 28], 'rgba(255,200,150,0.4)', 2.5);
    c.restore();
    // Wind-up: red "watch out" ticks throb above its head. They have a white
    // edge so they show on the floor and on the track alike.
    if (W > 0.12) {
      var throb = 0.8 + 0.2 * Math.sin(t * 0.05);
      c.beginPath();
      c.moveTo(-90, -124); c.lineTo(-90 - 10 * throb, -124 - 9 * throb);
      c.moveTo(-76, -131); c.lineTo(-76 - 4 * throb, -131 - 12 * throb);
      c.moveTo(-60, -134); c.lineTo(-60 + 2 * throb, -134 - 12 * throb);
      paint(c, null, '#ffffff', 8); paint(c, null, RED.m, 4.5);
    }
    // Snap: impact lines burst from the shut jaws, and fade as it springs back.
    if (ph === 'snap') {
      c.globalAlpha = Math.max(0, Math.min(1, 1.6 * (1 - f)));
      c.beginPath();
      for (i = -2; i <= 2; i++) {
        var an = PI + i * 0.42, r0 = 12, r1 = i % 2 ? 20 : 26;
        c.moveTo(-112 + Math.cos(an) * r0, -88 + Math.sin(an) * r0); c.lineTo(-112 + Math.cos(an) * r1, -88 + Math.sin(an) * r1);
      }
      paint(c, null, '#f08c00', 9); paint(c, null, '#fff6c2', 4.5);
      c.globalAlpha = 1;
    }
    c.restore();
  }

  var api = {
    INK: INK, rr: rr, poly: poly, oval: oval, paint: paint, grad: grad, radial: radial, shine: shine,
    eggPath: eggPath, star: star, label: label, PICS: PICS, sprite: sprite, stamp: stamp, drawDog: drawDog,
    // Small clutter for right beside the track, and bigger things for
    // farther out. render.js picks from these lists by name; a name listed
    // twice simply turns up more often.
    SCENERY_NEAR: ['apple', 'pear', 'can', 'jar', 'mug', 'cheese', 'bowl', 'carrot', 'cupcake'],
    SCENERY_FAR: ['sack', 'pot', 'crate', 'plant', 'bottle', 'colander', 'utensils', 'sack', 'crate', 'plant', 'jar', 'pear']
  };
  root.ER = root.ER || {};
  root.ER.art = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
