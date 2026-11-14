# 🥚 Egg Runner 2

**Don't crack under pressure!** Egg Runner 2 is an endless runner where you guide a brave little egg through an obstacle course — and now whole eggs along the track are treasure: collect them for score and shield protection that can save your run.

**Play now:** [benlambm.github.io/egg-runner-2](https://benlambm.github.io/egg-runner-2/) 🍳

Egg Runner 2 is the successor to [Egg Runner](https://github.com/benlambm/egg-runner).

## ✨ What's new in 2.0

- **Whole eggs are collectibles, not obstacles.** Hard boiled eggs are now whole eggs (never halved) that spawn on the track in singles and small runs of 3 to 5, bobbing and glinting like coins in a runner.
- **Egg counter.** The HUD always shows how many eggs you have collected (🥚 × N), and the game-over screen reports "Eggs collected: N".
- **Shield protection bank.** Every collected egg banks one protection charge, up to a cap of 5, shown in the HUD as filled vs empty egg slots. On an obstacle collision, a banked egg cracks in your place, the obstacle is removed, and you get about 1.5 seconds of flickering invulnerability so one mistake cannot chain into more hits. With an empty bank, a collision cracks you and ends the run as before.
- **Score bonus.** Each egg pickup adds 25 points, even at a full bank — pickups still count toward your collected total and score when the bank is full.
- **Removed obstacle.** The old egg-shaped obstacle is gone entirely: it no longer spawns, is drawn, or can be hit. The other obstacles (toaster, blender, carton, knife, butter) remain the hazards.

## ✨ 2.0 facelift

- **Digital-render look.** Shaded eggs with a specular shine and soft shadows that shrink as you jump, gradient-lit obstacles, a layered parallax kitchen (warm wall, soft cabinets, counter edge, shaded checker track), pickup sparkles, a shell burst when a banked egg cracks for you, and a soft glow pulse on the HUD when protection is gained or lost.
- **Gentler difficulty (playtest fix).** The run starts a little slower, takes about twice as long to reach a modestly lower top speed, and obstacle spacing now grows with speed: at least one full jump of travel (times a safety factor) and at least a fixed reaction gap, so back-to-back obstacles stay clearable at any speed.
- **Reliable re-jumping (playtest fix).** Jump buffering (a press up to 120 ms before landing fires on the landing frame), coyote time (a press up to 100 ms after leaving the ground still counts), and instant re-arm on the landing frame. No more eaten inputs between obstacles.
- **The side dog 🐕 (playtester request).** Every so often, never in the first 20 seconds, paw prints and a bark warn you, then a dog runs in from one side and runs alongside for exactly 10 seconds, snapping at ground level on its side every couple of seconds after a visible wind-up. Dodge by jumping, or by standing on the far side. If it catches you, a banked egg is eaten instead and you get the usual invulnerability flicker; with an empty bank the run ends: "Eaten by the dog!" Obstacles never spawn during a snap, so both dodges always stay open.

Full requirements: [SPEC.md](SPEC.md).

## 🎮 How to Play (Mobile)

- **Swipe left / right** — dodge obstacles
- **Swipe up** — jump over flat objects
- **Run over whole eggs** — collect them for +25 score and shield protection
- Survive as long as you can and unlock hats along the way 🎩🥚

Keyboard: arrow keys dodge left/right and jump.

## 📲 Install on Your Phone

This is a full **Progressive Web App** — no app store needed.

**iPhone / iPad:**
1. Open the link in **Safari**
2. Tap the **Share** icon (box with arrow)
3. Tap **"Add to Home Screen"**

**Android:**
1. Open the link in **Chrome**
2. Tap the install banner, or Menu (⋮) → **"Add to Home Screen"**

The egg icon lands right on your home screen next to your other apps. Launches fullscreen, works offline after first load. 🥚✨

## 🏗️ Zero Dependencies, Instant Ship

This entire installable mobile app is **four files**: `index.html`, `manifest.json`, `sw.js`, and two icons. That's it. No React, no Webpack, no node_modules black hole, no build step. Pure vanilla HTML/CSS/JS.

Deployment? Push to GitHub, enable Pages, done. From `git push` to live mobile app in under 60 seconds. One branch, one click, zero config. 🥚🚀

The service worker caches everything for offline play (cache `egg-runner-2-v1`). The manifest makes it installable. The `<meta>` tags handle iOS quirks. Ship it and forget it.

## 📄 License

**CC BY-NC 4.0** — [Creative Commons Attribution-NonCommercial 4.0 International](https://creativecommons.org/licenses/by-nc/4.0/)

You are free to share and adapt this work **for non-commercial purposes only**, provided you give appropriate credit:

> **Egg Runner** by [Ben Lamb](https://github.com/benlambm) — Original author must be credited in any reuse or derivative work.
