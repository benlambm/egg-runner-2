# Handoff: build the next edition of Egg Runner 2

This file is the brief for a new Claude Code session working in this repo.

## The job

Build the next edition of Egg Runner 2 as a new game, written from scratch.

DESCRIPTION.md is the source of truth for how the game plays. It describes play only, on purpose. The technical choices are yours, inside the limits below.

## What is already in this repo

- The current flat 2D game (index.html, sw.js, manifest.json, icons). It is live at https://benlambm.github.io/egg-runner-2/ and a child plays it.
- SPEC.md, the full specification of that current game. Use it to get the feel right, such as how forgiving the jump is. Where SPEC.md and DESCRIPTION.md disagree, DESCRIPTION.md wins. That includes hats (now costumes), the rule against new obstacles (chopping knives are new), and the phone-shaped frame (the game now fills any screen).

## Protect the live game

- Every push to `main` redeploys the live site. Do all work on a branch.
- Do not change `main` until Ben has played the new build and says to ship it.
- Do not touch the separate `egg-runner` repo.

## Limits

- Web first: plain HTML, CSS, and JavaScript. No game engine, no 3D library, and no build step unless you can show it is needed.
- The 3D look is faked by drawing 2D things at different sizes and positions. Movement stays three lanes plus a jump.
- No asset files. Draw all art in code and synthesize all sound in code. App icons are the one exception.
- Fill any screen, from an upright phone to a wide desktop window.
- Touch and keyboard both work fully.
- Runs offline after first load, saves progress on the device, and pauses when the player switches away.
- No network calls during play. This will later be wrapped as a phone app, so do not depend on anything a wrapper would break.
- Menus and text: light backgrounds, large type, high contrast.

## How to work

1. Read DESCRIPTION.md and SPEC.md, then show Ben a short plan and your questions before writing code.
2. Build in playable stages: track and look, obstacles, eggs and spares, the dog, chopping knives, costumes, start over.
3. Keep every tuning number in one commented place. The main player is a child, so Ben will retune after playtesting.
4. Write automated checks for the rules, and run them.
5. Where the description is silent, pick the simplest option that keeps the game fair and fun, and list those choices for Ben.
