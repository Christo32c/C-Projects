// Battle Board: checks for the Hero Builder and the Monster Forge.
// Pass --shots DIR to save screenshots.
//
//   node tests/builders.mjs [--shots dir] [--report out.json]
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
  localStorage.setItem('battleboard.prefs', JSON.stringify({ sandbox: true, quality: 'medium', sound: false }));
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

console.log('Builders');
const shots = arg('--shots');
const shot = async (n, clip) => { if (shots) await page.screenshot({ path: path.join(shots, n + '.png'), timeout: 0, animations: 'disabled', ...(clip ? { clip } : {}) }); };
const D = (fn, a) => page.evaluate(fn, a);
const press = sel => D(sel => { const b = document.querySelector(sel); if (!b) throw new Error('no ' + sel); b.click(); }, sel);
await page.setViewportSize({ width: 1280, height: 800 });
const look = () => D(() => battleBoard.dev.look());

await check('Hero Builder opens from Create a hero, in 3D beside the panel', async () => {
  await press('[data-go="heroes"]'); await wait(0.3); await press('[data-act="newHero"]'); await wait(0.3);
  await D(() => { document.getElementById('hName').value = 'Brakka'; document.getElementById('hName').dispatchEvent(new Event('input', { bubbles: true })); });
  await press('[data-act="openBuilder"]');
  await page.waitForFunction(() => document.body.classList.contains('building'), null, { timeout: 0 }); await wait(2);
  const r = await D(() => ({ tabs: document.querySelectorAll('#buildPanel [data-bt]').length, bases: document.querySelectorAll('#buildPanel .bases button').length, hand: getComputedStyle(document.getElementById('playBar')).display }));
  assert(r.tabs === 6 && r.bases === 6 && r.hand === 'none', JSON.stringify(r));
  await shot('builder-open');
  return '6 bases, 6 tabs';
});

await check('bases change the body: a dwarf is short and broad, an elf tall and slight', async () => {
  await press('[data-bk="base"][data-v="dwarf"]'); await wait(0.8); const dw = await look(); await shot('builder-dwarf', { x: 300, y: 60, width: 560, height: 680 });
  await press('[data-bk="base"][data-v="elf"]'); await wait(0.8); const el = await look();
  assert(dw.base === 'dwarf' && dw.height < 0.9 && dw.build > 1.2 && dw.beard === 'braided', JSON.stringify(dw));
  assert(el.base === 'elf' && el.height > 1 && el.ears === 'long', JSON.stringify(el));
  return `dwarf ${dw.height}×${dw.build}, elf ${el.height}×${el.build}`;
});

await check('the face: glowing eyes, curled horns, a long beard and a scar, seen close up', async () => {
  await press('[data-bt="face"]'); await wait(0.6);
  for (const [k, v] of [['eyes', 'glow'], ['horns', 'curled'], ['beard', 'long'], ['scar', 'eye'], ['paint', 'stripe'], ['mouth', 'grin']]) await press(`[data-bk="${k}"][data-v="${v}"]`);
  await wait(1); await shot('builder-face', { x: 200, y: 60, width: 670, height: 680 });
  const L = await look();
  assert(L.eyes === 'glow' && L.horns === 'curled' && L.beard === 'long' && L.scar === 'eye' && L.paint === 'stripe', JSON.stringify(L));
  return 'six face parts';
});

await check('hair style and hair colour are separate choices; outfit and colours apply', async () => {
  await press('[data-bt="hair"]'); await press('[data-bk="hair"][data-v="ponytail"]'); await press('[data-bk="hairColor"][data-v="#3a5a9a"]');
  await press('[data-bt="outfit"]'); for (const [k, v] of [['hat', 'hood'], ['cloak', 'long'], ['pack', 'backpack']]) await press(`[data-bk="${k}"][data-v="${v}"]`);
  await press('[data-bt="colours"]'); await press('[data-bk="color"][data-v="#8f3f3f"]');
  await wait(1); await shot('builder-outfit');
  const r = await D(() => ({ L: battleBoard.dev.look(), hair: battleBoard.dev.state.char.hair, color: battleBoard.dev.state.char.color }));
  assert(r.L.hair === 'ponytail' && r.hair === '#3a5a9a' && r.L.hat === 'hood' && r.L.cloak === 'long' && r.color === '#8f3f3f', JSON.stringify(r));
  return 'ponytail, blue hair, hood, long cloak';
});

