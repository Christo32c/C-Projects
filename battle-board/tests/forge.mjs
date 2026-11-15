// Battle Board: checks for the Spell Forge (invent a spell, its card art and its look, cast it, save it, learn it).
// Pass --shots DIR to save screenshots.
//
//   node tests/forge.mjs [--shots dir] [--report out.json]
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

console.log('Spell Forge');
const shots = arg('--shots');
const shot = async n => { if (shots) await page.screenshot({ path: path.join(shots, n + '.png'), timeout: 0, animations: 'disabled' }); };
const D = (fn, a) => page.evaluate(fn, a);
const press = sel => D(sel => document.querySelector(sel).click(), sel);   // the panel's buttons (Playwright's stability wait never settles on them under the fixed-step clock)
const F = (p, v) => D(([p, v]) => battleBoard.dev.forgeSet(p, v), [p, v]);
await page.setViewportSize({ width: 1280, height: 800 });
const dummyHp = () => D(() => battleBoard.dev.state.creatures.find(c => c.type === 'dummy').hp);
const logTail = () => D(() => battleBoard.dev.state.log.slice(-2).map(l => l.html.replace(/<[^>]+>/g, '')).join(' | '));

await check('the title screen has a Spell Forge, and it opens beside the training dummy', async () => {
  await page.click('[data-act="forge"]'); await wait(2);
  const r = await D(() => ({ forging: document.body.classList.contains('forging'), panel: !!document.querySelector('#forgePanel h2'), card: !!document.querySelector('#forgePanel .fprev .card'), hand: battleBoard.dev.hand(), map: battleBoard.dev.state.mapKey }));
  assert(r.forging && r.panel && r.card && r.map === 'trainingYard' && r.hand.includes('s:c_draft'), JSON.stringify(r));
  await shot('forge-open');
  return 'draft card in the hand';
});

await check('cast the default spell at the dummy: an orb flies and the spell attack resolves', async () => {
  const e0 = errCount(), log0 = await D(() => battleBoard.dev.state.log.length);
  await press('[data-fa="cast"]'); await wait(0.5); await shot('forge-cast-orb');
  await wait(2);
  const n = await D(() => battleBoard.dev.state.log.length), t = await logTail();
  assert(n > log0 && /Starfall/.test(t), 'no log: ' + t);
  noNewErrors(e0); return t.slice(0, 90);
});

await check('restyle it: a fireball-style area spell with a Dex save, then cast it', async () => {
  const e0 = errCount();
  await F('name', 'Sunburst'); await F('shape', 'area'); await F('radius', 10); await F('land', 'save'); await F('save', 'dex'); await F('dn', 4); await F('ds', 6); await F('dtype', 'fire');
  await F('fx.preset', 'fireball'); await F('fx.color', '#ffe066'); await F('fx.size', 1.8); await F('eff', 'burning'); await F('erounds', 2);
  const sp = await D(() => { const s = battleBoard.dev.state; return null; });
  await press('[data-fa="cast"]'); await wait(1.4); await shot('forge-cast-burst');
  await wait(2);
  const t = await logTail(), desc = await D(() => document.querySelector('#forgePanel .fprev .cx').textContent);
  assert(/Sunburst/.test(t) && /4d6 fire/.test(desc), JSON.stringify({ t, desc }));
  noNewErrors(e0); return desc.slice(0, 80);
});

await check('pixel art: paint on the grid, and it becomes the card art and the particles', async () => {
  const e0 = errCount();
  await page.click('[data-fa="art"][data-k="pixel"]'); await wait(0.3);
  await page.click('[data-fa="pxstart"]'); await wait(0.2);
  const cv = await page.locator('#pxc').boundingBox();
  await page.mouse.move(cv.x + 10, cv.y + 10); await page.mouse.down(); await page.mouse.move(cv.x + 60, cv.y + 12); await page.mouse.up();
  await F('fx.particle', 'image'); await F('fx.preset', 'healword'); await F('fx.impact', 'swirl');
  const r = await D(() => ({ img: (battleBoard.dev.forge().d.img || '').slice(0, 22), cardImg: !!document.querySelector('#forgePanel .fprev .art img.px'), sprite: !!battleBoard.dev.forge().d.fx }));
  await press('[data-fa="cast"]'); await wait(1.2); await shot('forge-pixel'); await wait(2);
  assert(r.img.startsWith('data:image/png') && r.cardImg, JSON.stringify(r));
  noNewErrors(e0); return 'pixel sprite cast';
});

