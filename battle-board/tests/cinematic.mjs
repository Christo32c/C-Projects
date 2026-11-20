// Battle Board: checks for cinematic blows, pieces that crumble or explode, and floating loot boxes.
// Pass --shots DIR to save screenshots.
//
//   node tests/cinematic.mjs [--shots dir] [--report out.json]
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

console.log('Cinematic');
const shots = arg('--shots');
const shot = async n => { if (shots) await page.screenshot({ path: path.join(shots, n + '.png'), timeout: 0, animations: 'disabled' }); };
const D = (fn, a) => page.evaluate(fn, a);
const settle = () => page.waitForFunction(() => document.getElementById('curtain').hidden, null, { timeout: 0 });
const idle = async () => { for (let i = 0; i < 80 && !(await D(() => battleBoard.dev.idle2())); i++) await wait(0.25); };
const hero = (kit, key = 'trainingYard') => D(([kit, key]) => { const B = battleBoard.dev, c = B.applyKit(B.newCharacter(), kit); c.name = 'Test'; B.enterPlay(B.freshState(key, [c])); }, [kit, key]);
await page.setViewportSize({ width: 1280, height: 800 });

await check('your blow: two steps back, then a fast smack, and the hit lands at the moment of impact', async () => {
  const e0 = errCount();
  await hero('warrior'); await settle(); await wait(0.5);
  const id = await D(() => { const B = battleBoard.dev, p = B.state.pos, id = B.spawn('zombie', p.x, p.z + 1, true); B.state.creatures.find(c => c.id === id).hp = 300; B.state.turn.action = true; return id; });
  await wait(0.4);
  // record every frame of the swing in the page itself
  const trace = await D(async id => { const B = battleBoard.dev, tr = []; B.attack2(id); await new Promise(res => { let n = 0; const f = () => { tr.push({ off: B.hs().off, hp: B.state.creatures.find(c => c.id === id).hp }); if (++n < 60) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); return tr; }, id);
  await shot('blow-after');
  const minOff = Math.min(...trace.map(t => t.off)), maxOff = Math.max(...trace.map(t => t.off)), firstHit = trace.findIndex(t => t.hp < 300), firstFwd = trace.findIndex(t => t.off > 0.1);
  assert(minOff < -0.1 && maxOff > 0.2, JSON.stringify({ minOff, maxOff }));
  assert(firstHit < 0 || firstHit >= firstFwd - 1, 'damage landed before the swing: ' + JSON.stringify({ firstHit, firstFwd }));
  await idle(); noNewErrors(e0);
  return `back ${minOff.toFixed(2)}, forward ${maxOff.toFixed(2)}`;
});

await check('a monster winds up and smacks too', async () => {
  const e0 = errCount();
  await hero('warrior', 'crypt'); await settle(); await wait(0.5);
  const id = await D(() => { const B = battleBoard.dev, p = B.state.pos; const id = B.spawn('skeleton', p.x, p.z + 1, false); B.state.creatures.find(c => c.id === id).hp = 300; return id; });
  await D(id => battleBoard.dev.attack2(id), id); await idle();   // starts the fight
  let minOff = 0;
  for (let i = 0; i < 4 && minOff > -0.1; i++) {
    minOff = Math.min(minOff, await D(async id => { const B = battleBoard.dev; let m = 0; const b = document.getElementById('endBtn'); if (!b.disabled) b.click();
      await new Promise(res => { let n = 0; const f = () => { const s = B.vstrike(id); if (s.off !== undefined) m = Math.min(m, s.off); if (++n < 120 && m > -0.1) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); return m; }, id));
    await idle();
  }
  await shot('monster-after');
  assert(minOff < -0.1, 'no wind-up seen: ' + minOff);
  noNewErrors(e0); return `back ${minOff.toFixed(2)}`;
});

await check('a dead piece crumbles into rubble and is gone; its loot floats in a box', async () => {
  const e0 = errCount();
  await hero('warrior'); await settle(); await wait(0.5);
  const id = await D(() => { const B = battleBoard.dev, p = B.state.pos; return B.spawn('skeleton', p.x + 1, p.z + 2, true); });
  await wait(0.5);
  await D(id => battleBoard.dev.killNow(id, false), id); await wait(0.6); await shot('death-crumble');
  await D(id => { const c = battleBoard.dev.state.creatures.find(c => c.id === id); c.loot = { items: ['potion'], gold: 7 }; c.looted = false; battleBoard.dev.lootBoxFor(id); }, id);
  await wait(2.5); await shot('loot-box');
  const r = await D(id => ({ broken: battleBoard.dev.broken(id), boxes: battleBoard.dev.lootBoxes() }), id);
  assert(r.broken && r.boxes.includes(id), JSON.stringify(r));
  noNewErrors(e0); return 'rubble, then a box';
});

await check('opening the box takes the loot, and the box pops and disappears', async () => {
  const e0 = errCount();
  const id = await D(() => battleBoard.dev.lootBoxes()[0]);
  const gold0 = await D(() => battleBoard.dev.state.char.gold);
  await D(id => battleBoard.dev.openLoot(id), id); await wait(0.3); await shot('loot-open');
  await D(() => [...document.querySelectorAll('#mBtns .btn, .modal .btn')].find(b => /Take all/.test(b.textContent)).click()); await wait(1.2);
  const r = await D(() => ({ boxes: battleBoard.dev.lootBoxes(), gold: battleBoard.dev.state.char.gold }));
  assert(!r.boxes.includes(id) && r.gold === gold0 + 7, JSON.stringify({ r, gold0 }));
  noNewErrors(e0); return `+7 gp, box gone`;
});

await check('a critical or crushing blow makes the piece explode instead', async () => {
  const e0 = errCount();
  const id = await D(() => { const B = battleBoard.dev, p = B.state.pos; return B.spawn('goblin', p.x - 1, p.z + 2, true); });
  await wait(0.5);
  await D(id => battleBoard.dev.killNow(id, true), id); await wait(0.25); await shot('death-explode');
  await wait(2.5);
  const r = await D(id => ({ broken: battleBoard.dev.broken(id) }), id);
  assert(r.broken, JSON.stringify(r));
  noNewErrors(e0); return 'exploded';
});

await check('no uncaught errors', async () => { assert(errors.length === 0, errors.slice(0, 3).join(' | ')); });
const pass = results.filter(r => r.ok).length;
console.log(`\n${pass}/${results.length} passed in ${Math.round((Date.now() - t0) / 1000)} s`);
if (reportOut) fs.writeFileSync(reportOut, JSON.stringify(results, null, 2));
await browser.close(); server.close();
process.exit(pass === results.length ? 0 : 1);
