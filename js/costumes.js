/*
 * Egg Runner 2 — the egg and its costumes.
 *
 * The egg is drawn fresh every frame (it runs, jumps, worries and cracks).
 * Its face always points at the player: it is a decoration stuck on the egg,
 * so it never needs to match the direction of the run.
 *
 * A costume is a full makeover made of up to three layers:
 *   back(c)   drawn behind the egg (capes, wings, tails)
 *   wear(c)   painted onto the shell itself (clothes, masks)
 *   front(c)  drawn over everything (hats, beards, props)
 * plus a few options: shell colours, eyes, mouth, shoes.
 *
 * To add a costume, add one entry to LIST. Nothing else needs to change.
 *
 * Units and axes match art.js: (0, 0) is the floor under the egg, y is DOWN.
 * The shell spans x -30..30 and y -85..-7. Eyes sit at y -54, mouth at -42.
 */
(function (root) {
  'use strict';

  var A = (typeof module !== 'undefined' && module.exports) ? require('./art.js') : root.ER.art;
  var rr = A.rr, poly = A.poly, oval = A.oval, paint = A.paint, grad = A.grad, star = A.star, INK = A.INK;
  var CY = -46, RX = 30, RY = 39;
  var SHELL = ['#ffffff', '#fffaf0', '#e6d8bf'];

  function shellPath(c) { A.eggPath(c, 0, CY, RX, RY); }
  function dots(c, pts, r, color) {
    c.fillStyle = color;
    for (var i = 0; i < pts.length; i += 2) { oval(c, pts[i], pts[i + 1], r, r); c.fill(); }
  }
  function line(c, pts, color, w) {
    c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    paint(c, null, color, w);
  }

  var LIST = [
    { id: 'plain', name: 'Plain Egg' },

    { id: 'chef', name: 'Chef',
      wear: function (c) {
        c.fillStyle = '#ffffff'; c.fillRect(-34, -34, 68, 30);
        line(c, [-34, -34, 34, -34], '#cfd6de', 2);
        dots(c, [-7, -26, 7, -26, -7, -15, 7, -15], 2.6, '#8a94a0');
        poly(c, [-13, -36, 13, -36, 0, -24]); paint(c, '#e5484d', INK, 2);
      },
      front: function (c) {
        oval(c, -15, -104, 13, 13); paint(c, '#ffffff'); oval(c, 15, -104, 13, 13); paint(c, '#ffffff');
        oval(c, 0, -111, 16, 15); paint(c, '#ffffff');
        rr(c, -21, -97, 42, 16, 4); paint(c, '#ffffff');
        c.beginPath(); c.moveTo(0, -47); c.quadraticCurveTo(-10, -41, -19, -49);
        c.moveTo(0, -47); c.quadraticCurveTo(10, -41, 19, -49); paint(c, null, '#4b2e1a', 5);
      } },

    { id: 'cowboy', name: 'Cowboy',
      wear: function (c) {
        c.fillStyle = '#8b5a2b'; c.fillRect(-34, -36, 21, 34); c.fillRect(13, -36, 21, 34);
        poly(c, [-22, -38, 22, -38, 0, -20]); paint(c, '#e5484d', INK, 2);
        dots(c, [-9, -34, 0, -31, 9, -34, 0, -25], 1.8, '#ffffff');
        c.fillStyle = '#ffd43b'; star(c, -21, -22, 7, 5); c.fill();
      },
      front: function (c) {
        oval(c, 0, -82, 46, 10); paint(c, grad(c, 0, -92, 0, -72, ['#a9713a', '#7a4d22']));
        c.beginPath(); c.moveTo(-22, -84); c.quadraticCurveTo(-24, -112, -8, -110);
        c.quadraticCurveTo(0, -104, 8, -110); c.quadraticCurveTo(24, -112, 22, -84); c.closePath();
        paint(c, '#9a6531');
        line(c, [-22, -88, 22, -88], '#3a2618', 5);
      } },

    { id: 'wizard', name: 'Wizard',
      wear: function (c) {
        c.fillStyle = '#6d3fc4'; c.fillRect(-34, -34, 68, 32);
        c.fillStyle = '#ffd43b'; c.fillRect(-34, -22, 68, 5);
        star(c, -18, -10, 4, 5); c.fill(); star(c, 19, -28, 4, 5); c.fill();
      },
      front: function (c) {
        c.beginPath(); c.moveTo(-23, -46); c.quadraticCurveTo(-26, -24, -12, -18);
        c.quadraticCurveTo(-6, -4, 0, 4); c.quadraticCurveTo(6, -4, 12, -18);
        c.quadraticCurveTo(26, -24, 23, -46); c.quadraticCurveTo(0, -34, -23, -46); c.closePath();
        paint(c, '#f4f4f6');
        poly(c, [-27, -80, 27, -80, 8, -136]); paint(c, grad(c, -27, 0, 27, 0, ['#8253d8', '#5a2fae']));
        oval(c, 0, -80, 38, 8); paint(c, '#6d3fc4');
        c.fillStyle = '#ffd43b'; star(c, -4, -98, 6, 5); c.fill(); star(c, 9, -116, 4, 5); c.fill();
      } },

    { id: 'ninja', name: 'Ninja', eyes: 'white', mouth: 'none', limbs: '#1f2430',
      wear: function (c) {
        c.fillStyle = '#1f2430'; c.fillRect(-34, -90, 68, 90);
        rr(c, -25, -66, 50, 23, 11); paint(c, '#fff3df', null);
        c.fillStyle = '#e5484d'; c.fillRect(-34, -26, 68, 6);
      },
      front: function (c) {
        poly(c, [27, -72, 50, -84, 46, -70]); paint(c, '#e5484d', INK, 2.5);
        poly(c, [27, -70, 52, -62, 44, -56]); paint(c, '#e5484d', INK, 2.5);
        c.beginPath(); c.moveTo(-28, -68); c.quadraticCurveTo(0, -78, 28, -68);
        paint(c, null, INK, 10); paint(c, null, '#e5484d', 6);
      } },

    { id: 'pirate', name: 'Pirate', eyes: 'patch',
      wear: function (c) {
        for (var y = -36; y < 0; y += 8) { c.fillStyle = (y / 8) % 2 ? '#ffffff' : '#e5484d'; c.fillRect(-34, y, 68, 8); }
        c.fillStyle = '#2a201c'; c.fillRect(-34, -20, 68, 7);
        rr(c, -6, -22, 12, 11, 2); paint(c, '#ffd43b', INK, 2);
        c.fillStyle = '#e5484d'; c.fillRect(-34, -90, 68, 22);
        dots(c, [-14, -76, 0, -80, 14, -76, -6, -72, 8, -71], 2, '#ffffff');
        line(c, [-30, -68, 30, -68], INK, 2.5);
      },
      front: function (c) {
        line(c, [-27, -70, 27, -52], '#1c1512', 3);
        oval(c, -11, -55, 9, 8); paint(c, '#1c1512', null);
        poly(c, [28, -72, 46, -78, 44, -62]); paint(c, '#e5484d', INK, 2.5);
        oval(c, 30, -40, 4.5, 4.5); paint(c, null, '#ffd43b', 3);
      } },

    { id: 'astronaut', name: 'Astronaut',
      back: function (c) { rr(c, -37, -72, 74, 60, 12); paint(c, '#c3cbd6'); },
      wear: function (c) {
        c.fillStyle = '#eef2f6'; c.fillRect(-34, -32, 68, 30);
        c.fillStyle = '#ff8a3d'; c.fillRect(-34, -34, 68, 5);
        rr(c, -14, -25, 28, 15, 3); paint(c, '#3f4a5a', INK, 2);
        dots(c, [-7, -17.5], 3, '#e5484d'); dots(c, [1, -17.5], 3, '#59b34a'); dots(c, [9, -17.5], 3, '#ffd43b');
      },
      front: function (c) {
        oval(c, 0, -57, 37, 36); paint(c, 'rgba(160,212,255,0.26)', '#dfe5ec', 6);
        oval(c, 0, -57, 40, 39); paint(c, null, INK, 2.5);
        c.beginPath(); c.arc(0, -57, 29, Math.PI * 1.1, Math.PI * 1.45); paint(c, null, 'rgba(255,255,255,0.9)', 4);
      } },

    { id: 'hero', name: 'Superhero', eyes: 'white',
      back: function (c, t) {
        var w = Math.sin(t * 0.012) * 4;
        c.beginPath(); c.moveTo(-22, -64); c.lineTo(22, -64);
        c.quadraticCurveTo(46 + w, -34, 44 + w, -2); c.quadraticCurveTo(22, -10, 0, -2 + w * 0.5);
        c.quadraticCurveTo(-22, -10, -44 + w, -2); c.quadraticCurveTo(-46 + w, -34, -22, -64); c.closePath();
        paint(c, grad(c, 0, -64, 0, 0, ['#f0525a', '#c5303b']));
      },
      wear: function (c) {
        c.fillStyle = '#2563eb'; c.fillRect(-34, -40, 68, 40);
        c.fillStyle = '#e5484d'; c.fillRect(-34, -14, 68, 14);
        c.fillStyle = '#ffd43b'; c.fillRect(-34, -17, 68, 5);
        oval(c, 0, -29, 10, 9); paint(c, '#ffd43b', INK, 2);
        c.fillStyle = '#e5484d'; star(c, 0, -29, 6.5, 5); c.fill();
        rr(c, -27, -65, 54, 21, 10); paint(c, '#e5484d', INK, 2);
      } },

    { id: 'king', name: 'King',
      back: function (c) {
        c.beginPath(); c.moveTo(-24, -62); c.lineTo(24, -62); c.quadraticCurveTo(48, -30, 46, -2);
        c.lineTo(-46, -2); c.quadraticCurveTo(-48, -30, -24, -62); c.closePath();
        paint(c, grad(c, 0, -62, 0, 0, ['#c5303b', '#8f1d2a']));
        rr(c, -48, -10, 96, 10, 5); paint(c, '#ffffff'); dots(c, [-34, -5, -12, -5, 12, -5, 34, -5], 2.2, '#2a201c');
      },
      wear: function (c) {
        c.fillStyle = '#7b3fc4'; c.fillRect(-34, -30, 68, 30);
        c.fillStyle = '#ffffff'; c.fillRect(-34, -36, 68, 11);
        dots(c, [-22, -30, -8, -31, 8, -31, 22, -30], 2, '#2a201c');
        line(c, [-34, -25, 34, -25], INK, 2);
        oval(c, 0, -13, 6, 6); paint(c, '#ffd43b', INK, 2);
      },
      front: function (c) {
        poly(c, [-23, -80, -27, -108, -12, -94, 0, -114, 12, -94, 27, -108, 23, -80]);
        paint(c, grad(c, 0, -114, 0, -80, ['#ffe680', '#f5b800']));
        dots(c, [-27, -108, 0, -114, 27, -108], 4, '#e5484d');
        dots(c, [-11, -86, 11, -86], 3, '#2f7ff0'); dots(c, [0, -88], 3.4, '#59b34a');
      } },

    { id: 'clown', name: 'Clown',
      wear: function (c) {
        c.fillStyle = '#ffd43b'; c.fillRect(-34, -32, 68, 32);
        dots(c, [-18, -20, 2, -24, 20, -16], 4.5, '#e5484d'); dots(c, [-8, -10, 12, -6, -24, -6], 4.5, '#2f7ff0');
      },
      front: function (c) {
        var wig = ['#e5484d', '#ff8a3d', '#ffd43b', '#59b34a', '#2f7ff0', '#8253d8'];
        var pts = [-33, -56, -34, -72, -24, -84, 24, -84, 34, -72, 33, -56];
        for (var i = 0; i < 6; i++) { oval(c, pts[i * 2], pts[i * 2 + 1], 11, 11); paint(c, wig[i], INK, 2.5); }
        for (var x = -24; x <= 24; x += 12) { oval(c, x, -33, 7, 6); paint(c, x % 24 ? '#ffffff' : '#7fd1ff', INK, 2); }
        oval(c, 0, -48, 6.5, 6.5); paint(c, '#e5484d', INK, 2); oval(c, -2, -50, 2, 2); paint(c, '#ffffff', null);
        poly(c, [-10, -84, 12, -86, 4, -110]); paint(c, '#2f7ff0'); oval(c, 4, -111, 5, 5); paint(c, '#ffd43b', INK, 2);
      } },

    { id: 'robot', name: 'Robot', eyes: 'robot', mouth: 'grille',
      shell: ['#f3f6f9', '#cfd6de', '#8f9aa6'], limbs: '#5b6672',
      wear: function (c) {
        rr(c, -17, -32, 34, 22, 4); paint(c, '#2f3945', INK, 2);
        dots(c, [-9, -25], 3, '#e5484d'); dots(c, [0, -25], 3, '#ffd43b'); dots(c, [9, -25], 3, '#59b34a');
        c.fillStyle = '#7fd1ff'; c.fillRect(-12, -18, 24, 4);
        dots(c, [-24, -60, 24, -60, -24, -30, 24, -30], 2, '#6b7682');
      },
      front: function (c) {
        line(c, [0, -85, 0, -103], INK, 4); oval(c, 0, -107, 6, 6); paint(c, '#e5484d', INK, 2.5);
        rr(c, -38, -62, 9, 16, 3); paint(c, '#8f9aa6', INK, 2.5); rr(c, 29, -62, 9, 16, 3); paint(c, '#8f9aa6', INK, 2.5);
      } },

    { id: 'dino', name: 'Dinosaur', limbs: '#2f8f46',
      back: function (c) { poly(c, [16, -30, 62, -10, 16, -4]); paint(c, '#4caf50'); poly(c, [34, -22, 42, -30, 46, -17]); paint(c, '#ff8a3d', INK, 2); },
      wear: function (c) {
        c.fillStyle = '#4caf50'; c.fillRect(-34, -90, 68, 90);
        oval(c, 0, -50, 23, 21); paint(c, '#fff3df', INK, 2);
        oval(c, 0, -14, 17, 12); paint(c, '#c9ecae', null);
      },
      front: function (c) {
        for (var x = -18; x <= 18; x += 12) { poly(c, [x - 5, -69, x, -62, x + 5, -69]); paint(c, '#ffffff', INK, 1.6); }
        poly(c, [-12, -84, -6, -100, 0, -86]); paint(c, '#ff8a3d', INK, 2.5);
        poly(c, [0, -86, 6, -102, 12, -84]); paint(c, '#ff8a3d', INK, 2.5);
        oval(c, -16, -78, 5, 6); paint(c, '#ffffff', INK, 2); oval(c, 16, -78, 5, 6); paint(c, '#ffffff', INK, 2);
        dots(c, [-16, -77, 16, -77], 2.2, INK);
      } },

    { id: 'bee', name: 'Bumblebee', shell: ['#fff3a0', '#ffd43b', '#e0a800'],
      back: function (c, t) {
        var f = Math.sin(t * 0.05) * 0.18;
        oval(c, -34, -68, 24, 13, 0.5 + f); paint(c, 'rgba(214,240,255,0.85)', INK, 2.5);
        oval(c, 34, -68, 24, 13, -0.5 - f); paint(c, 'rgba(214,240,255,0.85)', INK, 2.5);
      },
      wear: function (c) {
        c.fillStyle = '#2a201c'; c.fillRect(-34, -36, 68, 9); c.fillRect(-34, -19, 68, 9); c.fillRect(-34, -88, 68, 9);
      },
      front: function (c) {
        c.beginPath(); c.moveTo(-8, -84); c.quadraticCurveTo(-10, -100, -19, -104);
        c.moveTo(8, -84); c.quadraticCurveTo(10, -100, 19, -104); paint(c, null, INK, 3.5);
        dots(c, [-20, -105, 20, -105], 5, INK);
      } },

    { id: 'viking', name: 'Viking',
      wear: function (c) {
        c.fillStyle = '#8b5a2b'; c.fillRect(-34, -34, 68, 34);
        c.fillStyle = '#5b3a1e'; c.fillRect(-34, -20, 68, 6);
        rr(c, -6, -23, 12, 12, 3); paint(c, '#cfd6de', INK, 2);
      },
      front: function (c) {
        c.beginPath(); c.moveTo(-21, -47); c.quadraticCurveTo(-24, -26, -12, -20); c.lineTo(-13, -4);
        c.lineTo(-5, -16); c.lineTo(5, -16); c.lineTo(13, -4); c.lineTo(12, -20);
        c.quadraticCurveTo(24, -26, 21, -47); c.quadraticCurveTo(0, -36, -21, -47); c.closePath();
        paint(c, '#f0862b');
        dots(c, [-13, -4, 13, -4], 3.4, '#ffd43b');
        c.beginPath(); c.moveTo(-26, -74); c.quadraticCurveTo(-46, -82, -44, -106); c.quadraticCurveTo(-32, -92, -20, -84); c.closePath(); paint(c, '#fff3df');
        c.beginPath(); c.moveTo(26, -74); c.quadraticCurveTo(46, -82, 44, -106); c.quadraticCurveTo(32, -92, 20, -84); c.closePath(); paint(c, '#fff3df');
        c.beginPath(); c.moveTo(-29, -68); c.quadraticCurveTo(-28, -98, 0, -98); c.quadraticCurveTo(28, -98, 29, -68); c.closePath();
        paint(c, grad(c, 0, -98, 0, -68, ['#e6ebf0', '#9aa5b1']));
        rr(c, -31, -74, 62, 9, 3); paint(c, '#f5b800'); rr(c, -4, -98, 8, 26, 3); paint(c, '#f5b800', INK, 2.5);
      } },

    { id: 'vampire', name: 'Vampire', mouth: 'fangs', shell: ['#f7f4ff', '#e9e4f5', '#c2bbd6'],
      back: function (c) {
        poly(c, [-22, -62, -44, -98, -34, -52]); paint(c, '#1f1a26'); poly(c, [22, -62, 44, -98, 34, -52]); paint(c, '#1f1a26');
        c.beginPath(); c.moveTo(-26, -60); c.lineTo(26, -60); c.lineTo(46, -2); c.lineTo(-46, -2); c.closePath(); paint(c, '#1f1a26');
        poly(c, [-20, -56, 20, -56, 36, -6, -36, -6]); paint(c, '#b3202f', null);
      },
      wear: function (c) {
        c.fillStyle = '#1f1a26';
        c.beginPath(); c.moveTo(-34, -92); c.lineTo(34, -92); c.lineTo(34, -64); c.quadraticCurveTo(14, -78, 0, -66);
        c.quadraticCurveTo(-14, -78, -34, -64); c.closePath(); c.fill();
        c.fillRect(-34, -34, 68, 34);
        poly(c, [-12, -34, 12, -34, 0, -8]); paint(c, '#ffffff', null);
        poly(c, [-11, -36, 0, -30, -11, -24]); paint(c, '#e5484d', INK, 2); poly(c, [11, -36, 0, -30, 11, -24]); paint(c, '#e5484d', INK, 2);
      } },

    { id: 'detective', name: 'Detective',
      wear: function (c) {
        c.fillStyle = '#c9a36b'; c.fillRect(-34, -36, 68, 36);
        poly(c, [-10, -38, 10, -38, 0, -22]); paint(c, '#fff3df', INK, 2);
        line(c, [-10, -38, -20, -24, -6, -20], INK, 2); line(c, [10, -38, 20, -24, 6, -20], INK, 2);
        c.fillStyle = '#8a6a3a'; c.fillRect(-34, -18, 68, 5);
        dots(c, [-8, -9, 8, -9], 2.4, '#5b3a1e');
      },
      front: function (c) {
        oval(c, 0, -80, 42, 9); paint(c, '#5d6875');
        c.beginPath(); c.moveTo(-23, -82); c.quadraticCurveTo(-22, -108, 0, -106); c.quadraticCurveTo(22, -108, 23, -82); c.closePath();
        paint(c, grad(c, 0, -108, 0, -82, ['#7f8b99', '#56616d']));
        line(c, [-23, -86, 23, -86], '#2a201c', 5);
        line(c, [36, -30, 46, -14], INK, 6); line(c, [36, -30, 46, -14], '#8b5a2b', 3);
        oval(c, 30, -40, 11, 11); paint(c, 'rgba(190,230,255,0.6)', INK, 3.5);
      } },

    { id: 'mummy', name: 'Mummy', eyes: 'glow', mouth: 'none', shell: ['#f6f0dd', '#e9e0c6', '#c7ba98'], limbs: '#b8ab88',
      wear: function (c) {
        var y;
        for (y = -84; y < 0; y += 11) line(c, [-34, y, 34, y + (y % 22 ? 5 : -4)], '#b3a583', 2);
        rr(c, -25, -65, 50, 20, 7); paint(c, '#3a3340', INK, 2);
      },
      front: function (c) {
        c.beginPath(); c.moveTo(28, -40); c.quadraticCurveTo(44, -36, 40, -22); c.quadraticCurveTo(48, -16, 44, -6);
        paint(c, null, INK, 9); paint(c, null, '#e9e0c6', 5);
      } }
  ];

  var BY_ID = {};
  for (var i = 0; i < LIST.length; i++) BY_ID[LIST[i].id] = LIST[i];

  // ── the face ─────────────────────────────────────────────────────────
  function face(c, cos, mood) {
    var eyes = cos.eyes || 'dot', mouth = cos.mouth || 'smile', worried = mood === 'worried';
    var ex = 11, ey = -54;
    if (mood === 'cracked') {
      c.strokeStyle = eyes === 'glow' ? '#ffd43b' : INK; c.lineWidth = 3; c.lineCap = 'round';
      for (var s = -1; s <= 1; s += 2) {
        c.beginPath(); c.moveTo(s * ex - 5, ey - 5); c.lineTo(s * ex + 5, ey + 5);
        c.moveTo(s * ex + 5, ey - 5); c.lineTo(s * ex - 5, ey + 5); c.stroke();
      }
      if (mouth !== 'none') { c.beginPath(); c.moveTo(-9, -40); c.quadraticCurveTo(-4, -45, 0, -40); c.quadraticCurveTo(4, -35, 9, -40); paint(c, null, INK, 3); }
      return;
    }
    for (var side = -1; side <= 1; side += 2) {
      var x = side * ex;
      if (eyes === 'patch' && side < 0) continue;
      if (eyes === 'white') {
        oval(c, x, ey, 6.5, worried ? 7.5 : 6); paint(c, '#ffffff', INK, 2); oval(c, x, ey + 0.5, 2.8, 3.2); paint(c, INK, null);
      } else if (eyes === 'robot') {
        rr(c, x - 6.5, ey - 6, 13, 12, 3); paint(c, '#2f3945', INK, 2); rr(c, x - 3.5, ey - 3, 7, 6, 1.5); paint(c, worried ? '#ff8a3d' : '#7fe7ff', null);
      } else if (eyes === 'glow') {
        oval(c, x, ey - 1, 5, worried ? 6 : 4.6); paint(c, '#ffd43b', null);
      } else {
        oval(c, x, ey, worried ? 5.6 : 4.8, worried ? 6.4 : 5.4); paint(c, INK, null);
        oval(c, x - 1.6, ey - 2, 1.5, 1.5); paint(c, '#ffffff', null);
      }
      if (worried) { c.beginPath(); c.moveTo(x - side * 7, ey - 14); c.lineTo(x + side * 6, ey - 10); paint(c, null, eyes === 'glow' ? '#ffd43b' : INK, 3); }
    }
    if (eyes === 'dot' || eyes === 'patch') {
      c.fillStyle = 'rgba(255,120,130,0.35)';
      oval(c, -20, -44, 5.5, 4); c.fill(); oval(c, 20, -44, 5.5, 4); c.fill();
    }
    if (mouth === 'none') return;
    if (mouth === 'grille') {
      rr(c, -10, -45, 20, 9, 2); paint(c, '#2f3945', INK, 2);
      c.strokeStyle = '#cfd6de'; c.lineWidth = 1.5;
      for (var gx = -5; gx <= 5; gx += 5) { c.beginPath(); c.moveTo(gx, -44); c.lineTo(gx, -37); c.stroke(); }
      return;
    }
    if (worried) {
      c.beginPath(); c.moveTo(-9, -39); c.quadraticCurveTo(-4.5, -44, 0, -39.5); c.quadraticCurveTo(4.5, -35, 9, -39.5); paint(c, null, INK, 3);
    } else {
      c.beginPath(); c.arc(0, -46, 10, 0.16 * Math.PI, 0.84 * Math.PI); paint(c, null, INK, 3);
    }
    if (mouth === 'fangs') {
      poly(c, [-7, -39, -4, -32, -1, -38]); paint(c, '#ffffff', INK, 1.5); poly(c, [1, -38, 4, -32, 7, -39]); paint(c, '#ffffff', INK, 1.5);
    }
  }

  // ── the whole egg ────────────────────────────────────────────────────
  // o.costume  costume id            o.mood   happy | worried | cracked
  // o.t        animation clock (ms)  o.air    0 on the floor … 1 at the top of a jump
  // o.still    true for menu pictures (no running)
  function drawEgg(c, o) {
    var cos = BY_ID[o.costume] || BY_ID.plain;
    var t = o.t || 0, air = o.air || 0, still = !!o.still, cracked = o.mood === 'cracked';
    var limb = cos.limbs || INK;
    var ph = t * 0.021;
    var bob = still || air > 0 || cracked ? 0 : Math.abs(Math.sin(ph)) * 3;

    if (cracked) {                       // a little puddle of yolk
      oval(c, 0, -2, 44, 9); paint(c, '#fffdf5', '#d9cdb5', 2);
      oval(c, 6, -3, 13, 5); paint(c, '#ffc93c', '#e39a00', 2);
    }
    // Legs.
    for (var s = -1; s <= 1; s += 2) {
      var hipX = s * 10, fx, fy;
      if (cracked) { fx = s * 20; fy = 0; }
      else if (air > 0) { fx = s * 14; fy = -8 - air * 4; }
      else if (still) { fx = s * 11; fy = 0; }
      else { fx = hipX + Math.sin(ph + (s > 0 ? Math.PI : 0)) * 9; fy = -Math.max(0, Math.cos(ph + (s > 0 ? Math.PI : 0))) * 8; }
      c.beginPath(); c.moveTo(hipX, -12 - bob); c.lineTo(fx, fy - 3); paint(c, null, limb, 4.5);
      oval(c, fx + s * 1.5, fy - 3, 7.5, 4.5); paint(c, cos.shoes || limb, limb, 1.5);
    }
    c.save();
    c.translate(0, -bob);
    if (cos.back) cos.back(c, t);
    // Arms.
    for (s = -1; s <= 1; s += 2) {
      var hx, hy;
      if (cracked) { hx = s * 42; hy = -30; }
      else if (air > 0) { hx = s * 41; hy = -58 - air * 8; }
      else if (still) { hx = s * 39; hy = -30; }
      else { hx = s * 39; hy = -36 + Math.sin(ph + (s > 0 ? 0 : Math.PI)) * 9; }
      c.beginPath(); c.moveTo(s * 27, -42); c.lineTo(hx, hy); paint(c, null, limb, 4.5);
      oval(c, hx, hy, 3.6, 3.6); paint(c, limb, null);
    }
    // Shell.
    var sh = cos.shell || SHELL;
    shellPath(c);
    paint(c, A.radial(c, -11, -62, 4, 56, sh), null);
    if (cos.wear) { c.save(); shellPath(c); c.clip(); cos.wear(c, t); c.restore(); }
    oval(c, -13, -68, 5.5, 9, 0.5); paint(c, 'rgba(255,255,255,0.7)', null);
    shellPath(c); paint(c, null, INK, 3);
    face(c, cos, o.mood);
    if (cracked) {
      c.beginPath(); c.moveTo(-6, -85); c.lineTo(2, -72); c.lineTo(-7, -64); c.lineTo(4, -56);
      c.moveTo(22, -30); c.lineTo(12, -22); c.lineTo(20, -14); paint(c, null, INK, 2.5);
    }
    if (cos.front) cos.front(c, t);
    c.restore();
  }

  var api = { LIST: LIST, BY_ID: BY_ID, drawEgg: drawEgg,
              ids: LIST.map(function (x) { return x.id; }) };
  root.ER = root.ER || {};
  root.ER.costumes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
