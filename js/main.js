/*
 * Egg Runner 2 — the game loop, controls and menus.
 *
 * This file ties the pieces together: it reads touch and keyboard, advances
 * the rules, asks the renderer to draw, plays sounds when things happen, and
 * shows the start, pause and results screens.
 *
 * Modes:  menu → playing ⇄ paused → ending (slow zoom) → results → playing …
 */
(function () {
  'use strict';
  var ER = window.ER, T = ER.TUNING, audio = ER.audio, C = ER.costumes;

  function $(id) { return document.getElementById(id); }
  var canvas = $('game');
  var renderer = ER.createRenderer(canvas);

  // What the device remembers. Storage can be missing in some wrappers.
  var storage = null;
  try { storage = window.localStorage; storage.getItem('x'); } catch (e) { storage = null; }
  var progress = ER.progress.createProgress(storage, C.ids, Math.random);
  var save = progress.get();
  audio.setSound(save.sound); audio.setMusic(save.music);

  var mode = 'menu';
  var run = backdropRun();        // the run being shown (a quiet one behind menus)
  var sinceOver = 0;              // ms since the run ended (drives the zoom)
  var lastFrame = 0;
  var confirmFrom = null;         // which button opened "Are you sure?"
  var resultsAt = 0;              // when the results appeared (stops a held key skipping them)

  // A calm run with only eggs on it, shown behind the menus.
  function backdropRun() {
    return ER.rules.createRun({ seed: (Math.random() * 1e9) | 0, eggsOnly: true,
                                tuning: { START_SPEED: 300, SPEED_GAIN: 0 } });
  }
  function feet(units) { return Math.floor(units / T.UNITS_PER_FOOT); }

  // ── screens ──────────────────────────────────────────────────────────
  var screens = { menu: $('menu'), results: $('results'), pause: $('pause') };
  function show(name) {
    for (var k in screens) screens[k].hidden = k !== name;
    $('hud').hidden = !(name === null && (mode === 'playing' || mode === 'ending'));
  }

  function drawEggPic(cv, costume) {
    var c = cv.getContext('2d'), w = cv.width, h = cv.height;
    c.clearRect(0, 0, w, h);
    c.save();
    var s = h / 150;
    c.translate(w / 2, h - 10 * s); c.scale(s, s);
    c.fillStyle = 'rgba(60,38,20,0.18)';
    c.beginPath(); c.ellipse(0, 0, 34, 8, 0, 0, 6.283); c.fill();
    C.drawEgg(c, { costume: costume, mood: 'happy', t: 0, air: 0, still: true });
    c.restore();
  }

  // The costume picker: every unlocked costume, plain first, then locked ones.
  function buildStrip(strip, countEl) {
    save = progress.get();
    strip.textContent = '';
    function has(cos) { return cos.id === 'plain' || save.unlocked.indexOf(cos.id) >= 0; }
    // Costumes you have come first, locked ones after.
    var order = C.LIST.filter(has).concat(C.LIST.filter(function (cos) { return !has(cos); }));
    order.forEach(function (cos) {
      var have = has(cos);
      var tile = document.createElement(have ? 'button' : 'div');
      tile.className = 'tile' + (have ? '' : ' locked');
      var pic = document.createElement('canvas');
      pic.width = 120; pic.height = 132;
      var name = document.createElement('span');
      if (have) {
        drawEggPic(pic, cos.id);
        name.textContent = cos.name;
        tile.type = 'button';
        tile.setAttribute('aria-pressed', String(save.wearing === cos.id));
        tile.addEventListener('click', function () {
          audio.unlock(); audio.sfx('click');
          progress.wear(cos.id);
          refreshCostumes(true);
        });
      } else {
        var c = pic.getContext('2d');
        c.save(); c.translate(60, 122); c.scale(0.88, 0.88);
        ER.art.eggPath(c, 0, -46, 30, 39); c.fillStyle = '#d9d2c5'; c.fill();
        c.restore();
        c.font = '900 54px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#5b4a3c'; c.fillText('?', 60, 84);
        name.textContent = 'Locked';
        tile.setAttribute('aria-label', 'Locked costume');
      }
      tile.appendChild(pic); tile.appendChild(name);
      strip.appendChild(tile);
      if (have && save.wearing === cos.id) setTimeout(function () {
        if (tile.scrollIntoView) tile.scrollIntoView({ block: 'nearest', inline: 'center' });
      }, 0);
    });
    countEl.textContent = save.unlocked.length + ' of ' + progress.total;
  }
  // picked: true when the player has just chosen a costume themselves.
  function refreshCostumes(picked) {
    save = progress.get();
    buildStrip($('menuStrip'), $('menuCount'));
    buildStrip($('resStrip'), $('resCount'));
    drawEggPic($('menuEgg'), save.wearing);
    $('menuWearing').textContent = C.BY_ID[save.wearing].name;
    $('menuCostumeHint').textContent = save.unlocked.length >= progress.total
      ? 'You have every costume!' : 'Every run unlocks a new costume.';
    if (mode === 'results' && picked) {
      drawEggPic($('resEgg'), save.wearing);
      $('resUnlockLabel').textContent = 'Wearing';
      $('resUnlockName').textContent = C.BY_ID[save.wearing].name;
    }
  }
  function refreshSwitches() {
    save = progress.get();
    [['soundBtn', 'sound', 'Sound'], ['pauseSoundBtn', 'sound', 'Sound'],
     ['musicBtn', 'music', 'Music'], ['pauseMusicBtn', 'music', 'Music']].forEach(function (b) {
      $(b[0]).textContent = b[2] + ': ' + (save[b[1]] ? 'On' : 'Off');
      $(b[0]).setAttribute('aria-pressed', String(save[b[1]]));
    });
  }
  function toggle(name) {
    audio.unlock();
    progress.setSwitch(name, !progress.get()[name]);
    save = progress.get();
    audio.setSound(save.sound); audio.setMusic(save.music);
    if (mode === 'playing') audio.startMusic();
    audio.sfx('click');
    refreshSwitches();
  }

  function showMenu() {
    mode = 'menu';
    audio.stopMusic();
    run = backdropRun();
    renderer.fx.clear();
    save = progress.get();
    $('menuBest').hidden = !(save.best > 0);
    $('menuBest').textContent = 'Best: ' + feet(save.best) + ' ft';
    refreshCostumes(); refreshSwitches();
    show('menu');
  }

  // ── a run ────────────────────────────────────────────────────────────
  function startRun() {
    audio.unlock();
    audio.wake();
    run = ER.rules.createRun({ seed: (Math.random() * 4294967296) >>> 0 });
    renderer.fx.clear();
    sinceOver = 0;
    mode = 'playing';
    show(null);
    updateHud(true);
    audio.sfx('start');
    audio.startMusic();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function pause() {
    if (mode !== 'playing') return;
    mode = 'paused';
    audio.stopMusic();
    audio.sleep();
    refreshSwitches();
    show('pause');
    $('hud').hidden = true;
    $('resumeBtn').focus();
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = 'playing';
    audio.unlock(); audio.wake();
    audio.startMusic();
    lastFrame = 0;
    show(null);
  }

  var TITLES = {
    obstacle: ['Cracked!', 'You made an omelette.'],
    knife: ['Chopped!', 'That knife came down at just the wrong moment.'],
    dog: ['Eaten!', 'The dog got you.']
  };
  function showResults() {
    var S = run.S, title = TITLES[S.cause] || TITLES.obstacle;
    var out = progress.finishRun(S.dist);
    save = progress.get();
    mode = 'results';
    $('resultsTitle').textContent = title[0];
    $('resultsLine').textContent = title[1];
    $('resDist').textContent = feet(S.dist) + ' ft';
    $('resBest').textContent = feet(out.best) + ' ft';
    $('resNewBest').hidden = !out.newBest;
    $('resEggs').textContent = S.eggs;
    $('resScore').textContent = S.score;
    refreshCostumes(false);
    if (out.unlocked) {
      $('resUnlockLabel').textContent = 'New costume!';
      $('resUnlockName').textContent = C.BY_ID[out.unlocked].name;
      setTimeout(function () { audio.sfx('unlock'); }, 350);
    } else {
      $('resUnlockLabel').textContent = 'You have every costume!';
      $('resUnlockName').textContent = C.BY_ID[save.wearing].name;
      if (out.newBest) audio.sfx('best');
    }
    drawEggPic($('resEgg'), save.wearing);
    show('results');
    resultsAt = performance.now();
  }

  var hudShown = { d: -1, s: -1, e: -1 };
  function updateHud(force) {
    var S = run.S, d = feet(S.dist);
    if (force) hudShown = { d: -1, s: -1, e: -1 };
    if (d !== hudShown.d) { $('hudDist').textContent = d; hudShown.d = d; }
    if (S.score !== hudShown.s) { $('hudScore').textContent = S.score; hudShown.s = S.score; }
    if (S.eggs !== hudShown.e) { $('hudEggs').textContent = S.eggs; hudShown.e = S.eggs; }
  }

  // Things that just happened in the rules → sounds and sparkles.
  function react(events) {
    var S = run.S, fx = renderer.fx;
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      switch (e.type) {
        case 'jump': audio.sfx('jump'); break;
        case 'land': fx.land(S.t); break;
        case 'step': audio.sfx('step'); break;
        case 'egg':
          fx.egg(e.golden);
          if (e.earned) { audio.sfx('golden'); audio.sfx('spare'); fx.popup('+1 SPARE EGG!', '#a15c00', 30); }
          else if (e.golden) { audio.sfx('golden'); fx.popup('+' + T.EGG_POINTS, '#a15c00', 28); }
          else { audio.sfx('egg', { streak: e.streak }); fx.popup('+' + T.EGG_POINTS, '#2b1a10', 24); }
          break;
        case 'goldenLost': audio.sfx('lost'); fx.poof(e.lane, e.d - S.dist); break;
        case 'spareLost':
          audio.sfx('hit'); fx.shell(e.spares);
          fx.popup(e.cause === 'dog' ? 'CHOMP!' : e.cause === 'knife' ? 'CHOP!' : 'CRACK!', '#b3202f', 32);
          if (navigator.vibrate) { try { navigator.vibrate(60); } catch (err) { /* not allowed here */ } }
          break;
        case 'over':
          audio.stopMusic(); audio.sfx('over'); fx.shell();
          if (navigator.vibrate) { try { navigator.vibrate([80, 60, 120]); } catch (err2) { /* not allowed here */ } }
          break;
        case 'closeCall': audio.sfx('phew'); break;
        case 'dogWarning': audio.sfx('bark'); break;
        case 'dogWindup': audio.sfx('growl'); break;
        case 'dogSnap': audio.sfx('chomp'); break;
        case 'chop':
          if (e.ahead > -100 && e.ahead < 1500) audio.sfx('chop', { vol: 1 - Math.max(0, e.ahead) / 1700 });
          break;
      }
    }
  }

  // ── the loop ─────────────────────────────────────────────────────────
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = lastFrame ? Math.min(100, now - lastFrame) : 16;
    lastFrame = now;
    var zoom = 0;

    if (mode === 'playing') {
      run.update(dt);
      react(run.drain());
      updateHud(false);
      audio.setPace((run.S.speed - T.START_SPEED) / (T.TOP_SPEED - T.START_SPEED));
      if (run.S.over) { mode = 'ending'; sinceOver = 0; }
    } else if (mode === 'ending') {
      sinceOver += dt;
      zoom = sinceOver / T.ENDING_ZOOM_MS;
      if (zoom >= 1) { zoom = 1; showResults(); }
    } else if (mode === 'results') {
      zoom = 1; sinceOver += dt;
    } else if (mode === 'menu') {
      run.update(dt); run.drain();
    }
    renderer.draw(run, now, {
      costume: progress.get().wearing, zoom: zoom, sinceOver: sinceOver, frozen: mode === 'paused'
    });
  }

  // ── controls ─────────────────────────────────────────────────────────
  function act(cmd) {
    if (mode !== 'playing') return;
    run.input(cmd);
  }

  document.addEventListener('keydown', function (e) {
    var k = e.key;
    if (!$('confirm').hidden) {
      if (k === 'Escape') { closeConfirm(); e.preventDefault(); }
      return;
    }
    audio.unlock();
    if (mode === 'playing') {
      // A held key counts once, so one press is always exactly one move.
      var cmd = (k === 'ArrowLeft' || k === 'a' || k === 'A') ? 'left'
              : (k === 'ArrowRight' || k === 'd' || k === 'D') ? 'right'
              : (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') ? 'jump' : null;
      if (cmd) { if (!e.repeat) act(cmd); }
      else if (k === 'Escape' || k === 'p' || k === 'P') pause();
      else return;
      e.preventDefault();
      return;
    }
    if (mode === 'ending') {
      if ((k === 'Enter' || k === ' ') && sinceOver > 500) { sinceOver = T.ENDING_ZOOM_MS; e.preventDefault(); }
      return;
    }
    if (mode === 'paused' && (k === 'Escape' || k === 'p' || k === 'P')) { resume(); e.preventDefault(); return; }
    // On a menu, Enter or Space on a focused button presses that button
    // (the browser does this). Anywhere else they mean "go".
    var onButton = e.target && e.target.tagName === 'BUTTON';
    if ((k === 'Enter' || k === ' ') && !onButton && !e.repeat) {
      if (mode === 'menu') startRun();
      else if (mode === 'results') { if (performance.now() - resultsAt > 500) startRun(); }
      else if (mode === 'paused') resume();
      e.preventDefault();
    }
  });

  // Swipes. The move fires as soon as the finger has travelled far enough
  // (not when it lifts), and one swipe is always exactly one move.
  var touch = null;
  function swipeSize() { return Math.max(18, Math.min(34, Math.min(window.innerWidth, window.innerHeight) * 0.05)); }
  canvas.addEventListener('pointerdown', function (e) {
    audio.unlock();
    if (mode === 'ending' && sinceOver > 500) { sinceOver = T.ENDING_ZOOM_MS; return; }
    touch = { id: e.pointerId, x: e.clientX, y: e.clientY, used: false };
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } }
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!touch || touch.used || e.pointerId !== touch.id) return;
    var dx = e.clientX - touch.x, dy = e.clientY - touch.y, need = swipeSize();
    if (Math.abs(dx) < need && Math.abs(dy) < need) return;
    touch.used = true;
    if (Math.abs(dx) > Math.abs(dy)) act(dx < 0 ? 'left' : 'right');
    else if (dy < 0) act('jump');
    e.preventDefault();
  });
  function endTouch(e) { if (touch && e.pointerId === touch.id) touch = null; }
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('touchmove', function (e) {
    if (e.target === canvas) e.preventDefault();       // no page scrolling or pull-to-refresh
  }, { passive: false });

  // Buttons.
  function press(id, fn) {
    $(id).addEventListener('click', function () { audio.unlock(); fn(); });
  }
  press('playBtn', startRun);
  press('againBtn', startRun);
  press('homeBtn', function () { audio.sfx('click'); showMenu(); });
  press('pauseBtn', pause);
  press('resumeBtn', resume);
  press('quitBtn', function () { audio.wake(); showMenu(); });
  press('soundBtn', function () { toggle('sound'); });
  press('pauseSoundBtn', function () { toggle('sound'); });
  press('musicBtn', function () { toggle('music'); });
  press('pauseMusicBtn', function () { toggle('music'); });

  // Start Over, with "Are you sure?" first.
  function closeConfirm() {
    $('confirm').hidden = true;
    if (confirmFrom) confirmFrom.focus();
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-start-over]'), function (btn) {
    btn.addEventListener('click', function () {
      audio.unlock(); audio.sfx('click');
      confirmFrom = btn;
      $('confirm').hidden = false;
      $('confirmNo').focus();
    });
  });
  press('confirmNo', function () { audio.sfx('click'); closeConfirm(); });
  press('confirmYes', function () {
    progress.startOver();
    $('confirm').hidden = true;
    audio.sfx('lost');
    showMenu();                    // back to the start, plain egg, as if never played
  });

  // Pause when the player switches away; stay paused until they choose to go on.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { pause(); audio.sleep(); }
    else if (mode !== 'paused') audio.wake();
  });
  window.addEventListener('blur', pause);
  window.addEventListener('pagehide', pause);

  // Refit the picture straight away when the window changes or the phone turns.
  function refit() { renderer.resize(); }
  window.addEventListener('resize', refit);
  window.addEventListener('orientationchange', function () { setTimeout(refit, 60); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', refit);

  // Offline play: the service worker keeps a copy of every file.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* still playable online */ });
    });
  }

  // For the browser checks in /tools. Not used by the game itself.
  window.ER.debug = {
    mode: function () { return mode; },
    run: function () { return run; },
    progress: progress,
    renderer: renderer
  };

  showMenu();
  requestAnimationFrame(frame);
})();
