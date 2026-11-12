// Battle Board: checks for the fixes from the design review (mana economy, kits, merchant, wounds, bosses,
// prepared spells, settings, the creator's reachability check and more). Fast: a minute or two.
//
//   node tests/review-fixes.mjs [--report out.json]
//
// Needs Playwright (npm i -D playwright, or a global install). Three.js loads from jsDelivr; set
// THREE_LOCAL=/path/to/node_modules/three to serve it from disk instead (for offline machines).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const catalogOut = arg('--catalog'), reportOut = arg('--report');

// --- a tiny static server for the game folder ---
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, 'index.html') : p;
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, r));
const url = `http://localhost:${server.address().port}/`;

const results = [];
const t0 = Date.now();
async function check(name, fn) {
  const s = Date.now();
  try { const note = await fn(); results.push({ name, ok: true, note: note || '', ms: Date.now() - s }); console.log(`  ok    ${name}${note ? ' · ' + note : ''}`); }
  catch (e) { results.push({ name, ok: false, note: String(e.message || e).slice(0, 400), ms: Date.now() - s }); console.log(`  FAIL  ${name} · ${String(e.message || e).slice(0, 300)}`); }
}
const assert = (c, msg) => { if (!c) throw new Error(msg); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|favicon/.test(m.text())) errors.push(m.text()); });
// a fixed-step clock, so animations and timers advance the same way however slow the machine is
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('battleboard.prefs', JSON.stringify({ sandbox: true, quality: 'low', sound: false }));
  let fake = 0; window.__t = () => fake; performance.now = () => fake;
  const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => raf(() => { fake += 1000 / 30; cb(fake); });
});
if (process.env.THREE_LOCAL) await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)/, r => r.fulfill({ path: path.join(process.env.THREE_LOCAL, r.request().url().match(/three@[^/]+\/(.*)$/)[1]), contentType: 'application/javascript' }));
await page.route(/fonts\.g/, r => r.abort());
await page.goto(url, { waitUntil: 'load' });
const wait = async s => { const a = await page.evaluate(() => __t()); await page.waitForFunction(t => __t() >= t, a + s * 1000, { timeout: 0, polling: 100 }); };
const ev = (fn, a) => page.evaluate(fn, a);
const errCount = () => errors.length;
const noNewErrors = before => assert(errors.length === before, `page errors: ${errors.slice(before).join(' | ')}`);
await wait(1);


console.log('Design review fixes');
const D = (fn, a) => page.evaluate(fn, a);
const enter = (key, kits = ['spellblade']) => D(([key, kits]) => {
  const B = battleBoard.dev, chars = kits.map((k, i) => { const c = B.applyKit(B.newCharacter(), k); c.name = 'Hero ' + i; return c; });
  B.enterPlay(B.freshState(key, chars));
}, [key, kits]);

await check('boots', async () => { assert(/Adventure/.test(await D(() => document.getElementById('screen').innerText)), 'no title'); });

await check('mana: passing rounds and walking restore nothing; potions do', async () => {
  await enter('crypt'); await wait(2);
  const r = await D(async () => {
    const s = battleBoard.dev.state, c = s.char; c.mp = 3;
    for (let i = 0; i < 6; i++) await battleBoard.dev.endTurn();
    const afterWait = c.mp;
    c.inventory.push({ key: 'manaPotion', qty: 1 }); battleBoard.dev.useHot('mana');
    return { afterWait, afterPotion: c.mp };
  });
  assert(r.afterWait === 3, `Pass a round gave mana: 3 → ${r.afterWait}`);
  assert(r.afterPotion > 3, 'the potion restored nothing');
  return `3 → ${r.afterWait} after 6 rounds, ${r.afterPotion} after a potion`;
});

await check('Fire Bolt costs 2, reaches 60 ft and deals 1d10', async () => {
  const f = await D(() => battleBoard.catalog(8).data.SPELLS.firebolt);
  assert(f.cost === 2 && f.range === 12 && f.damage.join() === '1,10', JSON.stringify(f));
});

