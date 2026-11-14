// What the game remembers: costumes, best distance, and Start Over.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createProgress, KEY } = require('../js/progress.js');
const costumes = require('../js/costumes.js');

function fakeStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
    map
  };
}
// A predictable "random" so checks can be repeated.
function dice(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
const IDS = costumes.ids;

test('there is a plain egg and a good number of full costumes', () => {
  assert.equal(IDS[0], 'plain');
  assert.equal(new Set(IDS).size, IDS.length, 'ids are unique');
  assert.ok(IDS.length - 1 >= 12, 'costumes: ' + (IDS.length - 1));
  for (const c of costumes.LIST) {
    assert.ok(c.name && c.name.length > 2);
    if (c.id !== 'plain') assert.ok(c.wear || c.front || c.back, c.id + ' changes how the egg looks');
  }
  for (const want of ['chef', 'cowboy', 'wizard', 'ninja']) assert.ok(IDS.includes(want), want);
});

test('a new game starts plain with nothing unlocked', () => {
  const p = createProgress(fakeStorage(), IDS, dice(1));
  assert.deepEqual(p.get().unlocked, []);
  assert.equal(p.get().wearing, 'plain');
  assert.equal(p.get().best, 0);
});

test('every run unlocks one new costume and puts it on straight away', () => {
  const p = createProgress(fakeStorage(), IDS, dice(7));
  const seen = [];
  for (let i = 0; i < IDS.length - 1; i++) {
    const out = p.finishRun(100);
    assert.ok(out.unlocked, 'run ' + i + ' unlocked something');
    assert.ok(!seen.includes(out.unlocked), 'never the same costume twice');
    assert.notEqual(out.unlocked, 'plain');
    assert.equal(p.get().wearing, out.unlocked);
    seen.push(out.unlocked);
    assert.equal(p.get().unlocked.length, i + 1);
  }
  assert.deepEqual([...seen].sort(), IDS.filter(id => id !== 'plain').sort());
});

test('once every costume is unlocked a run unlocks nothing and changes nothing', () => {
  const p = createProgress(fakeStorage(), IDS, dice(3));
  for (let i = 0; i < IDS.length - 1; i++) p.finishRun(1);
  p.wear('plain');
  const out = p.finishRun(1);
  assert.equal(out.unlocked, null);
  assert.equal(p.get().wearing, 'plain');
});

test('the unlock is random: different games unlock in different orders', () => {
  const first = seed => createProgress(fakeStorage(), IDS, dice(seed)).finishRun(1).unlocked;
  const firsts = new Set();
  for (let seed = 1; seed <= 40; seed++) firsts.add(first(seed * 7919));
  assert.ok(firsts.size >= 6, 'different first costumes: ' + firsts.size);
});

test('you can wear any unlocked costume or go back to plain, but not a locked one', () => {
  const p = createProgress(fakeStorage(), IDS, dice(5));
  const a = p.finishRun(1).unlocked, b = p.finishRun(1).unlocked;
  assert.equal(p.wear(a), true); assert.equal(p.get().wearing, a);
  assert.equal(p.wear('plain'), true); assert.equal(p.get().wearing, 'plain');
  const locked = IDS.find(id => id !== 'plain' && id !== a && id !== b);
  assert.equal(p.wear(locked), false);
  assert.equal(p.get().wearing, 'plain');
});

test('best distance only ever goes up', () => {
  const p = createProgress(fakeStorage(), IDS, dice(5));
  assert.equal(p.finishRun(500).newBest, true);
  assert.equal(p.finishRun(300).newBest, false);
  assert.equal(p.get().best, 500);
  assert.equal(p.finishRun(900).newBest, true);
  assert.equal(p.get().best, 900);
});

test('progress is still there after closing and reopening', () => {
  const storage = fakeStorage();
  const p = createProgress(storage, IDS, dice(9));
  const a = p.finishRun(1234).unlocked;
  p.finishRun(10);
  p.wear(a);
  const again = createProgress(storage, IDS, dice(9));
  assert.equal(again.get().best, 1234);
  assert.equal(again.get().wearing, a);
  assert.equal(again.get().unlocked.length, 2);
});

test('Start Over erases costumes, the costume worn and the best distance', () => {
  const storage = fakeStorage({ er_hats: '["none","crown"]', er_equipped: 'crown', er_best: '4000' });
  const p = createProgress(storage, IDS, dice(11));
  p.finishRun(5000); p.finishRun(100);
  p.startOver();
  assert.deepEqual(p.get().unlocked, []);
  assert.equal(p.get().wearing, 'plain');
  assert.equal(p.get().best, 0);
  // …and it stays erased after reopening, including the old game's leftovers.
  const again = createProgress(storage, IDS, dice(11));
  assert.deepEqual(again.get().unlocked, []);
  assert.equal(again.get().wearing, 'plain');
  assert.equal(again.get().best, 0);
  for (const k of ['er_hats', 'er_equipped', 'er_best']) assert.equal(storage.getItem(k), null);
});

test('the game still works when storage is missing or broken', () => {
  const none = createProgress(null, IDS, dice(2));
  assert.ok(none.finishRun(10).unlocked);
  const broken = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };
  const p = createProgress(broken, IDS, dice(2));
  assert.ok(p.finishRun(10).unlocked);
  p.startOver();
  assert.equal(p.get().wearing, 'plain');
  const junk = createProgress(fakeStorage({ [KEY]: '{not json' }), IDS, dice(2));
  assert.equal(junk.get().wearing, 'plain');
  const odd = createProgress(fakeStorage({ [KEY]: JSON.stringify({ unlocked: ['nope', 'chef'], wearing: 'nope', best: -5 }) }), IDS, dice(2));
  assert.deepEqual(odd.get().unlocked, ['chef']);
  assert.equal(odd.get().wearing, 'plain');
  assert.equal(odd.get().best, 0);
});
