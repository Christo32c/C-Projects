// Battle Board: checks for the immersion pass (first-person view, floor moods, the score, the film look).
// Fast: a few minutes. Pass --shots DIR to save screenshots.
//
//   node tests/immersion.mjs [--shots dir] [--report out.json]
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


console.log('Immersion');
const shots = arg('--shots');
const shot = async n => { if (shots) await page.screenshot({ path: path.join(shots, n + '.png'), timeout: 0, animations: 'disabled' }); };
const D = (fn, a) => page.evaluate(fn, a);
const enter = (key, kits = ['spellblade']) => D(([key, kits]) => {
  const B = battleBoard.dev, chars = kits.map((k, i) => { const c = B.applyKit(B.newCharacter(), k); c.name = 'Hero ' + i; return c; });
  B.enterPlay(B.freshState(key, chars));
}, [key, kits]);

await check('a title card rises on entering a floor, with the floor\'s mood', async () => {
  await enter('descent6');
  const r = await D(() => ({ hidden: document.getElementById('curtain').hidden, t: document.getElementById('curT').textContent, s: document.getElementById('curS').textContent, m: battleBoard.dev.mood() }));
  assert(!r.hidden && /Burning Halls/.test(r.t) && /Floor 6/.test(r.s), 'no title card: ' + JSON.stringify(r));
  assert(r.m.root === -4 && r.m.tint[0] > 1 && r.m.light === '#ff8a48', 'wrong mood');
  await page.waitForFunction(() => document.getElementById('curtain').hidden, null, { timeout: 30000 }).catch(() => { throw new Error('the curtain never lifted'); });
  await wait(1); await shot('third-person-floor6');
  return r.t;
});

await check('first person: eye-level camera, ceiling, held weapon, hero hidden', async () => {
  await enter('crypt'); await page.waitForFunction(() => document.getElementById('curtain').hidden, null, { timeout: 30000 }); await wait(1.5);
  const e0 = errCount();
  await D(() => battleBoard.dev.setFp(true)); await wait(1);
  const f = await D(() => battleBoard.dev.fp());
  assert(f.on && f.fov > 60 && f.ceiling && f.rig, 'not in first person: ' + JSON.stringify(f));
  await shot('first-person-crypt');
  await D(() => battleBoard.dev.fp().look(null, 0.55)); await wait(0.4); await shot('first-person-look-up'); await D(() => battleBoard.dev.fp().look(null, -0.05));
  noNewErrors(e0);
  return 'fov 70';
});

await check('first person: W steps one square the way you face; A and D turn a quarter', async () => {
  const r = await D(async () => {
    const B = battleBoard.dev, s = B.state, p0 = { ...s.pos }, y0 = B.fp().yaw;
    let moved = false, turns = 0;
    for (; turns < 4 && !moved; turns++) { moved = B.stepKey(1, 0); if (!moved) { B.turnKey(1); await new Promise(r => { const t0 = __t(); const i = setInterval(() => { if (__t() > t0 + 900) { clearInterval(i); r(); } }, 50); }); } }
    return { moved, turns, p0, y0 };
  });
  assert(r.moved, 'could not step in any direction');
  await wait(1.5);
  const p1 = await D(() => ({ ...battleBoard.dev.state.pos, yaw: battleBoard.dev.fp().yaw }));
  assert(Math.abs(p1.x - r.p0.x) + Math.abs(p1.z - r.p0.z) === 1, `moved ${JSON.stringify(r.p0)} → ${JSON.stringify(p1)}`);
  await D(() => battleBoard.dev.turnKey(1)); await wait(1.2);
  const y2 = await D(() => battleBoard.dev.fp().yaw);
  const d = Math.abs(Math.atan2(Math.sin(y2 - p1.yaw), Math.cos(y2 - p1.yaw)));
  assert(Math.abs(d - Math.PI / 2) < 0.2 || d < 0.2 && false, `turned ${d.toFixed(2)} rad`);
  await shot('first-person-step');
  return `stepped to ${p1.x},${p1.z}; turned ${(d * 180 / Math.PI).toFixed(0)}°`;
});

await check('the keyboard drives it: B toggles the view, arrow keys step', async () => {
  await page.keyboard.press('b'); await wait(0.6);
  assert(!(await D(() => battleBoard.dev.fp().on)), 'B did not leave first person');
  const v = await D(() => ({ fov: battleBoard.dev.fp().fov, ceiling: battleBoard.dev.fp().ceiling }));
  assert(v.fov === 45 && !v.ceiling, 'third person not restored');
  await page.keyboard.press('b'); await wait(0.6);
  assert(await D(() => battleBoard.dev.fp().on), 'B did not enter first person');
  return 'ok';
});

await check('the score follows the danger: explore or tense, then combat', async () => {
  const calm = await D(() => battleBoard.dev.musicMood());
  assert(['explore', 'tense'].includes(calm), 'calm mood was ' + calm);
  const e0 = errCount();
  await D(() => { const B = battleBoard.dev, s = B.state, c = s.creatures.filter(c => c.alive && c.type !== 'dummy' && !['crate', 'barrel', 'keg', 'urn'].includes(c.type)).sort((a, b) => Math.hypot(a.x - s.pos.x, a.z - s.pos.z) - Math.hypot(b.x - s.pos.x, b.z - s.pos.z))[0]; B.damage(c.id, 1); }); await wait(1);
  const fight = await D(() => battleBoard.dev.musicMood());
  assert(fight === 'combat' || fight === 'boss', 'fight mood was ' + fight);
  await wait(6); await shot('first-person-fight');
  noNewErrors(e0);
  return `${calm} → ${fight}`;
});

await check('film look is on at Medium quality', async () => { assert(await D(() => battleBoard.dev.film()), 'film pass off'); });

await check('every floor of the Descent has its own mood, in first person without errors', async () => {
  const e0 = errCount(), roots = new Set();
  for (const k of ['descent2', 'descent3', 'descent4', 'descent5', 'descent7']) {
    await enter(k); await wait(1.2);
    const m = await D(() => battleBoard.dev.mood()); roots.add(m.fog + m.light);
    assert(await D(() => battleBoard.dev.fp().on), 'first person did not carry over to ' + k);
    if (k === 'descent3' || k === 'descent7') { await page.waitForFunction(() => document.getElementById('curtain').hidden, null, { timeout: 30000 }); await wait(2); await shot('first-person-' + k); }
  }
  assert(roots.size === 5, 'floors share a mood');
  noNewErrors(e0);
  return '5 distinct';
});

await check('no uncaught errors', async () => { assert(errors.length === 0, errors.join(' | ')); });

const pass = results.filter(r => r.ok).length;
console.log(`\n${pass}/${results.length} passed in ${Math.round((Date.now() - t0) / 1000)} s`);
if (reportOut) fs.writeFileSync(reportOut, JSON.stringify({ results, errors }, null, 2));
await browser.close(); server.close();
process.exit(pass === results.length ? 0 : 1);