await check('surprise me changes the look, and undo puts it back', async () => {
  const a = JSON.stringify(await look());
  await press('[data-ba="random"]'); await wait(0.4); const b = JSON.stringify(await look());
  await press('[data-ba="undo"]'); await wait(0.3); const c = JSON.stringify(await look());
  assert(a !== b, 'nothing changed'); assert(c !== b, 'undo did nothing');
  await press('[data-ba="random"]'); await wait(0.6); await shot('builder-random', { x: 300, y: 60, width: 560, height: 680 });
  return 'ok';
});

await check('keep the look: the new hero carries it, and Restyle reopens it', async () => {
  const before = await look();
  await press('[data-ba="done"]'); await wait(1.5);
  const sum = await D(() => document.querySelector('[data-act="openBuilder"]')?.nextElementSibling?.textContent || '');
  await press('[data-act="createHero"]'); await wait(0.5);
  const saved = await D(() => { const hs = JSON.parse(localStorage.getItem('battleboard.heroes.v1')); const h = hs.find(h => h.char.name === 'Brakka'); return h && { id: h.id, look: h.char.look, species: h.char.species }; });
  assert(saved && saved.look && saved.look.base === before.base && saved.look.hair === before.hair, JSON.stringify({ saved, before }));
  await press('[data-go="heroes"]'); await wait(0.3);
  await press(`[data-act="restyle"][data-id="${saved.id}"]`);
  await page.waitForFunction(() => document.body.classList.contains('building'), null, { timeout: 0 }); await wait(1);
  const again = await look();
  await press('[data-bt="outfit"]'); await press('[data-bk="hat"][data-v="wizard"]'); await press('[data-ba="done"]'); await wait(1);
  const after = await D(id => JSON.parse(localStorage.getItem('battleboard.heroes.v1')).find(h => h.id === id).char.look.hat, saved.id);
  assert(again.base === before.base && after === 'wizard', JSON.stringify({ again: again.base, after }));
  return `${saved.species} · "${sum.slice(0, 50)}"`;
});

await check('Monster Forge opens with a monster standing in the Training Yard', async () => {
  await press('[data-go="title"]').catch(() => {}); await D(() => battleBoard.dev.openMonsterForge()); await wait(2.5);
  const r = await D(() => ({ on: document.body.classList.contains('mforging'), c: battleBoard.dev.state.creatures.find(c => c.type === 'x_draft'), threat: document.querySelector('#monPanel .threat') !== null }));
  assert(r.on && r.c && r.c.alive && r.threat, JSON.stringify(r));
  await shot('monster-open');
  return `${r.c.hp} HP draft on the board`;
});

await check('restyle it as a giant purple spider, change its stats, and the threat updates', async () => {
  const t0 = await D(() => document.querySelector('#monPanel .threat').textContent);
  await press('[data-ma="body"][data-k="spider"]'); await wait(0.5);
  await D(() => { const B = battleBoard.dev; B.mforgeSet('tint', '#8a3aff'); B.mforgeSet('tintAmt', 0.6); B.mforgeSet('scale', 1.7); B.mforgeSet('hp', 60); B.mforgeSet('atk', 7); B.mforgeSet('eff', 'poisoned'); B.mforgeSet('name', 'Violet Widow'); });
  await wait(1.5); await shot('monster-spider');
  const r = await D(() => ({ t: document.querySelector('#monPanel .threat').textContent, m: battleBoard.dev.state.creatures.find(c => c.type === 'x_draft') }));
  assert(r.t !== t0 && r.m.hp === 60, JSON.stringify({ t0, r }));
  return r.t.replace(/\s+/g, ' ').slice(0, 90);
});

