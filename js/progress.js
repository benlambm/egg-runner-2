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

    function load() {
      data = fresh();
      try {
        var raw = storage && storage.getItem(KEY);
        var saved = raw ? JSON.parse(raw) : null;
        if (saved && typeof saved === 'object') {
          if (Array.isArray(saved.unlocked)) data.unlocked = saved.unlocked.filter(function (id) { return real.indexOf(id) >= 0; });
          if (typeof saved.best === 'number' && saved.best > 0) data.best = saved.best;
          if (typeof saved.runs === 'number') data.runs = saved.runs;
          if (saved.sound === false) data.sound = false;
          if (saved.music === false) data.music = false;
          if (saved.wearing === 'plain' || data.unlocked.indexOf(saved.wearing) >= 0) data.wearing = saved.wearing;
        }
      } catch (e) { data = fresh(); }
      return data;
    }
    function save() {
      try { if (storage) storage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* play on without saving */ }
    }

    // Call once when a run ends. Every run unlocks one new costume, picked
    // at random, and puts it on straight away.
    function finishRun(distance) {
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
      if (id !== 'plain' && data.unlocked.indexOf(id) < 0) return false;
      data.wearing = id;
      save();
      return true;
    }

    // Start Over: forget costumes, the costume worn and the best distance.
    // The sound switches are kept, since they are a setting, not progress.
    function startOver() {
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

    function setSwitch(name, on) { data[name] = !!on; save(); }

    load();
    return {
      get: function () { return data; }, load: load, save: save, finishRun: finishRun,
      wear: wear, startOver: startOver, setSwitch: setSwitch, total: real.length
    };
  }

  var api = { createProgress: createProgress, KEY: KEY };
  root.ER = root.ER || {};
  root.ER.progress = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
