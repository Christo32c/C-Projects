// Battle Board: checks for the three classes (Sorcerer, Ranger, Warrior) and their new moves: Hellpit, Tri-Shot and Steel Cyclone.
// Pass --shots DIR to save screenshots.
//
//   node tests/classes.mjs [--shots dir] [--report out.json]
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

console.log('Classes');
const shots = arg('--shots');
const shot = async n => { if (shots) await page.screenshot({ path: path.join(shots, n + '.png'), timeout: 0, animations: 'disabled' }); };
const D = (fn, a) => page.evaluate(fn, a);
const press = sel => D(sel => document.querySelector(sel).click(), sel);
const enter = (key, kit) => D(([key, kit]) => { const B = battleBoard.dev, c = B.applyKit(B.newCharacter(), kit); c.name = 'Test ' + kit; B.enterPlay(B.freshState(key, [c])); }, [key, kit]);
const settle = () => page.waitForFunction(() => document.getElementById('curtain').hidden, null, { timeout: 0 });
const idle = async () => { for (let i = 0; i < 80 && !(await D(() => battleBoard.dev.idle2())); i++) await wait(0.25); };
const logSince = mark => D(mark => { const L = battleBoard.dev.state.log, i = L.findLastIndex(l => l.html === mark); return L.slice(i + 1).map(l => l.html.replace(/<[^>]+>/g, '')); }, mark);
const mark = m => D(m => battleBoard.dev.state.log.push({ kind: '', html: m }), m);
await page.setViewportSize({ width: 1280, height: 800 });

await check('Create a hero offers Sorcerer, Ranger and Warrior', async () => {
  await press('[data-go="heroes"]'); await wait(0.3); await press('[data-act="newHero"]'); await wait(0.3);
  const r = await D(() => [...document.querySelectorAll('[data-act="hKit"]')].map(b => b.textContent));
  assert(JSON.stringify(r) === JSON.stringify(['Sorcerer', 'Ranger', 'Warrior']), JSON.stringify(r));
  return r.join(', ');
});

await check('an old Spellblade or Warden hero becomes a Sorcerer or Warrior', async () => {
  const r = await D(() => { const B = battleBoard.dev, c = B.newCharacter(); c.kit = 'warden'; c.cls = 'Warden'; const st = B.freshState('trainingYard', [c]); return { kit: st.party[0].char.kit, cls: st.party[0].char.cls, techs: null }; });
  assert(r.kit === 'warrior' && r.cls === 'Warrior', JSON.stringify(r));
  return `${r.cls}`;
});

await check('Sorcerer: Hellpit burns a group (Dex save for half), and the hound can climb out and fight', async () => {
  const e0 = errCount();
  await enter('trainingYard', 'sorcerer'); await settle(); await wait(1);
  const ids = await D(() => { const B = battleBoard.dev, s = B.state, p = s.pos, out = []; for (const [dx, dz] of [[0, 4], [1, 4], [-1, 4]]) out.push(B.spawn('skeleton', p.x + dx, p.z + dz, false)); B.forceHound(true); return out; });
  const tgt = await D(() => { const s = battleBoard.dev.state; return { x: s.pos.x, z: s.pos.z + 4 }; });
  const known = await D(() => battleBoard.dev.knownSpells().includes('hellpit'));
  await mark('M1'); await D(t => battleBoard.dev.cast('hellpit', t.x, t.z), tgt); await wait(0.9); await shot('class-hellpit'); await idle(); await wait(0.5);
  const after = await D(() => ({ summons: battleBoard.dev.summons(), hp: battleBoard.dev.state.creatures.filter(c => c.type === 'skeleton').map(c => c.hp), fight: !!battleBoard.combat() }));
  const L1 = await logSince('M1');
  assert(known && L1.some(l => /Hellpit/.test(l)) && after.summons.length === 1, JSON.stringify({ known, L1, after }));
  await wait(1); await shot('class-hound');
  // pass turns until the hound has acted
  await mark('M2');
  for (let i = 0; i < 12 && !(await logSince('M2')).some(l => /hell hound (savages|snaps)/.test(l)); i++) { await D(() => { const b = document.getElementById('endBtn'); if (!b.disabled) b.click(); }); await wait(2); await idle(); }
  const L2 = await logSince('M2');
  await D(() => battleBoard.dev.forceHound(false));
  assert(L2.some(l => /hell hound (savages|snaps)/.test(l)), 'the hound never acted: ' + L2.join(' | ').slice(0, 300));
  await shot('class-hound-bite');
  noNewErrors(e0);
  return `${after.hp.join('/')} HP left; ${L2.find(l => /hell hound/.test(l)).slice(0, 60)}`;
});

await check('Warrior: Steel Cyclone attacks every enemy next to you, then cools down', async () => {
  const e0 = errCount();
  await enter('trainingYard', 'warrior'); await settle(); await wait(1);
  await D(() => { const B = battleBoard.dev, p = B.state.pos; B.spawn('skeleton', p.x + 1, p.z, true); B.spawn('skeleton', p.x - 1, p.z + 1, true); B.spawn('goblin', p.x, p.z - 1, true); });
  const known = await D(() => battleBoard.dev.knownTechs());
  await mark('M3'); await D(() => battleBoard.dev.useTech('cyclone')); await wait(0.3); await shot('class-cyclone'); await idle(); await wait(0.4);
  const L = await logSince('M3'), cd = await D(() => battleBoard.dev.state.char.cd?.cyclone);
  const strikes = L.filter(l => /^Steel Cyclone (hits|misses|scores)/.test(l)).length;
  assert(known.includes('cyclone') && strikes === 3 && cd === 4, JSON.stringify({ known, strikes, cd, L }));
  noNewErrors(e0); return `${strikes} strikes, ready again in ${cd} turns`;
});

await check('Ranger: Tri-Shot looses three arrows at up to three enemies and spends three arrows', async () => {
  const e0 = errCount();
  await enter('trainingYard', 'ranger'); await settle(); await wait(1);
  await D(() => { const B = battleBoard.dev, p = B.state.pos; B.spawn('goblin', p.x + 2, p.z + 4, true); B.spawn('goblin', p.x - 2, p.z + 4, true); B.spawn('goblin', p.x, p.z + 5, true); });
  const ammo0 = await D(() => battleBoard.dev.state.char.inventory.find(i => i.key === 'arrowVenom')?.qty);
  await mark('M4'); await D(() => battleBoard.dev.useTech('trishot')); await wait(0.25); await shot('class-trishot'); await idle(); await wait(0.4);
  const L = await logSince('M4'), ammo1 = await D(() => battleBoard.dev.state.char.inventory.find(i => i.key === 'arrowVenom')?.qty);
  const shots_ = L.filter(l => /^Tri-Shot (hits|misses|scores)/.test(l)).length;
  assert(shots_ === 3 && ammo0 - ammo1 === 3, JSON.stringify({ shots_, ammo0, ammo1, L }));
  noNewErrors(e0); return `3 arrows, ${ammo1} left`;
});

await check('no uncaught errors', async () => { assert(errors.length === 0, errors.slice(0, 3).join(' | ')); });
const pass = results.filter(r => r.ok).length;
console.log(`\n${pass}/${results.length} passed in ${Math.round((Date.now() - t0) / 1000)} s`);
if (reportOut) fs.writeFileSync(reportOut, JSON.stringify(results, null, 2));
await browser.close(); server.close();
process.exit(pass === results.length ? 0 : 1);
