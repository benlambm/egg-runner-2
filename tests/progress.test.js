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

// ── two tabs of the game open at once ───────────────────────────────────
// Each tab keeps its own copy of the progress. These checks open two
// "tabs" on the same storage and make sure neither wipes out the other.

test('two tabs: a costume unlocked in one tab is not wiped out by the other', () => {
  const storage = fakeStorage();
  const tabA = createProgress(storage, IDS, dice(3));
  const tabB = createProgress(storage, IDS, dice(8));      // opened before A unlocks anything
  const a = tabA.finishRun(1000).unlocked;
  const b = tabB.finishRun(50).unlocked;
  assert.notEqual(a, b, 'the second tab knows the first costume is already unlocked');
  const reopened = createProgress(storage, IDS, dice(1)).get();
  assert.deepEqual([...reopened.unlocked].sort(), [a, b].sort(), 'both costumes are kept');
  assert.equal(reopened.best, 1000, 'and the longer best distance');
  assert.equal(tabB.get().best, 1000);
});

test('two tabs: every kind of change picks up the other tab\'s progress first', () => {
  const storage = fakeStorage();
  const tabA = createProgress(storage, IDS, dice(3));
  const tabB = createProgress(storage, IDS, dice(8));
  const a = tabA.finishRun(700).unlocked;
  tabB.setSwitch('music', false);                          // only a switch, in the other tab
  let saved = createProgress(storage, IDS, dice(1)).get();
  assert.deepEqual(saved.unlocked, [a]);
  assert.equal(saved.music, false);
  assert.equal(tabB.wear(a), true, 'the other tab can wear what the first one unlocked');
  tabA.wear('plain');
  saved = createProgress(storage, IDS, dice(1)).get();
  assert.equal(saved.wearing, 'plain');
  assert.equal(saved.music, false, 'and the switch is still off');
  assert.equal(saved.best, 700);
});

test('two tabs: Start Over in one tab is not undone by the other', () => {
  const storage = fakeStorage();
  const tabA = createProgress(storage, IDS, dice(3));
  const tabB = createProgress(storage, IDS, dice(8));
  const old = tabB.finishRun(900).unlocked;
  tabB.finishRun(100);
  tabA.startOver();
  assert.equal(tabB.wear(old), false, 'the erased costume cannot be put back on from the other tab');
  const earned = tabB.finishRun(20).unlocked;
  const saved = createProgress(storage, IDS, dice(1)).get();
  assert.deepEqual(saved.unlocked, [earned], 'only the costume earned after Start Over');
  assert.equal(saved.best, 20);
});

test('sync() says whether another tab changed anything', () => {
  const storage = fakeStorage();
  const tabA = createProgress(storage, IDS, dice(3));
  const tabB = createProgress(storage, IDS, dice(8));
  assert.equal(tabB.sync(), false, 'nothing new');
  tabA.finishRun(10);
  assert.equal(tabB.sync(), true);
  assert.equal(tabB.get().unlocked.length, 1);
  assert.equal(tabB.sync(), false, 'already picked up');
  assert.equal(tabA.sync(), false, 'a tab\'s own saving is not news to itself');
});

// ── storage that misbehaves ─────────────────────────────────────────────

test('when saving fails (storage full), progress is kept for as long as the game is open', () => {
  // Reading works, writing does not: what a full or read-only storage does.
  for (const how of ['throws', 'silently does nothing']) {
    const base = fakeStorage();
    const storage = Object.assign({}, base, { setItem() { if (how === 'throws') throw new Error('QuotaExceededError'); } });
    const p = createProgress(storage, IDS, dice(4));
    const a = p.finishRun(300).unlocked;
    const b = p.finishRun(400).unlocked;
    p.setSwitch('sound', false);
    assert.equal(p.wear(a), true, how);
    assert.deepEqual(p.get().unlocked, [a, b], how + ': nothing is forgotten mid-game');
    assert.equal(p.get().best, 400);
    assert.equal(p.get().wearing, a);
    assert.equal(p.get().sound, false);
  }
});

test('storage that answers with something that is not text is treated as unreadable', () => {
  const weird = { getItem: () => ({ not: 'text' }), setItem() {}, removeItem() {} };
  const p = createProgress(weird, IDS, dice(4));
  const a = p.finishRun(10).unlocked;
  p.finishRun(10);
  assert.equal(p.get().unlocked.length, 2);
  assert.equal(p.wear(a), true);
});

// ── damaged saves ───────────────────────────────────────────────────────

