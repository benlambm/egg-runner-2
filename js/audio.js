/*
 * Egg Runner 2 — sound.
 *
 * Every sound is made in code with the Web Audio API; there are no sound
 * files. Browsers only allow sound after the player has touched or pressed
 * something, so unlock() is called from the first tap or key press.
 *
 * Two parts: short sound effects (SOUNDS), and the tune that plays while you
 * run (createMusic), a boogie-style retro dance track.
 */
(function (root) {
  'use strict';

  var T = (root.ER && root.ER.TUNING) || {};
  var ac = null, master = null, musicGain = null, music = null, noiseBuf = null;
  var soundOn = true, musicOn = true, musicTimer = null, pace = 0;
  var asleep = false;            // true from sleep() until the next wake()
  var MAIN_VOLUME = 0.9;         // everything (tune and effects) passes through this on its way out

  function musicVolume() { return T.MUSIC_VOLUME === undefined ? 0.5 : T.MUSIC_VOLUME; }

  // The browser answers "pause sound" and "carry on" with a promise that can
  // fail (for example when it wants a tap first). Sound is never worth an
  // error, so a failure is ignored; the next tap or key press tries again.
  function quietly(promise) {
    if (promise && promise.catch) promise.catch(function () { /* try again on the next tap */ });
  }

  function unlock() {
    if (!ac) {
      var Ctor = root.AudioContext || root.webkitAudioContext;
      if (!Ctor) return;
      try {
        ac = new Ctor();
        master = ac.createGain(); master.gain.value = MAIN_VOLUME; master.connect(ac.destination);
        musicGain = ac.createGain(); musicGain.gain.value = musicVolume(); musicGain.connect(master);
      } catch (e) { ac = null; return; }
    }
    wake();
  }

  // Let sound run again. Anything other than "running" needs waking: a phone
  // puts sound to sleep on its own for a call or the lock screen, and iPhones
  // call that "interrupted" rather than "suspended". `asleep` covers a wake
  // that comes straight after a sleep, before the browser has caught up.
  function wake() {
    if (!ac || !ac.resume || ac.state === 'closed') return;
    if (ac.state === 'running' && !asleep) return;
    asleep = false;
    try { quietly(ac.resume()); } catch (e) { /* stay silent */ }
  }
  // Silence everything while the game is paused or in the background.
  function sleep() {
    if (!ac || !ac.suspend || ac.state === 'closed') return;
    asleep = true;
    try { quietly(ac.suspend()); } catch (e) { /* nothing to pause */ }
  }

  // One second of hiss, made once and reused by every cymbal, clap and crack.
  function noiseBuffer(ctx) {
    var buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ── sound effects ────────────────────────────────────────────────────
  // One note: a tone that slides from f0 to f1 and fades out.
  function tone(type, f0, f1, dur, vol, when) {
    if (!ac) return;
    var t = ac.currentTime + (when || 0);
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.03);
  }
  // A burst of noise (cracks, thunks, chomps).
  function noise(dur, vol, when, lowpass) {
    if (!ac) return;
    if (!noiseBuf) noiseBuf = noiseBuffer(ac);
    var t = ac.currentTime + (when || 0);
    var src = ac.createBufferSource(), g = ac.createGain();
    src.buffer = noiseBuf;
    g.gain.setValueAtTime(vol, t);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    if (lowpass) {
      var f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass;
      src.connect(f); f.connect(g);
    } else src.connect(g);
    g.connect(master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }

  var SOUNDS = {
    click: function () { tone('square', 520, 780, 0.06, 0.06); },
    start: function () { tone('triangle', 392, 392, 0.1, 0.16); tone('triangle', 523, 523, 0.1, 0.16, 0.1); tone('triangle', 784, 784, 0.18, 0.16, 0.2); },
    jump: function () { tone('sine', 300, 640, 0.15, 0.2); },
    step: function () { tone('square', 700, 880, 0.04, 0.05); },
    // Each egg in a row rings a little higher than the last.
    egg: function (o) { var f = 880 * Math.pow(1.122, Math.min(7, (o && o.streak || 1) - 1)); tone('sine', f, f * 1.5, 0.14, 0.16); },
    golden: function () { tone('sine', 1047, 1047, 0.09, 0.16); tone('sine', 1319, 1319, 0.09, 0.16, 0.08); tone('sine', 1568, 2093, 0.22, 0.16, 0.16); },
    spare: function () { [784, 988, 1175, 1568].forEach(function (f, i) { tone('triangle', f, f, 0.12, 0.17, 0.3 + i * 0.07); }); },
    lost: function () { tone('triangle', 600, 300, 0.2, 0.1); },
    hit: function () { noise(0.14, 0.4); tone('sawtooth', 380, 110, 0.26, 0.16); },
    over: function () {
      noise(0.22, 0.5); tone('sawtooth', 400, 90, 0.35, 0.18);
      [392, 330, 262].forEach(function (f, i) { tone('sine', f, f * 0.94, 0.3, 0.18, 0.45 + i * 0.27); });
    },
    phew: function () { tone('sine', 620, 520, 0.09, 0.1); tone('sine', 660, 540, 0.09, 0.1, 0.11); },
    bark: function () { [0, 0.2].forEach(function (w) { tone('square', 250, 120, 0.13, 0.15, w); noise(0.07, 0.12, w, 1400); }); },
    growl: function () { tone('sawtooth', 95, 70, 0.36, 0.14); tone('sawtooth', 101, 74, 0.36, 0.1); },
    chomp: function () { noise(0.07, 0.4, 0, 2400); tone('square', 180, 70, 0.1, 0.16); },
    chop: function (o) { var v = o && o.vol !== undefined ? o.vol : 1; noise(0.09, 0.32 * v, 0, 1800); tone('triangle', 150, 60, 0.12, 0.3 * v); },
    unlock: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone('triangle', f, f, 0.16, 0.16, i * 0.09); }); tone('sine', 1568, 2093, 0.4, 0.12, 0.45); },
    best: function () { [784, 988, 1175].forEach(function (f, i) { tone('square', f, f, 0.1, 0.06, i * 0.08); }); }
  };

  function sfx(name, o) {
    if (!soundOn || !ac || ac.state !== 'running') return;
    // A sound that cannot be made must never stop the game.
    try { if (SOUNDS[name]) SOUNDS[name](o); } catch (e) { /* play on in silence */ }
  }

  // ── the tune: a boogie-style retro dance track ───────────────────────
  // How it is put together, for anyone who wants to change it:
  //   • Time is cut into steps of a sixteenth note, 16 to a bar.
  //   • Drums: a kick on every beat ("four on the floor"), a clap on beats
  //     2 and 4, and hi-hats between the beats.
  //   • A bouncing bass that hops between a note and the same note an
  //     octave higher: that hop is the boogie.
  //   • Every second sixteenth is played a little late ("swing"), which is
  //     what makes it shuffle instead of march.
  //   • Short chord stabs between the beats, a twinkling run of notes
  //     (the arp) with an echo, and a simple lead tune.
  //   • The bass and chords dip in volume on every kick and swell back
  //     ("pumping"), the signature of dance music.
  //   • The song builds up in 8-bar sections, drops to a quiet breakdown,
  //     then comes back in full, and loops.
  // Notes are numbers on the piano scale: 69 is the A above middle C, and
  // each step of 1 is one piano key.
  var CHORDS = {                       // root (bass) note, then the chord's notes above it
    Am: { root: 45, notes: [0, 3, 7, 10] },
    F:  { root: 41, notes: [0, 4, 7, 11] },
    G:  { root: 43, notes: [0, 4, 7, 10] },
    Dm: { root: 38, notes: [0, 3, 7, 10] },
    E:  { root: 40, notes: [0, 4, 7, 10] }
  };
  var BARS = ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'Dm', 'E'];      // the 8-bar chord loop
  // Bass: for each step, how many keys above the root (12 = an octave up); null = rest.
  var BASS_A = [0, null, 12, null, 0, null, 12, null, 0, null, 12, null, 0, null, 12, null];
  var BASS_B = [0, null, 12, 0, null, 0, 12, null, 0, null, 12, 0, null, 7, 12, 10];
  var ARP = [0, 2, 1, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 2];    // which chord note the arp plays on each step
  // The lead tune, bar by bar: step → note.
  var LEAD = [
    { 0: 69, 3: 72, 6: 74, 8: 76, 11: 74, 14: 72 },
    { 0: 69, 3: 67, 6: 69, 10: 72, 12: 76 },
    { 0: 77, 4: 76, 8: 72, 12: 69 },
    { 0: 74, 4: 71, 8: 74, 12: 79 },
    { 0: 69, 3: 72, 6: 74, 8: 76, 11: 79, 14: 76 },
    { 0: 81, 3: 79, 6: 76, 10: 72, 12: 69 },
    { 0: 74, 4: 77, 8: 81, 12: 77 },
    { 0: 76, 4: 80, 8: 83, 12: 80 }
  ];
  // The song: a short intro, then five 8-bar sections that loop.
  var INTRO_BARS = 4;
  var SECTIONS = [
    { kick: 1, clap: 1, bass: 1, stab: 1, arp: 0, lead: 0 },
    { kick: 1, clap: 1, bass: 1, stab: 1, arp: 1, lead: 0 },
    { kick: 1, clap: 1, bass: 1, stab: 1, arp: 1, lead: 1 },
    { kick: 0, clap: 0, bass: 0, stab: 1, arp: 1, lead: 0, quiet: 1 },   // the breakdown
    { kick: 1, clap: 1, bass: 1, stab: 1, arp: 1, lead: 1 }
  ];

  function hz(note) { return 440 * Math.pow(2, (note - 69) / 12); }

  // Builds the band on an audio context and returns { play(step, time, len) }.
  // It is separate from the game's own context so a tool can render the tune
  // into a buffer and measure it.
  function createMusic(ctx, out) {
    var squash = ctx.createDynamicsCompressor();      // stops loud moments from distorting
    squash.threshold.value = -16; squash.ratio.value = 5; squash.attack.value = 0.004; squash.release.value = 0.16;
    squash.connect(out);
    var drums = ctx.createGain(); drums.connect(squash);
    var pump = ctx.createGain(); pump.connect(squash);           // everything that dips on the kick
    function filter(type, freq, q, dest) {
      var f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; f.connect(dest); return f;
    }
    var bassBus = filter('lowpass', 640, 6, pump);               // rubbery, squelchy bass
    var stabBus = filter('lowpass', 2400, 1, pump);
    var hatBus = filter('highpass', 7000, 0.7, drums);
    var clapBus = filter('bandpass', 1700, 0.9, drums);
    var arpBus = ctx.createGain(); arpBus.connect(pump);
    var echo = ctx.createDelay(1), echoBack = ctx.createGain(), echoOut = ctx.createGain();
    echoBack.gain.value = 0.34; echoOut.gain.value = 0.5;
    arpBus.connect(echo); echo.connect(echoBack); echoBack.connect(echo); echo.connect(echoOut); echoOut.connect(pump);
    var hiss = noiseBuffer(ctx);

    // Notes are handed to the browser a little before they are due. This is
    // the list of those that have not started yet, so that stopping the tune
    // can take them back (see hush below).
    var linedUp = [];

    function note(type, freq, t, dur, vol, dest, slideTo) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t + dur + 0.02);
      linedUp.push({ at: t, out: g });
    }
    function burst(dest, t, dur, vol) {
      var s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = hiss;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(g); g.connect(dest);
      s.start(t, (t * 7.3) % 0.8); s.stop(t + dur + 0.02);
      linedUp.push({ at: t, out: g });
    }
    // Take back every note that has not started yet. Without this, pausing
    // froze those notes in the queue and they played on top of the tune when
    // it carried on, or as a stray blip on the menu after End Run.
    // Notes already sounding are left alone; they fade with the tune.
    function hush() {
      var now = ctx.currentTime;
      for (var i = 0; i < linedUp.length; i++) {
        if (linedUp[i].at > now) linedUp[i].out.disconnect();
      }
      linedUp.length = 0;
      pump.gain.cancelScheduledValues(now);                      // and the dips lined up with them
      pump.gain.setTargetAtTime(1, now, 0.03);
    }
    function kick(t, vol) {
      note('sine', 150, t, 0.24, vol, drums, 42);
      burst(clapBus, t, 0.015, vol * 0.25);                      // the click at the front
      pump.gain.cancelScheduledValues(t);                        // dip, then swell back
      pump.gain.setValueAtTime(0.4, t);
      pump.gain.linearRampToValueAtTime(1, t + 0.2);
    }

    // Play everything that falls on sixteenth-note number `n` at time `t`.
    // `len` is the length of one step in seconds.
    function play(n, t, len) {
      var step = n % 16, barNo = Math.floor(n / 16);
      var sec, barInSec;
      // Notes that have started no longer need remembering.
      while (linedUp.length && linedUp[0].at <= ctx.currentTime) linedUp.shift();
      if (barNo < INTRO_BARS) { sec = { kick: 1, clap: 0, bass: 1, stab: 0, arp: 0, lead: 0 }; barInSec = barNo + 4; }
      else {
        var b = barNo - INTRO_BARS;
        sec = SECTIONS[Math.floor(b / 8) % SECTIONS.length]; barInSec = b % 8;
      }
      var chord = CHORDS[BARS[barInSec]];
      var lastBar = barInSec === 7, comingBack = sec.quiet && barInSec >= 4;
      if (step % 2) t += len * 0.17;                              // swing: the boogie shuffle
      echo.delayTime.setValueAtTime(len * 3, t);

      // Drums.
      if (sec.kick && step % 4 === 0) kick(t, 0.6);
      if ((sec.clap || comingBack) && (step === 4 || step === 12)) burst(clapBus, t, 0.16, 0.42);
      if (lastBar && step >= (sec.quiet ? 8 : 13)) burst(clapBus, t, 0.09, 0.2 + (step - 8) * 0.035);   // roll into the next section
      if (step % 4 === 2) burst(hatBus, t, 0.11, 0.17);           // open hat between the beats
      else if (step % 2 && barNo >= INTRO_BARS) burst(hatBus, t, 0.035, 0.085);

      // Bass.
      if (sec.bass || comingBack) {
        var up = (barInSec % 2 ? BASS_B : BASS_A)[step];
        if (up !== null) note('sawtooth', hz(chord.root + up), t, len * 1.7, 0.36, bassBus);
      }
      // Chord stabs between the beats.
      if (sec.stab && step % 4 === 2) {
        for (var i = 0; i < chord.notes.length; i++) note('sawtooth', hz(chord.root + 24 + chord.notes[i]), t, 0.16, sec.quiet ? 0.1 : 0.065, stabBus);
      }
      // The twinkling arp.
      if (sec.arp) {
        var hop = (step % 8 >= 4 ? 48 : 36);
        note('square', hz(chord.root + hop + chord.notes[ARP[step]]), t, len * 0.9, sec.quiet ? 0.09 : 0.04, arpBus);
      }
      // The lead tune.
      if (sec.lead && LEAD[barInSec][step]) note('square', hz(LEAD[barInSec][step]), t, len * 2.6, 0.08, stabBus);
    }
    return { play: play, hush: hush };
  }

  // The tune runs a little faster as the run does.
  function stepSeconds() {
    var bpm = T.MUSIC_BPM || [118, 130];
    return 60 / (bpm[0] + (bpm[1] - bpm[0]) * pace) / 4;
  }

  var nextNoteAt = 0, stepNo = 0;
  function schedule() {
    if (!ac || ac.state !== 'running' || !music) return;
    if (nextNoteAt < ac.currentTime) nextNoteAt = ac.currentTime + 0.06;
    while (nextNoteAt < ac.currentTime + 0.3) {          // line up the next third of a second
      var len = stepSeconds();
      music.play(stepNo, nextNoteAt, len);
      nextNoteAt += len; stepNo++;
    }
  }
  // fromTheTop: true starts the song again (a new run); otherwise it carries
  // on from where it stopped (coming back from a pause).
  function startMusic(fromTheTop) {
    stopMusic();
    if (!musicOn || !soundOn || !ac) return;
    // If this browser cannot build the band, the game plays on without a tune.
    if (!music) { try { music = createMusic(ac, musicGain); } catch (e) { music = null; return; } }
    if (fromTheTop) stepNo = 0;
    else stepNo -= stepNo % 16;                          // pick up at the start of the bar
    nextNoteAt = 0;
    musicGain.gain.cancelScheduledValues(ac.currentTime);
    musicGain.gain.setTargetAtTime(musicVolume(), ac.currentTime, 0.02);
    musicTimer = setInterval(schedule, 70);
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (music) music.hush();             // notes lined up but not yet started
    // Fade quickly so notes already sounding do not end with a click.
    if (ac && musicGain) {
      musicGain.gain.cancelScheduledValues(ac.currentTime);
      musicGain.gain.setTargetAtTime(0.0001, ac.currentTime, 0.03);
    }
  }

  root.ER = root.ER || {};
  root.ER.audio = {
    unlock: unlock, sfx: sfx, startMusic: startMusic, stopMusic: stopMusic,
    setSound: function (on) { soundOn = !!on; if (!on) stopMusic(); },
    setMusic: function (on) { musicOn = !!on; if (!on) stopMusic(); },
    setPace: function (p) { pace = Math.max(0, Math.min(1, p || 0)); },
    sleep: sleep, wake: wake,
    // For the developer tools: build the tune on any audio context, and how
    // loud the game then plays it (the tune's own volume is in the tuning file).
    createMusic: createMusic, mainVolume: MAIN_VOLUME,
    musicPlaying: function () { return !!musicTimer; }
  };
})(typeof self !== 'undefined' ? self : globalThis);