await check('kits: Warden and Ranger start with their own gear and spell lists', async () => {
  const r = await D(() => {
    const B = battleBoard.dev, w = B.applyKit(B.newCharacter(), 'warden'), g = B.applyKit(B.newCharacter(), 'ranger');
    return { w: [w.cls, w.equipped.weapon, w.equipped.armor, w.castAbility], g: [g.cls, g.equipped.weapon, g.equipped.ammo, g.castAbility] };
  });
  assert(r.w.join() === 'Warden,mace,splint,wis', r.w.join()); assert(r.g.join() === 'Ranger,shortbow,arrowVenom,wis', r.g.join());
  await enter('crypt', ['ranger']); await wait(1);
  const known = await D(() => battleBoard.dev.knownSpells());
  assert(known.every(k => ['frostray', 'vines', 'healword', 'enfeeble', 'poison', 'regen', 'icewall'].includes(k)), 'ranger knows ' + known);
  return `ranger knows ${known.join(', ')}`;
});

await check('prepared spells: at most 8 on the hotbar', async () => {
  await enter('trainingYard'); await wait(1);
  const n = await D(() => document.querySelectorAll('#spellbar [data-spell]').length);
  const r = await D(() => { const B = battleBoard.dev; B.togglePrepared('hold'); return B.preparedSpells().length; });
  assert(n === 8 && r === 8, `${n} on the hotbar, ${r} after preparing a ninth`);
  return `${n} shown of 16 known`;
});

await check('hit odds show on the target', async () => {
  const t = await D(() => { const s = battleBoard.dev.state, d = s.creatures.find(c => c.type === 'dummy'); return battleBoard.dev.oddsText(d.id); });
  assert(/\d+% to hit/.test(t), t); return t;
});

await check('effects keep counting down out of a fight', async () => {
  const r = await D(() => { const B = battleBoard.dev, c = B.state.char; B.addStatus(c, 'blessed', 3); B.exploreStatusTick(); return c.status.find(s => s.id === 'blessed')?.rounds; });
  assert(r === 2, `blessed has ${r} rounds left`);
});

await check('wounds: each knockout costs 10% max HP until camp', async () => {
  const r = await D(() => { const B = battleBoard.dev, c = B.state.char, a = B.maxHpOf(c); c.wounds = 2; const b = B.maxHpOf(c); c.wounds = 0; return [a, b]; });
  assert(r[1] < r[0], r.join(' → ')); return `${r[0]} → ${r[1]} max HP with 2 wounds`;
});

await check('bosses: a second stun in a row is shrugged off; at half HP the phase begins', async () => {
  await enter('descent1'); await wait(2);
  const r = await D(() => {
    const B = battleBoard.dev, s = B.state, b = s.creatures.find(c => c.type === 'wolfRider');
    B.addStatus(b, 'stunned', 1); b.status = []; B.addStatus(b, 'stunned', 1);
    const second = b.status.some(x => x.id === 'stunned');
    const wolves = s.creatures.filter(c => c.type === 'wolf' && c.alive).length;
    B.damage(b.id, Math.ceil(b.hp / 2) + 1);
    return { second, wolves, id: b.id };
  });
  await wait(2);
  const wolves = await D(() => battleBoard.dev.state.creatures.filter(c => c.type === 'wolf' && c.alive).length);
  assert(!r.second, 'the boss was stunned twice in a row');
  assert(wolves > r.wolves, `no phase: wolves ${r.wolves} → ${wolves}`);
  return `wolves ${r.wolves} → ${wolves}`;
});

await check('a bigger party meets more monsters', async () => {
  const r = await D(() => { const B = battleBoard.dev, c = () => B.applyKit(B.newCharacter(), 'spellblade'); return [B.freshState('descent2', [c()]).creatures.length, B.freshState('descent2', [c(), c(), c()]).creatures.length]; });
  assert(r[1] > r[0], r.join(' vs ')); return `${r[0]} solo, ${r[1]} for three`;
});