await check('fight it: combat starts, the forge hero cannot die, and Reset ends it', async () => {
  const e0 = errCount();
  await press('[data-ma="fight"]'); await wait(1);
  const inFight = await D(() => !!battleBoard.combat());
  for (let i = 0; i < 6; i++) { await D(() => { const B = battleBoard.dev; if (!document.getElementById('endBtn').disabled) document.getElementById('endBtn').click(); }); await wait(2.5); }
  await shot('monster-fight');
  const hp = await D(() => battleBoard.dev.state.char.hp);
  await press('[data-ma="reset"]'); await wait(1);
  const after = await D(() => ({ fight: !!battleBoard.combat(), hp: battleBoard.dev.state.char.hp }));
  assert(inFight && hp >= 1 && !after.fight, JSON.stringify({ inFight, hp, after }));
  noNewErrors(e0); return `hero at ${hp} HP after six rounds`;
});

let saved;
await check('save it: it gets a map letter and appears in the creator\'s palette; a dungeon with that letter spawns it', async () => {
  await press('[data-ma="save"]'); await wait(0.5);
  const r = await D(() => ({ f: battleBoard.dev.forgedMonsters(), t: battleBoard.dev.tools(), cc: battleBoard.dev.creatureChars() }));
  saved = r.f[0];
  assert(r.f.length === 1 && saved.ch && r.t.some(t => t.ch === saved.ch) && r.cc[saved.ch] === 'x_' + saved.id, JSON.stringify(r).slice(0, 300));
  const spawned = await D(s => { const st = battleBoard.dev.freshState('x', null, { name: 'Forge test', rows: ['#######', '#@..' + s.ch + '.#', '#######'], dark: false }); return st.creatures.map(c => c.type); }, saved);
  assert(spawned.includes('x_' + saved.id), JSON.stringify(spawned));
  return `letter ${saved.ch}`;
});

await check('a figure monster can be dressed in the Hero Builder and comes back to the forge', async () => {
  await press('[data-ma="new"]'); await wait(0.8);
  await press('[data-ma="builder"]');
  await page.waitForFunction(() => document.body.classList.contains('building'), null, { timeout: 0 }); await wait(1);
  await press('[data-bk="base"][data-v="horned"]'); await press('[data-bt="outfit"]'); await press('[data-bk="hat"][data-v="helm"]'); await press('[data-ba="done"]');
  await page.waitForFunction(() => document.body.classList.contains('mforging'), null, { timeout: 0 }); await wait(2);
  const r = await D(() => ({ base: battleBoard.dev.mforge().d.look.base, hat: battleBoard.dev.mforge().d.look.hat, on: !!battleBoard.dev.state.creatures.find(c => c.type === 'x_draft') }));
  await shot('monster-figure');
  assert(r.base === 'horned' && r.hat === 'helm' && r.on, JSON.stringify(r));
  return 'horned figure in a helm';
});

await check('phone: the monster forge sits under the board', async () => {
  await page.setViewportSize({ width: 390, height: 844 }); await wait(1.5);
  await shot('monster-phone');
  const r = await D(() => { const p = document.getElementById('monPanel').getBoundingClientRect(), c = document.getElementById('c').getBoundingClientRect(); return { pTop: p.top, cBottom: c.bottom }; });
  await D(() => battleBoard.dev.closeMonsterForge()); await page.setViewportSize({ width: 1280, height: 800 });
  assert(r.pTop >= r.cBottom - 2, JSON.stringify(r)); return `panel from ${Math.round(r.pTop)} px`;
});

await check('no uncaught errors', async () => { assert(errors.length === 0, errors.slice(0, 3).join(' | ')); });
const pass = results.filter(r => r.ok).length;
console.log(`\n${pass}/${results.length} passed in ${Math.round((Date.now() - t0) / 1000)} s`);
if (reportOut) fs.writeFileSync(reportOut, JSON.stringify(results, null, 2));
await browser.close(); server.close();
process.exit(pass === results.length ? 0 : 1);
