// The plumbing of the sound (js/audio.js): when the tune starts and stops,
// what happens to notes already lined up, and how it copes when a phone's
// sound is asleep, interrupted or missing. Nothing here listens to the tune;
// a stand-in for the browser's sound system records what was asked of it.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'js', 'audio.js'), 'utf8');

// A stand-in for the browser's sound system. Like the real one it changes
// state a moment AFTER being asked (the Web Audio standard says so, and
// phones behave that way), unless `instant` is set.
function fakeAudio(opts) {
  opts = opts || {};
  const log = { contexts: [], notes: [], resumes: 0, suspends: 0 };
  function param(value) {
    return { value, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
             setTargetAtTime() {}, cancelScheduledValues() {} };
  }
  function node(extra) {
    return Object.assign({ outs: [], connect(to) { this.outs.push(to); return to; }, disconnect() { this.outs.length = 0; this.cut = true; } }, extra);
  }
  class FakeContext {
    constructor() {
      if (opts.refuse) throw new Error('no sound device');
      this.state = opts.startState || 'running';
      this.currentTime = 0; this.sampleRate = 8000; this.destination = node();
      this.pending = [];                 // state changes that have not happened yet
      log.contexts.push(this);
    }
    settle() { this.pending.forEach(s => { this.state = s; }); this.pending = []; }
    change(to) {
      if (opts.instant) this.state = to; else this.pending.push(to);
      return opts.rejects ? Promise.reject(new Error('not allowed')) : Promise.resolve();
    }
    resume() { log.resumes++; return this.change('running'); }
    suspend() { log.suspends++; return this.change('suspended'); }
    createGain() { if (opts.broken) throw new Error('broken'); return node({ gain: param(1) }); }
    createDynamicsCompressor() { return node({ threshold: param(0), ratio: param(0), attack: param(0), release: param(0) }); }
    createBiquadFilter() { return node({ frequency: param(0), Q: param(0) }); }
    createDelay() { return node({ delayTime: param(0) }); }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
    source(kind) {
      const rec = { kind, at: null, out: null, freq: null };
      log.notes.push(rec);
      return node({
        frequency: { setValueAtTime(f) { rec.freq = f; }, exponentialRampToValueAtTime() {} },
        connect(to) { rec.out = to; return to; },
        start(t) { rec.at = t; }, stop() {}
      });
    }
    createOscillator() { return this.source('tone'); }
    createBufferSource() { return this.source('noise'); }
  }
  return { FakeContext, log };
}

// Load audio.js into a little world of its own, with a stand-in clock for
// setInterval so the check can tick the tune's timer by hand.
function load(opts) {
  const fake = fakeAudio(opts);
  const timers = new Map();
  let nextId = 1;
  const world = {
    setInterval(fn) { timers.set(nextId, fn); return nextId++; },
    clearInterval(id) { timers.delete(id); },
    Math, Promise, Float32Array
  };
  world.self = world;
  if (!(opts && opts.missing)) world.AudioContext = fake.FakeContext;
  vm.runInNewContext(SOURCE, world);
  const audio = world.ER.audio;
  const ctx = () => fake.log.contexts[0];
  // Let `seconds` of sound time pass, ticking the tune's timer every 70 ms.
  function run(seconds) {
    for (let t = 0; t < seconds; t += 0.07) {
      ctx().currentTime += 0.07;
      [...timers.values()].forEach(fn => fn());
    }
  }
  // Notes that will still be heard: lined up for later and still wired in.
  const stillToCome = () => fake.log.notes.filter(n => n.at > ctx().currentTime && !n.out.cut);
  return { audio, log: fake.log, timers, ctx, run, stillToCome };
}
// What the band plays, as text, so two stretches of the song can be compared.
const tune = (notes, from) => notes.map(n => n.kind + ' ' + (n.freq ? n.freq.toFixed(1) : '-') + ' @' + (n.at - from).toFixed(3)).join('\n');

test('no sound system is touched until the first tap or key press', () => {
  const g = load();
  g.audio.sfx('jump'); g.audio.startMusic(true); g.audio.stopMusic(); g.audio.sleep(); g.audio.wake(); g.audio.setPace(0.5);
  assert.equal(g.log.contexts.length, 0);
  assert.equal(g.timers.size, 0);
  g.audio.unlock();
  assert.equal(g.log.contexts.length, 1);
  g.audio.unlock(); g.audio.unlock();
  assert.equal(g.log.contexts.length, 1, 'only ever one');
});

