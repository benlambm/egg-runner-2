/*
 * Egg Runner 2 — fitting the picture to a screen.
 *
 * The 3D look is the old arcade trick: every thing is a flat picture, drawn
 * smaller and nearer the horizon the farther away it is. One formula does it:
 *
 *     size on screen = sp * CAM_BACK / (CAM_BACK + distance ahead of the egg)
 *
 * Screen size only changes how big the picture is and how much kitchen shows
 * around the track. It never changes how far ahead you can see (SEE_AHEAD).
 * No browser code here, so the checks can test any screen size.
 */
(function (root) {
  'use strict';

  var BASE = (typeof module !== 'undefined' && module.exports)
    ? require('./tuning.js') : root.ER.TUNING;

  // Work out the camera for a screen of w by h pixels.
  function layout(w, h, T) {
    T = T || BASE;
    // A hidden or not-yet-measured page can report a size of zero (or
    // nothing at all). Treat any size that is not a real one as a single
    // pixel, so every number below is usable instead of "not a number".
    if (!(w >= 1 && w < Infinity)) w = 1;
    if (!(h >= 1 && h < Infinity)) h = 1;
    var sp = Math.min(w / T.VIEW_FIT[0], h / T.VIEW_FIT[1]);   // pixels per unit at the egg
    // The last spare in the line is the nearest thing that must stay on screen.
    var nearest = T.TRAIL_GAP * T.MAX_SPARES;
    var nearRatio = T.CAM_BACK / (T.CAM_BACK - nearest);
    var bottomPad = h * 0.04;
    var vanishY = h * T.HORIZON;
    var camH = (h - bottomPad - vanishY) / (nearRatio * sp);
    if (camH > T.CAM_HEIGHT[1] || camH < T.CAM_HEIGHT[0]) {
      camH = Math.max(T.CAM_HEIGHT[0], Math.min(T.CAM_HEIGHT[1], camH));
      vanishY = h - bottomPad - camH * nearRatio * sp;
    }
    var L = {
      w: w, h: h, cx: w / 2, sp: sp, camH: camH, camBack: T.CAM_BACK, vanishY: vanishY,
      seeAhead: T.SEE_AHEAD
    };
    L.farS = sp * T.CAM_BACK / (T.CAM_BACK + T.FAR_WALL);   // scale at the back wall
    L.farY = vanishY + camH * L.farS;                        // where floor meets wall
    L.eggY = vanishY + camH * sp;                            // the egg's feet
    // The dog runs beside the track where there is room, and tucks in on
    // narrow screens so it is always fully visible.
    var dogS = sp * T.CAM_BACK / (T.CAM_BACK + T.DOG_AHEAD);
    var room = (w / 2 - 72 * dogS - 4) / dogS;
    L.dogX = Math.max(150, Math.min(T.DOG_SIDE, room));
    return L;
  }

  // World position (x across, y up, z ahead of the egg) to screen pixels.
  // Returns scale too: one world unit at that depth is `s` pixels.
  function project(L, x, y, z) {
    var s = L.sp * L.camBack / (z + L.camBack);
    return { x: L.cx + x * s, y: L.vanishY + (L.camH - y) * s, s: s };
  }

  var api = { layout: layout, project: project };
  root.ER = root.ER || {};
  root.ER.view = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
