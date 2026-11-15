# Egg Runner 2

You are a cartoon egg running endlessly through a kitchen. Get as far as you can before you crack.

**Play it:** [benlambm.github.io/egg-runner-2](https://benlambm.github.io/egg-runner-2/)

This edition was rebuilt from scratch and replaces the older flat version. How the game plays is defined in [DESCRIPTION.md](DESCRIPTION.md); this file covers how the build is put together.

## Where it comes from

The original [Egg Runner](https://github.com/benlambm/egg-runner) ([play it](https://benlambm.github.io/egg-runner/)) was first committed on March 21, 2026: a four file Progressive Web App, vanilla HTML, CSS and JavaScript, no build step, written in a morning.

This rebuild landed on November 14, 2026. It was built from [DESCRIPTION.md](DESCRIPTION.md), a plain language account of the game, and it keeps the same three lanes, the same egg and the same kitchen, at roughly twelve and a half thousand lines, with automated players that prove the courses are fair.

The two repos are kept as a pair on purpose. Together they chart how AI assisted building changed across 2026: in March, an assistant helped a person write a small game by hand; in November, an agent built and tested a far larger one from a description the person wrote. The design barely moved. The leverage did.

## Try it

The game is plain HTML, CSS and JavaScript. There is nothing to install and no build step.

```
python3 -m http.server 8080
```

Then open `http://localhost:8080`. On a phone, use the computer's address on the same Wi-Fi.

- **Touch:** swipe left or right to change lanes, swipe up to jump.
- **Keyboard:** arrow keys (or A, D, W). Space also jumps. Enter starts. Escape or P pauses.

## Retuning

Every tuning number is in [`js/tuning.js`](js/tuning.js), with a comment on each: speeds, jump, forgiveness windows, spacing, egg and golden-row rates, the dog's timing, the knives' rhythm and how often they appear.

Change a number, reload, play. Then run the checks: several of them describe fairness limits (for example, obstacles are never closer than one jump) and will say so if a number breaks one.

## Checks

```
npm test                  # the rules, in Node (about 15 seconds, 256 checks)
ER_LONG=1 npm test        # the same plus a long soak (about 6 minutes)
npm run test:browser      # the real game in a headless browser (about 80 seconds, 135 checks; needs Playwright)
npm run shots -- <folder> # screenshots of set scenes, for looking at art changes
```

`npm test` has no dependencies. It covers every rule in DESCRIPTION.md, including:

- **Proof by play.** A simple automated player runs 40 full four-minute courses. With knives switched off it is never hit, which shows a clean escape always exists from obstacles and the dog. With knives on, its only hits are chops under sets that cover all three lanes.
- **A search from every position.** A deliberately clumsy player, allowed one press every 150 to 300 ms, is followed through every position it could reach using the real rules. It finds no dead ends, and every golden chain can be collected egg by egg without a hit.
- **Random play.** Thousands of seconds of random and deliberately mistimed play, with the always-true rules checked after every step (nothing hurts a blinking egg, an egg is collected once, the dog only bites at a snap within its reach, no value ever becomes "not a number", nothing piles up over a 30-minute run).
- **Fair spacing.** Rows never block all three lanes, are never closer than one jump or one reaction time, and get extra room when the way through needs two lane changes.
- **The dog.** Never early, a one-second warning, exactly ten seconds alongside, a wind-up before every snap, a snap that reaches exactly two lanes, and no obstacle or knife anywhere near a snap.
- **Eggs.** Golden eggs only at the end of chains of 6 to 8, none in the first 15 seconds, rare early.
- **Screen sizes.** On twelve screen shapes the egg, a full jump, all five spares and the dog are on screen, nothing is stretched, and things appear at the same distance ahead.
- **Saving, two tabs, Start Over, the offline worker, sound plumbing, and no network calls.**

`npm run test:browser` plays the real page, served from `/egg-runner-2/` with caching headers like the live site. It covers keyboard, touch swipes (including two thumbs at once), pause on switching away, resizing and a change of screen sharpness, the ending zoom and results, costume saving across reloads and across two tabs, Start Over with "Are you sure?" (including that the keyboard cannot reach anything behind the question), every menu at ten screen sizes, 300 random actions, updating to a new version, loading with no connection, the tune (audible, never distorts, steady beat), the far kitchen's slow loop (no pops, ends where it began, the track stays bright at night), perfect stillness while paused, and drawing speed on a phone, a desktop and a tablet.

## How it is built

| File | What it does |
| --- | --- |
| `js/tuning.js` | Every tuning number. |
| `js/rules.js` | The rules: moving, obstacles, eggs and spares, the dog, knives, hits, score. No drawing or browser code, so the checks can play it. |
| `js/view.js` | Fits the picture to any screen. The fake-3D formula lives here. |
| `js/art.js` | Every picture, drawn in code: obstacles, eggs, knives, the dog, kitchen clutter. |
| `js/costumes.js` | The egg and its costumes. Add one entry to add a costume. |
| `js/render.js` | Draws a frame: wall, floor, track, then everything far to near. |
| `js/audio.js` | Every sound and the tune, made in code. |
| `js/progress.js` | What the device remembers. |
| `js/main.js` | Game loop, controls, menus. |
| `sw.js`, `manifest.json` | Offline play and home-screen install. |
| `tests/`, `tools/` | The checks and the screenshot tool. Not part of the game. |

The 3D look is the old arcade trick. Each thing is a flat picture, drawn at `size = CAM_BACK / (CAM_BACK + distance ahead)` and placed nearer the horizon the farther away it is. Movement is still three lanes and a jump.

There are no asset files except the two app icons.

## Shipping

- Every push to `main` redeploys the live game, and a child plays it. Work on a branch.
- Merge to `main` only when Ben has played the build and says to ship it.
- When any game file changes, bump `VERSION` in `sw.js` (the part after the `egg-runner-2-` prefix; keep the prefix, because old copies are recognised by it). That is what makes phones that already have the game fetch the new files.

## Choices made where the description is silent

Each is the simplest option that kept the game fair. Most are one number in `js/tuning.js`.

**Starting fresh**
- Old hats and the old best distance are not carried over.
- Start Over erases only this game's own save. The original Egg Runner is served from the same web address and shares the browser's storage, so its saved data is left alone.
- Start Over keeps the sound and music switches, since they are settings rather than progress.

**Costumes**
- There are sixteen: chef, cowboy, wizard, ninja, pirate, astronaut, superhero, king, clown, robot, dinosaur, bumblebee, viking, vampire, detective, mummy.
- Once all sixteen are unlocked, a run unlocks nothing.
- Ending a run from the pause screen gives no costume and does not count toward best distance.

**Moving**
- A lane change counts the instant you press. The slide is only drawn.
- "Slightly early" is 140 ms before landing. "Slightly late" is 90 ms after a flat obstacle first touches you, at every speed.
- A jump pressed in the air while the dog is winding up is remembered until landing, however early, so one press always answers a wind-up. This forgiveness was added when testing showed quick players being bitten on landing.
- Coming down on the back half of a flat obstacle counts as clearing it.
- One swipe is one move, and it fires as soon as the finger has travelled about 5% of the screen, not when it lifts. Every finger is followed separately, so two thumbs both count.
- A held key counts once, and a key still held down never skips the ending zoom or re-presses a button. Ctrl, Alt and Cmd combinations are left to the browser.

**Obstacles**
- A row blocks one or two lanes, never three. Two-lane rows start rare (10%) and reach 45% at top speed.
- Pace matches the live game: same start speed, top speed and ramp.
- The first obstacle arrives after 3.2 seconds.
- A last-moment lane switch is a close call if the obstacle would have reached you within 260 ms.

**Eggs**
- Eggs are grabbed by lane and position. Height does not matter, so a jump never misses one.
- Short rows are 3 to 5 whole eggs and never golden. A golden egg comes only as the last egg of a longer chain of 6 to 8.
- No golden chain arrives in the first 15 seconds. After that they come about 1.5 times a minute early on, rising to about 6 a minute at top speed.
- An egg row never leads into a tall obstacle. A tall obstacle in the row's lane is at least 0.3 seconds of travel before its first egg and after its last (`EGG_CLEAR_BEFORE_MS`, `EGG_CLEAR_AFTER_MS`), and 0.72 seconds when the lane beside is blocked too. Eggs also keep clear of knives.

**The dog**
- The first visit arrives between 25 and about 42 seconds in. After that there are 25 to 45 quiet seconds between visits.
- A snap reaches two lanes, the dog's own and the middle, and both glow red on the floor during the wind-up. Only the far lane or a jump is safe. `DOG_BITE_LANES` in the tuning file sets the reach.
- The bite is a single instant, when the wind-up ends. Being in the air at that instant is enough.
- The description says no new obstacles appear during a wind-up. Because things are now visible far ahead, this build does something stronger: the stretch of track that reaches you from just before each wind-up until 650 ms after the snap is laid out with no obstacles at all.
- The first row after a snap gets the usual two-lane extra room when it leaves only one outer lane open.
- Knives never arrive during a dog visit.
- After the dog wins, it sits exactly where the egg was, so the ending zoom frames it.
- On narrow screens the dog tucks in over the edge of the outer lane so it is always fully visible. This is looks only.

**Chopping knives**
- The first knives arrive from about 33 seconds in, or later if the dog is visiting. After that a set comes every 11 to 21 seconds.
- The first two sets are a single knife. After that: one knife 35%, two 42%, all three lanes 23%.
- A blade is low enough to hit about a quarter of the time. Each knife waits raised for at least 0.6 seconds after lifting, so a knife you see rising as you arrive is safe.
- No obstacles sit within about a second before a set of knives, so you are free to pick a lane.
- A knife that hits you is knocked away, like any obstacle.

**Screen and view**
- The far end of the kitchen changes in a slow loop of four minutes (`BACKDROP_LOOP_MS`): morning, afternoon, sunset, night and back. The sky, sun, moon and stars show through the windows, the wall's light follows, and lamps and the oven glow come up at dusk. The floor, the track and everything on them keep full brightness at night. The loop starts at morning each time the page loads and is not reset by a new run; it stands still while paused. A clock, kettle steam and clouds move at every hour.
- Very large or very sharp screens are drawn slightly softer rather than slower: the canvas is capped at 2.3 million pixels (`MAX_PIXELS` and `MAX_DETAIL` at the top of `js/render.js`).
- Clutter keeps a clear aisle beside the track, where the dog runs.
- Players who ask their device for reduced motion get no screen shake and no speed streaks.
- Tall screens look down on the track from a little higher. This shows more kitchen, not more track: things appear 2,600 units ahead on every screen.
- Things you have passed fade out behind the egg so they never hide the spares.
- The app can turn to any orientation.

**Other**
- Distance is shown in feet. Score is one point per inch travelled plus 25 per egg.
- Sound effects and a tune, each with its own switch. The tune is a boogie-style retro dance track: a kick on every beat, a bouncing octave bass, a shuffle, chord stabs, an echoing run of notes and a lead line. It builds over about 90 seconds, drops to a quiet breakdown and loops, and it speeds up a little with the run. A new run starts it from the top; coming back from a pause carries on.
- Results titles are "Cracked!", "Chopped!" and "Eaten!". A tap or Enter skips the zoom after half a second, and the results ignore taps and keys for their first half second so a double tap cannot start a new run by accident.
- Two tabs share progress: neither overwrites the other's costumes or best distance.
- A menu too tall for the screen is drawn up to 20% smaller before it scrolls.
- After switching away the game stays paused until you press Keep Running.
- Phones that support it buzz briefly on a hit.
- The app icons are unchanged.

## License

CC BY-NC 4.0. See [LICENSE](LICENSE). Egg Runner is by [Ben Lamb](https://github.com/benlambm).