test('the game plays on when sound is missing, refused or broken', () => {
  for (const opts of [{ missing: true }, { refuse: true }, { broken: true }]) {
    const g = load(opts);
    assert.doesNotThrow(() => {
      g.audio.unlock(); g.audio.sfx('jump'); g.audio.sfx('over'); g.audio.setSound(true); g.audio.setMusic(true);
      g.audio.startMusic(true); g.audio.setPace(1); g.audio.sleep(); g.audio.wake(); g.audio.stopMusic();
      g.audio.setSound(false); g.audio.setMusic(false);
    }, JSON.stringify(opts));
    assert.equal(g.audio.musicPlaying(), false);
    assert.equal(g.timers.size, 0);
  }
});

test('a sound that cannot be made does not stop the game', () => {
  const g = load({ instant: true });
  g.audio.unlock();
  g.ctx().createOscillator = () => { throw new Error('out of voices'); };
  assert.doesNotThrow(() => { g.audio.sfx('jump'); g.audio.sfx('hit'); });
});

test('the tune needs both switches on, and has exactly one timer', () => {
  const g = load({ instant: true });
  g.audio.unlock();
  g.audio.setMusic(false); g.audio.startMusic(true);
  assert.equal(g.audio.musicPlaying(), false, 'Music: Off');
  g.audio.setMusic(true); g.audio.setSound(false); g.audio.startMusic(true);
  assert.equal(g.audio.musicPlaying(), false, 'Sound: Off');
  g.audio.setSound(true);
  for (let i = 0; i < 25; i++) { g.audio.startMusic(i % 2 === 0); g.run(0.2); }
  assert.equal(g.timers.size, 1, 'starting again never adds a second timer');
  g.audio.setMusic(false);
  assert.equal(g.timers.size, 0, 'switching Music off stops it');
  g.audio.setMusic(true); g.audio.startMusic(true);
  g.audio.setSound(false);
  assert.equal(g.timers.size, 0, 'switching Sound off stops it');
});

test('sound effects stay silent when Sound is off or the phone\'s sound is asleep', () => {
  const g = load({ instant: true });
  g.audio.unlock();
  g.audio.sfx('jump');
  const one = g.log.notes.length;
  assert.ok(one > 0, 'a jump makes a sound');
  g.audio.setSound(false); g.audio.sfx('jump');
  assert.equal(g.log.notes.length, one, 'Sound: Off');
  g.audio.setSound(true); g.audio.sleep(); g.audio.sfx('jump');
  assert.equal(g.log.notes.length, one, 'asleep: nothing is queued up to burst out later');
  g.audio.wake(); g.audio.sfx('jump');
  assert.ok(g.log.notes.length > one, 'awake again');
});

test('notes are lined up only a moment ahead, never in a pile', () => {
  const g = load({ instant: true });
  g.audio.unlock(); g.audio.startMusic(true);
  g.run(3);
  assert.ok(g.log.notes.length > 20, 'the band is playing');
  for (const n of g.log.notes) assert.ok(n.at <= g.ctx().currentTime + 0.5, 'a note was lined up ' + (n.at - g.ctx().currentTime).toFixed(2) + ' s ahead');
  // A long stall (the phone was busy) must not be followed by a burst of catch-up notes.
  const before = g.log.notes.length;
  g.ctx().currentTime += 20;
  g.run(0.07);
  const burst = g.log.notes.slice(before);
  assert.ok(burst.length < 30, 'after a stall: ' + burst.length + ' notes at once');
  for (const n of burst) assert.ok(n.at >= g.ctx().currentTime - 0.08, 'no note is lined up in the past');
});

test('stopping the tune takes back every note that had not started yet', () => {
  for (const stop of ['stopMusic', 'setMusic', 'setSound']) {
    const g = load({ instant: true });
    g.audio.unlock(); g.audio.startMusic(true);
    g.run(1.5);
    assert.ok(g.stillToCome().length > 0, 'some notes are always lined up while it plays');
    const sounding = g.log.notes.filter(n => n.at <= g.ctx().currentTime);
    if (stop === 'stopMusic') g.audio.stopMusic(); else g.audio[stop](false);
    assert.equal(g.stillToCome().length, 0, stop + ': a note lined up before the stop would still be heard');
    assert.ok(sounding.every(n => !n.out.cut), 'notes already sounding are left to fade, not chopped off');
    assert.equal(g.timers.size, 0);
  }
});

