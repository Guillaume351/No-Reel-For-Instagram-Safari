const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { createHash } = require('node:crypto');
const resource = path.resolve(__dirname, '../Shared (Extension)/Resources');
const html = fs.readFileSync(path.join(resource, 'popup.html'), 'utf8');
const script = fs.readFileSync(path.join(resource, 'popup.js'), 'utf8');
console.log('QA_SOURCE_SHA256 popup.js ' + createHash('sha256').update(script).digest('hex')); 
const keys = ['hideReels', 'hideFeedReels', 'keepReelsCollapsed', 'hideSearchReels', 'hideExploreTab', 'hideExploreRecommendations', 'hideSuggestedPosts', 'hideSponsoredPosts', 'hideSuggestedUsers', 'hideStories'];
const mixed = Object.fromEntries(keys.map((key, i) => [key, i % 2 === 0]));
const opposite = Object.fromEntries(keys.map(key => [key, !mixed[key]]));
function deferred() { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }
async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
async function fixture(t, { background, get, save = async () => {} }) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'safari-web-extension://no-reel/popup.html', virtualConsole: new VirtualConsole() });
  t.after(() => dom.window.close());
  const { window } = dom;
  const timers = new Map(); let nextID = 0; let writes = 0; let localReads = 0;
  window.setTimeout = (callback, delay) => { const id = ++nextID; timers.set(id, { callback, delay }); return id; };
  window.clearTimeout = id => timers.delete(id);
  window.browser = {
    i18n: { getMessage: key => key, getUILanguage: () => 'en' },
    runtime: { sendMessage: message => { if (message.type === 'getSettings') return background(); writes++; return Promise.resolve(save(message.payload)).then(() => ({ settings: message.payload })); } },
    storage: { sync: { get, set: async values => { writes++; return save(values); } }, local: { get: async () => { localReads++; return opposite; }, set: async () => { writes++; } } }
  };
  window.eval(script); await flush();
  return {
    window, timers,
    state: () => window.document.querySelector('#status').dataset.state,
    settings: () => Object.fromEntries(keys.map(key => [key, window.document.querySelector(`[name="${key}"]`).checked])),
    writes: () => writes, localReads: () => localReads,
    async expireRead() { const timer = [...timers].find(([, timer]) => timer.delay === 10000); assert.ok(timer, 'a 10s read deadline must exist'); timers.delete(timer[0]); timer[1].callback(); await flush(); }
  };
}
test('hanging background read falls back to the SAME sync store; late reply cannot replace the mixed snapshot', async t => {
  const late = deferred(); const s = await fixture(t, { background: () => late.promise, get: async () => mixed });
  assert.equal(s.window.document.querySelector('#showEverything').disabled, true); await s.expireRead();
  assert.equal(s.state(), 'idle'); assert.deepEqual(s.settings(), mixed); assert.equal(s.timers.size, 0);
  late.resolve({ settings: opposite }); await flush();
  assert.deepEqual(s.settings(), mixed); assert.equal(s.writes(), 0); assert.equal(s.localReads(), 0);
});
test('two never-settling reads expose Retry after20s and leave unknown preferences unwritable; late replies are ignored', async t => {
  const bg = deferred(), direct = deferred(); const s = await fixture(t, { background: () => bg.promise, get: () => direct.promise });
  await s.expireRead(); assert.equal(s.window.document.querySelector('#showEverything').disabled, true); await s.expireRead();
  assert.equal(s.state(), 'error'); assert.equal(s.window.document.querySelector('#retrySettings').hidden, false);
  assert.equal(s.window.document.querySelector('#showEverything').disabled, true);
  assert.equal([...s.window.document.querySelectorAll('input[type="checkbox"]')].every(control => control.disabled), true);
  s.window.document.querySelector('#showEverything').dispatchEvent(new s.window.Event('click', { bubbles: true }));
  const unknownControl = s.window.document.querySelector('[name="hideReels"]'); unknownControl.checked = false; unknownControl.dispatchEvent(new s.window.Event('change', { bubbles: true }));
  await flush(); assert.equal(s.writes(), 0);
  bg.resolve({ settings: opposite }); direct.resolve(opposite); await flush();
  assert.equal(s.state(), 'error'); assert.equal(s.window.document.querySelector('#showEverything').disabled, true);
  assert.equal(s.writes(), 0); assert.equal(s.localReads(), 0);
});
test('Retry recovers exact current mixed choices; old background and sync replies cannot overwrite the retry result', async t => {
  const bg = deferred(), direct = deferred(); let recovered = false;
  const s = await fixture(t, { background: () => recovered ? Promise.resolve({ settings: mixed }) : bg.promise, get: () => direct.promise });
  await s.expireRead(); await s.expireRead(); recovered = true;
  s.window.document.querySelector('#retrySettings').click(); await flush();
  assert.equal(s.state(), 'idle'); assert.deepEqual(s.settings(), mixed);
  assert.equal(s.window.document.querySelector('#retrySettings').hidden, true);
  assert.equal(s.window.document.querySelector('#showEverything').disabled, false);
  bg.resolve({ settings: opposite }); direct.resolve(opposite); await flush();
  assert.deepEqual(s.settings(), mixed); assert.equal(s.state(), 'idle'); assert.equal(s.writes(), 0);
});
test('rejected background plus stalled sync stays fail-closed and never reads a conflicting local store', async t => {
  const direct = deferred(); const s = await fixture(t, { background: async () => { throw new Error('unavailable'); }, get: () => direct.promise });
  await s.expireRead(); assert.equal(s.state(), 'error'); assert.equal(s.localReads(), 0); assert.equal(s.writes(), 0);
});
test('normal background read cancels its deadline without a direct storage request', async t => {
  let reads = 0; const s = await fixture(t, { background: async () => ({ settings: mixed }), get: async () => { reads++; return opposite; } });
  assert.equal(s.state(), 'idle'); assert.deepEqual(s.settings(), mixed); assert.equal(s.timers.size, 0); assert.equal(reads, 0); assert.equal(s.writes(), 0);
});
test('uncertain writes are never timed out into an automatic fallback write', async t => {
  const pending = deferred(); let writeAttempts = 0;
  const s = await fixture(t, { background: async () => ({ settings: mixed }), get: async () => mixed, save: () => { writeAttempts++; return pending.promise; } });
  s.window.document.querySelector('#showEverything').click(); await flush();
  assert.equal(s.state(), 'pending'); assert.equal(writeAttempts, 1); assert.equal(s.timers.size, 0); assert.equal(s.writes(), 1);
  pending.resolve(); await flush(); assert.equal(s.state(), 'success'); assert.equal(writeAttempts, 1);
});

test('late background rejection after its read deadline is handled and cannot replace the recovered choices', async t => {
  const late = deferred(); const s = await fixture(t, { background: () => late.promise, get: async () => mixed });
  await s.expireRead(); assert.equal(s.state(), 'idle'); assert.deepEqual(s.settings(), mixed);
  late.reject(new Error('late background rejection')); await flush();
  assert.equal(s.state(), 'idle'); assert.deepEqual(s.settings(), mixed); assert.equal(s.writes(), 0);
});