await check('ambush: hitting an unaware monster first makes the monsters lose their first turn', async () => {
  await enter('descent1'); await wait(2);
  const r = await D(() => { const B = battleBoard.dev, s = B.state, g = s.creatures.find(c => c.type === 'goblin' && !c.aware); B.damage(g.id, 1); return s.creatures.filter(c => c.surprised).length; });
  assert(r > 0, 'nobody was surprised'); return `${r} monsters caught off guard`;
});

await check('passive Perception, the Stair Merchant, selling junk and respec', async () => {
  await enter('crypt'); await wait(1);
  const r = await D(() => {
    const B = battleBoard.dev, c = B.state.char; c.gold = 100; c.inventory.push({ key: 'ratTail', qty: 2 });
    const pots = () => c.inventory.find(i => i.key === 'potion')?.qty || 0, p0 = pots();
    B.openMerchant();
    const title = document.getElementById('mTitle').textContent;
    document.querySelector('[data-shop="buy"][data-k="potion"]').click();
    const g1 = c.gold;
    document.querySelector('[data-shop="sell"][data-k="ratTail"]').click();
    const g2 = c.gold;
    document.querySelector('#mBtns button').click();
    c.statPoints = 2; B.spendPoint('str'); B.spendPoint('str'); const raised = c.abilities.str;
    B.undoGrowth(); const undone = c.abilities.str;
    B.respec(); const back = c.abilities.str;
    return { title, p0, p1: pots(), g1, g2, raised, undone, back, pts: c.statPoints, passive: B.passiveOf(c) };
  });
  assert(r.title === 'The Stair Merchant', r.title);
  assert(r.p1 === r.p0 + 1 && r.g1 === 75 && r.g2 === 78, JSON.stringify(r));
  assert(r.undone === r.raised - 1 && r.back === r.raised - 2 && r.pts === 2, JSON.stringify(r));
  return `bought a potion (100 → 75 gp), sold a rat tail (+3), undo and respec work; passive Perception ${r.passive}`;
});

await check('settings: combat speed and key rebinding', async () => {
  const r = await D(() => {
    const B = battleBoard.dev; B.openSettings();
    document.querySelector('[data-act="setPace"][data-k="fast"]').click();
    B.prefs().keys = { potion: 'z' };
    const out = { pace: B.prefs().pace, z: B.remapKey('z'), q: B.remapKey('q') };
    B.prefs().keys = {}; document.querySelector('#mBtns button').click();
    return out;
  });
  assert(r.pace === 'fast' && r.z === 'q' && r.q === '', JSON.stringify(r));
});

await check('messages stack, four at most', async () => {
  await D(() => { for (let i = 0; i < 7; i++) battleBoard.dev.toast('Message ' + i); });
  const c = await D(() => { const t = battleBoard.dev; return t.toastCount(); });
  assert(c <= 4, `${c} toasts`);
});

await check('creator: walled-off monsters and exits are flagged', async () => {
  const r = await D(() => battleBoard.dev.reachProblems({ rows: ['#######', '#@.#n.#', '#..#.X#', '#######'], rooms: [] }).map(p => p.text));
  assert(r.some(t => /exit/.test(t)) && r.some(t => /walled off/.test(t)), r.join(' | '));
  return r.length + ' problems';
});

await check('every item has a real model for the floor', async () => { assert(await D(() => battleBoard.dev.itemModelOk()), 'missing model'); });

await check('no uncaught errors', async () => { assert(!errors.length, errors.join(' | ').slice(0, 400)); });

const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed in ${Math.round((Date.now() - t0) / 1000)} s`);
if (reportOut) fs.writeFileSync(reportOut, JSON.stringify({ results, errors }, null, 1));
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
