/*
 * Egg Runner 2 — the pictures.
 *
 * Every picture in the game is drawn here with canvas shapes; there are no
 * image files. Pictures are drawn in the game's units with (0, 0) at the
 * point where the thing touches the floor, x to the right and y DOWN (so
 * "up" is negative y).
 *
 * Things that never change shape (obstacles, eggs, scenery) are drawn once
 * into a small off-screen canvas and then stamped at whatever size the
 * distance calls for. That is what keeps phones fast.
 */
(function (root) {
  'use strict';

  var INK = '#3a2618';          // outline colour for everything
  var TAU = Math.PI * 2;

  // ── drawing helpers ──────────────────────────────────────────────────
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
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

  // ── the pictures ─────────────────────────────────────────────────────
  // Each entry: w = width, h = height above the floor, d = room below the
  // floor line, and draw(c).
  var PICS = {};

  // Tall obstacles ·······················································
  PICS.toaster = { w: 108, h: 96, d: 4, draw: function (c) {
    rr(c, -31, -92, 25, 34, 5); paint(c, '#e9b96b', '#a8742f', 3);       // toast
    rr(c, 6, -86, 25, 30, 5); paint(c, '#e9b96b', '#a8742f', 3);
    rr(c, -40, -8, 16, 8, 3); paint(c, '#4a4f57'); rr(c, 24, -8, 16, 8, 3); paint(c, '#4a4f57');
    rr(c, -46, -72, 92, 66, 16); paint(c, grad(c, 0, -72, 0, -6, ['#f7f9fb', '#d5dbe2', '#aab3bd']));
    rr(c, -35, -75, 32, 9, 4); paint(c, '#3f444b', null); rr(c, 3, -75, 32, 9, 4); paint(c, '#3f444b', null);
    shine(c, -38, -62, 9, 40);
    rr(c, 40, -52, 12, 20, 4); paint(c, '#e5484d');                      // lever
    oval(c, 22, -22, 7, 7); paint(c, '#4a4f57', INK, 2.5);
  } };

  PICS.blender = { w: 96, h: 134, d: 4, draw: function (c) {
    c.beginPath(); c.moveTo(27, -100); c.quadraticCurveTo(52, -80, 26, -58);   // handle
    paint(c, null, INK, 12); paint(c, null, '#d7ecf7', 6);
    poly(c, [-22, -38, 22, -38, 30, -112, -30, -112]); paint(c, 'rgba(206,236,250,0.92)');
    c.save(); poly(c, [-22, -38, 22, -38, 30, -112, -30, -112]); c.clip();
    c.fillStyle = '#ff7fa7'; c.fillRect(-32, -84, 64, 50);
    c.fillStyle = '#ffa9c4'; c.fillRect(-32, -88, 64, 6); c.restore();
    poly(c, [-22, -38, 22, -38, 30, -112, -30, -112]); paint(c, null);
    shine(c, -20, -104, 7, 44);
    rr(c, -33, -122, 66, 13, 5); paint(c, '#3f444b'); rr(c, -9, -131, 18, 11, 4); paint(c, '#3f444b');
    poly(c, [-31, 0, 31, 0, 25, -38, -25, -38]); paint(c, grad(c, 0, -38, 0, 0, ['#f0626a', '#c5303b']));
    oval(c, 0, -19, 7.5, 7.5); paint(c, '#fff5f5', INK, 2.5);
  } };

  PICS.carton = { w: 80, h: 136, d: 4, draw: function (c) {
    rr(c, -31, -100, 62, 100, 4); paint(c, grad(c, -31, 0, 31, 0, ['#ffffff', '#f3f7fb', '#d6e0ec']));
    poly(c, [-31, -100, 31, -100, 22, -122, -22, -122]); paint(c, '#e3ebf5');
    rr(c, -23, -133, 46, 12, 3); paint(c, '#ffffff');
    c.save(); rr(c, -31, -100, 62, 100, 4); c.clip();
    c.fillStyle = '#2f7ff0'; c.fillRect(-32, -78, 64, 38);
    c.fillStyle = '#3a2618';
    oval(c, -20, -12, 12, 9, 0.3); c.fill(); oval(c, 16, -22, 9, 7, -0.4); c.fill(); oval(c, 26, -2, 9, 6); c.fill();
    c.restore();
    label(c, 'MILK', 0, -58, 21, '#ffffff');
    rr(c, -31, -100, 62, 100, 4); paint(c, null);
  } };

  // Flat obstacles ·······················································
  PICS.knife = { w: 116, h: 30, d: 4, draw: function (c) {
    c.beginPath(); c.moveTo(-54, -7); c.lineTo(6, -24); c.lineTo(14, -24); c.lineTo(14, -3);
    c.lineTo(-42, -3); c.quadraticCurveTo(-52, -3, -54, -7); c.closePath();
    paint(c, grad(c, 0, -24, 0, -3, ['#ffffff', '#cfd6de', '#96a1ad']));
    c.beginPath(); c.moveTo(-46, -6); c.lineTo(10, -6); paint(c, null, 'rgba(255,255,255,0.9)', 2);
    rr(c, 12, -26, 42, 23, 8); paint(c, grad(c, 0, -26, 0, -3, ['#4b3a33', '#2a201c']));
    oval(c, 24, -14.5, 3, 3); paint(c, '#d9dee4', null); oval(c, 41, -14.5, 3, 3); paint(c, '#d9dee4', null);
  } };

  PICS.butter = { w: 110, h: 44, d: 4, draw: function (c) {
    rr(c, -52, -10, 104, 10, 5); paint(c, grad(c, 0, -10, 0, 0, ['#ffffff', '#c9d9ee']));
    rr(c, -36, -40, 72, 32, 7); paint(c, grad(c, 0, -40, 0, -8, ['#fff3a0', '#ffd53d', '#f0b414']));
    rr(c, -30, -36, 60, 7, 3.5); paint(c, 'rgba(255,255,255,0.65)', null);
    c.beginPath(); c.moveTo(14, -40); c.lineTo(14, -8); paint(c, null, '#d79a10', 2);
  } };

  // Eggs ··································································
  function wholeEgg(c, cy, rx, ry, stops, line) {
    eggPath(c, 0, cy, rx, ry);
    paint(c, radial(c, -rx * 0.35, cy - ry * 0.4, 2, ry * 1.5, stops), line, 3);
    oval(c, -rx * 0.38, cy - ry * 0.42, rx * 0.2, ry * 0.24, -0.5); paint(c, 'rgba(255,255,255,0.95)', null);
  }
  PICS.egg = { w: 52, h: 62, d: 4, draw: function (c) {
    wholeEgg(c, -29, 21, 27, ['#ffffff', '#fffaf0', '#e9dcc4'], INK);
  } };
  PICS.golden = { w: 96, h: 86, d: 14, draw: function (c) {
    oval(c, 0, -30, 46, 46); paint(c, radial(c, 0, -30, 14, 46, ['rgba(255,221,87,0.75)', 'rgba(255,221,87,0)']), null);
    wholeEgg(c, -30, 23, 29, ['#fffbd1', '#ffd43b', '#e39a00'], '#8a5200');
    c.fillStyle = '#ffffff'; star(c, 17, -54, 9, 4); c.fill(); star(c, -21, -12, 6, 4); c.fill();
  } };
  // A spare: a little egg with a face, like a duckling.
  PICS.spare = { w: 32, h: 38, d: 4, draw: function (c) {
    c.fillStyle = INK; rr(c, -9, -4, 7.5, 5, 2.5); c.fill(); rr(c, 1.5, -4, 7.5, 5, 2.5); c.fill();
    eggPath(c, 0, -19, 12, 15.5);
    paint(c, radial(c, -4, -25, 1, 23, ['#ffffff', '#fffaf0', '#e9dcc4']), INK, 2.5);
    c.fillStyle = INK; oval(c, -4.3, -20, 1.9, 2.3); c.fill(); oval(c, 4.3, -20, 1.9, 2.3); c.fill();
    c.beginPath(); c.arc(0, -17, 2.8, 0.15 * Math.PI, 0.85 * Math.PI); paint(c, null, INK, 1.5);
  } };

  // Chopping knives ······················································
  PICS.frame = { w: 520, h: 424, d: 6, draw: function (c) {
    var wood = grad(c, 0, -420, 0, 0, ['#c98f55', '#a86f3a']);
    rr(c, -238, -400, 24, 400, 5); paint(c, wood); rr(c, 214, -400, 24, 400, 5); paint(c, wood);
    rr(c, -252, -420, 504, 30, 8); paint(c, grad(c, 0, -420, 0, -390, ['#dba466', '#b0763f']));
    c.fillStyle = '#6d4420';
    for (var x = -226; x <= 226; x += 452) { oval(c, x, -405, 4, 4); c.fill(); }
    rr(c, -250, -8, 48, 10, 4); paint(c, '#8b5a2b'); rr(c, 202, -8, 48, 10, 4); paint(c, '#8b5a2b');
  } };
  // The blade's bottom edge is at y = 0.
  PICS.cleaver = { w: 96, h: 168, d: 4, draw: function (c) {
    rr(c, -9, -164, 18, 62, 7); paint(c, grad(c, -9, 0, 9, 0, ['#5a4338', '#2a201c']));
    oval(c, 0, -146, 2.6, 2.6); paint(c, '#d9dee4', null); oval(c, 0, -122, 2.6, 2.6); paint(c, '#d9dee4', null);
    c.beginPath(); c.moveTo(-40, -106); c.lineTo(36, -106); c.quadraticCurveTo(42, -106, 42, -100);
    c.lineTo(42, -8); c.quadraticCurveTo(0, 6, -40, -8); c.closePath();
    paint(c, grad(c, -40, 0, 42, 0, ['#f9fbfc', '#d3dae1', '#a2adb9']));
    oval(c, 26, -90, 6, 6); paint(c, '#fff8ea', INK, 2.5);
    c.beginPath(); c.moveTo(-36, -14); c.quadraticCurveTo(0, -2, 38, -14); paint(c, null, 'rgba(255,255,255,0.95)', 3);
    shine(c, -30, -96, 8, 56);
  } };

  // Paw print (drawn flat on the floor by the renderer) ·················
  PICS.paw = { w: 60, h: 60, d: 0, draw: function (c) {
    c.fillStyle = 'rgba(95,60,30,0.75)';
    oval(c, 0, -18, 15, 13); c.fill();
    oval(c, -18, -34, 6.5, 8, -0.4); c.fill(); oval(c, -6.5, -44, 6.5, 8.5, -0.1); c.fill();
    oval(c, 6.5, -44, 6.5, 8.5, 0.1); c.fill(); oval(c, 18, -34, 6.5, 8, 0.4); c.fill();
  } };

  // Kitchen clutter beside the track ····································
  PICS.apple = { w: 100, h: 104, d: 4, draw: function (c) {
    c.beginPath(); c.moveTo(2, -82); c.quadraticCurveTo(4, -96, 12, -100); paint(c, null, '#5b3a1e', 5);
    oval(c, 22, -94, 13, 6, -0.5); paint(c, '#59b34a', INK, 2.5);
    c.beginPath(); c.moveTo(0, -80); c.bezierCurveTo(40, -100, 56, -40, 30, -8);
    c.bezierCurveTo(16, 4, 6, -4, 0, -4); c.bezierCurveTo(-6, -4, -16, 4, -30, -8);
    c.bezierCurveTo(-56, -40, -40, -100, 0, -80); c.closePath();
    paint(c, radial(c, -14, -60, 4, 70, ['#ff8a80', '#e53935', '#b71c1c']));
    oval(c, -20, -58, 7, 13, 0.4); paint(c, 'rgba(255,255,255,0.55)', null);
  } };
  PICS.can = { w: 84, h: 104, d: 4, draw: function (c) {
    rr(c, -36, -98, 72, 98, 8); paint(c, grad(c, -36, 0, 36, 0, ['#e6ebf0', '#f9fbfc', '#aeb8c2']));
    c.save(); rr(c, -36, -98, 72, 98, 8); c.clip();
    c.fillStyle = '#e8503a'; c.fillRect(-40, -80, 80, 58);
    c.fillStyle = '#ffd54a'; oval(c, 0, -51, 22, 18); c.fill(); c.restore();
    label(c, 'SOUP', 0, -50, 15, '#8a2b1c');
    rr(c, -36, -98, 72, 98, 8); paint(c, null);
  } };
  PICS.jar = { w: 84, h: 112, d: 4, draw: function (c) {
    rr(c, -34, -92, 68, 92, 14); paint(c, 'rgba(214,238,250,0.9)');
    c.save(); rr(c, -34, -92, 68, 92, 14); c.clip(); c.fillStyle = '#b3414f'; c.fillRect(-36, -70, 72, 72); c.restore();
    rr(c, -34, -92, 68, 92, 14); paint(c, null);
    rr(c, -22, -56, 44, 30, 4); paint(c, '#fff8e7', INK, 2); label(c, 'JAM', 0, -40, 14, '#b3414f');
    rr(c, -30, -108, 60, 18, 5); paint(c, '#f2c14e'); shine(c, -26, -84, 7, 30);
  } };
  PICS.bottle = { w: 64, h: 172, d: 4, draw: function (c) {
    c.beginPath(); c.moveTo(-24, 0); c.lineTo(-24, -92); c.quadraticCurveTo(-24, -116, -9, -128);
    c.lineTo(-9, -156); c.lineTo(9, -156); c.lineTo(9, -128); c.quadraticCurveTo(24, -116, 24, -92); c.lineTo(24, 0); c.closePath();
    paint(c, grad(c, -24, 0, 24, 0, ['#7ccf8a', '#3f9c56', '#27703b']));
    rr(c, -24, -76, 48, 40, 3); paint(c, '#fff8e7', INK, 2); label(c, 'OIL', 0, -55, 15, '#27703b');
    rr(c, -11, -168, 22, 14, 4); paint(c, '#f2c14e'); shine(c, -17, -112, 6, 30);
  } };
  PICS.sack = { w: 132, h: 136, d: 4, draw: function (c) {
    c.beginPath(); c.moveTo(-50, 0); c.bezierCurveTo(-66, -40, -56, -90, -34, -106);
    c.lineTo(-44, -130); c.lineTo(44, -130); c.lineTo(34, -106);
    c.bezierCurveTo(56, -90, 66, -40, 50, 0); c.closePath();
    paint(c, grad(c, -60, 0, 60, 0, ['#fbf1dc', '#f1e2c2', '#d6c19a']));
    c.beginPath(); c.moveTo(-36, -106); c.lineTo(36, -106); paint(c, null, '#b08d57', 5);
    label(c, 'FLOUR', 0, -54, 22, '#9a6b3a');
  } };
  PICS.pot = { w: 168, h: 112, d: 4, draw: function (c) {
    rr(c, -80, -70, 26, 14, 6); paint(c, '#3f444b'); rr(c, 54, -70, 26, 14, 6); paint(c, '#3f444b');
    rr(c, -58, -84, 116, 84, 14); paint(c, grad(c, -58, 0, 58, 0, ['#ff9a62', '#f26b3a', '#b9431f']));
    rr(c, -64, -94, 128, 16, 7); paint(c, '#cfd6de');
    rr(c, -12, -108, 24, 16, 6); paint(c, '#3f444b'); shine(c, -46, -70, 10, 44);
  } };
  PICS.mug = { w: 112, h: 88, d: 4, draw: function (c) {
    c.beginPath(); c.arc(36, -40, 20, -1.2, 1.2); paint(c, null, INK, 16); paint(c, null, '#5aa9e6', 9);
    rr(c, -40, -80, 76, 80, 10); paint(c, grad(c, -40, 0, 36, 0, ['#8cc8f5', '#5aa9e6', '#3a82c4']));
    c.fillStyle = '#ffffff'; star(c, -2, -40, 15, 5); c.fill(); shine(c, -32, -68, 8, 40);
  } };
  PICS.cheese = { w: 128, h: 76, d: 4, draw: function (c) {
    poly(c, [-56, 0, 56, 0, 56, -40, -56, -70]); paint(c, grad(c, 0, -70, 0, 0, ['#ffe082', '#ffc93c']));
    c.fillStyle = '#e8a91c';
    oval(c, -26, -30, 10, 9); c.fill(); oval(c, 14, -18, 8, 7); c.fill(); oval(c, 38, -30, 5, 5); c.fill(); oval(c, -40, -10, 5, 4); c.fill();
    poly(c, [-56, 0, 56, 0, 56, -40, -56, -70]); paint(c, null);
  } };
  PICS.crate = { w: 172, h: 124, d: 4, draw: function (c) {
    c.fillStyle = '#e8503a'; oval(c, -34, -108, 20, 18); c.fill(); oval(c, 6, -112, 20, 18); c.fill(); oval(c, 42, -106, 20, 18); c.fill();
    c.strokeStyle = INK; c.lineWidth = 3;
    oval(c, -34, -108, 20, 18); c.stroke(); oval(c, 6, -112, 20, 18); c.stroke(); oval(c, 42, -106, 20, 18); c.stroke();
    rr(c, -78, -100, 156, 100, 5); paint(c, '#c58a4c');
    for (var y = -100; y < 0; y += 34) { rr(c, -78, y, 156, 32, 4); paint(c, grad(c, 0, y, 0, y + 32, ['#e2ad6f', '#c58a4c']), INK, 2.5); }
    rr(c, -78, -100, 14, 100, 3); paint(c, '#a86f3a', INK, 2.5); rr(c, 64, -100, 14, 100, 3); paint(c, '#a86f3a', INK, 2.5);
  } };
  PICS.plant = { w: 148, h: 188, d: 4, draw: function (c) {
    var leaves = [[-34, -120, -0.7], [34, -120, 0.7], [-16, -146, -0.25], [18, -148, 0.3], [0, -160, 0], [-48, -92, -1.1], [48, -92, 1.1]];
    for (var i = 0; i < leaves.length; i++) {
      oval(c, leaves[i][0], leaves[i][1], 15, 34, leaves[i][2]);
      paint(c, i % 2 ? '#4caf50' : '#66c56a', INK, 2.5);
    }
    poly(c, [-40, -72, 40, -72, 30, 0, -30, 0]); paint(c, grad(c, -40, 0, 40, 0, ['#f08a5d', '#d86b3d', '#a84a22']));
    rr(c, -46, -84, 92, 18, 6); paint(c, '#e2794a');
  } };
  PICS.bowl = { w: 160, h: 64, d: 4, draw: function (c) {
    c.fillStyle = '#8a5a2b'; oval(c, 0, -46, 54, 12); c.fill();
    poly(c, [-74, 0, 74, 0, 58, -48, -58, -48]); paint(c, grad(c, -74, 0, 74, 0, ['#7fb7ee', '#4a8fd8', '#2f6fb5']));
    oval(c, 0, -48, 58, 11); paint(c, '#9a6a3a');
    label(c, 'DOG', 0, -22, 22, '#ffffff');
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
    cv.width = Math.ceil((p.w + pad * 2) * res);
    cv.height = Math.ceil((p.h + p.d + pad * 2) * res);
    var c = cv.getContext('2d');
    c.scale(res, res);
    c.translate(p.w / 2 + pad, p.h + pad);
    p.draw(c);
    s = cache[name] = { img: cv, ox: p.w / 2 + pad, oy: p.h + pad, w: p.w + pad * 2, h: p.h + p.d + pad * 2, res: res };
    return s;
  }
  // Stamp `name` with its floor point at (x, y), `s` pixels per unit.
  function stamp(c, name, x, y, s, res, flipX) {
    var sp = sprite(name, res);
    if (flipX) {
      c.save(); c.translate(x, y); c.scale(-1, 1);
      c.drawImage(sp.img, -sp.ox * s, -sp.oy * s, sp.w * s, sp.h * s);
      c.restore();
    } else {
      c.drawImage(sp.img, x - sp.ox * s, y - sp.oy * s, sp.w * s, sp.h * s);
    }
  }

  // ── the dog (drawn fresh every frame because it moves) ───────────────
  // Drawn for a dog on the RIGHT of the track, so its head faces left
  // toward the egg. o.t = time in ms, o.phase = idle | windup | snap,
  // o.f = how far through that phase (0..1), o.happy = it just ate.
  function drawDog(c, o) {
    var t = o.t, run = t * 0.022;
    var shake = o.phase === 'windup' ? Math.sin(t * 0.09) * 3 : 0;
    var lunge = o.phase === 'snap' ? -34 * Math.sin(Math.min(1, o.f * 1.6) * Math.PI * 0.5) * (1 - o.f * 0.5)
              : o.phase === 'windup' ? 14 * o.f : 0;
    var jaw = o.phase === 'windup' ? 0.15 + 0.55 * o.f : o.phase === 'snap' ? 0.02 : 0.16 + 0.05 * Math.sin(t * 0.012);
    var bob = Math.abs(Math.sin(run)) * 5;
    var BROWN = '#c98a4b', DARK = '#8a5a2b', LIGHT = '#e8c391';

    // Tail.
    c.save(); c.translate(52, -74 - bob); c.rotate(-0.5 + Math.sin(t * 0.03) * 0.5);
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(14, -18, 8, -40); paint(c, null, INK, 15); paint(c, null, BROWN, 9);
    c.restore();
    // Far legs, then body, then near legs.
    var legs = [[-24, 0], [40, Math.PI], [-6, Math.PI], [24, 0]];
    for (var i = 0; i < 4; i++) {
      if (i === 2) {
        oval(c, 10, -58 - bob, 50, 34); paint(c, grad(c, 0, -92, 0, -24, [BROWN, BROWN, DARK]));
        oval(c, 30, -70 - bob, 16, 12, -0.3); paint(c, DARK, null);
      }
      var sw = Math.sin(run + legs[i][1]) * 11, lift = Math.max(0, Math.cos(run + legs[i][1])) * 8;
      c.beginPath(); c.moveTo(legs[i][0], -34 - bob); c.lineTo(legs[i][0] + sw, -6 - lift);
      paint(c, null, INK, 17); paint(c, null, i < 2 ? DARK : BROWN, 11);
      oval(c, legs[i][0] + sw - 3, -5 - lift, 10, 6); paint(c, i < 2 ? DARK : LIGHT, INK, 2.5);
    }
    // Collar and head.
    c.save(); c.translate(lunge + shake, -bob * 0.6);
    rr(c, -40, -74, 30, 13, 6); paint(c, '#e5484d'); oval(c, -27, -58, 6, 6); paint(c, '#ffd43b', INK, 2);
    // Lower jaw (opens on the wind-up).
    c.save(); c.translate(-48, -78); c.rotate(-jaw);
    rr(c, -44, 0, 48, 13, 6); paint(c, LIGHT);
    c.fillStyle = '#ffffff'; poly(c, [-36, 0, -31, -7, -26, 0]); c.fill(); poly(c, [-22, 0, -17, -7, -12, 0]); c.fill();
    if (o.phase === 'idle' && !o.happy) { rr(c, -30, 4, 16, 20, 8); paint(c, '#ff7b93', INK, 2.5); }
    c.restore();
    // Skull and snout.
    oval(c, -40, -98, 32, 29); paint(c, BROWN);
    rr(c, -96, -100, 54, 26, 12); paint(c, LIGHT);
    c.fillStyle = '#ffffff'; poly(c, [-84, -75, -79, -66, -74, -75]); c.fill(); poly(c, [-68, -75, -63, -66, -58, -75]); c.fill();
    oval(c, -93, -93, 9, 8); paint(c, '#2a1a10', null);
    // Ear.
    c.save(); c.translate(-22, -116); c.rotate(0.5 + Math.sin(run) * 0.15);
    oval(c, 0, 16, 13, 24); paint(c, DARK); c.restore();
    // Eye.
    if (o.happy) {
      c.beginPath(); c.arc(-52, -104, 6, Math.PI * 1.1, Math.PI * 1.9); paint(c, null, INK, 3);
    } else {
      oval(c, -52, -104, 7.5, 8.5); paint(c, '#ffffff', INK, 2.5);
      oval(c, -55, -103, 3.6, 4.2); paint(c, '#2a1a10', null);
      if (o.phase !== 'idle') { c.beginPath(); c.moveTo(-66, -112); c.lineTo(-44, -120); paint(c, null, INK, 4); }
    }
    if (o.phase === 'snap') {                       // chomp lines
      c.strokeStyle = '#ffffff'; c.lineWidth = 5; c.lineCap = 'round';
      for (var k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(-108, -84 + k * 16); c.lineTo(-126, -84 + k * 26); c.stroke(); }
    }
    c.restore();
  }

  var api = {
    INK: INK, rr: rr, poly: poly, oval: oval, paint: paint, grad: grad, radial: radial, shine: shine,
    eggPath: eggPath, star: star, label: label, PICS: PICS, sprite: sprite, stamp: stamp, drawDog: drawDog,
    SCENERY_NEAR: ['apple', 'can', 'jar', 'mug', 'cheese', 'bottle', 'bowl'],
    SCENERY_FAR: ['sack', 'pot', 'crate', 'plant', 'bottle', 'jar', 'sack', 'crate', 'apple']
  };
  root.ER = root.ER || {};
  root.ER.art = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
