/*
 * Egg Runner 2 — the egg and its costumes.
 *
 * The egg is the star of the game. It is on screen in every frame, so it is
 * drawn fresh each time (it runs, jumps, worries and cracks) instead of being
 * stamped from a stored picture.
 *
 * Its face always points at the player. The face is a decoration stuck on the
 * egg, like the face on a cheap egg costume, so it never has to match the
 * direction of the run.
 *
 * LIGHT. One warm light shines from the upper left. Every part is brightest
 * toward the upper left and gets darker and a little cooler toward the lower
 * right. Shadows are never grey: a white shell shades to soft lilac, red
 * cloth to deep red-purple. Outlines are a dark shade of the thing's own
 * colour; the shared dark ink is kept for eyes and mouths.
 *
 * A COSTUME is a full makeover built from up to four layers:
 *   back(c, P)   behind the egg: capes, wings, tails, backpacks
 *   wear(c, P)   painted onto the shell itself: clothes, masks, stripes
 *   front(c, P)  over the face and body: beards, noses, things held in a hand
 *   hat(c, P)    on the head; it tips when the egg cracks and lifts a little
 *                as the egg falls
 * plus a few options: colours of the shell, sleeves, gloves and shoes, and
 * the kind of eyes and mouth. P describes the pose the egg is in right now
 * (see drawEgg), so loose things such as capes and antennas can move with it.
 *
 * To add a costume, add one entry to LIST. Nothing else needs to change.
 *
 * Units and axes match art.js: (0, 0) is the floor under the egg, y is DOWN.
 * The shell spans x -30..30 and y -85..-7. Eyes sit at y -54 and the mouth
 * just below. Nothing here draws a shadow on the floor: render.js does that.
 */
