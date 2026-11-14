/*
 * Egg Runner 2 — what the game remembers on this device.
 *
 * Unlocked costumes, the costume being worn, the best distance, and the
 * sound switches. It is kept in the browser's localStorage under one key.
 * If storage is not available (private browsing, a strict app wrapper) the
 * game still plays; it just forgets when closed.
 */
(function (root) {
  'use strict';

  var KEY = 'egg-runner-2.save.v1';
  // Keys left by the older flat game on the same web address.
  var OLD_KEYS = ['er_hats', 'er_equipped', 'er_best'];
  // No run can get this far (it is days of running at top speed), so a
  // bigger saved best distance is damage, not a record.
  var MAX_BEST = 1e9;

  function fresh() {
    return { unlocked: [], wearing: 'plain', best: 0, runs: 0, sound: true, music: true };
  }

  // storage: something with getItem / setItem / removeItem (localStorage).
  // costumeIds: every costume id, 'plain' included.
  // random: function returning 0..1 (Math.random).
  function createProgress(storage, costumeIds, random) {
    random = random || Math.random;
    var real = costumeIds.filter(function (id) { return id !== 'plain'; });
    var data = fresh();
    // The saved text exactly as this page last saw it in storage. If storage
    // holds something else later, another tab of the game has saved.
    var lastSeen = null;

    // The saved text: null if nothing is saved, undefined if storage cannot
    // be read at all.
    function read() {
      try {
        var raw = storage ? storage.getItem(KEY) : undefined;
        return (typeof raw === 'string' || raw === null) ? raw : undefined;
      } catch (e) { return undefined; }
    }

    // Turn saved text into tidy data. Saved text can be damaged, cut short or
    // written by a different version, so every part is checked and anything
    // that does not make sense is left at its fresh value.
    function parse(raw) {
      var d = fresh();
      try {
        var saved = raw ? JSON.parse(raw) : null;
        if (saved && typeof saved === 'object') {
          if (Array.isArray(saved.unlocked)) {
            saved.unlocked.forEach(function (id) {        // real costumes only, each one once
              if (real.indexOf(id) >= 0 && d.unlocked.indexOf(id) < 0) d.unlocked.push(id);
            });
          }
          if (typeof saved.best === 'number' && saved.best > 0 && saved.best <= MAX_BEST) d.best = saved.best;
          if (typeof saved.runs === 'number' && saved.runs > 0 && isFinite(saved.runs)) d.runs = Math.floor(saved.runs);
          if (saved.sound === false) d.sound = false;
          if (saved.music === false) d.music = false;
          if (saved.wearing === 'plain' || d.unlocked.indexOf(saved.wearing) >= 0) d.wearing = saved.wearing;
        }
      } catch (e) { d = fresh(); }
      return d;
    }

    function load() {
      var raw = read();
      data = parse(raw);
      lastSeen = raw === undefined ? null : raw;
      return data;
    }

    // Two tabs of the game can be open at once. Each keeps its own copy of
    // the progress, so without this the tab that saves last would wipe out
    // a costume the other tab had just unlocked. sync() picks up whatever
    // another tab has saved; every change below calls it first.
    // Returns true if something changed.
    function sync() {
      var raw = read();
      // Nothing new, or storage cannot be read: keep what this page has.
      // (That also covers a full or blocked storage, where saving fails: the
      // progress then lives only in this page, and must not be thrown away.)
      if (raw === undefined || raw === lastSeen) return false;
      data = parse(raw);
      lastSeen = raw;
      return true;
    }

    function save() {
      try { if (storage) storage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* play on without saving */ }
      // Note what storage really holds now (the save may not have worked).
      var now = read();
      if (now !== undefined) lastSeen = now;
    }

    // Call once when a run ends. Every run unlocks one new costume, picked
    // at random, and puts it on straight away.
    function finishRun(distance) {
      sync();
      var locked = real.filter(function (id) { return data.unlocked.indexOf(id) < 0; });
      var unlocked = null;
      if (locked.length) {
        unlocked = locked[Math.floor(random() * locked.length)];
        data.unlocked.push(unlocked);
        data.wearing = unlocked;
      }
      var newBest = distance > data.best;
      if (newBest) data.best = distance;
      data.runs++;
      save();
      return { unlocked: unlocked, newBest: newBest, best: data.best };
    }

    // Wear any unlocked costume, or go back to plain.
    function wear(id) {
      sync();
      if (id !== 'plain' && data.unlocked.indexOf(id) < 0) return false;
      data.wearing = id;
      save();
      return true;
    }

    // Start Over: forget costumes, the costume worn and the best distance.
    // The sound switches are kept, since they are a setting, not progress.
    function startOver() {
      sync();
      var sound = data.sound, music = data.music;
      data = fresh();
      data.sound = sound; data.music = music;
      try {
        if (storage) {
          storage.removeItem(KEY);
          OLD_KEYS.forEach(function (k) { storage.removeItem(k); });
        }
      } catch (e) { /* nothing to erase */ }
      save();
    }

    function setSwitch(name, on) { sync(); data[name] = !!on; save(); }

    load();
    return {
      get: function () { return data; }, load: load, save: save, sync: sync, finishRun: finishRun,
      wear: wear, startOver: startOver, setSwitch: setSwitch, total: real.length
    };
  }

  var api = { createProgress: createProgress, KEY: KEY };
  root.ER = root.ER || {};
  root.ER.progress = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
