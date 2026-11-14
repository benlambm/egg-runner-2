# Egg Runner 2 — Specification: Facelift, Tuning Fixes, and the Side Dog

**Status:** Implemented and live, November 14, 2026
**Applies to:** `benlambm/egg-runner-2` only, published at https://benlambm.github.io/egg-runner-2/
**Version label:** Egg Runner 2.0 (facelift). The game is not renumbered.

## 1. Scope and hard constraints

- Only Egg Runner 2 changes in this pass. The original Egg Runner (`benlambm/egg-runner`) stays untouched, and there is no Egg Runner 3: version 3 was aborted by Ben on November 12, 2026, and no version 3 repository may be created.
- The game stays a zero-dependency, static, canvas 2D Progressive Web App: `index.html`, `manifest.json`, `sw.js`, `SPEC.md`, and icons. No libraries, no WebGL, no build step.
- Existing 2.0 mechanics are preserved exactly unless a requirement below says otherwise: whole-egg collectibles in singles and runs of 3 to 5, +25 score per egg, shield bank cap of 5, a banked egg cracks in the player's place on a hit and removes the obstacle, 1,500 ms of flickering invulnerability after a shield crack, hats, scoring, controls (arrow keys and swipe), and the crack and game-over flow.
- All tuning constants live together near the top of the script, commented, so the next round of playtest feedback can be applied by changing numbers in one place.

## 2. Requirement A: Gentler difficulty ramp

Source: playtest feedback from Ben's niece (November 12, 2026): the game gets too difficult too fast.

- Starting speed is slightly lower than the 2.0 launch build: 5.5, was 6.
- Top speed is modestly lower: 15, was 18.
- The ramp takes about twice the distance to reach top speed: the speed formula divides distance by 10,000, was 5,000.
- Obstacle spacing respects reaction time and grows with speed. Every gap after a spawn is at least the larger of:
  - the distance travelled during one full jump cycle (rise, fall, land: about 583 ms at the game's gravity and jump strength) at the current speed, times a safety factor of 1.15, and
  - a fixed reaction-time gap of 620 ms of travel at the current speed,
  plus a random extra of up to 160 distance units.

## 3. Requirement B: Reliable re-jumping

Source: playtest feedback from Ben's niece: small hops between obstacles feel buggy, with not enough time to re-jump.

- Jump buffering, 120 ms: a jump pressed shortly before landing fires on the landing frame itself.
- Coyote time, 100 ms: a jump pressed shortly after leaving the ground still counts.
- Instant re-arm: the jump state resets on the same frame the egg lands. No cooldown, animation lock, or other input-eating state may delay the next jump.
- Combined with Requirement A's spacing rule, back-to-back obstacles are always clearable with small hops: the gap always exceeds one full jump cycle of travel by the safety factor.

## 4. Requirement C: The side dog

Source: feature request from Ben's niece, with Ben's clarification of the dodge (November 12, 2026): jump, or move away from the dog's side.

- Cadence: the dog appears occasionally, randomized between 25 and 45 seconds apart, and never during the first 20 seconds of a run.
- Arrival: it runs in from one side of the screen, chosen at random each visit, and runs alongside the egg at ground level on that side.
- Duration: exactly 10 seconds alongside, then it veers off and leaves.
- Fair warning: about 1 second before it arrives, paw prints creep in from the side it will use, and a bark sounds in the game's existing sound style.
- The threat: while present, the dog snaps at the egg from its side. Each snap has a visible wind-up of about 0.4 seconds (the dog shakes and its jaw drops), then a snap of about 150 ms covering ground level on the dog's side. Snaps land roughly every 1.6 to 2.2 seconds, randomized.
- The dodge, two ways, and both must work:
  - Jump: be airborne when the snap lands.
  - Move away: be on the far side of the track (any lane not on the dog's side) when the snap lands.
  A snap catches only a grounded egg standing on the dog's side.
- Getting caught uses the existing protection rules: a banked egg is consumed instead (the dog gets that egg), the shell-burst effect plays, and the usual 1,500 ms invulnerability applies. With an empty bank, the egg is eaten and the run ends. The game-over screen then reads "EATEN!" with the line "Eaten by the dog!"
- Fairness: obstacle spawning pauses during each snap's wind-up and snap, so no obstacle pattern can block both dodges at once.
- Art: the dog is drawn in the game's canvas style with the facelift's shading: side view, running legs, wagging tail, collar, and a jaw that opens on the wind-up and snap. It must read instantly as a dog at gameplay speed.

## 5. Requirement D: The facelift (digital-render look)

- Shaded eggs: the player egg and collectible whole eggs get gradient shading with the light from the upper left, a specular highlight, and a soft contact shadow that scales with jump height.
- Rendered obstacles: the existing obstacles (toaster, blender, carton, knife, butter) get gradient shading and grounding shadows, so everything sits in one lit world.
- Parallax kitchen world: layered depth replaces the flat background: a warm gradient wall (far layer), soft-focus cabinets and a counter edge (mid layer, scrolling at about a third of track speed), and the checker track with lane shading and a subtle sheen (full speed).
- Juice, kept cheap with capped canvas particles (maximum 90 alive at once): a sparkle burst when an egg is collected, a shell-fragment burst when a banked egg cracks in the player's place (including when the dog takes it), and a soft glow pulse on the HUD egg slots when protection is gained or lost.
- Panels and text: HUD and game-over panel keep the same information and layout with a light rendered finish. The start screen gains one line explaining the dog.
- Performance: no shadowBlur overuse, pre-rendered-style gradients and cheap alpha shapes only, so mobile frame rates hold.

## 6. Acceptance criteria

- The live published game loads the updated build: the served page carries the "Egg Runner 2.0 (facelift)" marker and the side dog code.
- Gameplay starts more slowly and ramps more gently, and obstacle spacing grows as speed rises (constants in section 2).
- Repeated jumps between obstacles succeed reliably, including a jump pressed just before landing (buffering) or just after leaving the ground (coyote time), verified in a logic harness.
- The side dog appears from one side for exactly 10 seconds, is telegraphed about 1 second ahead, and can be dodged both by jumping and by moving to the far side. It never blocks both dodges at once (obstacle spawning pauses during snaps).
- The facelift is visible in the live game: shaded eggs, shine, soft shadows, layered kitchen backdrop, pickup sparkles.
- The original Egg Runner is untouched, and no Egg Runner 3 repository exists.

## 7. Out of scope

- No new obstacles, hats, levels, or scoring changes.
- No changes to the original Egg Runner.
- No Egg Runner 3 work of any kind.