(function (root) {
  'use strict';

  var A = (typeof module !== 'undefined' && module.exports) ? require('./art.js') : root.ER.art;
  var rr = A.rr, poly = A.poly, oval = A.oval, grad = A.grad, radial = A.radial, star = A.star, INK = A.INK;
  var PI = Math.PI;
  var CY = -46, RX = 30, RY = 39;   // the shell: height of its middle, half its width, half its height

  // ── colours ──────────────────────────────────────────────────────────
  // Each colour comes as a set: the colour itself, a lit shade (_L), a shaded
  // one (_D) and a dark one for outlines (_INK). These match the rest of the
  // game so the egg looks like it belongs in the same kitchen.
  var RED = '#e5484d', RED_L = '#ff7d74', RED_D = '#b52c46', RED_INK = '#7d1630';
  var YEL = '#ffd43b', YEL_INK = '#99590a';
  var GRN = '#59b34a', GRN_L = '#8fdc6f', GRN_D = '#3b8f48', GRN_INK = '#1c6130';
  var PUR = '#8253d8', PUR_L = '#a985f2', PUR_D = '#5f38b4', PUR_INK = '#3a1f86';
  var BLU = '#2f7ff0', BLU_D = '#1f5cc8', BLU_INK = '#143a8f';
  var BRN = '#9a6531', BRN_L = '#c48d52', BRN_D = '#744620', BRN_INK = '#4a2710';
  var GOLD = '#ffcf3a', GOLD_L = '#fff2a8', GOLD_D = '#eba016', GOLD_INK = '#8f5200';
  var STEEL = '#c3cedb', STEEL_L = '#f3f8fd', STEEL_D = '#8493ab', STEEL_INK = '#3e4a63';
  var WHITE = '#ffffff', WHITE_D = '#dfe3f6', WHITE_INK = '#5d6592';   // white cloth: lilac shadow, slate outline
  var NIGHT = '#33293f', NIGHT_INK = '#17111f';   // "black" cloth is really a deep violet
  var SHELL = '#fffaf0', SHELL_INK = '#6b4226';   // the bare egg: warm white, chestnut outline
  var LIMB = '#4d2f1f', LIMB_INK = '#2e190e', SOLE = '#a37450';   // bare arms, legs and shoes

  // ── small drawing helpers ────────────────────────────────────────────
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function fill(c, col) { c.fillStyle = col; c.fill(); }
  function line(c, col, w) { c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
  function ink(c, col, edge, w) { fill(c, col); line(c, edge, w || 2.5); }   // fill, then outline
  function dot(c, x, y, r, col) { c.beginPath(); c.arc(x, y, r, 0, 2 * PI); fill(c, col); }
  function shellPath(c) { A.eggPath(c, 0, CY, RX, RY); }

  // A band of cloth wrapped round the egg, from height y0 down to y1. We look
  // down on the egg a little, so a level band dips in the middle; `sag` is by
  // how much. This dip is what makes clothes look wrapped round a ball
  // instead of printed on a flat card. (Bands are wider than the shell; the
  // shell's outline trims them.)
  function band(c, y0, y1, sag) {
    c.beginPath(); c.moveTo(-36, y0); c.quadraticCurveTo(0, y0 + sag * 2, 36, y0);
    c.lineTo(36, y1); c.quadraticCurveTo(0, y1 + sag * 2, -36, y1); c.closePath();
  }
  function hem(c, y, sag) { c.beginPath(); c.moveTo(-36, y); c.quadraticCurveTo(0, y + sag * 2, 36, y); }
  // A ribbon: one curved stroke with a darker edge.
  function ribbon(c, x0, y0, cx, cy, x1, y1, col, edge, w) {
    c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cx, cy, x1, y1); line(c, edge, w + 2.8); line(c, col, w);
  }
  // A cape hanging behind the egg. It lags behind a lane change (P.swing),
  // flies up as the egg falls (P.lift) and its hem ripples with the clock
  // (P.flap). `waves` is how many scallops the hem has and `arch` how deep
  // they are (0 = one smooth hem).
  function capePath(c, P, half, top, waves, arch) {
    var sw = P.swing * 9, f = P.flap * 2.2, hemY = -3 - P.lift * 24, i, x0 = half, x1;
    c.beginPath(); c.moveTo(-22, top); c.lineTo(22, top);
    c.bezierCurveTo(half - 5 + sw * 0.4, top + 18, half + 4 + sw, hemY - 24, half + sw + f, hemY);
    for (i = 1; i <= waves; i++) {
      x1 = half - i * 2 * half / waves;
      c.quadraticCurveTo((x0 + x1) / 2 + sw, hemY - arch + (i % 2 ? f : -f), x1 + sw + (i === waves ? f : 0), hemY + (i === waves ? 0 : (i % 2 ? -f : f) * 0.5));
      x0 = x1;
    }
    c.bezierCurveTo(-half - 4 + sw, hemY - 24, -half + 5 + sw * 0.4, top + 18, -22, top); c.closePath();
  }

  // ── the costumes ─────────────────────────────────────────────────────
  // Besides its layers, a costume may set any of these (all optional):
  //   shell      the shell's colour, when the costume covers the whole egg
  //   line       outline colour of the shell (a dark shade of `shell`)
  //   shade      0..1, how strongly the shell is shaded toward the lower right
  //   gloss      0..1, how shiny it is (cloth is duller than a bare shell)
  //   eyes       'white' (wide, with pupils), 'patch' (one covered), 'led', 'glow'
  //   mouth      'none', 'fangs', 'led', 'stitch'
  //   mouthY     moves the mouth down a little, to make room for a moustache or nose
  //   blush      cheek colour, or false for none; blushX moves the cheeks inward
  //   sleeve, sleeveLine   arm colour and its outline       hands, handLine   gloves
  //   legs, legLine        trouser legs                     shoes, shoeLine, sole, shoeSize, shoeStyle
  //   shoulder   height the arms start at       peg   which leg is wooden       fist   flies fist first
  var LIST = [
    // No costume at all: just the bare shell.
    { id: 'plain', name: 'Plain Egg', shade: 0.6 },

    // White jacket, red neckerchief, curly moustache and a tall puffy hat.
    { id: 'chef', name: 'Chef', mouthY: 3, sleeve: '#f6f8ff', sleeveLine: WHITE_INK, shoes: '#46526f', shoeLine: '#252d44',
      wear: function (c) {
        band(c, -33, 2, 5); fill(c, '#f4f6ff');
        hem(c, -33, 5); line(c, WHITE_INK, 2);
        c.beginPath(); c.moveTo(-5, -28); c.quadraticCurveTo(-8, -18, -7, -6); line(c, '#b4bbdc', 1.6);   // the jacket's front flap
        dot(c, -1.5, -18.5, 2.3, '#6f7aa8'); dot(c, 9.5, -19.5, 2.3, '#6f7aa8');
        dot(c, -2, -10.5, 2.3, '#6f7aa8'); dot(c, 9, -11.5, 2.3, '#6f7aa8');
        c.beginPath(); c.moveTo(-13, -32); c.quadraticCurveTo(0, -25.5, 13, -32); c.lineTo(2, -20.5);
        c.quadraticCurveTo(0, -19, -2, -20.5); c.closePath(); ink(c, RED, RED_INK, 2);   // neckerchief
        rr(c, -3.6, -30.4, 7.2, 5.4, 2.2); ink(c, RED_L, RED_INK, 1.6);
      },
      front: function (c) {
        for (var s = -1; s <= 1; s += 2) {   // moustache
          c.beginPath(); c.moveTo(0, -44.6);
          c.bezierCurveTo(s * 6, -40.4, s * 14, -41, s * 17.5, -48);
          c.bezierCurveTo(s * 14, -45.2, s * 8, -47, s * 1, -48); c.closePath();
          ink(c, '#70401d', '#3d2010', 1.6);
        }
      },
      hat: function (c, P) {
        var w = P.sway * 1.6;   // the top wobbles as it runs
        oval(c, -13 + w, -106, 13, 12); ink(c, WHITE, WHITE_INK, 2.5);
        oval(c, 14 + w, -105, 12.5, 12); ink(c, '#e9ecfa', WHITE_INK, 2.5);
        oval(c, w, -113, 15, 13); ink(c, WHITE, WHITE_INK, 2.5);
        oval(c, w * 0.6, -103, 15, 9); fill(c, WHITE);   // hides the lines between the puffs
        oval(c, 13 + w * 0.6, -101, 9, 6.5); fill(c, '#e9ecfa');
        c.beginPath(); c.moveTo(-19, -99); c.quadraticCurveTo(0, -95, 19, -99); c.lineTo(18.5, -82);
        c.quadraticCurveTo(0, -75.5, -18.5, -82); c.closePath(); ink(c, WHITE, WHITE_INK, 2.5);   // the band
        c.beginPath(); c.moveTo(9, -96.6); c.lineTo(17.7, -98); c.lineTo(17.3, -82.4); c.quadraticCurveTo(13, -80.2, 9, -79.5); c.closePath();
        fill(c, WHITE_D);
        c.beginPath(); c.moveTo(-9, -96.5); c.lineTo(-9, -80.5); c.moveTo(0, -95.5); c.lineTo(0, -79.5); c.moveTo(9, -96.5); c.lineTo(9, -80.5);
        line(c, '#b4bbdc', 1.4);   // pleats
      } },

    // Blue shirt, leather vest with a sheriff's star, red bandana, big hat.
    { id: 'cowboy', name: 'Cowboy', sleeve: '#4d8fe0', sleeveLine: BLU_INK, hands: '#e0a860', handLine: BRN_INK, shoes: BRN, shoeLine: BRN_INK,
      wear: function (c, P) {
        band(c, -33, 2, 5); fill(c, '#4d8fe0');
        band(c, -19, -13, 5); fill(c, '#5a3212');   // belt and buckle
        rr(c, -5.5, -15.6, 11, 8.5, 2.5); ink(c, GOLD, GOLD_INK, 1.8);
        poly(c, [-36, -36, -18.5, -32, -10.5, -4, -36, 2]); ink(c, BRN, BRN_INK, 2);   // the vest's two panels
        poly(c, [36, -36, 18.5, -32, 10.5, -4, 36, 2]); ink(c, BRN, BRN_INK, 2);
        star(c, -18, -21, 6.6, 5); ink(c, GOLD, GOLD_INK, 1.5);
        var f = P.sway * 1.5;   // the bandana's point swings
        c.beginPath(); c.moveTo(-19, -34); c.quadraticCurveTo(0, -27, 19, -34); c.lineTo(1.5 + f, -17.5);
        c.quadraticCurveTo(f, -16, -1.5 + f, -17.5); c.closePath(); ink(c, RED, RED_INK, 2);
        dot(c, -8, -27.8, 1.5, WHITE); dot(c, 0, -26, 1.5, WHITE); dot(c, 8, -27.8, 1.5, WHITE); dot(c, f * 0.5, -21, 1.5, WHITE);
      },
      hat: function (c) {
        c.beginPath(); c.moveTo(-49, -92); c.bezierCurveTo(-42, -80, -24, -73, 0, -73); c.bezierCurveTo(24, -73, 42, -80, 49, -92);
        c.bezierCurveTo(40, -86.5, 22, -85, 0, -85); c.bezierCurveTo(-22, -85, -40, -86.5, -49, -92); c.closePath();
        ink(c, grad(c, -40, -92, 34, -72, [BRN_L, BRN, BRN_D]), BRN_INK, 2.6);   // the brim, ends curled up
        c.beginPath(); c.moveTo(-21, -83); c.bezierCurveTo(-25, -99, -23, -113, -10, -112.5); c.quadraticCurveTo(0, -106, 10, -112.5);
        c.bezierCurveTo(23, -113, 25, -99, 21, -83); c.quadraticCurveTo(0, -76.5, -21, -83); c.closePath();
        ink(c, grad(c, -22, -110, 22, -84, [BRN_L, BRN, BRN_D]), BRN_INK, 2.6);   // the crown
        c.beginPath(); c.moveTo(0, -107.5); c.quadraticCurveTo(-1.5, -101, 0, -96); line(c, BRN_D, 1.8);
        c.beginPath(); c.moveTo(-22, -90); c.quadraticCurveTo(0, -83.5, 22, -90); c.lineTo(21, -83);
        c.quadraticCurveTo(0, -76.5, -21, -83); c.closePath(); fill(c, '#4a2710');   // hat band
        rr(c, -3.5, -85.6, 7, 6, 1.5); ink(c, GOLD, GOLD_INK, 1.4);
        c.beginPath(); c.moveTo(-41, -84); c.bezierCurveTo(-31, -78, -16, -75.6, -2, -75.4); line(c, 'rgba(255,236,200,0.5)', 1.6);
      } },

    // Purple robe with gold stars, a long white beard, a bent pointed hat and a wand.
    { id: 'wizard', name: 'Wizard', sleeve: PUR, sleeveLine: PUR_INK, shoes: PUR_D, shoeLine: PUR_INK,
      wear: function (c) {
        band(c, -33, 2, 5); fill(c, PUR);
        band(c, -33, -29.5, 5); fill(c, GOLD);
        c.fillStyle = GOLD;
        star(c, -22, -18, 4.2, 5); c.fill(); star(c, 22, -22, 3.6, 5); c.fill(); star(c, 20, -8, 3, 5); c.fill();
      },
      front: function (c, P) {
        var b = P.sway * 2.2 + P.swing * 3;   // the beard's tip sways
        c.beginPath(); c.moveTo(-25.5, -49);
        c.bezierCurveTo(-29, -35, -25, -21, -16, -15); c.bezierCurveTo(-13, -7, -6, -2, b, 3);
        c.bezierCurveTo(6, -2, 13, -7, 16, -15); c.bezierCurveTo(25, -21, 29, -35, 25.5, -49);
        c.bezierCurveTo(19, -38, 9, -32.5, 0, -32.5); c.bezierCurveTo(-9, -32.5, -19, -38, -25.5, -49); c.closePath();
        ink(c, '#fafbff', '#7780b0', 2.5);
        c.beginPath(); c.moveTo(25, -46); c.bezierCurveTo(27.5, -35, 24, -21.5, 15.5, -15.6);
        c.bezierCurveTo(12.5, -8, 7, -3, b + 1, 1.2); c.bezierCurveTo(9, -10, 16, -22, 18.5, -37); c.closePath();
        fill(c, WHITE_D);   // its shadow side
        c.beginPath(); c.moveTo(-8, -27); c.quadraticCurveTo(-7, -16, b * 0.6 - 2, -7);
        c.moveTo(7, -27); c.quadraticCurveTo(8, -17, b * 0.6 + 3, -9); line(c, '#b4bbdc', 1.5);
        var hx = P.hr.x, hy = P.hr.y, tw = 1 + Math.sin(P.t * 0.009) * 0.16;   // the wand's star twinkles
        c.beginPath(); c.moveTo(hx - 2, hy + 5); c.lineTo(hx + 6, hy - 19); line(c, BRN_INK, 5); line(c, '#b9824a', 2.4);
        star(c, hx + 7, hy - 23, 7.5 * tw, 5); ink(c, GOLD, GOLD_INK, 1.6);
        dot(c, hx + 16, hy - 31, 1.5 * tw, '#fff6c0'); dot(c, hx - 3, hy - 32, 1.2 * tw, '#fff6c0');
      },
      hat: function (c, P) {
        var w = P.sway * 2.5 + P.swing * 4;   // the floppy tip trails behind
        oval(c, 0, -80, 38, 9); ink(c, PUR_D, PUR_INK, 2.6);
        c.beginPath(); c.moveTo(-24, -82); c.bezierCurveTo(-15, -100, -5, -119, 7, -128);
        c.bezierCurveTo(13, -132.5, 21 + w * 0.5, -132, 25 + w, -123.5);
        c.bezierCurveTo(19 + w * 0.5, -126, 14, -124.5, 12.5, -118); c.bezierCurveTo(18, -105, 22, -93, 24, -82);
        c.quadraticCurveTo(0, -74.5, -24, -82); c.closePath();
        ink(c, grad(c, -20, -112, 24, -88, [PUR_L, PUR, PUR_D]), PUR_INK, 2.6);
        c.beginPath(); c.moveTo(-22.2, -86.6); c.quadraticCurveTo(0, -79.5, 22.8, -86.6); c.lineTo(24, -82);
        c.quadraticCurveTo(0, -74.5, -24, -82); c.closePath(); ink(c, GOLD, GOLD_INK, 1.5);
        c.fillStyle = GOLD; star(c, -3, -98.5, 5.6, 5); c.fill(); star(c, 9, -111.5, 3.6, 5); c.fill();
        c.beginPath(); c.moveTo(-33, -79); c.quadraticCurveTo(-22, -73.5, -6, -72.2); line(c, 'rgba(255,255,255,0.35)', 1.6);
      } },

    // Dark suit from head to toe, a red headband with flying tails, a sword on the back.
    { id: 'ninja', name: 'Ninja', eyes: 'white', lids: '#ffeeda', mouth: 'none', blush: false, browY: -9.5,
      shell: '#3a4462', line: '#161c30', gloss: 0.32, sleeve: '#3a4462', sleeveLine: '#161c30',
      legs: '#3a4462', legLine: '#161c30', shoes: '#2c3452', shoeLine: '#161c30', sole: '#59648a',
      back: function (c) {   // only the sword's grip shows, over the shoulder
        c.beginPath(); c.moveTo(-17, -72); c.lineTo(-36, -104); line(c, '#161c30', 8.4); line(c, '#566186', 4.8);
        c.beginPath(); c.moveTo(-23.5, -81.5); c.lineTo(-20.5, -84.5); c.moveTo(-28.5, -90); c.lineTo(-25.5, -93); c.moveTo(-33.5, -98.5); c.lineTo(-30.5, -101.5);
        line(c, GOLD, 2);
        dot(c, -36.6, -105, 3.6, GOLD_INK); dot(c, -36.6, -105, 2.2, GOLD);
        c.save(); c.translate(-19.5, -76); c.rotate(-0.53); rr(c, -8.5, -2.4, 17, 4.8, 2.2); ink(c, GOLD, GOLD_INK, 1.6); c.restore();
      },
      wear: function (c) {
        c.beginPath(); c.moveTo(-26, -61); c.quadraticCurveTo(-26, -69.5, -17, -69.5); c.quadraticCurveTo(0, -66, 17, -69.5);
        c.quadraticCurveTo(26, -69.5, 26, -61); c.lineTo(26, -52.5); c.quadraticCurveTo(26, -45.5, 17, -45);
        c.quadraticCurveTo(0, -41.5, -17, -45); c.quadraticCurveTo(-26, -45.5, -26, -52.5); c.closePath();
        ink(c, '#ffeeda', '#161c30', 2);   // the gap in the hood
        c.beginPath(); c.moveTo(-25, -60); c.quadraticCurveTo(-25, -68.5, -17, -68.5); c.quadraticCurveTo(0, -65, 17, -68.5);
        c.quadraticCurveTo(25, -68.5, 25, -60); c.quadraticCurveTo(0, -65.5, -25, -60); c.closePath();
        fill(c, 'rgba(126,92,176,0.24)');   // the hood's shadow on the face
        band(c, -80, -72.5, 3); fill(c, RED);   // headband
        hem(c, -72.5, 3); line(c, RED_INK, 1.6); hem(c, -80, 3); line(c, RED_INK, 1.6);
        c.beginPath(); c.moveTo(-30, -37); c.lineTo(-2, -22); c.moveTo(30, -37); c.lineTo(2, -22); line(c, '#566186', 2);   // folds of the jacket
        band(c, -22, -15.5, 5); fill(c, RED); hem(c, -22, 5); line(c, RED_INK, 1.4); hem(c, -15.5, 5); line(c, RED_INK, 1.4);
        poly(c, [-11.5, -11, -6, -11.5, -7, -1.5, -12.5, -3.5]); ink(c, RED, RED_INK, 1.5);   // the sash's knot and end
        rr(c, -13, -17.6, 8, 7.4, 2.6); ink(c, RED_L, RED_INK, 1.5);
      },
      front: function (c, P) {
        var f = P.flap, g = P.flap2, up = P.lift * 14, sw = P.swing * 8;   // the headband's tails fly
        ribbon(c, 22, -76, 36 + sw, -88 - up * 0.5 + f * 3, 50 + sw, -82 - up + g * 5, RED, RED_INK, 4.2);
        ribbon(c, 22, -75, 37 + sw, -73 - up * 0.4 + g * 3, 49 + sw, -65 - up + f * 5, RED, RED_INK, 4.2);
        oval(c, 22, -75.5, 4.2, 4.8); ink(c, RED_L, RED_INK, 1.8);
      } },

    // Captain's hat with a skull, an eye patch, a striped shirt, an earring and a wooden leg.
    { id: 'pirate', name: 'Pirate', eyes: 'patch', peg: -1, sleeve: RED, sleeveLine: RED_INK, shoes: NIGHT, shoeLine: NIGHT_INK,
      wear: function (c) {
        var y, i = 0;
        for (y = -33; y < 2; y += 7, i++) { band(c, y, y + 7.3, 5); fill(c, i % 2 ? RED : WHITE); }
        hem(c, -33, 5); line(c, RED_INK, 1.8);
        band(c, -18.5, -12.5, 5); fill(c, '#3b2a20');
        rr(c, -5.5, -15.4, 11, 8.5, 2.5); ink(c, GOLD, GOLD_INK, 1.8);
        rr(c, -2.4, -12.8, 4.8, 3.4, 1); fill(c, '#3b2a20');
      },
      front: function (c, P) {
        c.beginPath(); c.moveTo(25, -68.5); c.lineTo(-10, -57); c.lineTo(-28.5, -46.5); line(c, NIGHT_INK, 2.4);   // the patch's strap
        c.beginPath(); c.moveTo(-19.5, -58.5); c.quadraticCurveTo(-11, -62.5, -2.5, -58.5); c.quadraticCurveTo(-2, -46.5, -11, -45.5);
        c.quadraticCurveTo(-20, -46.5, -19.5, -58.5); c.closePath(); ink(c, NIGHT, NIGHT_INK, 2);
        c.beginPath(); c.moveTo(-16, -56.5); c.quadraticCurveTo(-13, -58.5, -9.5, -58.2); line(c, 'rgba(255,255,255,0.3)', 1.5);
        c.beginPath(); c.arc(29.5 + P.sway, -38.5 + P.lift * 2, 4.4, 0, 2 * PI); line(c, GOLD_INK, 3.6); line(c, GOLD, 1.9);   // earring
      },
      hat: function (c) {
        c.beginPath(); c.moveTo(-39, -82); c.quadraticCurveTo(-45, -97, -31, -100); c.quadraticCurveTo(-13, -119, 0, -119);
        c.quadraticCurveTo(13, -119, 31, -100); c.quadraticCurveTo(45, -97, 39, -82); c.quadraticCurveTo(0, -69, -39, -82); c.closePath();
        ink(c, NIGHT, NIGHT_INK, 2.6);
        c.beginPath(); c.moveTo(-36.5, -86); c.quadraticCurveTo(-40, -95, -29.5, -97); c.quadraticCurveTo(-12, -115.5, 0, -115.5);
        c.quadraticCurveTo(12, -115.5, 29.5, -97); c.quadraticCurveTo(40, -95, 36.5, -86); line(c, GOLD, 2.2);   // gold trim
        c.beginPath(); c.moveTo(-31, -89); c.quadraticCurveTo(-29, -96, -17, -105.5); line(c, 'rgba(255,255,255,0.16)', 4);
        c.beginPath(); c.moveTo(-9.5, -104); c.lineTo(9.5, -89); c.moveTo(9.5, -104); c.lineTo(-9.5, -89); line(c, WHITE, 3.2);
        oval(c, 0, -98, 6.8, 6.2); fill(c, WHITE); rr(c, -3.5, -94, 7, 4.8, 1.6); fill(c, WHITE);   // a friendly little skull
        dot(c, -2.5, -98.4, 1.7, NIGHT); dot(c, 2.5, -98.4, 1.7, NIGHT);
      } },

    // White space suit, backpack with a blinking aerial, and a glass bubble helmet.
    { id: 'astronaut', name: 'Astronaut', shoulder: -29, sleeve: '#f1f5ff', sleeveLine: '#55648f', hands: '#ff8a3d', handLine: '#a8501a',
      legs: '#f1f5ff', legLine: '#55648f', shoes: '#f1f5ff', shoeLine: '#55648f', sole: '#ff8a3d',
      back: function (c, P) {
        rr(c, -37, -66, 74, 56, 12); ink(c, '#c5cfe4', '#55648f', 2.5);
        rr(c, 26, -62, 9, 48, 4); fill(c, '#a9b5d2');
        var w = P.sway * 2 + P.swing * 3;
        c.beginPath(); c.moveTo(31, -64); c.quadraticCurveTo(33, -82, 36 + w, -96); line(c, '#55648f', 3);
        dot(c, 36 + w, -98.5, 4.4, '#7d1630'); dot(c, 36 + w, -98.5, 3, Math.floor(P.t / 400) % 2 ? '#ffb3a8' : RED);
      },
      wear: function (c, P) {
        band(c, -31, 2, 5); fill(c, '#f1f5ff');
        c.beginPath(); c.moveTo(-24, -23); c.quadraticCurveTo(-21, -13, -15, -9); c.moveTo(24, -23); c.quadraticCurveTo(21, -13, 15, -9);
        line(c, '#c3cbe6', 1.6);   // folds in the suit
        rr(c, -12.5, -22, 25, 13, 3.5); ink(c, '#46557f', '#2a3558', 1.8);   // control panel; its lights take turns
        var on = Math.floor(P.t / 350) % 3;
        dot(c, -6.5, -15.5, 2.5, on === 0 ? '#ff7a7a' : '#a8243f'); dot(c, 0, -15.5, 2.5, on === 1 ? '#fff07a' : '#c79a12');
        dot(c, 6.5, -15.5, 2.5, on === 2 ? '#93ff80' : '#2f8a3c');
      },
      front: function (c, P) {
        oval(c, 0, -60, 36.5, 36); fill(c, 'rgba(160,214,255,0.2)'); line(c, '#55648f', 6.4); line(c, '#eaf4ff', 3.4);   // the glass
        c.beginPath(); c.arc(0, -60, 29.5, 1.08 * PI, 1.4 * PI); line(c, 'rgba(255,255,255,0.92)', 4.4);
        c.beginPath(); c.arc(0, -60, 29.5, 1.45 * PI, 1.5 * PI); line(c, 'rgba(255,255,255,0.92)', 4.4);
        c.beginPath(); c.arc(0, -60, 30.5, 0.14 * PI, 0.34 * PI); line(c, 'rgba(255,255,255,0.4)', 2.4);
        if (P.cracked) {   // a crack in the glass
          c.beginPath(); c.moveTo(18, -90); c.lineTo(12, -80); c.lineTo(20, -74); c.lineTo(15, -66); c.moveTo(12, -80); c.lineTo(5, -78);
          line(c, 'rgba(255,255,255,0.95)', 1.8);
        }
        c.beginPath(); c.ellipse(0, -30.5, 30.5, 6.6, 0, 0.03 * PI, 0.97 * PI); line(c, '#55648f', 6.6); line(c, '#dfe7f6', 3.6);   // collar ring
        c.beginPath(); c.ellipse(0, -31.2, 30, 6.4, 0, 0.55 * PI, 0.9 * PI); line(c, WHITE, 1.3);
      } },

    // Blue suit, red mask and boots, a star on the chest and a cape that flies.
    { id: 'hero', name: 'Superhero', eyes: 'white', fist: true, sleeve: BLU, sleeveLine: BLU_INK, hands: RED, handLine: RED_INK,
      legs: BLU, legLine: BLU_INK, shoes: RED, shoeLine: RED_INK,
      back: function (c, P) {
        capePath(c, P, 45, -64, 4, 7);
        ink(c, grad(c, -30, -62, 34, 0, ['#f25a5f', RED, RED_D]), RED_INK, 2.6);
        var sw = P.swing * 9, y = -3 - P.lift * 24;
        c.beginPath(); c.moveTo(-30 + sw * 0.5, -44); c.quadraticCurveTo(-36 + sw, -26, -33 + sw, y - 9);
        c.moveTo(30 + sw * 0.5, -44); c.quadraticCurveTo(36 + sw, -26, 33 + sw, y - 9); line(c, RED_D, 1.8);   // folds
      },
      wear: function (c) {
        band(c, -36, 2, 5); fill(c, BLU);
        band(c, -13, 2, 5); fill(c, RED);
        band(c, -17.5, -12.5, 5); fill(c, YEL); hem(c, -17.5, 5); line(c, YEL_INK, 1.2); hem(c, -12.5, 5); line(c, YEL_INK, 1.2);
        oval(c, 0, -26.5, 10, 8.8); ink(c, YEL, YEL_INK, 1.8);
        star(c, 0, -26.5, 6.6, 5); fill(c, RED);
        c.beginPath(); c.moveTo(-26.5, -58); c.quadraticCurveTo(-25, -66.5, -12, -65.5); c.quadraticCurveTo(0, -62.5, 12, -65.5);
        c.quadraticCurveTo(25, -66.5, 26.5, -58); c.quadraticCurveTo(23, -47, 11, -46.5); c.quadraticCurveTo(3.5, -46.5, 0, -51);
        c.quadraticCurveTo(-3.5, -46.5, -11, -46.5); c.quadraticCurveTo(-23, -47, -26.5, -58); c.closePath();
        ink(c, RED, RED_INK, 2);   // the mask
      } },

    // Gold crown, a red cape trimmed with white fur, a purple tunic and a medal.
    { id: 'king', name: 'King', sleeve: '#d83a4a', sleeveLine: RED_INK, hands: WHITE, handLine: WHITE_INK, shoes: PUR_D, shoeLine: PUR_INK,
      back: function (c, P) {
        var sw = P.swing * 8, f = P.flap * 2, y = -4 - P.lift * 20, i, x;
        c.beginPath(); c.moveTo(-23, -62); c.lineTo(23, -62);
        c.bezierCurveTo(44 + sw * 0.4, -44, 51 + sw, -22, 48 + sw + f, y);
        c.quadraticCurveTo(sw, y + 9, -48 + sw + f, y);
        c.bezierCurveTo(-51 + sw, -22, -44 + sw * 0.4, -44, -23, -62); c.closePath();
        ink(c, grad(c, -30, -60, 30, 0, ['#ec5560', '#c5303b', '#8f1d3a']), RED_INK, 2.6);
        c.beginPath(); c.moveTo(46.5 + sw + f, y - 1.5); c.quadraticCurveTo(sw, y + 7.5, -46.5 + sw + f, y - 1.5);
        line(c, WHITE_INK, 11.5); line(c, WHITE, 8.5);   // the fur hem and its spots
        for (i = -2; i <= 2; i++) { x = i * 19; dot(c, x + sw + f * Math.abs(i) / 2, y - 1.5 + 4.5 * (1 - x * x / 2209), 1.8, '#3b2f4a'); }
      },
      wear: function (c) {
        band(c, -27, 2, 5); fill(c, PUR);
        band(c, -36, -27, 5); fill(c, WHITE); hem(c, -27, 5); line(c, WHITE_INK, 1.8);   // fur collar
        dot(c, -22, -30.5, 1.7, '#3b2f4a'); dot(c, -8, -27.6, 1.7, '#3b2f4a'); dot(c, 8, -27.6, 1.7, '#3b2f4a'); dot(c, 22, -30.5, 1.7, '#3b2f4a');
        c.beginPath(); c.moveTo(-12, -23.5); c.quadraticCurveTo(0, -11, 12, -23.5); line(c, GOLD_INK, 3.4); line(c, GOLD, 1.8);
        oval(c, 0, -16.5, 4.6, 5); ink(c, GOLD, GOLD_INK, 1.6); dot(c, 0, -16.5, 2.2, RED);
      },
      hat: function (c, P) {
        c.beginPath(); c.moveTo(-21, -90); c.quadraticCurveTo(0, -113, 21, -90); c.closePath(); ink(c, '#c5303b', RED_INK, 2);   // velvet inside
        c.beginPath(); c.moveTo(-23, -80); c.lineTo(-27, -105); c.lineTo(-17.5, -95); c.lineTo(-12, -110); c.lineTo(-5.5, -96.5);
        c.lineTo(0, -116); c.lineTo(5.5, -96.5); c.lineTo(12, -110); c.lineTo(17.5, -95); c.lineTo(27, -105); c.lineTo(23, -80);
        c.quadraticCurveTo(0, -73, -23, -80); c.closePath();
        ink(c, grad(c, -24, -100, 24, -82, [GOLD_L, GOLD, GOLD_D]), GOLD_INK, 2.5);
        c.beginPath(); c.moveTo(-24, -86.5); c.quadraticCurveTo(0, -79.5, 24, -86.5); line(c, GOLD_INK, 1.4);
        dot(c, -27, -106, 3.4, RED_INK); dot(c, -27, -106, 2.2, RED); dot(c, 27, -106, 3.4, RED_INK); dot(c, 27, -106, 2.2, RED);
        dot(c, 0, -117.5, 3.8, RED_INK); dot(c, 0, -117.5, 2.6, RED);
        dot(c, -12, -111, 2.6, GOLD_INK); dot(c, -12, -111, 1.5, GOLD_L); dot(c, 12, -111, 2.6, GOLD_INK); dot(c, 12, -111, 1.5, GOLD_L);
        dot(c, -12, -81.4, 2.6, BLU); dot(c, 12, -81.4, 2.6, BLU); dot(c, 0, -79.8, 3, GRN);
        var tw = 0.75 + 0.35 * Math.sin(P.t * 0.006);   // a glint that comes and goes
        c.fillStyle = WHITE; star(c, -15, -100, 4.6 * tw, 4); c.fill();
      } },

    // Spotty yellow suit, frilly collar, red nose, rainbow hair, tiny hat and enormous shoes.
    { id: 'clown', name: 'Clown', mouthY: 2.5, blush: 'rgba(229,72,77,0.5)', sleeve: YEL, sleeveLine: YEL_INK, hands: WHITE, handLine: WHITE_INK,
      shoes: RED, shoeLine: RED_INK, shoeSize: 1.4, sole: '#ffb3a8',
      back: function (c, P) {   // the hair is behind the egg, so the top of the head stays bald
        var hair = [RED, '#ff8a3d', YEL, GRN, BLU, PUR], edge = [RED_INK, '#a04a10', YEL_INK, GRN_INK, BLU_INK, PUR_INK];
        var at = [-31, -57, -33.5, -72, -24, -85, 24, -85, 33.5, -72, 31, -57], i, b;
        for (i = 0; i < 6; i++) {
          b = P.bounce * (i % 2 ? 1.6 : 0.8);
          oval(c, at[i * 2], at[i * 2 + 1] - b, 11.5, 11.5); ink(c, hair[i], edge[i], 2.5);
          oval(c, at[i * 2] - 3.5, at[i * 2 + 1] - b - 4, 4, 3, -0.5); fill(c, 'rgba(255,255,255,0.3)');
          c.beginPath(); c.arc(at[i * 2], at[i * 2 + 1] - b, 8.6, 0.08 * PI, 0.6 * PI); line(c, 'rgba(70,24,110,0.22)', 3);   // each puff's shadow side
        }
      },
      wear: function (c) {
        band(c, -33, 2, 5); fill(c, YEL);
        dot(c, -20, -15, 4.6, BLU); dot(c, 20, -17, 4.6, RED); dot(c, -11, -3.5, 4, GRN); dot(c, 13, -4, 4, PUR);
        dot(c, 0, -16, 4.4, RED_INK); dot(c, 0, -16, 3.2, RED); dot(c, 0, -6.5, 3.8, BLU_INK); dot(c, 0, -6.5, 2.7, BLU);   // pom-pom buttons
      },
      front: function (c) {
        var xs = [-25, 25, -12.5, 12.5, 0], i, x;   // the frilly collar, sides first
        for (i = 0; i < 5; i++) {
          x = xs[i];
          oval(c, x, -30.6 + 5.2 * (1 - x * x / 900), 7.6, 5.4); ink(c, i === 2 || i === 3 ? '#8fd0ff' : WHITE, '#3f6fb0', 1.8);
        }
        oval(c, 0, -48.6, 6, 5.7); ink(c, RED, RED_INK, 2);   // nose
        oval(c, -2, -50.6, 2.1, 1.7, -0.4); fill(c, 'rgba(255,255,255,0.85)');
      },
      hat: function (c, P) {
        var w = P.sway * 2 + P.swing * 3;
        oval(c, 3, -86, 12, 3.6); ink(c, BLU_D, BLU_INK, 2);
        c.beginPath(); c.moveTo(-7.5, -86.5); c.lineTo(13.5, -87.5); c.lineTo(6 + w, -110); c.closePath(); ink(c, BLU, BLU_INK, 2.2);
        c.beginPath(); c.moveTo(5.5, -87.6); c.lineTo(12.4, -87.9); c.lineTo(6.3 + w, -107.5); c.closePath(); fill(c, BLU_D);
        c.beginPath(); c.moveTo(-2.5, -94); c.lineTo(11, -95); c.moveTo(1.5, -101.5); c.lineTo(9, -102); line(c, YEL, 2.2);
        dot(c, 6 + w, -112, 5.6, YEL_INK); dot(c, 6 + w, -112, 4.3, YEL); dot(c, 4.6 + w, -113.4, 1.5, '#fff6c0');
      } },

    // A metal egg with a screen for a face, a panel of lights and a springy aerial.
    { id: 'robot', name: 'Robot', eyes: 'led', mouth: 'led', blush: false, shade: 0.5, gloss: 0.8, line: STEEL_INK,
      shell: function (c) { return grad(c, 0, -85, 0, -7, ['#f4f9ff', '#d3deec', '#a7b5cb', '#7c8ba6', '#c9bdb0']); },   // sky above, floor below
      sleeve: STEEL_D, sleeveLine: STEEL_INK, hands: '#5f6d8a', handLine: '#2c3650', legs: STEEL_D, legLine: STEEL_INK,
      shoes: '#5f6d8a', shoeLine: '#2c3650', shoeStyle: 'block', sole: STEEL,
      wear: function (c, P) {
        rr(c, -23.5, -67.5, 47, 32, 9); ink(c, '#1c2942', STEEL_INK, 2.2);   // the face screen
        c.beginPath(); c.moveTo(-18, -44); c.lineTo(-6, -64.5); c.lineTo(1, -64.5); c.lineTo(-11, -44); c.closePath(); fill(c, 'rgba(255,255,255,0.07)');
        hem(c, -33, 5); line(c, STEEL_INK, 1.6); hem(c, -31.4, 5); line(c, 'rgba(255,255,255,0.55)', 1.1);   // the seam round the middle
        rr(c, -13, -25, 26, 14.5, 3.5); ink(c, '#2a3856', '#1a2238', 1.8);
        var on = Math.floor(P.t / 300) % 3;   // the lights take turns
        dot(c, -7, -19.4, 2.6, on === 0 ? '#ff7a7a' : '#8f2238'); dot(c, 0, -19.4, 2.6, on === 1 ? '#fff07a' : '#a57f10');
        dot(c, 7, -19.4, 2.6, on === 2 ? '#93ff80' : '#2a7a36');
        c.beginPath(); c.moveTo(-8, -14); c.lineTo(8, -14); line(c, '#7fe7ff', 1.8);
        dot(c, -25, -38, 1.7, '#66748f'); dot(c, 25, -38, 1.7, '#66748f'); dot(c, -21, -13, 1.7, '#66748f'); dot(c, 21, -13, 1.7, '#66748f');   // rivets
      },
      front: function (c) {
        for (var s = -1; s <= 1; s += 2) {   // ear bolts
          rr(c, s * 33 - 4.5, -62, 9, 15, 3.2); ink(c, s < 0 ? STEEL : STEEL_D, STEEL_INK, 2.2);
          c.beginPath(); c.moveTo(s * 33 - 1.5, -58.5); c.lineTo(s * 33 - 1.5, -50.5); line(c, 'rgba(255,255,255,0.6)', 1.4);
        }
      },
      hat: function (c, P) {
        var w = P.sway * 4 + P.swing * 5, lit = P.worried && Math.floor(P.t / 110) % 2;   // the light flashes when worried
        rr(c, -5.5, -88.5, 11, 6, 2.5); ink(c, STEEL_D, STEEL_INK, 2);
        c.beginPath(); c.moveTo(0, -88); c.quadraticCurveTo(-w * 0.4, -98, w, -106); line(c, STEEL_INK, 3.4);
        dot(c, w, -109, 6.4, RED_INK); dot(c, w, -109, 4.9, lit ? '#ffd9a0' : RED); dot(c, w - 1.6, -110.8, 1.6, 'rgba(255,255,255,0.8)');
      } },

    // A green dinosaur suit: the egg looks out of its toothy mouth. Spikes, and a tail that wags.
    { id: 'dino', name: 'Dinosaur', shell: GRN, line: GRN_INK, gloss: 0.6, blushX: 15, browY: -10.5, sleeve: GRN, sleeveLine: GRN_INK, legs: GRN, legLine: GRN_INK,
      shoes: GRN, shoeLine: GRN_INK, shoeStyle: 'claw', shoeSize: 1.15, sole: GRN_L,
      back: function (c, P) {
        var wag = Math.sin(P.t * 0.008) * 4 + P.swing * 8 - P.lift * 10;
        poly(c, [36, -30, 43, -39 + wag * 0.4, 47, -27 + wag * 0.5]); ink(c, '#ff9a3d', '#a04a10', 2);  // spikes along the tail
        poly(c, [26, -31, 31, -40 + wag * 0.2, 36, -30 + wag * 0.3]); ink(c, '#ff9a3d', '#a04a10', 2);
        c.beginPath(); c.moveTo(12, -31); c.bezierCurveTo(32, -32, 48, -28 + wag * 0.6, 61, -19 + wag);
        c.bezierCurveTo(46, -9 + wag * 0.5, 30, -4, 12, -6); c.closePath(); ink(c, GRN, GRN_INK, 2.5);
        c.beginPath(); c.moveTo(20, -10); c.bezierCurveTo(34, -9.5, 46, -13 + wag * 0.5, 54, -17.5 + wag); line(c, GRN_D, 2);
        poly(c, [-9, -84, -1, -103, 7, -84]); ink(c, '#ffb054', '#a04a10', 2.2);   // spikes on the head
        poly(c, [-2, -84, 6, -99, 13, -82]); ink(c, '#ff8a3d', '#a04a10', 2.2);
      },
      wear: function (c) {
        oval(c, 0, -15, 18, 14); fill(c, '#dcf5aa');   // pale tummy
        hem(c, -22, 4); line(c, '#aadb78', 1.5); hem(c, -15.5, 4); line(c, '#aadb78', 1.5);
        dot(c, -25, -27, 3, GRN_D); dot(c, 25.5, -32, 2.4, GRN_D); dot(c, -21, -76, 2.6, GRN_D); dot(c, 22, -73, 2, GRN_D);   // spots
        oval(c, 0, -52.5, 24.5, 23); ink(c, '#236b35', GRN_INK, 2);   // the suit's open mouth…
        oval(c, 0, -50.5, 21, 18.6); fill(c, SHELL);   // …with the egg's face looking out of it
        var xs = [-15, -7.5, 0, 7.5, 15], i, x, y;   // a row of teeth along the top
        for (i = 0; i < 5; i++) {
          x = xs[i]; y = -52.5 - 23 * Math.sqrt(1 - x * x / 600.25) + 1;
          poly(c, [x - 3.6, y, x + 3.6, y, x, y + 6.6]); ink(c, WHITE, GRN_INK, 1.1);
        }
      },
      hat: function (c) {   // the suit's own eyes and nose, up on top
        for (var s = -1; s <= 1; s += 2) {
          oval(c, s * 13.5, -80, 7.4, 7.6); ink(c, s < 0 ? GRN_L : GRN, GRN_INK, 2.2);
          oval(c, s * 13.5, -80.4, 4.3, 4.8); fill(c, WHITE); dot(c, s * 13.5 + s * 0.6, -79.2, 2.3, INK);
        }
        dot(c, -4, -77.4, 1.4, GRN_INK); dot(c, 4, -77.4, 1.4, GRN_INK);
      } },

    // Yellow and black stripes, buzzing wings, bobbing antennae and a little sting.
    { id: 'bee', name: 'Bumblebee', shell: YEL, line: '#6b3d08', blush: 'rgba(255,120,60,0.42)',
      back: function (c, P) {
        var buzz = Math.sin(P.t * 0.055) * (P.air > 0 ? 0.42 : P.still ? 0 : 0.22), s;   // wings beat faster and wider in the air
        poly(c, [22, -21, 34, -12.5, 21, -11]); ink(c, '#3b2a20', '#1f140d', 1.8);   // sting
        for (s = -1; s <= 1; s += 2) {
          c.save(); c.translate(s * 21, -57); c.scale(s, 1);
          c.rotate(0.62 + buzz); oval(c, 17.5, 2, 14, 7.6); ink(c, 'rgba(206,236,255,0.8)', '#5b9bd1', 2);
          c.rotate(-1.12 - buzz * 2); oval(c, 19.5, 0, 19.5, 11); ink(c, 'rgba(226,246,255,0.86)', '#5b9bd1', 2.2);
          c.beginPath(); c.moveTo(6, 0); c.lineTo(31, 0); c.moveTo(17, 0); c.lineTo(27.5, -5.2); line(c, 'rgba(91,155,209,0.6)', 1.3);
          c.beginPath(); c.moveTo(9, -6.2); c.quadraticCurveTo(19.5, -10, 30, -5.2); line(c, 'rgba(255,255,255,0.9)', 1.6);
          c.restore();
        }
      },
      wear: function (c) {
        band(c, -92, -76.5, 3); fill(c, '#3b2a20');
        band(c, -34, -25.5, 5); fill(c, '#3b2a20'); band(c, -18.5, -10, 5); fill(c, '#3b2a20');
      },
      hat: function (c, P) {
        var w = P.sway * 3 + P.swing * 4, b = P.bounce * 2 - P.lift * 3, s;   // antennae spring about
        for (s = -1; s <= 1; s += 2) {
          c.beginPath(); c.moveTo(s * 7, -83); c.quadraticCurveTo(s * 9 + w * 0.3, -98, s * 18 + w, -104 + b); line(c, '#3b2a20', 3.2);
          dot(c, s * 19 + w, -105.5 + b, 5, '#3b2a20'); dot(c, s * 19 + w - 1.5, -107 + b, 1.5, 'rgba(255,255,255,0.45)');
        }
      } },

    // Iron helmet with horns, a huge orange beard with plaits, and a round shield.
    { id: 'viking', name: 'Viking', mouthY: 1, sleeve: '#4a6cb8', sleeveLine: '#1f3470', shoes: BRN, shoeLine: BRN_INK,
      wear: function (c) {
        band(c, -33, 2, 5); fill(c, '#4a6cb8');
        band(c, -36, -29.5, 5); fill(c, '#fff1d6'); hem(c, -29.5, 5); line(c, '#8a6a3a', 1.6);   // fur collar
        band(c, -17, -11.5, 5); fill(c, BRN_D);
      },
      front: function (c, P) {
        var b = P.sway * 1.6 + P.swing * 2.5, s;   // the plaits swing
        c.beginPath(); c.moveTo(-26, -50); c.bezierCurveTo(-29.5, -36, -25, -24, -16, -19);
        c.lineTo(-17.5 + b, -8); c.quadraticCurveTo(-13.5 + b, -1.5, -9.5 + b, -8); c.lineTo(-7, -17);
        c.quadraticCurveTo(0, -10.5, 7, -17); c.lineTo(9.5 + b, -8); c.quadraticCurveTo(13.5 + b, -1.5, 17.5 + b, -8); c.lineTo(16, -19);
        c.bezierCurveTo(25, -24, 29.5, -36, 26, -50); c.bezierCurveTo(18, -39.5, 9, -32, 0, -32);
        c.bezierCurveTo(-9, -32, -18, -39.5, -26, -50); c.closePath(); ink(c, '#f28c2e', '#96450a', 2.5);
        c.beginPath(); c.moveTo(25.5, -47); c.bezierCurveTo(28, -36, 24.5, -24.5, 16.5, -19.5); c.lineTo(17, -12);
        c.bezierCurveTo(13, -18, 17, -28, 19, -38); c.closePath(); fill(c, '#d86f1c');   // shadow side
        c.beginPath(); c.moveTo(-9, -27); c.quadraticCurveTo(-11, -21, -12, -17); c.moveTo(0, -26.5); c.lineTo(0, -15); c.moveTo(9, -27); c.quadraticCurveTo(11, -21, 12, -17);
        line(c, '#c9651a', 1.5);
        for (s = -1; s <= 1; s += 2) {
          rr(c, s * 13.5 + b - 4.3, -9.6, 8.6, 4.6, 2); ink(c, GOLD, GOLD_INK, 1.4);   // gold ties on the plaits
          c.beginPath(); c.moveTo(s * 1, -45.5); c.bezierCurveTo(s * 7, -47.5, s * 13, -45.5, s * 18.5, -40);
          c.bezierCurveTo(s * 12, -40.5, s * 6, -41.5, s * 1, -43.5); c.closePath(); ink(c, '#f9a03f', '#96450a', 1.5);   // moustache
        }
        var x = P.hl.x - 3, y = P.hl.y + 2;   // shield in the left hand
        dot(c, x, y, 13.6, STEEL_INK); dot(c, x, y, 11.8, STEEL); dot(c, x, y, 9.6, BRN_L);
        c.beginPath(); c.moveTo(x - 3.4, y - 9); c.lineTo(x - 3.4, y + 9); c.moveTo(x + 3.4, y - 9); c.lineTo(x + 3.4, y + 9); line(c, BRN, 1.4);   // planks
        c.beginPath(); c.arc(x, y, 10.7, 0.05 * PI, 0.6 * PI); line(c, STEEL_D, 2.2);
        c.beginPath(); c.arc(x, y, 10.7, 1.1 * PI, 1.45 * PI); line(c, STEEL_L, 1.6);
        dot(c, x, y, 4.4, STEEL_INK); dot(c, x, y, 3, STEEL_L);
      },
      hat: function (c) {
        for (var s = -1; s <= 1; s += 2) {   // horns
          c.beginPath(); c.moveTo(s * 25, -79); c.bezierCurveTo(s * 40, -79, s * 49, -92, s * 46.5, -111);
          c.bezierCurveTo(s * 37, -101, s * 30, -95, s * 21, -91); c.closePath(); ink(c, s < 0 ? '#fff6e2' : '#f6e2bd', '#8a6a3a', 2.5);
          c.beginPath(); c.moveTo(s * 33, -82.5); c.quadraticCurveTo(s * 34, -88, s * 29.5, -92.5); c.moveTo(s * 40.5, -89.5); c.quadraticCurveTo(s * 40.5, -94, s * 37, -98);
          line(c, '#d9bd8c', 1.6);
        }
        c.beginPath(); c.moveTo(-27, -70); c.bezierCurveTo(-27, -92, -14, -100, 0, -100); c.bezierCurveTo(14, -100, 27, -92, 27, -70);
        c.quadraticCurveTo(0, -63, -27, -70); c.closePath();
        ink(c, grad(c, -22, -98, 24, -70, [STEEL_L, STEEL, STEEL_D]), STEEL_INK, 2.5);   // the iron dome
        c.beginPath(); c.moveTo(-27.4, -76.5); c.quadraticCurveTo(0, -69.5, 27.4, -76.5); c.lineTo(27, -70);
        c.quadraticCurveTo(0, -63, -27, -70); c.closePath(); ink(c, GOLD, GOLD_INK, 2);   // brow band
        rr(c, -3.6, -100.5, 7.2, 31, 3); ink(c, GOLD, GOLD_INK, 2);
        dot(c, -17, -71.6, 1.6, GOLD_INK); dot(c, 17, -71.6, 1.6, GOLD_INK);
        c.beginPath(); c.moveTo(-19, -88); c.quadraticCurveTo(-15, -95, -8, -97); line(c, 'rgba(255,255,255,0.75)', 2.2);
      } },

    // Pale face, slick dark hair, little fangs, a bow tie and a bat-wing cape with a tall collar.
    { id: 'vampire', name: 'Vampire', mouth: 'fangs', shell: '#f3eeff', line: '#40305f', blush: 'rgba(206,104,178,0.36)',
      sleeve: NIGHT, sleeveLine: NIGHT_INK, hands: WHITE, handLine: WHITE_INK, shoes: NIGHT, shoeLine: NIGHT_INK,
      back: function (c, P) {
        var sw = P.swing * 9, y = -3 - P.lift * 24, s;
        for (s = -1; s <= 1; s += 2) {   // the tall collar
          poly(c, [s * 20, -62, s * 45 + sw * 0.3, -99, s * 35, -50]); ink(c, NIGHT, NIGHT_INK, 2.5);
          poly(c, [s * 22, -60, s * 40 + sw * 0.3, -88, s * 32, -54]); fill(c, RED_D);
        }
        capePath(c, P, 46, -60, 4, 10); ink(c, NIGHT, NIGHT_INK, 2.6);
        c.beginPath(); c.moveTo(-19, -56); c.lineTo(19, -56);
        c.bezierCurveTo(35 + sw * 0.4, -42, 42 + sw, -26, 39 + sw, y - 9); c.quadraticCurveTo(sw, y - 15, -39 + sw, y - 9);
        c.bezierCurveTo(-42 + sw, -26, -35 + sw * 0.4, -42, -19, -56); c.closePath();
        fill(c, grad(c, -30, -56, 30, 0, ['#e04a57', '#b3202f', '#7d1630']));   // red lining
      },
      wear: function (c) {
        c.beginPath(); c.moveTo(-34, -92); c.lineTo(34, -92); c.lineTo(34, -64); c.quadraticCurveTo(15, -80, 0, -67.5);
        c.quadraticCurveTo(-15, -80, -34, -64); c.closePath(); fill(c, NIGHT);   // hair with a widow's peak
        c.beginPath(); c.moveTo(-17, -74.5); c.quadraticCurveTo(-9, -81, 1, -80); line(c, '#6a5890', 2);
        band(c, -33, 2, 5); fill(c, NIGHT);
        c.beginPath(); c.moveTo(-12, -31.6); c.quadraticCurveTo(0, -25.6, 12, -31.6); c.lineTo(0, -8); c.closePath(); fill(c, WHITE);   // shirt front
        dot(c, 0, -17.5, 1.5, NIGHT); dot(c, 0, -12.5, 1.5, NIGHT);
        poly(c, [-11, -33, -11, -22.5, -1, -27.6]); ink(c, RED, RED_INK, 1.6); poly(c, [11, -33, 11, -22.5, 1, -27.6]); ink(c, RED, RED_INK, 1.6);
        dot(c, 0, -27.6, 3.3, RED_INK); dot(c, 0, -27.6, 2.2, RED_L);   // bow tie
      } },

    // Checked hunting cap, tan coat and a big magnifying glass.
    { id: 'detective', name: 'Detective', sleeve: '#d2ab72', sleeveLine: '#6b4a1e', hands: '#7a4c24', handLine: BRN_INK, shoes: BRN, shoeLine: BRN_INK,
      wear: function (c) {
        band(c, -33, 2, 5); fill(c, '#d2ab72');
        c.beginPath(); c.moveTo(-8, -31); c.quadraticCurveTo(0, -27.4, 8, -31); c.lineTo(0, -17.5); c.closePath(); fill(c, '#fffaf0');   // shirt and tie
        poly(c, [-2.3, -27.6, 2.3, -27.6, 2.8, -22, 0, -18.5, -2.8, -22]); ink(c, RED_D, RED_INK, 1.2);
        poly(c, [-8, -31.4, -0.6, -18.6, -6.5, -14.5, -18.5, -27, -16, -34]); ink(c, '#e6c793', '#6b4a1e', 1.6);   // lapels, folded back
        poly(c, [8, -31.4, 0.6, -18.6, 6.5, -14.5, 18.5, -27, 16, -34]); ink(c, '#c79d62', '#6b4a1e', 1.6);
        band(c, -15, -10, 5); fill(c, '#a37f48'); hem(c, -15, 5); line(c, '#6b4a1e', 1.3); hem(c, -10, 5); line(c, '#6b4a1e', 1.3);
        rr(c, -4.6, -11.6, 9.2, 7.4, 2); ink(c, GOLD, GOLD_INK, 1.6);
        dot(c, -21, -19, 1.8, '#6b4a1e'); dot(c, 21, -19, 1.8, '#6b4a1e');
      },
      front: function (c, P) {
        var hx = P.hr.x, hy = P.hr.y, x = hx + 5, y = hy - 17;   // magnifying glass in the right hand
        c.beginPath(); c.moveTo(hx, hy + 1); c.lineTo(hx + 2.6, hy - 7); line(c, BRN_INK, 6.6); line(c, '#b9824a', 3.6);
        dot(c, x, y, 10.8, 'rgba(186,230,255,0.5)');
        c.beginPath(); c.arc(x, y, 10.8, 0, 2 * PI); line(c, GOLD_INK, 5); line(c, GOLD, 2.4);
        c.beginPath(); c.arc(x, y, 6.6, 1.05 * PI, 1.5 * PI); line(c, 'rgba(255,255,255,0.95)', 2.2);
        dot(c, x + 3.6, y + 4, 1.5, 'rgba(255,255,255,0.7)');
      },
      hat: function (c) {
        var TAN = '#cfa86c', TAN_INK = '#6b4a1e', s;
        for (s = -1; s <= 1; s += 2) { oval(c, s * 21, -85, 6.6, 11.5, s * 0.32); ink(c, s < 0 ? '#dcb97f' : '#b89055', TAN_INK, 2.2); }   // ear flaps, tied up
        c.beginPath(); c.moveTo(-25, -72); c.bezierCurveTo(-26, -94, -13, -102, 0, -102); c.bezierCurveTo(13, -102, 26, -94, 25, -72);
        c.quadraticCurveTo(0, -66, -25, -72); c.closePath(); ink(c, grad(c, -20, -100, 22, -72, ['#e6c692', TAN, '#b08a50']), TAN_INK, 2.5);
        c.beginPath(); c.moveTo(-9, -100.5); c.quadraticCurveTo(-13, -86, -11.5, -70.6); c.moveTo(9, -100.5); c.quadraticCurveTo(13, -86, 11.5, -70.6);
        c.moveTo(-24.5, -84); c.quadraticCurveTo(0, -78.5, 24.5, -84); c.moveTo(-19, -94.5); c.quadraticCurveTo(0, -90, 19, -94.5);
        line(c, 'rgba(120,84,36,0.5)', 1.5);   // the check pattern
        c.beginPath(); c.moveTo(-20, -71.5); c.quadraticCurveTo(0, -57.5, 20, -71.5); c.quadraticCurveTo(0, -66.5, -20, -71.5); c.closePath();
        ink(c, '#b08a50', TAN_INK, 2.2);   // the peak
        oval(c, -5, -103.5, 4.6, 3, -0.4); ink(c, '#8a5a2b', BRN_INK, 1.5); oval(c, 5, -103.5, 4.6, 3, 0.4); ink(c, '#8a5a2b', BRN_INK, 1.5);
        dot(c, 0, -102.6, 2.2, BRN_INK);
      } },

    // Wrapped in bandages from top to toe, with glowing eyes and loose ends that flutter.
    { id: 'mummy', name: 'Mummy', eyes: 'glow', mouth: 'stitch', blush: false, browY: -10.5, shell: '#f1e8cf', line: '#7b6a45', gloss: 0.22,
      sleeve: '#f1e8cf', sleeveLine: '#7b6a45', legs: '#f1e8cf', legLine: '#7b6a45', shoes: '#e9dfc2', shoeLine: '#7b6a45', sole: '#cdbf98',
      wear: function (c) {
        var W = [-80, -75, -73, -78, -40, -44.5, -36, -30, -27, -31, -21, -15.5, -12, -16, -7, -4], i;   // each bandage edge: height at left, at right
        c.beginPath(); c.moveTo(-36, -36); c.quadraticCurveTo(0, -25, 36, -30); c.lineTo(36, -31); c.quadraticCurveTo(0, -17, -36, -27); c.closePath();
        fill(c, '#e2d6b2');   // a few strips are a shade darker
        c.beginPath(); c.moveTo(-36, -80); c.quadraticCurveTo(0, -72, 36, -75); c.lineTo(36, -78); c.quadraticCurveTo(0, -70, -36, -73); c.closePath();
        fill(c, '#e2d6b2');
        c.beginPath(); c.moveTo(-36, -12); c.quadraticCurveTo(0, -6, 36, -16); c.lineTo(36, -4); c.quadraticCurveTo(0, 2, -36, -7); c.closePath();
        fill(c, '#e2d6b2');
        c.beginPath();
        for (i = 0; i < W.length; i += 2) { c.moveTo(-36, W[i]); c.quadraticCurveTo(0, (W[i] + W[i + 1]) / 2 + 8, 36, W[i + 1]); }
        line(c, '#a8976a', 1.6);
        c.beginPath(); c.moveTo(-27, -63); c.quadraticCurveTo(0, -66.5, 27, -65.5); c.lineTo(26, -47.5); c.quadraticCurveTo(0, -42, -26, -48.5); c.closePath();
        ink(c, '#3b2f4a', '#7b6a45', 1.8);   // the dark gap the eyes look out of
      },
      front: function (c, P) {
        var f = P.flap, g = P.flap2, up = P.lift * 12, sw = P.swing * 6, hx = P.hr.x, hy = P.hr.y;   // loose ends flutter
        ribbon(c, hx, hy + 3, hx + 8 + sw, hy + 9 + f * 2 - up * 0.5, hx + 4 + sw + g * 3, hy + 19 - up, '#f1e8cf', '#7b6a45', 2.2);   // thinner than an arm, so they are not taken for one
        ribbon(c, -24, -14, -33 + sw, -13 + f * 2 - up * 0.4, -36 + sw + g * 3, -3 - up, '#f1e8cf', '#7b6a45', 2.2);
      } }
  ];

  var BY_ID = {};
  for (var i = 0; i < LIST.length; i++) BY_ID[LIST[i].id] = LIST[i];

  // ── the face ─────────────────────────────────────────────────────────
  // A dizzy spiral, for the eyes of an egg that has just cracked.
  function swirl(c, x, y, r, turn, col, w) {
    c.beginPath();
    for (var i = 0; i <= 14; i++) {
      var a = turn + i * 0.62, d = r * i / 14;
      if (i) c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); else c.moveTo(x, y);
    }
    line(c, col, w);
  }

  // Eyebrows tilted up in the middle: the clearest sign of worry at a glance.
  function brows(c, y, col, w) {
    c.beginPath(); c.moveTo(-17.5, y + 3.6); c.lineTo(-5.5, y); c.moveTo(17.5, y + 3.6); c.lineTo(5.5, y); line(c, col, w);
  }

  function drawFace(c, cos, P) {
    var eyes = cos.eyes || 'dot', mouth = cos.mouth || 'smile';
    var worried = P.worried, cracked = P.cracked, t = P.t;
    var ex = 11, ey = -54, look = P.lean * 1.3;   // the eyes glance the way the egg is sliding…
    var lookY = P.air > 0 ? -P.vy * 1.1 : 0;   // …and up as it rises, down as it falls
    var my = cos.mouthY || 0, s, x;

    // Rosy cheeks.
    if (cos.blush !== false) {
      c.fillStyle = cos.blush || 'rgba(255,122,134,0.42)';
      x = cos.blushX || 20;
      oval(c, -x, -44.5, 5.4, 3.8); c.fill(); oval(c, x, -44.5, 5.4, 3.8); c.fill();
    }

    // Eyes.
    for (s = -1; s <= 1; s += 2) {
      x = s * ex;
      if (eyes === 'patch' && s < 0) continue;   // under the pirate's patch
      if (eyes === 'led') {   // the robot's eyes are lights on its screen
        if (cracked) {
          c.globalAlpha *= Math.floor(t / 90) % 3 ? 1 : 0.45;   // flickering
          c.beginPath(); c.moveTo(x - 4.5, ey - 4.5); c.lineTo(x + 4.5, ey + 4.5); c.moveTo(x + 4.5, ey - 4.5); c.lineTo(x - 4.5, ey + 4.5);
          line(c, '#ff7a5e', 3); c.globalAlpha = P.alpha;
        } else if (P.blink) { rr(c, x - 5.2, ey - 0.6, 10.4, 2.6, 1.3); fill(c, '#5ee6ff'); }
        else if (worried) {
          poly(c, [x - s * 5.2, ey - 7, x + s * 5.2, ey - 2.6, x + s * 5.2, ey + 5.5, x - s * 5.2, ey + 5.5]); fill(c, '#ffb02e');
          rr(c, x - 2.4, ey - 1, 4.8, 4, 1.4); fill(c, '#fff1c9');
        } else {
          rr(c, x - 5.2, ey - 5.8, 10.4, 11.4, 3.2); fill(c, '#5ee6ff'); rr(c, x - 2.8 + look, ey - 3.6, 5.2, 4.6, 1.6); fill(c, '#e2fcff');
        }
      } else if (cracked) {
        swirl(c, x, ey, 6.2, s * t * 0.004, eyes === 'glow' ? YEL : INK, 2.2);
      } else if (eyes === 'glow') {   // the mummy's eyes shine out of the dark
        dot(c, x, ey, 8.4, 'rgba(255,212,59,0.2)');
        if (P.blink) { c.beginPath(); c.moveTo(x - 5, ey); c.lineTo(x + 5, ey); line(c, YEL, 2.6); continue; }
        oval(c, x, ey, worried ? 5.8 : 5.2, worried ? 6.8 : 5.6); fill(c, YEL);
        oval(c, x + look, ey + 0.6 + lookY, worried ? 1.7 : 2.3, worried ? 2 : 2.8); fill(c, '#3b2f4a');
        dot(c, x - 1.8, ey - 2.2, 1.5, '#fffbe0');
      } else if (P.blink) {
        c.beginPath(); c.moveTo(x - 4.8, ey + 0.4); c.quadraticCurveTo(x, ey + 3.6, x + 4.8, ey + 0.4); line(c, INK, 2.6);
      } else if (eyes === 'white' || worried) {   // wide eyes: the white shows all round a small pupil
        var jx = worried ? Math.sin(t * 0.05) * 0.7 : 0;
        oval(c, x, ey, worried ? 6.3 : 6.6, worried ? 7.3 : 6.3); ink(c, WHITE, INK, 2);
        oval(c, x + look * 1.5 + jx, ey + 0.6 + lookY, worried ? 2.3 : 3, worried ? 2.7 : 3.4); fill(c, INK);
        dot(c, x + look * 1.5 + jx - 1, ey - 0.6 + lookY, 0.9, WHITE);
        if (cos.lids && !worried) {   // the ninja's keen, narrowed look
          poly(c, [x - 8, ey - 8, x + 8, ey - 8, x + 8, ey - 4.9 - s * 0.6, x - 8, ey - 4.9 + s * 0.6]); fill(c, cos.lids);
          c.beginPath(); c.moveTo(x - 6, ey - 4.9 + s * 0.45); c.lineTo(x + 6, ey - 4.9 - s * 0.45); line(c, INK, 2.4);
        }
      } else {   // the everyday eye: dark and shiny
        oval(c, x + look, ey + lookY, 4.8, 6); fill(c, INK);
        oval(c, x + look - 1.5, ey + lookY - 2.3, 1.8, 2.1); fill(c, WHITE);
        dot(c, x + look + 1.7, ey + lookY + 2.3, 0.9, 'rgba(255,255,255,0.75)');
      }
    }
    if (worried && eyes !== 'led') brows(c, ey + (cos.browY || -12.5), eyes === 'glow' ? '#f1e8cf' : INK, eyes === 'glow' ? 2.6 : 3);

    // Mouth.
    if (mouth === 'none') return;
    if (mouth === 'led') {
      c.beginPath();
      if (cracked) { c.moveTo(-9, -41); c.lineTo(-5, -43); c.lineTo(-1, -39.5); c.lineTo(3, -43); c.lineTo(9, -40); line(c, '#ff7a5e', 2.6); }
      else if (worried) { c.moveTo(-9, -39.5); c.lineTo(-4.5, -43.5); c.lineTo(0, -39.5); c.lineTo(4.5, -43.5); c.lineTo(9, -39.5); line(c, '#ffb02e', 2.6); }
      else { c.moveTo(-8.5, -44); c.quadraticCurveTo(0, -36.5, 8.5, -44); line(c, '#5ee6ff', 2.8); }
      return;
    }
    if (mouth === 'stitch') {   // the mummy's mouth is a gap between bandages
      c.beginPath();
      if (cracked) { c.moveTo(-8, -38.5); c.lineTo(-4, -41.5); c.lineTo(0, -38); c.lineTo(4, -41.5); c.lineTo(8, -38.5); }
      else if (worried) { c.moveTo(-8, -38); c.quadraticCurveTo(-4, -42.5, 0, -38.5); c.quadraticCurveTo(4, -34.5, 8, -38.5); }
      else { c.moveTo(-7.5, -41.5); c.quadraticCurveTo(0, -34.5, 7.5, -41.5); }
      line(c, '#4f4060', 2.6);
      return;
    }
    c.save(); c.translate(0, my);
    if (cracked) {   // a wobbly line with the tongue hanging out
      c.beginPath(); c.moveTo(-9, -40); c.quadraticCurveTo(-4.5, -44.5, 0, -40); c.quadraticCurveTo(4.5, -35.5, 9, -40); line(c, INK, 2.8);
      rr(c, 2, -39.6, 6.4, 7.6, 3.2); ink(c, '#ff8fa3', INK, 1.6);
    } else if (worried) {   // gritted teeth
      rr(c, -8.6, -45, 17.2, 8.6, 3.6); ink(c, WHITE, INK, 2.2);
      c.beginPath(); c.moveTo(-8, -40.7); c.lineTo(8, -40.7); c.moveTo(-3, -44.5); c.lineTo(-3, -37); c.moveTo(3, -44.5); c.lineTo(3, -37); line(c, INK, 1.3);
    } else {   // a wide open smile, wider still in mid-jump
      c.translate(0, -45.5); c.scale(1, 1 + 0.28 * P.air); c.translate(0, 45.5);
      c.beginPath(); c.moveTo(-9.6, -45.5); c.quadraticCurveTo(0, -42.3, 9.6, -45.5);
      c.quadraticCurveTo(8.6, -35.3, 0, -35.3); c.quadraticCurveTo(-8.6, -35.3, -9.6, -45.5); c.closePath();
      fill(c, '#7a2630');
      oval(c, 0, -38.3, 4.7, 2.3); fill(c, '#ff8fa3');
      if (mouth === 'fangs') {
        poly(c, [-6.8, -44.6, -2.6, -43.6, -4.6, -38.8]); fill(c, WHITE); poly(c, [6.8, -44.6, 2.6, -43.6, 4.6, -38.8]); fill(c, WHITE);
      }
      c.beginPath(); c.moveTo(-9.6, -45.5); c.quadraticCurveTo(0, -42.3, 9.6, -45.5);
      c.quadraticCurveTo(8.6, -35.3, 0, -35.3); c.quadraticCurveTo(-8.6, -35.3, -9.6, -45.5); c.closePath();
      line(c, INK, 2.2);
    }
    c.restore();
  }

  // ── arms, legs and shoes ─────────────────────────────────────────────
  // A bendy arm or leg: one curved stroke. With an `edge` colour it is a
  // sleeve or trouser leg (a coloured stroke on a darker, wider one);
  // without, it is the bare egg's thin dark limb.
  function limb(c, x0, y0, cx, cy, x1, y1, col, edge) {
    c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cx, cy, x1, y1);
    if (edge) { line(c, edge, 7.4); line(c, col, 4.4); } else line(c, col, 5.2);
  }
  function hand(c, cos, x, y) {
    var edge = cos.handLine || cos.sleeveLine;
    c.beginPath(); c.arc(x, y, 4.6, 0, 2 * PI);
    if (edge) ink(c, cos.hands || cos.sleeve, edge, 1.8); else fill(c, LIMB);
    dot(c, x - 1.4, y - 1.5, 1.4, 'rgba(255,255,255,0.35)');
  }
  // One shoe, seen a little from above. A lifted foot shows its paler sole,
  // which is what makes the run read as running at a glance.
  function shoe(c, cos, x, y, s, turn, soleUp) {
    var k = cos.shoeSize || 1, col = cos.shoes || LIMB, edge = cos.shoeLine || LIMB_INK, i;
    c.save(); c.translate(x, y); c.rotate(turn);
    if (cos.shoeStyle === 'block') rr(c, s * 1.5 - 7.5, -5, 15, 9.6, 3); else oval(c, s * 1.6 * k, 0, 8.2 * k, 5.2 * k);
    ink(c, col, edge, 2);
    if (soleUp) { oval(c, s * 1.6 * k, 0.5, 5.4 * k, 2.9 * k); fill(c, cos.sole || SOLE); }
    else { oval(c, s * 1.6 * k - 2.8 * k, -2 * k, 2.8 * k, 1.3 * k, -0.25); fill(c, 'rgba(255,255,255,0.4)'); }
    if (cos.shoeStyle === 'claw' && !soleUp) for (i = -1; i <= 1; i++) dot(c, s * 1.6 * k + i * 4.4, 3.6 * k - Math.abs(i) * 0.9, 1.4, WHITE);
    c.restore();
  }

  // ── the whole egg ────────────────────────────────────────────────────
  // What the costume layers are told about the pose. One object is reused
  // for every picture so that drawing makes no litter for the browser to tidy up.
  var P = { t: 0, mood: 'happy', worried: false, cracked: false, still: false, blink: false, air: 0, vy: 0, lean: 0, pace: 0,
            sway: 0,      // -1..1, rocking from foot to foot while running
            bounce: 0,    // 0..1, the up-and-down of each step
            flap: 0, flap2: 0,   // -1..1, two slow ripples for cloth and ribbons
            lift: 0,      // 0..1, how much loose things fly upward (most while falling)
            swing: 0,     // -1..1, loose things trailing behind a slide sideways
            alpha: 1,     // how see-through the whole egg is being drawn
            hl: { x: 0, y: 0 }, hr: { x: 0, y: 0 } };   // where the left and right hands are

  // Where the legs are in their run cycle. The cycle is carried forward by
  // however far the clock `t` moved since the last picture, at a speed that
  // depends on the pace. That way the legs quicken smoothly as the run speeds
  // up, and when the clock stops (a paused game) the legs stop dead.
  var stride = { t: null, at: 0 };

  // o.costume  costume id                 o.mood   happy | worried | cracked
  // o.t        animation clock (ms)       o.air    0 on the floor … 1 at the top of a jump
  // o.still    true for menu pictures (standing, not running)
  // o.vy       -1..1, + while rising      o.lean   -1..1, sliding left / right between lanes
  // o.pace     0..1, how fast the run is
  function drawEgg(c, o) {
    var cos = BY_ID[o.costume] || BY_ID.plain;
    var t = o.t || 0, air = clamp(o.air || 0, 0, 1), still = !!o.still;
    var cracked = o.mood === 'cracked', worried = o.mood === 'worried';
    var vy = clamp(o.vy || 0, -1, 1), lean = clamp(o.lean || 0, -1, 1), pace = clamp(o.pace || 0, 0, 1);
    var inAir = air > 0 && !cracked, running = !still && !cracked && !inAir;
    var s, i, a, x, y;

    var ph = 0;
    if (!still && !cracked) {
      var rate = 0.0175 + 0.0075 * pace, dt = t - stride.t;
      if (stride.t === null || dt < 0 || dt > 250) stride.at = t * rate; else stride.at += dt * rate;
      stride.t = t; ph = stride.at;
    }
    var step = running ? Math.sin(ph) : 0;   // -1..1: which foot is off the floor
    var up = Math.abs(step);   // 0 as a foot lands, 1 in mid-stride
    var tuck = inAir ? clamp(air * 2.2, 0, 1) : 0;   // how far the legs are tucked up in a jump
    tuck = tuck * tuck * (3 - 2 * tuck);

    // How the body sits: it bobs and rocks with each step, leans into a
    // slide, and slumps to one side once cracked.
    var bob = running ? up * (3.4 + 1.8 * pace) : still && !cracked ? (1 - Math.cos(t * 0.004)) * 0.7 : 0;
    var rot = lean * 0.11 + step * 0.06 + (cracked ? 0.07 + Math.sin(t * 0.0028) * 0.03 : 0);
    var sqx = running ? 1 - (up - 0.5) * 0.05 : 1, sqy = running ? 1 + (up - 0.5) * 0.06 : 1;
    var cr = Math.cos(rot), sr = Math.sin(rot);

    P.t = t; P.mood = o.mood || 'happy'; P.worried = worried; P.cracked = cracked; P.still = still;
    P.air = inAir ? air : 0; P.vy = vy; P.lean = lean; P.pace = pace;
    P.sway = step; P.bounce = up;
    P.flap = Math.sin(t * 0.011); P.flap2 = Math.sin(t * 0.017 + 1.3);
    P.lift = inAir ? clamp(0.25 * tuck - vy * 0.75, 0, 1) : 0;
    P.swing = -lean;
    P.blink = !worried && !cracked && (t + 1700) % 3900 < 120;
    P.alpha = c.globalAlpha;

    // Hands. Worked out first because some costumes hold things.
    var shY = cos.shoulder || -42;
    for (s = -1; s <= 1; s += 2) {
      if (cracked) { x = s * 43; y = -11; }
      else if (inAir && cos.fist) { x = s > 0 ? 36 : -39; y = s > 0 ? -34 - 40 * tuck : -25 - 3 * tuck; }   // the superhero flies fist first
      else if (inAir) { x = s * (41 + 1.5 * tuck); y = -25 - 39 * tuck - vy * 3; }
      else if (still) { x = s * 41; y = -24; }
      else { x = s * 40.5; y = -32 - s * step * (8 + 3 * pace); }
      if (!cracked) y += s * lean * 6;   // arms trail behind a slide sideways
      if (worried && !inAir) { x += s * 1.5; y -= 13 + Math.sin(t * 0.045 + s) * 1.5; }   // hands fly up in alarm
      if (s < 0) { P.hl.x = x; P.hl.y = y; } else { P.hr.x = x; P.hr.y = y; }
    }

    // Cracked: the egg sits in a puddle of its own yolk.
    if (cracked) {
      c.beginPath(); c.moveTo(-45, -2); c.bezierCurveTo(-49, -9, -31, -11, -22, -8.5); c.bezierCurveTo(-10, -12, 10, -12, 22, -8.5);
      c.bezierCurveTo(34, -11, 51, -8, 46, -1); c.bezierCurveTo(50, 5, 31, 9, 16, 7); c.bezierCurveTo(4, 11, -14, 10, -24, 7);
      c.bezierCurveTo(-37, 9, -51, 4, -45, -2); c.closePath(); ink(c, '#fffdf5', '#cdbd9c', 2);
      c.beginPath(); c.moveTo(-27, 0); c.bezierCurveTo(-27, -7, 24, -8, 27, -1); c.bezierCurveTo(29, 6, 10, 6.5, 2, 6);
      c.bezierCurveTo(-8, 8, -27, 6, -27, 0); c.closePath(); ink(c, '#ffc928', '#dd8e00', 2);
      oval(c, -15, 2.6, 6, 1.8, -0.1); fill(c, 'rgba(255,255,255,0.75)');
    }

    // Behind the egg.
    c.save(); c.translate(0, -bob); c.rotate(rot); c.scale(sqx, sqy);
    if (cracked) dizzyStars(c, t, false);
    if (cos.back) cos.back(c, P);
    c.restore();

    // Legs and shoes. The feet are placed on the floor; the hips ride on the body.
    for (s = -1; s <= 1; s += 2) {
      var hx = s * 9.5 * sqx, hy = -12 * sqy;
      var gx = hx * cr - hy * sr, gy = hx * sr + hy * cr - bob;
      var swing = running ? Math.sin(ph + (s > 0 ? PI : 0)) : 0, raise = Math.max(0, swing), fx, fy, turn = 0;
      if (cracked) { fx = s * 21; fy = 4; }
      else if (inAir) {   // knees out and feet up; they reach down again to land
        var reach = clamp(-vy, 0, 1) * (1 - air);
        fx = s * (11 + 13 * tuck * (1 - reach)); fy = -(1 + 8 * tuck) * (1 - reach); turn = s * 0.55 * tuck * (1 - reach);
      }
      else if (still) { fx = s * 11; fy = 0; }
      else { fx = s * (10.5 + 8.5 * raise + 2.5 * Math.min(0, swing)); fy = -raise * (8 + 3 * pace); turn = s * raise * 0.55; }   // each foot flicks up and out in turn
      if (cos.peg === s && !cracked) {   // the pirate's wooden leg
        c.beginPath(); c.moveTo(gx, gy); c.lineTo(fx, fy - 2.5); line(c, BRN_INK, 8); line(c, BRN_L, 5);
        c.beginPath(); c.moveTo(gx - 0.8, gy + 3); c.lineTo(fx - 0.8, fy - 4.5); line(c, 'rgba(255,255,255,0.35)', 1.2);
        c.beginPath(); c.moveTo(fx - 3.4, fy - 1.5); c.lineTo(fx + 3.4, fy - 1.5); line(c, BRN_INK, 3.4);
        continue;
      }
      limb(c, gx, gy, (gx + fx) / 2 + s * (2 + 2 * raise + 3 * tuck), (gy + fy - 4.5) / 2 + 2 * tuck, fx, fy - 4.5, cos.legs || LIMB, cos.legLine);
      if (cracked) {   // sitting: the soles face us
        oval(c, fx, fy - 6, 6.6 * (cos.shoeSize || 1), 7.8 * (cos.shoeSize || 1), s * 0.25); ink(c, cos.shoes || LIMB, cos.shoeLine || LIMB_INK, 2);
        oval(c, fx, fy - 5.6, 4.2 * (cos.shoeSize || 1), 5.4 * (cos.shoeSize || 1), s * 0.25); fill(c, cos.sole || SOLE);
      } else shoe(c, cos, fx + s * 0.6, fy - 4.4, s, turn, raise > 0.45);
    }

    c.save(); c.translate(0, -bob); c.rotate(rot); c.scale(sqx, sqy);

    // Arms, behind the shell so the shoulders are hidden.
    for (s = -1; s <= 1; s += 2) {
      var H = s < 0 ? P.hl : P.hr, sx0 = s * 27;
      limb(c, sx0, shY, (sx0 + H.x) / 2 + s * 4.5, (shY + H.y) / 2 + 4, H.x, H.y, cos.sleeve || LIMB, cos.sleeveLine);
      hand(c, cos, H.x, H.y);
    }

    // The shell: its own colour, then anything worn, then the shading that
    // makes it round, then the outline.
    shellPath(c);
    fill(c, typeof cos.shell === 'function' ? cos.shell(c) : cos.shell || SHELL);
    c.save(); shellPath(c); c.clip();
    if (cos.wear) cos.wear(c, P);
    if (cracked) {   // yolk running out of the crack
      c.beginPath(); c.moveTo(16.5, -24); c.quadraticCurveTo(22.5, -24.5, 23.5, -19); c.quadraticCurveTo(24, -11.5, 20, -10);
      c.quadraticCurveTo(16.5, -10.5, 17.5, -17); c.closePath(); ink(c, '#ffc928', '#dd8e00', 1.5);
    }
    roundShade(c, cos.shade === undefined ? 0.85 : cos.shade);
    c.beginPath(); c.moveTo(26.6, -31); c.bezierCurveTo(26.6, -20, 18, -11.6, 7, -10.4); line(c, 'rgba(255,240,208,0.42)', 2.2);   // light bounced up off the floor
    a = cos.gloss === undefined ? 1 : cos.gloss;   // the shine, upper left
    c.globalAlpha = P.alpha * a;
    oval(c, -13.5, -68, 5.6, 9.4, 0.5); fill(c, 'rgba(255,255,255,0.78)');
    dot(c, -19.5, -55, 2.2, 'rgba(255,255,255,0.6)');
    c.globalAlpha = P.alpha;
    c.restore();
    shellPath(c); line(c, cos.line || SHELL_INK, 3);

    if (cracked) {   // the cracks: dark, with a pale edge so they show on dark costumes too
      for (i = 0; i < 2; i++) {
        c.beginPath(); c.moveTo(-4.4 + i * 1.4, -84.5); c.lineTo(2.6 + i * 1.4, -76); c.lineTo(-5.4 + i * 1.4, -70); c.lineTo(-0.4 + i * 1.4, -65);
        c.moveTo(2.6 + i * 1.4, -76); c.lineTo(8.6 + i * 1.4, -73.5); c.moveTo(26.6 + i * 1.4, -30); c.lineTo(18 + i * 1.4, -24.5); c.lineTo(21 + i * 1.4, -19.5);
        line(c, i ? INK : 'rgba(255,255,255,0.6)', 2);
      }
    }
    drawFace(c, cos, P);
    if (cos.front) cos.front(c, P);
    if (cos.hat) {   // hats lag a little behind the head, and sit askew after a crack
      c.save(); c.translate(0, -80);
      c.rotate(-lean * 0.07 - step * 0.02 + (cracked ? 0.15 : 0));
      c.translate(cracked ? 2 : 0, 80 - P.lift * 3.5 - (cracked ? 2.5 : 0));
      cos.hat(c, P); c.restore();
    }
    if (cracked) dizzyStars(c, t, true);
    c.restore();
  }

  // Shading that makes the shell, and anything worn on it, look round: it
  // darkens toward the lower right, away from the light. It darkens by
  // multiplying colours (white goes lilac, red goes deep red, yellow goes
  // amber) so shadows keep their colour instead of turning grey.
  function roundShade(c, strength) {
    var was = c.globalCompositeOperation, alpha = c.globalAlpha;
    c.globalCompositeOperation = 'multiply';
    c.globalAlpha = alpha * strength;
    c.fillStyle = c.globalCompositeOperation === 'multiply'
      ? radial(c, -13, -64, 12, 70, ['rgba(148,130,214,0)', 'rgba(148,130,214,0.2)', 'rgba(148,130,214,0.8)'])
      : radial(c, -13, -64, 12, 70, ['rgba(72,44,140,0)', 'rgba(72,44,140,0.07)', 'rgba(72,44,140,0.3)']);   // for a browser that cannot multiply
    c.fillRect(-32, -87, 64, 82);
    c.globalCompositeOperation = was; c.globalAlpha = alpha;
  }

  // Three little stars circling the head of a dazed egg. Each is drawn
  // either before the egg (when it is round the back) or after it.
  function dizzyStars(c, t, inFront) {
    for (var i = 0; i < 3; i++) {
      var a = t * 0.0042 + i * 2.094, depth = Math.sin(a);
      if ((depth > 0) !== inFront) continue;
      star(c, Math.cos(a) * 30, -93 + depth * 7, 5.2 + depth * 1.2, 5); ink(c, YEL, YEL_INK, 1.4);
    }
  }

  var api = { LIST: LIST, BY_ID: BY_ID, drawEgg: drawEgg,
              ids: LIST.map(function (x) { return x.id; }) };
  root.ER = root.ER || {};
  root.ER.costumes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
