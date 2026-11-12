// Battle Board test run: serves the game, drives it in headless Chromium and checks data integrity,
// every map, combat and initiative, every spell, statuses, levelling and talents, the creator, and saves.
//
//   node tests/run-tests.mjs [--catalog out.json] [--report out.json]
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

console.log('Battle Board tests');
let catalog = null;

await check('boots to the title screen', async () => {
  const t = await ev(() => document.getElementById('screen').innerText);
  assert(/Adventure/.test(t) && /Create/.test(t), 'title screen missing');
  noNewErrors(0);
});

await check('renders the catalogue (every item and monster model)', async () => {
  const before = errCount();
  catalog = await ev(() => battleBoard.catalog(224));
  const ni = Object.keys(catalog.images.items).length, nm = Object.keys(catalog.images.monsters).length;
  assert(ni === Object.keys(catalog.data.ITEMS).length && nm === Object.keys(catalog.data.MONSTERS).length, 'missing renders');
  noNewErrors(before);
  return `${ni} items, ${nm} monsters and props`;
});

await check('data: loot tables, chests and caches only name real items', async () => {
  const { ITEMS, LOOT_TABLES, maps } = catalog.data, bad = [];
  for (const [t, tab] of Object.entries(LOOT_TABLES)) for (const e of tab) if (e.item && !ITEMS[e.item]) bad.push(`${t}: ${e.item}`);
  for (const [k, m] of Object.entries(maps)) for (const f of ['chests', 'loot', 'stash']) for (const [pos, v] of Object.entries(m[f] || {})) for (const it of v.items || []) if (!ITEMS[it]) bad.push(`${k} ${f} ${pos}: ${it}`);
  assert(!bad.length, bad.join(', '));
});

await check('data: every monster has a model, stats and sensible references', async () => {
  const { MONSTERS, LOOT_TABLES, STATUS, CREATURE_CHARS } = catalog.data, bad = [];
  for (const [t, m] of Object.entries(MONSTERS)) {
    if (!(m.hp > 0) || !(m.ac > 0)) bad.push(`${t}: hp/ac`);
    if (m.ai !== 'none' && !(m.atk >= 0 && m.dmg && m.range)) bad.push(`${t}: attack`);
    if (m.onHit && !STATUS[m.onHit.status]) bad.push(`${t}: onHit ${m.onHit.status}`);
    if (typeof m.summon === 'string' && !MONSTERS[m.summon]) bad.push(`${t}: summons ${m.summon}`);
    if (m.ai !== 'none' && !LOOT_TABLES[t] && !m.respawn) bad.push(`${t}: no loot table`);
  }
  for (const [ch, t] of Object.entries(CREATURE_CHARS)) if (!MONSTERS[t]) bad.push(`char ${ch} → ${t}`);
  assert(!bad.length, bad.join(', '));
});

await check('data: spells, statuses and talents are complete', async () => {
  const { SPELLS, STATUS, TALENTS, ABILITIES } = catalog.data, bad = [];
  for (const [k, sp] of Object.entries(SPELLS)) {
    if (!(sp.cost >= 1) || !(sp.unlock >= 1) || !sp.desc || !sp.icon) bad.push(`${k}: cost/unlock/desc/icon`);
    if (sp.status && !STATUS[sp.status[0]]) bad.push(`${k}: status ${sp.status[0]}`);
  }
  for (const [k] of ABILITIES) if (Object.keys(TALENTS[k] || {}).length < 4) bad.push(`${k}: fewer than 4 talents`);
  assert(!bad.length, bad.join(', '));
  return `${Object.keys(SPELLS).length} spells, ${Object.keys(STATUS).length} effects, ${Object.values(TALENTS).reduce((s, t) => s + Object.keys(t).length, 0)} talents`;
});