test('a pause freezes sound; nothing left over plays when the run carries on', () => {
  const g = load();                      // state changes arrive late, as on a real phone
  g.audio.unlock(); g.ctx().settle();
  g.audio.startMusic(true);
  g.run(2);
  // Pause: main.js calls these two.
  g.audio.stopMusic(); g.audio.sleep(); g.ctx().settle();
  assert.equal(g.ctx().state, 'suspended');
  assert.equal(g.stillToCome().length, 0, 'notes frozen in the queue would play on top of the tune after the pause');
  const made = g.log.notes.length;
  g.run(1);
  assert.equal(g.log.notes.length, made, 'nothing is lined up while paused');
  // Keep Running.
  g.audio.unlock(); g.audio.wake(); g.audio.startMusic(); g.ctx().settle();
  g.run(0.5);
  assert.ok(g.log.notes.length > made, 'the tune carries on');
});

test('a new run starts the song from the top; coming back from a pause carries on', () => {
  const g = load({ instant: true });
  g.audio.unlock();
  g.audio.startMusic(true);
  let from = g.ctx().currentTime;
  g.run(1);
  // The first dozen notes are enough to tell one bar of the song from another.
  const opening = tune(g.log.notes.slice(0, 12), from);
  // Play well into the song, pause in the middle of a bar, carry on.
  g.run(9.3);
  g.audio.stopMusic(); g.audio.sleep(); g.audio.wake();
  let mark = g.log.notes.length; from = g.ctx().currentTime;
  g.audio.startMusic();
  g.run(1);
  const carriedOn = tune(g.log.notes.slice(mark, mark + 12), from);
  assert.notEqual(carriedOn, opening, 'after a pause the song does not go back to its opening');
  // A new run.
  g.audio.stopMusic();
  mark = g.log.notes.length; from = g.ctx().currentTime;
  g.audio.startMusic(true);
  g.run(1);
  assert.equal(tune(g.log.notes.slice(mark, mark + 12), from), opening, 'a new run starts from the top');
});

test('sound comes back after a phone interrupts it (a call, the lock screen)', () => {
  // iPhones report "interrupted" rather than "suspended".
  for (const state of ['suspended', 'interrupted']) {
    const g = load({ instant: true });
    g.audio.unlock();
    g.ctx().state = state;
    const asked = g.log.resumes;
    g.audio.wake();
    assert.equal(g.log.resumes, asked + 1, 'wake() asks a ' + state + ' sound system to carry on');
    assert.equal(g.ctx().state, 'running');
    g.ctx().state = state;
    g.audio.unlock();
    assert.equal(g.ctx().state, 'running', 'and so does the next tap');
  }
});

test('pause then straight back: sound is awake, even though the phone answers late', () => {
  const g = load();                      // late state changes
  g.audio.unlock(); g.ctx().settle();
  assert.equal(g.ctx().state, 'running');
  g.audio.sleep();                       // pause …
  g.audio.unlock(); g.audio.wake();      // … and Keep Running before the phone has caught up
  g.ctx().settle();
  assert.equal(g.ctx().state, 'running', 'the game was left running with its sound asleep');
});

test('a phone that refuses to wake or sleep its sound causes no error', async () => {
  const g = load({ rejects: true, startState: 'suspended' });
  let complaint = null;
  const listen = e => { complaint = e; };
  process.on('unhandledRejection', listen);
  g.audio.unlock(); g.audio.wake(); g.audio.sleep(); g.audio.wake();
  await new Promise(resolve => setTimeout(resolve, 20));
  process.removeListener('unhandledRejection', listen);
  assert.equal(complaint, null, 'an unanswered failure would show as an error in the browser console');
});

test('many runs: one sound system, one timer, nothing piling up', () => {
  const g = load({ instant: true });
  g.audio.unlock();
  for (let i = 0; i < 40; i++) {
    g.audio.startMusic(true); g.run(0.6);
    if (i % 3 === 0) { g.audio.stopMusic(); g.audio.sleep(); g.audio.wake(); g.audio.startMusic(); g.run(0.3); }
    g.audio.stopMusic(); g.run(0.2);
    assert.equal(g.timers.size, 0);
    assert.equal(g.stillToCome().length, 0);
  }
  assert.equal(g.log.contexts.length, 1);
});
