/*
 * Egg Runner 2 — sound.
 *
 * Every sound is made in code with the Web Audio API; there are no sound
 * files. Browsers only allow sound after the player has touched or pressed
 * something, so unlock() is called from the first tap or key press.
 */
(function (root) {
  'use strict';

  var ac = null, master = null, musicGain = null;
  var soundOn = true, musicOn = true, musicTimer = null, nextNoteAt = 0, step = 0, pace = 0;

  function unlock() {
    if (!ac) {
      var Ctor = root.AudioContext || root.webkitAudioContext;
      if (!Ctor) return;
      try { ac = new Ctor(); } catch (e) { ac = null; return; }
      master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
      musicGain = ac.createGain(); musicGain.gain.value = 0.5; musicGain.connect(master);
    }
    if (ac.state === 'suspended' && ac.resume) ac.resume();
  }

  // One note: a tone that slides from f0 to f1 and fades out.
  function tone(type, f0, f1, dur, vol, when, dest) {
    if (!ac) return;
    var t = ac.currentTime + (when || 0);
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || master);
    o.start(t); o.stop(t + dur + 0.03);
  }
  // A burst of noise (cracks, thunks, chomps).
  function noise(dur, vol, when, lowpass) {
    if (!ac) return;
    var t = ac.currentTime + (when || 0), n = Math.floor(ac.sampleRate * dur);
    var buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ac.createBufferSource(), g = ac.createGain();
    src.buffer = buf; g.gain.value = vol;
    if (lowpass) {
      var f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass;
      src.connect(f); f.connect(g);
    } else src.connect(g);
    g.connect(master); src.start(t);
  }

  var SOUNDS = {
    click: function () { tone('square', 520, 780, 0.06, 0.06); },
    start: function () { tone('triangle', 392, 392, 0.1, 0.16); tone('triangle', 523, 523, 0.1, 0.16, 0.1); tone('triangle', 784, 784, 0.18, 0.16, 0.2); },
    jump: function () { tone('sine', 300, 640, 0.15, 0.2); },
    step: function () { tone('square', 700, 880, 0.04, 0.05); },
    // Each egg in a row rings a little higher than the last.
    egg: function (o) { var f = 880 * Math.pow(1.122, Math.min(6, (o && o.streak || 1) - 1)); tone('sine', f, f * 1.5, 0.14, 0.16); },
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
    if (SOUNDS[name]) SOUNDS[name](o);
  }

  // ── a small looping tune while you run ───────────────────────────────
  var LEAD = [659, 0, 784, 659, 523, 0, 659, 784,   880, 0, 1047, 880, 698, 0, 880, 1047,
              988, 0, 1175, 988, 784, 0, 988, 1175,  1047, 784, 659, 784, 1047, 0, 0, 0];
  var BASS = [131, 0, 196, 0, 131, 0, 196, 0,   175, 0, 262, 0, 175, 0, 262, 0,
              196, 0, 294, 0, 196, 0, 294, 0,   131, 0, 196, 0, 131, 0, 165, 0];
  function schedule() {
    if (!ac || ac.state !== 'running') return;
    var beat = 0.21 - 0.05 * pace;                 // the tune speeds up with the run
    if (nextNoteAt < ac.currentTime) nextNoteAt = ac.currentTime + 0.05;
    while (nextNoteAt < ac.currentTime + 0.3) {
      var i = step % LEAD.length, when = nextNoteAt - ac.currentTime;
      if (LEAD[i]) tone('square', LEAD[i], LEAD[i], beat * 0.9, 0.035, when, musicGain);
      if (BASS[i]) tone('triangle', BASS[i], BASS[i], beat * 1.7, 0.11, when, musicGain);
      nextNoteAt += beat; step++;
    }
  }
  function startMusic() {
    stopMusic();
    if (!musicOn || !soundOn || !ac) return;
    step = 0; nextNoteAt = 0;
    musicTimer = setInterval(schedule, 90);
  }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }

  root.ER = root.ER || {};
  root.ER.audio = {
    unlock: unlock, sfx: sfx, startMusic: startMusic, stopMusic: stopMusic,
    setSound: function (on) { soundOn = !!on; if (!on) stopMusic(); },
    setMusic: function (on) { musicOn = !!on; if (!on) stopMusic(); },
    setPace: function (p) { pace = Math.max(0, Math.min(1, p)); },
    // Silence everything while the game is paused or in the background.
    sleep: function () { if (ac && ac.state === 'running' && ac.suspend) ac.suspend(); },
    wake: function () { if (ac && ac.state === 'suspended' && ac.resume) ac.resume(); }
  };
})(typeof self !== 'undefined' ? self : globalThis);