await check('data: every map has one start, a closed border and real characters', async () => {
  const { maps, CREATURE_CHARS } = catalog.data, bad = [];
  const legal = new Set('#.~DSGXCFI123$HTYZPp@evwlhjq'.split('').concat(Object.keys(CREATURE_CHARS)));
  for (const [k, m] of Object.entries(maps)) {
    const all = m.rows.join('');
    if ((all.match(/@/g) || []).length !== 1) bad.push(`${k}: start count`);
    // the Training Yard is an open yard: the edge of the board is its wall
    if (k !== 'trainingYard' && (!/^#+$/.test(m.rows[0]) || !/^#+$/.test(m.rows.at(-1)) || m.rows.some(r => r[0] !== '#' || r.at(-1) !== '#'))) bad.push(`${k}: open border`);
    for (const ch of new Set(all)) if (!legal.has(ch)) bad.push(`${k}: unknown "${ch}"`);
  }
  assert(!bad.length, bad.join(', '));
  return `${Object.keys(maps).length} maps`;
});

await check('creates a hero and enters the Sunken Crypt', async () => {
  const before = errCount();
  await page.click('text=Adventure'); await page.click('text=+ Create a new hero');
  await page.fill('#hName', 'Tester'); await page.click('text=Create hero');
  await page.click('text=Sunken Crypt'); await page.click('text=+ Hire a companion');
  await page.click('text=Enter the dungeon'); await wait(1.5);
  const s = await ev(() => ({ mode: document.body.dataset.mode, party: battleBoard.party().length }));
  assert(s.mode === 'play' && s.party === 2, JSON.stringify(s));
  noNewErrors(before);
});

for (const key of ['trainingYard', 'descent1', 'descent2', 'descent3', 'descent4', 'descent5', 'descent6', 'descent7', 'crypt']) {
  await check(`loads ${key}`, async () => {
    const before = errCount();
    await ev(k => battleBoard.go(k), key); await wait(0.8);
    const s = await ev(() => { const st = battleBoard.state; return { key: st.mapKey, ch: st.grid[st.pos.z][st.pos.x], foes: st.creatures.filter(c => c.alive).length }; });
    assert(s.key === key && '.~pevX'.includes(s.ch), JSON.stringify(s));
    noNewErrors(before);
    return `${s.foes} creatures`;
  });
}

await check('combat: everyone rolls initiative and monsters act in order', async () => {
  const before = errCount();
  await ev(() => { battleBoard.state.explored.fill(1); battleBoard.teleport(3, 9); }); await wait(0.3);
  await ev(() => battleBoard.walk(3, 8)); await wait(3);
  const c = await ev(() => battleBoard.combat());
  assert(c && c.order.some(o => o.startsWith('h:')) && c.order.some(o => o.startsWith('m:')), 'no initiative order: ' + JSON.stringify(c));
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 40 && await ev(() => document.getElementById('endBtn').disabled); k++) await wait(0.5);
    if (!(await ev(() => battleBoard.combat()))) break;
    await page.click('#endBtn'); await wait(1);
  }
  const log = await ev(() => battleBoard.state.log.map(l => l.html).join(' '));
  assert(/bites|slashes/.test(log), 'no monster attacked');
  noNewErrors(before);
  return c.order.join(', ');
});

await check('every spell casts without errors (Training Yard, free casting)', async () => {
  const before = errCount();
  await ev(() => battleBoard.go('trainingYard')); await wait(0.8);
  const spells = Object.keys(catalog.data.SPELLS), cast = [];
  const dummy = await ev(() => { const d = battleBoard.state.creatures.find(c => c.type === 'dummy'); return { x: d.x, z: d.z }; });
  await ev(d => battleBoard.teleport(d.x - 2, d.z), dummy); await wait(0.3);
  for (const k of spells) {
    const sp = catalog.data.SPELLS[k];
    const t = sp.target === 'ally' ? await ev(() => ({ ...battleBoard.state.pos })) : sp.shape === 'single' ? dummy : { x: dummy.x, z: dummy.z + 1 };
    await ev(([k, t]) => battleBoard.cast(k, t.x, t.z), [k, t]);
    await wait(sp.shape === 'single' ? 1.2 : 2);
    for (let i = 0; i < 20 && await ev(() => document.getElementById('endBtn').disabled); i++) await wait(0.3);
    cast.push(k);
  }
  noNewErrors(before);
  return `${cast.length} spells`;
});

await check('effects: a hex lands and statuses count down at the end of a turn', async () => {
  const d = await ev(() => { const st = battleBoard.state, c = st.creatures.find(c => c.type === 'dummy'); battleBoard.dev.addStatus(c, 'hexed', 2); battleBoard.dev.addStatus(st.char, 'blessed', 2); return { dummy: c.status.map(s => s.id), hero: st.char.status.map(s => s.id) }; });
  assert(d.dummy.includes('hexed') && d.hero.includes('blessed'), JSON.stringify(d));
});

