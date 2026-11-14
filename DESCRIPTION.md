# Egg Runner 2: Plain Language Game Description

Nov 14, 2026 · Ben Lamb

You are a cartoon egg running endlessly through a kitchen. The goal is to get as far as you can before you crack.

## The look

The game should look three-dimensional without playing any differently. You look down the track from just behind and above the egg, and the track stretches away toward a horizon at the far end of the kitchen. Things ahead start small in the distance and grow as they rush toward you, so you can see what is coming well before it arrives.

This is a look, not a new way of moving. It is the trick old arcade racing games used to fake depth on a flat picture. There are still exactly three lanes, you still only step left, step right, and jump, and nothing about how the egg moves gets more complicated.

The egg's face always faces you, even though the egg is running away from you down the track. This works because the face is obviously a decoration, like a goofy face stuck on a cheap egg costume, and not a real face that has to point where the egg is going. That is true even for the plain egg with no costume on. The smile, the worried look, and the sweat drops are all part of the decoration, so they always show toward the player and never need to line up with the direction of the run.

## Where it plays

The game plays in a web browser on phones, tablets, and desktop computers, and it is the same game on all of them.

It fills whatever screen it is given and looks good at every width. On a phone held upright it fills the tall screen. On a desktop it uses the whole wide window instead of sitting in a phone-shaped box. The three-lane track stays centered, and the kitchen spreads out on both sides to fill the extra space. Nothing is stretched or squashed, the scores and menus stay readable, and the picture adjusts right away when the window is resized or the phone is turned.

Screen size never changes the rules. A bigger screen shows more kitchen, not more of the track ahead, so nobody gets more warning than anyone else.

Touch and keyboard both work fully: swipe on a touch screen, arrow keys on a keyboard. The game runs without an internet connection once it has loaded, remembers your progress on the device, and pauses if you switch away and come back.

It may later be packaged as a phone app for an app store, so it should feel like a complete game on its own, not like a web page.

## Moving

The track has three lanes. You can step left or right between them, and you can jump. Jumping is forgiving: a press that comes slightly early or slightly late still counts, and you can jump again the moment you land.

## Obstacles

Kitchen objects come at you down the lanes.

- Tall ones (toaster, blender, milk carton) cannot be jumped. Change lanes.
- Flat ones (a knife lying on the floor, a pat of butter) can be jumped or dodged.

These obstacles are always spaced so a clean escape exists. Chopping knives, described below, are the one exception.

A close call happens two ways: you jump and an obstacle passes right underneath you, or you switch lanes at the last moment and an obstacle brushes past where you just were. Either way, the egg's smile turns to a worried look and tear-shaped drops of sweat fly off it for about a second. After that the egg stays calm for the next 10 to 20 seconds, even through more close calls, so the sweat stays a special moment.

## Chopping knives

Big chopping knives hang over the track and chop up and down, each over one lane. Thanks to the depth of the view, you can see them rising and falling in the distance long before you reach them.

A chopping knife hits you if its blade comes down as you pass beneath it. Jumping does not help, because the blade comes from above. Stepping into a lane with no knife over it is the only sure way past.

Sometimes there is no sure way past. Knives can cover every lane, and their rhythm is uneven, so whether a blade is up or down as you run under it is partly luck. You cannot always avoid the chop.

A chop is a hit like any other: it costs one spare, or cracks you if you have none. This is the best reason to keep spares in your line.

## Spare eggs

Whole eggs along the track are treasure, never hazards. They appear alone or in short rows, and you can grab them on the ground or in midair. Each one scores 25 points, but whole eggs alone do not protect you.

Protection comes only from golden eggs. Some rows of whole eggs end with a golden egg. Collect every egg in the row without missing one, then grab the golden egg, and you earn one spare egg on top of its 25 points. Miss any egg in the row and the golden egg turns into an ordinary whole egg before you reach it.

You can carry up to five spares. A golden egg earned while you already carry five still scores.

Your spares trail behind you in a little line, like ducklings. They follow you from lane to lane and hop when you jump, so you can always see how much protection you have by looking at the runner. The trail is only for show: obstacles and the dog pass through it, and only a hit on you costs a spare.

## Getting hit

Any hit costs one spare egg. The last spare in your line cracks in your place, and whatever hit you is knocked away. You then blink for about a second and a half, and nothing can hurt you while you blink. If you are hit with no spares left, the run ends.

## The dog

Every so often, though never early in a run, paw prints and a bark warn that a dog is coming. It runs alongside you on one side for ten seconds, snapping every couple of seconds. Each snap has a visible wind-up first.

You are safe if you are in the air when it snaps, or if you are in the middle lane or on the far side. If it catches you, it eats the last spare in your line, or eats you if you have none. No new obstacles appear while it is winding up, so there is always a way out.

## Pace

The run starts gently and speeds up gradually the farther you go, up to a top speed. Score grows with distance, plus 25 points for every egg collected.

## Ending

When you crack or get eaten, the view slowly zooms in on the egg. Then the results show your distance, best distance, eggs collected, and score, along with the new costume you just unlocked.

## Costumes

The egg starts plain, with no costume at all. Every run unlocks one new costume, chosen at random, and you put it on right away. A costume is a full makeover of the egg (for example chef, cowboy, wizard, ninja), not just a hat.

Costumes are only for fun. Between runs you can switch to any costume you have unlocked, or go back to plain.

## Start over

The start screen and the game-over screen each have a Start Over button. It erases everything the game remembers: unlocked costumes, the costume you are wearing, and your best distance. The egg is plain again, as if the game had never been played. It asks "Are you sure?" first.

## Feel

Cheerful, silly, and readable at a glance. It is made for a child to play, so fairness and responsiveness matter more than difficulty. The chopping knives are the one deliberate exception: a bit of bad luck that you prepare for by keeping spares.