test('a damaged save never shows nonsense: repeated costumes, impossible distances', () => {
  const open = data => createProgress(fakeStorage({ [KEY]: typeof data === 'string' ? data : JSON.stringify(data) }), IDS, dice(2));
  // The same costume listed many times counts once.
  let p = open({ unlocked: ['chef', 'chef', 'wizard', 'chef'], wearing: 'chef' });
  assert.deepEqual(p.get().unlocked, ['chef', 'wizard']);
  assert.equal(p.get().wearing, 'chef');
  // A best distance nobody could run is ignored (1e999 reads back as "infinity").
  for (const best of ['1e999', '1e300', '-1e999', '"far"', 'null', '[5]']) {
    p = open('{"best":' + best + ',"unlocked":["ninja"]}');
    assert.equal(p.get().best, 0, 'best ' + best);
    assert.deepEqual(p.get().unlocked, ['ninja'], 'the rest of the save is still used');
  }
  assert.equal(open({ best: 123456.5 }).get().best, 123456.5, 'an ordinary best distance is kept exactly');
  // The count of runs is a whole number, zero or more.
  for (const runs of ['-4.5', '1e999', '"3"', 'null']) assert.equal(open('{"runs":' + runs + '}').get().runs, 0, 'runs ' + runs);
  assert.equal(open({ runs: 7 }).get().runs, 7);
  // Switches are only off when the save clearly says off.
  p = open({ sound: 0, music: 'no' });
  assert.equal(p.get().sound, true); assert.equal(p.get().music, true);
  p = open({ sound: false, music: false });
  assert.equal(p.get().sound, false); assert.equal(p.get().music, false);
  // Things that are not a save at all.
  for (const junk of ['[]', 'null', '"x"', '42', 'true', '{"unlocked":"chef"}', '{"unlocked":{"0":"chef"}}', '{"unlocked":[1,null,{},["chef"]]}', '']) {
    p = open(junk);
    assert.deepEqual(p.get(), { unlocked: [], wearing: 'plain', best: 0, runs: 0, sound: true, music: true }, junk);
  }
});

test('an enormous save loads quickly and is tidied', () => {
  const huge = [];
  for (let i = 0; i < 150000; i++) huge.push('junk' + i);
  for (let i = 0; i < 150000; i++) huge.push('chef', 'wizard');
  const storage = fakeStorage({ [KEY]: JSON.stringify({ unlocked: huge, wearing: 'wizard', best: 99, extra: 'x'.repeat(200000) }) });
  const t0 = Date.now();
  const p = createProgress(storage, IDS, dice(2));
  assert.ok(Date.now() - t0 < 1500, 'took ' + (Date.now() - t0) + ' ms');
  assert.equal(p.get().unlocked.length, 2);
  assert.deepEqual(p.get().unlocked, ['chef', 'wizard']);
  assert.equal(p.get().wearing, 'wizard');
  p.wear('chef');
  assert.ok(storage.getItem(KEY).length < 300, 'and the next save is small again');
});

test('a save written by a newer version still loads what this version understands', () => {
  const storage = fakeStorage({ [KEY]: JSON.stringify({ version: 9, unlocked: ['chef', 'a-costume-from-the-future'], wearing: 'a-costume-from-the-future', best: 2500, sound: false, coins: 12 }) });
  const p = createProgress(storage, IDS, dice(2));
  assert.deepEqual(p.get().unlocked, ['chef']);
  assert.equal(p.get().wearing, 'plain', 'a costume this version does not have is not worn');
  assert.equal(p.get().best, 2500);
  assert.equal(p.get().sound, false);
});

test('Start Over erases nothing but this game\'s own progress', () => {
  const storage = fakeStorage({ 'another-game.save': 'keep me', 'egg-runner-2.other': 'keep me too', er_best: '4000' });
  const p = createProgress(storage, IDS, dice(11));
  p.setSwitch('sound', false);
  p.finishRun(5000);
  p.startOver();
  assert.equal(storage.getItem('another-game.save'), 'keep me');
  assert.equal(storage.getItem('egg-runner-2.other'), 'keep me too');
  assert.equal(storage.getItem('er_best'), null, 'the older flat game\'s leftovers go');
  const again = createProgress(storage, IDS, dice(11)).get();
  assert.deepEqual(again.unlocked, []);
  assert.equal(again.sound, false, 'the sound switch is a setting, so it stays as it was');
  assert.equal(again.music, true);
});