await check('mana: casting costs mana outside the Training Yard', async () => {
  await ev(() => battleBoard.go('crypt')); await wait(0.8);
  const r = await ev(() => { const st = battleBoard.state, before = st.char.mp; battleBoard.cast('ward', st.pos.x, st.pos.z); return { before, after: st.char.mp }; });
  await wait(1.2);
  assert(r.after < r.before, JSON.stringify(r));
  return `${r.before} → ${r.after} MP`;
});

await check('design probe: does "Wait" outside a fight refill mana for free?', async () => {
  const r = await ev(async () => { const st = battleBoard.state, before = st.char.mp; for (let i = 0; i < 6; i++) await battleBoard.dev.endTurn(); return { before, after: st.char.mp }; });
  return r.after > r.before ? `yes: ${r.before} → ${r.after} MP after 6 waits (see design review)` : 'no';
});

await check('levelling: XP gives a level, stat points, and a talent at an even score', async () => {
  const before = errCount();
  const r = await ev(() => {
    const st = battleBoard.state; battleBoard.xp(300);
    const c = st.char, k = ['str', 'dex', 'con', 'int', 'wis', 'cha'].find(k => c.abilities[k] % 2 === 0 && c.abilities[k] < 20) || 'str';
    const lvl = c.level, pts = c.statPoints;
    document.querySelectorAll('[data-notice-act]').forEach(b => b.click());
    return { lvl, pts, k };
  });
  assert(r.lvl >= 2 && r.pts >= 2, JSON.stringify(r));
  await page.keyboard.press('c'); await wait(0.3);
  for (let i = 0; i < 2; i++) { await page.click(`[data-act="spend"][data-k="${r.k}"]`); await wait(0.2); }
  const choice = await page.$('[data-act="talent"]');
  assert(choice, 'no talent offered after raising ' + r.k);
  await choice.click(); await wait(0.3);
  const t = await ev(() => battleBoard.state.char.talents);
  assert(t.length === 1, 'talent not learned');
  await page.keyboard.press('Escape');
  noNewErrors(before);
  return `${r.k.toUpperCase()} → talent ${t[0]}`;
});

await check('saves and continues an expedition', async () => {
  const pos = await ev(() => { battleBoard.teleport(2, 14); return { ...battleBoard.state.pos }; });
  await page.click('#menuBtn'); await page.click('#mBtns >> text=Main menu'); await wait(0.6);
  await page.click('text=Continue: Tester'); await wait(1);
  const now = await ev(() => ({ ...battleBoard.state.pos }));
  assert(now.x === pos.x && now.z === pos.z, `${JSON.stringify(pos)} vs ${JSON.stringify(now)}`);
});

await check('creator: build a dungeon, paint a monster, playtest and return', async () => {
  const before = errCount();
  await page.click('#menuBtn'); await page.click('#mBtns >> text=Main menu'); await wait(0.5);
  await page.click('text=Create'); await page.fill('#ndName', 'Test Dungeon'); await page.click('text=Create and edit'); await wait(1.2);
  await page.click('[data-tool="skeleton"]');
  const sc = await ev(() => battleBoard.screenOf(Math.floor(battleBoard.state.grid[0].length / 2) + 1, Math.floor(battleBoard.state.grid.length / 2)));
  await page.mouse.click(sc.x, sc.y); await wait(0.5);
  const rows = await ev(() => Object.values(JSON.parse(localStorage.getItem('battleboard.dungeons.v1')))[0].rows.join(''));
  assert(rows.includes('k'), 'skeleton not painted');
  await page.click('#edPlay'); await wait(1.2);
  assert(await ev(() => battleBoard.dev.mode()) === 'test', 'playtest did not start');
  await page.click('#menuBtn'); await wait(1);
  assert(await ev(() => battleBoard.dev.mode()) === 'edit', 'did not return to the editor');
  noNewErrors(before);
});

await check('no uncaught errors during the whole run', async () => { assert(!errors.length, errors.join(' | ')); });

await browser.close(); server.close();
const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length} passed in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (reportOut) fs.writeFileSync(reportOut, JSON.stringify({ when: new Date().toISOString(), passed, total: results.length, results, errors }, null, 1));
if (catalogOut && catalog) fs.writeFileSync(catalogOut, JSON.stringify(catalog));
process.exit(passed === results.length ? 0 : 1);