await check('upload a picture for the card', async () => {
  await page.click('[data-fa="art"][data-k="upload"]'); await wait(0.3);
  await page.setInputFiles('#forgeFile', path.join(root, 'docs/screens/cards-phone-read.png').replace('cards-phone-read', fs.existsSync(path.join(root, 'docs/screens/cards-phone-read.png')) ? 'cards-phone-read' : 'cards-phone'));
  await page.waitForFunction(() => (battleBoard.dev.forge().d.img || '').startsWith('data:image/png') && battleBoard.dev.forge().d.art === 'upload', null, { timeout: 20000 });
  const r = await D(() => ({ len: battleBoard.dev.forge().d.img.length, card: !!document.querySelector('#forgePanel .fprev .art img') }));
  await shot('forge-upload');
  assert(r.card && r.len < 60000, JSON.stringify(r));
  await page.click('[data-fa="art"][data-k="glyph"]');
  return `${Math.round(r.len / 1024)} KB stored`;
});

await check('code mode: every library animation casts without errors', async () => {
  const e0 = errCount();
  await page.click('[data-fa="fxmode"][data-k="code"]'); await wait(0.3);
  const lib = await D(() => battleBoard.dev.fxLibrary());
  for (const k of lib) {
    await D(k => { const s = document.getElementById('fxLib'); s.value = k; s.dispatchEvent(new Event('change', { bubbles: true })); }, k);
    await press('[data-fa="libload"]');
    await press('[data-fa="cast"]'); await wait(k === 'meteors' || k === 'vortex' ? 1.4 : 0.9);
    if (['chain', 'meteors', 'vortex', 'implode'].includes(k)) await shot('forge-code-' + k);
    await wait(2.2);
    const err = await D(() => battleBoard.dev.forge().err); if (err) throw new Error(k + ': ' + err);
  }
  noNewErrors(e0); return lib.length + ' animations';
});

await check('code mode: a mistake shows under the editor and the spell still lands; the guide opens', async () => {
  await F('fx.code', 'fx.particle({ at: fx.to });\nundefinedThing();');
  const log0 = await D(() => battleBoard.dev.state.log.length);
  await press('[data-fa="cast"]'); await wait(2.5);
  const r = await D(() => ({ err: battleBoard.dev.forge().err, box: document.querySelector('#forgePanel .codeerr')?.textContent || '', logs: battleBoard.dev.state.log.length }));
  await shot('forge-code-error');
  await press('[data-fa="guide"]'); await wait(0.3);
  const g = await D(() => !document.getElementById('modal').hidden && /build guide/i.test(document.getElementById('modal').textContent));
  await shot('forge-guide'); await D(() => { document.getElementById('modal').hidden = true; });
  assert(/undefinedThing/.test(r.err) && /undefinedThing/.test(r.box) && r.logs > log0 && g, JSON.stringify({ r, g }));
  await press('[data-fa="libload"]');
  return r.err.slice(0, 60);
});

await check('save it; a level-1 Spellblade can learn it outside the forge', async () => {
  await press('[data-fa="save"]'); await wait(0.5);
  const ids = await D(() => battleBoard.dev.forged());
  await press('[data-fa="done"]'); await wait(1.5);
  const r = await D(id => {
    const B = battleBoard.dev, c = B.applyKit(B.newCharacter(), 'spellblade'); c.name = 'Learner'; B.enterPlay(B.freshState('crypt', [c]));
    return { known: B.knownSpells().includes('c_' + id), forging: document.body.classList.contains('forging'), draft: B.knownSpells().includes('c_draft') };
  }, ids[0]);
  assert(ids.length === 1 && r.known && !r.forging && !r.draft, JSON.stringify({ ids, r }));
  return 'known in the Sunken Crypt';
});

await check('phone: the forge sits under the board', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await D(() => battleBoard.dev.openForge(battleBoard.dev.forged()[0])); await wait(2);
  await shot('forge-phone');
  const r = await D(() => { const p = document.getElementById('forgePanel').getBoundingClientRect(), c = document.getElementById('c').getBoundingClientRect(); return { pTop: p.top, cBottom: c.bottom, w: p.width }; });
  await D(() => battleBoard.dev.closeForge()); await page.setViewportSize({ width: 1280, height: 800 });
  assert(r.pTop >= r.cBottom - 2 && r.w <= 392, JSON.stringify(r));
  return `panel from ${Math.round(r.pTop)} px`;
});

await check('no uncaught errors', async () => { assert(errors.length === 0, errors.slice(0, 3).join(' | ')); });
const pass = results.filter(r => r.ok).length;
console.log(`\n${pass}/${results.length} passed in ${Math.round((Date.now() - t0) / 1000)} s`);
if (reportOut) fs.writeFileSync(reportOut, JSON.stringify(results, null, 2));
await browser.close(); server.close();
process.exit(pass === results.length ? 0 : 1);
