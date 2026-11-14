/*
 * Egg Runner 2 — every tuning number, in one place.
 *
 * Change a number here, reload, and the game plays differently. Nothing else
 * needs editing. After a change, run `npm test`: a few checks describe limits
 * that keep the game fair (for example, that obstacles are never spaced closer
 * than one jump), and they will tell you if a number has broken one.
 *
 * Units used throughout:
 *   distance  "units". One lane is 120 units wide and the egg is about 80
 *             units tall. 120 units = 1 foot on the distance readout.
 *   time      milliseconds (names end in _MS)
 *   speed     units per second
 */
(function (root) {
  'use strict';

  var TUNING = {

    // ── PACE ────────────────────────────────────────────────────────────
    // The run starts gently and speeds up with distance, up to a top speed.
    START_SPEED: 330,          // speed at the very start of a run
    TOP_SPEED: 900,            // the fastest it ever gets
    SPEED_GAIN: 0.006,         // speed added per unit travelled. Smaller = gentler
                               // ramp. At 0.006 top speed arrives after ~790 feet
                               // (about 2 minutes 50 seconds).

    // ── SCORE ───────────────────────────────────────────────────────────
    UNITS_PER_FOOT: 120,       // distance readout: units in one foot
    UNITS_PER_POINT: 10,       // one point for every this many units travelled
    EGG_POINTS: 25,            // points for every egg collected (whole or golden)

    // ── MOVING ──────────────────────────────────────────────────────────
    LANE_WIDTH: 120,           // distance between lane centres
    LANE_SLIDE_MS: 85,         // how quickly the egg is DRAWN sliding to its new
                               // lane. Looks only: the rules count the egg as in
                               // the new lane the instant you press.

    // ── JUMP ────────────────────────────────────────────────────────────
    // Air time = 2 * JUMP_SPEED / GRAVITY  (583 ms with these numbers).
    // Height   = JUMP_SPEED² / (2 * GRAVITY) (122 units, about 1.5 eggs).
    GRAVITY: 2880,             // units per second, per second
    JUMP_SPEED: 840,           // upward speed at take-off
    JUMP_BUFFER_MS: 140,       // EARLY press: a jump pressed this long before
                               // landing still fires, on the landing frame
    LATE_JUMP_GRACE_MS: 90,    // LATE press: a flat obstacle may already be
                               // touching the egg for this long and a jump still
                               // clears it

    // ── OBSTACLES ───────────────────────────────────────────────────────
    FIRST_OBSTACLE_MS: 3200,   // quiet time at the start of every run
    // Hit sizes, measured along the track. Smaller = more forgiving.
    PLAYER_HALF_DEPTH: 20,     // the egg, front to back
    TALL_HALF_DEPTH: 16,       // toaster, blender, milk carton
    FLAT_HALF_DEPTH: 14,       // knife on the floor, pat of butter
    FLAT_CLEAR_HEIGHT: 18,     // the egg clears a flat obstacle when it is at
                               // least this high off the floor
    FLAT_CHANCE: 0.42,         // share of obstacles that are flat (jumpable)

    // Spacing between rows of obstacles. A gap is never shorter than the
    // larger of these two, measured as travel time at the current speed:
    GAP_JUMP_SAFETY: 1.15,     //   one full jump (take-off to landing) times this
    GAP_REACTION_MS: 620,      //   a fixed reaction time
    // …plus a random extra. Early in the run the extra is large; at top
    // speed it shrinks to the second pair.
    GAP_EXTRA_START_MS: [350, 1000],   // extra gap at the start (least, most)
    GAP_EXTRA_TOP_MS: [60, 520],       // extra gap at top speed (least, most)
    GAP_TWO_LANE_EXTRA_MS: 420,   // added when the only way through needs two
                                  // lane changes in a row

    // Rows that block two lanes at once (one lane is always left open).
    DOUBLE_ROW_CHANCE_START: 0.10,     // chance at the start of a run
    DOUBLE_ROW_CHANCE_TOP: 0.45,       // chance at top speed

    // ── CLOSE CALLS ─────────────────────────────────────────────────────
    CLOSE_CALL_SWITCH_MS: 260, // leaving a lane this soon before an obstacle
                               // arrives in it counts as a close call
    SWEAT_MS: 1000,            // worried face and sweat drops last this long
    CALM_MS: [10000, 20000],   // then the egg stays calm for this long

    // ── EGGS AND SPARES ─────────────────────────────────────────────────
    MAX_SPARES: 5,             // most spare eggs you can carry
    EGG_REACH: 38,             // how close (along the track) the egg must pass
                               // to grab an egg. Height does not matter.
    EGG_SPACING: 86,           // distance between eggs in a row
    EGG_GROUP_GAP_MS: [900, 2100],  // travel time between groups of eggs
    EGG_ROW_CHANCE: 0.55,      // share of ordinary groups that are a short row
                               // (the rest are a single egg)
    EGG_ROW_LENGTH: [3, 5],    // eggs in a short row. Short rows are never golden.
    // Golden eggs only ever come at the end of a longer chain of whole eggs.
    GOLDEN_CHAIN_LENGTH: [6, 8],      // eggs in a chain, counting the golden one
    GOLDEN_FIRST_MS: 15000,           // no golden chain arrives before this
    GOLDEN_CHAIN_CHANCE_START: 0.04,  // share of egg groups that are a golden
                                      // chain early in a run…
    GOLDEN_CHAIN_CHANCE_TOP: 0.15,    // …rising to this at top speed
    EGG_CLEAR_BEFORE_MS: 300,  // no tall obstacle in an egg row's lane this long
                               // before its first egg…
    EGG_CLEAR_AFTER: 90,       // …or this far (units) after its last

    // ── GETTING HIT ─────────────────────────────────────────────────────
    BLINK_MS: 1500,            // after a hit: blinking, and nothing can hurt you

    // ── THE DOG ─────────────────────────────────────────────────────────
    DOG_FIRST_MS: [25000, 40000],   // first visit lands in this window; never
                                    // earlier than the first number
    DOG_BETWEEN_MS: [25000, 45000], // quiet time between visits
    DOG_WARN_MS: 1000,         // paw prints and bark this long before it arrives
    DOG_STAY_MS: 10000,        // it runs alongside for exactly this long
    DOG_FIRST_SNAP_MS: 1300,   // it never snaps sooner than this after arriving
    DOG_WINDUP_MS: 420,        // visible wind-up before every snap
    DOG_SNAP_MS: 160,          // how long the jaws stay shut (looks only: the
                               // bite itself is one instant, when wind-up ends)
    DOG_BITE_LANES: 2,         // how many lanes a snap reaches, counted from the
                               // dog's side: 2 = its own lane and the middle
                               // lane, so only the far lane (or a jump) is safe.
                               // 1 = its own lane only.
    DOG_IDLE_MS: [1100, 1700], // pause between snaps (so a snap lands roughly
                               // every 1.7 to 2.3 seconds)
    // The track is kept clear of obstacles around every snap, so there is
    // always a way out: from a little before the wind-up starts…
    DOG_CLEAR_BEFORE: 60,      //   (units)
    DOG_CLEAR_AFTER_MS: 650,   // …until this long after the snap

    // ── CHOPPING KNIVES ─────────────────────────────────────────────────
    KNIFE_FIRST_MS: [32000, 44000],   // first knives appear in this window
    KNIFE_BETWEEN_MS: [11000, 21000], // travel time between sets of knives
    KNIFE_EASY_GATES: 2,       // the first this-many sets are a single knife
    // After that, chance of 1, 2 or 3 knives in a set. Three knives cover
    // every lane: no sure way past, only luck (and spares).
    KNIFE_COUNT_CHANCE: [0.35, 0.42, 0.23],
    // Each knife's rhythm, re-rolled every chop so it is uneven:
    KNIFE_UP_MS: [600, 1500],  // waits raised for this long
    KNIFE_CHOP_MS: 120,        // comes down this fast
    KNIFE_DOWN_MS: [200, 380], // stays down this long
    KNIFE_RISE_MS: 320,        // takes this long to lift again
    KNIFE_DANGER_BELOW: 0.35,  // the blade can hit while it is lower than this
                               // (0 = fully down, 1 = fully raised)
    KNIFE_HALF_DEPTH: 14,      // how long (units of track) the egg is "under" it
    // No obstacles near a set of knives, so you are free to pick a lane:
    KNIFE_CLEAR_BEFORE_MS: 950,        // clear run-up before the knives
    KNIFE_CLEAR_AFTER_MS: 650,         // clear stretch after them
    KNIFE_DOG_GAP_MS: 1800,    // knives and the dog are kept this far apart

    // ── ENDING ──────────────────────────────────────────────────────────
    ENDING_ZOOM_MS: 2000,      // slow zoom on the egg before the results show
    ENDING_ZOOM: 1.7,          // how far it zooms in

    // ── THE VIEW (same on every screen size) ────────────────────────────
    SEE_AHEAD: 2600,           // things appear this far ahead of the egg. This
                               // is the warning distance. Screen size never
                               // changes it.
    FADE_IN: 380,              // …and fade in over this distance
    FAR_WALL: 3100,            // where the floor meets the kitchen's back wall
    CAM_BACK: 600,             // camera distance behind the egg
    // How the picture is fitted to a screen. The track is sized so that a
    // screen VIEW_FIT[0] units wide and VIEW_FIT[1] units tall just holds it;
    // anything larger shows more kitchen around it, never more track.
    VIEW_FIT: [420, 640],
    HORIZON: 0.25,             // vanishing point, as a share of screen height
    CAM_HEIGHT: [300, 470],    // camera height limits; tall screens look down
                               // from higher up
    DOG_AHEAD: 150,            // the dog is drawn this far ahead of the egg…
    DOG_SIDE: 268,             // …and this far out from the track centre, or
                               // closer in when a narrow screen needs it
    DESPAWN_BEHIND: 660,       // things are forgotten this far behind the egg

    // ── SPARES TRAIL (looks only) ───────────────────────────────────────
    TRAIL_GAP: 40,             // distance between ducklings in the line
    TRAIL_DELAY_MS: 95,        // each one copies the egg this much later

    // ── THE FAR KITCHEN (looks only) ────────────────────────────────────
    BACKDROP_LOOP_MS: 240000,  // the far end of the kitchen changes slowly and
                               // then repeats (morning, afternoon, sunset,
                               // night, morning…). One full loop takes this long.

    // ── MUSIC ───────────────────────────────────────────────────────────
    MUSIC_BPM: [118, 130],     // beats per minute at the start of a run, and at
                               // top speed
    MUSIC_VOLUME: 0.5,         // how loud the tune is next to the sound effects
                               // (0 = silent, 1 = as loud as the effects)

    // ── INTERNAL ────────────────────────────────────────────────────────
    STEP_MS: 1000 / 120        // the rules tick 120 times a second
  };

  // Derived, not tuned: air time of one full jump, in milliseconds.
  TUNING.JUMP_AIR_MS = 2 * TUNING.JUMP_SPEED / TUNING.GRAVITY * 1000;

  root.ER = root.ER || {};
  root.ER.TUNING = TUNING;
  if (typeof module !== 'undefined' && module.exports) module.exports = TUNING;
})(typeof self !== 'undefined' ? self : globalThis);
