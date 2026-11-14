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
  var fingers = {};               // each finger (or mouse button) now down on the picture, by its id
  var confirmFrom = null;         // which button opened "Are you sure?"
  var resultsAt = 0;              // when the results appeared (stops a held key skipping them)
  // The results ignore key presses and taps for this long after they appear.
  // A child tapping or pressing to skip the zoom often presses twice, and
  // the second press must not land on whichever button has just appeared
  // under the finger.
  var RESULTS_GUARD_MS = 500;

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
    fitCards();
    // The keyboard must not be left on a button that has just been hidden
    // (browsers take a moment to notice, and a key pressed in that moment
    // would go to the hidden button).
    var a = document.activeElement;
    if (a && a !== document.body && a.blur && !a.getClientRects().length) a.blur();
  }

  // A menu card that is too tall for the screen is drawn a little smaller, so
  // that every button can be reached without scrolling. The style sheet
  // already lays the cards out for common screens; this is the safety net
  // for the ones in between, and for phones whose own lettering is wider
  // than expected. Below CARD_SMALLEST the words would be too small to
  // read, so from there the card scrolls instead (only tiny screens).
  var CARD_SMALLEST = 0.8;
  function fitCards() {
    var cards = document.querySelectorAll('.screen:not([hidden]) > .card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i], size = 1;
      card.style.zoom = '';
      // Words re-wrap as the card shrinks, so the first guess can be a
      // little out: look again, up to three times.
      for (var tries = 0; tries < 3 && size > CARD_SMALLEST && card.scrollHeight > card.clientHeight + 1; tries++) {
        size = Math.max(CARD_SMALLEST, size * card.clientHeight / card.scrollHeight - 0.01);
        card.style.zoom = size;
      }
    }
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

  // Slide a costume strip sideways until the costume being worn is in the
  // middle. Only the strip moves. (Asking the browser to "scroll it into
  // view" also slid the whole card down on short screens, so the menu opened
  // with its title cut off.)
  function showWorn(strip) {
    var tile = strip.querySelector('[aria-pressed="true"]');
    if (!tile) return;
    var t = tile.getBoundingClientRect(), s = strip.getBoundingClientRect();
    var shrunk = s.width / strip.offsetWidth || 1;      // less than 1 when fitCards has shrunk the card
    strip.scrollLeft += ((t.left + t.width / 2) - (s.left + s.width / 2)) / shrunk;
  }

  // The costume picker: every unlocked costume, plain first, then locked ones.
  function buildStrip(strip, countEl) {
    save = progress.get();
    var slid = strip.scrollLeft;
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
        tile.setAttribute('data-costume', cos.id);
        tile.setAttribute('aria-pressed', String(save.wearing === cos.id));
        tile.addEventListener('click', function () {
          audio.unlock(); audio.sfx('click');
          progress.wear(cos.id);
          refreshCostumes(true);
          // The picker has just been drawn again, and the button that was
          // pressed is gone. Put the keyboard's place back on its
          // replacement; otherwise the next Enter would start a run.
          var again = strip.querySelector('[data-costume="' + cos.id + '"]');
          if (again) again.focus({ preventScroll: true });
        });
        // Moving along the costumes with Tab: slide the strip so the one
        // the keyboard is on is fully showing (browsers leave it half
        // hidden at the edge). Only for the keyboard: sliding the strip
        // under a finger or a mouse in mid-press would make the press miss.
        tile.addEventListener('focus', function () {
          try { if (tile.matches(':focus-visible')) tile.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
          catch (e) { /* an old browser: leave the strip where it is */ }
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
    });
    strip.scrollLeft = slid;             // drawing it again must not make it jump
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
    fitCards();                        // the words just changed, and so may the card's height
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

  // Everything on the start screen that depends on what is saved.
  function refreshMenu() {
    save = progress.get();
    $('menuBest').hidden = !(save.best > 0);
    $('menuBest').textContent = 'Best: ' + feet(save.best) + ' ft';
    refreshCostumes(); refreshSwitches();
  }
  function showMenu() {
    mode = 'menu';
    audio.stopMusic();
    run = backdropRun();
    renderer.fx.clear();
    refreshMenu();
    show('menu');
    showWorn($('menuStrip'));
  }

  // Another tab of the game may have saved something (a new costume, Start
  // Over, a sound switch). Pick it up and show it here too, so the two tabs
  // never disagree about what has been unlocked.
  function pickUpOtherTabs() {
    if (!progress.sync()) return;
    save = progress.get();
    audio.setSound(save.sound); audio.setMusic(save.music);
    if (mode === 'playing' && !audio.musicPlaying()) audio.startMusic();   // the tune was switched back on over there
    if (mode === 'menu') refreshMenu();
    else { refreshCostumes(false); refreshSwitches(); }
  }
  window.addEventListener('storage', pickUpOtherTabs);

  // ── a run ────────────────────────────────────────────────────────────
  // seed: only the developer tools pass one, to get the same course twice.
  function startRun(seed) {
    audio.unlock();
    audio.wake();
    run = ER.rules.createRun({ seed: typeof seed === 'number' ? seed >>> 0 : (Math.random() * 4294967296) >>> 0 });
    renderer.fx.clear();
    sinceOver = 0;
    mode = 'playing';
    show(null);
    updateHud(true);
    audio.sfx('start');
    audio.startMusic(true);          // a new run starts the song from the top
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function pause() {
    if (mode !== 'playing') return;
    mode = 'paused';
    fingers = {};                    // a swipe cut off by the pause is over
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
    showWorn($('resStrip'));
    resultsAt = performance.now();
  }
  // No button on the results can be pressed in the first moments (see
  // RESULTS_GUARD_MS). Listening "on the way down" lets one rule cover every
  // button on the screen, including the costume tiles.
  $('results').addEventListener('click', function (e) {
    if (performance.now() - resultsAt < RESULTS_GUARD_MS) { e.stopPropagation(); e.preventDefault(); }
  }, true);

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
    fitIfChanged();

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
    // Ctrl, Alt and Command combinations belong to the browser (bookmark,
    // print, go back). The game leaves them alone.
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    // Enter held down on a button would press it over and over, and then
    // press whichever button the keyboard lands on next ("No" would open
    // and shut the question in a flicker). A held key counts once here too.
    if (e.repeat && k === 'Enter' && e.target && e.target.tagName === 'BUTTON') { e.preventDefault(); return; }
    if (!$('confirm').hidden) {
      if (k === 'Escape') { closeConfirm(); e.preventDefault(); }
      // Tab stays on the two answers. Otherwise it would walk on to the
      // buttons hidden behind "Are you sure?", and Enter there could start
      // a run that nobody can see or steer.
      else if (k === 'Tab') {
        (document.activeElement === $('confirmNo') ? $('confirmYes') : $('confirmNo')).focus();
        e.preventDefault();
      }
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
      // A fresh press skips the zoom. A key still held down from the run
      // (Space, to jump) does not.
      if ((k === 'Enter' || k === ' ') && !e.repeat && sinceOver > 500) { sinceOver = T.ENDING_ZOOM_MS; e.preventDefault(); }
      return;
    }
    if (mode === 'paused' && (k === 'Escape' || k === 'p' || k === 'P')) { resume(); e.preventDefault(); return; }
    // On a menu, Enter or Space on a focused button presses that button
    // (the browser does this). Anywhere else they mean "go".
    var onButton = e.target && e.target.tagName === 'BUTTON';
    if ((k === 'Enter' || k === ' ') && !onButton && !e.repeat) {
      if (mode === 'menu') startRun();
      else if (mode === 'results') { if (performance.now() - resultsAt > RESULTS_GUARD_MS) startRun(); }
      else if (mode === 'paused') resume();
      e.preventDefault();
    }
  });

  // Swipes. The move fires as soon as the finger has travelled far enough
  // (not when it lifts), and one swipe is always exactly one move.
  // Every finger on the screen is followed on its own (two thumbs can swipe
  // at once, or one can rest on the glass while the other plays). Following
  // only the newest finger dropped the other one's swipe.
  function swipeSize() { return Math.max(18, Math.min(34, Math.min(window.innerWidth, window.innerHeight) * 0.05)); }
  canvas.addEventListener('pointerdown', function (e) {
    audio.unlock();
    if (mode === 'ending' && sinceOver > 500) { sinceOver = T.ENDING_ZOOM_MS; return; }
    fingers[e.pointerId] = { x: e.clientX, y: e.clientY, used: false };
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } }
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', function (e) {
    var touch = fingers[e.pointerId];
    if (!touch || touch.used) return;
    var dx = e.clientX - touch.x, dy = e.clientY - touch.y, need = swipeSize();
    if (Math.abs(dx) < need && Math.abs(dy) < need) return;
    touch.used = true;
    if (Math.abs(dx) > Math.abs(dy)) act(dx < 0 ? 'left' : 'right');
    else if (dy < 0) act('jump');
    e.preventDefault();
  });
  function endTouch(e) { delete fingers[e.pointerId]; }
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
  press('playBtn', function () { startRun(); });
  press('againBtn', function () { startRun(); });
  press('homeBtn', function () { audio.sfx('click'); showMenu(); });
  press('pauseBtn', pause);
  press('resumeBtn', resume);
  press('quitBtn', function () { audio.wake(); showMenu(); });
  press('soundBtn', function () { toggle('sound'); });
  press('pauseSoundBtn', function () { toggle('sound'); });
  press('musicBtn', function () { toggle('music'); });
  press('pauseMusicBtn', function () { toggle('music'); });

  // Start Over, with "Are you sure?" first. While the question is showing,
  // the screen behind it is switched off ("inert"), so nothing on it can be
  // pressed, whether by keyboard or by a screen reader.
  function showConfirm(on) {
    $('confirm').hidden = !on;
    screens.menu.inert = screens.results.inert = on;
    fitCards();
  }
  function closeConfirm() {
    showConfirm(false);
    if (confirmFrom) confirmFrom.focus();
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-start-over]'), function (btn) {
    btn.addEventListener('click', function () {
      audio.unlock(); audio.sfx('click');
      confirmFrom = btn;
      showConfirm(true);
      $('confirmNo').focus();
    });
  });
  press('confirmNo', function () { audio.sfx('click'); closeConfirm(); });
  press('confirmYes', function () {
    progress.startOver();
    showConfirm(false);
    audio.sfx('lost');
    showMenu();                    // back to the start, plain egg, as if never played
    $('playBtn').focus();          // the button just pressed is gone; keep the keyboard somewhere sensible
  });

  // Pause when the player switches away; stay paused until they choose to go on.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { pause(); audio.sleep(); }
    else {
      if (mode !== 'paused') audio.wake();
      pickUpOtherTabs();             // in case this tab was asleep when another one saved
    }
  });
  window.addEventListener('blur', pause);
  window.addEventListener('pagehide', pause);

  // Refit the picture straight away when the window changes or the phone turns.
  var fitW = canvas.clientWidth, fitH = canvas.clientHeight, fitDpr = window.devicePixelRatio;
  function refit() {
    renderer.resize();
    fitCards();
    fitW = canvas.clientWidth; fitH = canvas.clientHeight; fitDpr = window.devicePixelRatio;
  }
  // Called every frame. The browser does not always announce a change: a
  // window dragged to a sharper or blurrier monitor keeps its size, and some
  // app wrappers skip the resize notice when the phone turns. Comparing
  // three numbers costs nothing and means the picture can never stay wrong.
  function fitIfChanged() {
    if (canvas.clientWidth !== fitW || canvas.clientHeight !== fitH || window.devicePixelRatio !== fitDpr) refit();
  }
  window.addEventListener('resize', refit);
  window.addEventListener('orientationchange', function () { setTimeout(refit, 60); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', refit);

  // Offline play: the service worker keeps a copy of every file.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      // Some app wrappers refuse service workers outright; the game does not need one to play.
      try { navigator.serviceWorker.register('sw.js').catch(function () { /* still playable online */ }); }
      catch (e) { /* still playable online */ }
    });
  }

  // For the browser checks in /tools. Not used by the game itself.
  window.ER.debug = {
    mode: function () { return mode; },
    run: function () { return run; },
    startRun: startRun,
    progress: progress,
    renderer: renderer
  };

  showMenu();
  requestAnimationFrame(frame);
})();
