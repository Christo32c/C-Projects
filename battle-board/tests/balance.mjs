// Battle Board: checks for combat balance (defence from armour or dodging, martial training) and weapon techniques.
// Fast: a few minutes.
//
//   node tests/balance.mjs [--report out.json]
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


console.log('Balance and techniques');
const shots = arg('--shots');
const shot = async n => { if (shots) await page.screenshot({ path: path.join(shots, n + '.png'), timeout: 0, animations: 'disabled' }); };
const D = (fn, a) => page.evaluate(fn, a);
const enter = (key, kits = ['spellblade']) => D(([key, kits]) => {
  const B = battleBoard.dev, chars = kits.map((k, i) => { const c = B.applyKit(B.newCharacter(), k); c.name = 'Hero ' + i; return c; });
  B.enterPlay(B.freshState(key, chars));
}, [key, kits]);
const nearest = () => D(() => { const s = battleBoard.dev.state; return s.creatures.filter(c => c.alive && !['crate', 'barrel', 'keg', 'urn', 'dummy'].includes(c.type)).sort((a, b) => Math.hypot(a.x - s.pos.x, a.z - s.pos.z) - Math.hypot(b.x - s.pos.x, b.z - s.pos.z))[0]; });
const cat = await D(() => battleBoard.catalog ? null : null);

await check('weak monsters are easy to hit; bosses are not', async () => {
  const out = [];
  for (const kit of ['spellblade', 'warden', 'ranger']) {
    await enter('crypt', [kit]); await wait(0.5);
    const r = await D(() => { const B = battleBoard.dev, s = B.state, by = t => s.creatures.find(c => c.type === t); return { rat: B.hitChance(by('rat').id), sk: B.hitChance(by('skeleton').id), boss: B.hitChance(by('warden').id), d: B.derived() }; });
    out.push(`${kit} rat ${Math.round(r.rat * 100)}% skeleton ${Math.round(r.sk * 100)}% boss ${Math.round(r.boss * 100)}%`);
    assert(r.rat >= 0.8 && r.sk >= 0.7, `${kit} misses weak monsters too often: ${JSON.stringify(r)}`);
    assert(r.boss <= 0.65 && r.boss >= 0.35, `${kit} vs the boss: ${r.boss}`);
    if (kit !== 'spellblade') assert(r.d.trained, kit + ' has no martial training');
  }
  return out.join(' · ');
});

await check('every monster defends with armour or by dodging', async () => {
  const bad = await D(() => { const s = battleBoard.dev.state; return 0; });
  const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), blk = src.slice(src.indexOf('const MONSTERS = {'), src.indexOf('// What each enemy carries.'));
  const rows = blk.split('\n').filter(l => /^  \w+:\s*\{/.test(l)), missing = rows.filter(l => !/object: true/.test(l) && !/guard: '(armor|dodge)'/.test(l)).map(l => l.trim().split(':')[0]);
  assert(!missing.length, 'no guard: ' + missing.join(', '));
  return rows.length + ' monsters';
});

await check('warden: Cleave, Shield Bash and Second Wind at level 1; they sit on the hotbar', async () => {
  await enter('crypt', ['warden']); await wait(0.5);
  const r = await D(() => ({ t: battleBoard.dev.knownTechs(), hb: battleBoard.dev.hotbar(), n: document.querySelectorAll('#spellbar [data-tech]').length }));
  assert(['cleave', 'bash', 'wind'].every(k => r.t.includes(k)) && r.hb.includes('t:cleave') && r.n === 3, JSON.stringify(r));
  return r.t.join(', ');
});

await check('Shield Bash: arms, rides the next attack, stuns on a hit, then cools down', async () => {
  const e0 = errCount();
  const r = await D(async () => {
    const B = battleBoard.dev, s = B.state, c = s.creatures.filter(c => c.alive && c.type === 'skeleton').sort((a, b) => Math.hypot(a.x - s.pos.x, a.z - s.pos.z) - Math.hypot(b.x - s.pos.x, b.z - s.pos.z))[0];
    s.pos.x = c.x - 1; s.pos.z = c.z; c.hp = 500; c.aware = true; B.refresh();
    let stunned = false, tries = 0, cdSeen = 0;
    for (; tries < 12 && !stunned; tries++) {
      s.char.cd = {}; s.turn.action = true; B.refresh();
      B.useTech('bash'); B.attack(c.id);
      cdSeen = Math.max(cdSeen, s.char.cd.bash || 0);
      stunned = (c.status || []).some(q => q.id === 'stunned');
    }
    return { stunned, tries, cdSeen, action: s.turn.action };
  });
  assert(r.stunned, 'never stunned in 12 tries'); assert(r.cdSeen === 3, 'cooldown ' + r.cdSeen); assert(!r.action, 'the attack did not use the action');
  await wait(1); noNewErrors(e0);
  return `stunned after ${r.tries} tr${r.tries > 1 ? 'ies' : 'y'}`;
});

await check('a technique on cooldown cannot be armed; Second Wind works once a fight', async () => {
  const r = await D(() => {
    const B = battleBoard.dev, s = B.state; s.turn.action = true; s.char.cd = { cleave: 2 }; B.refresh();
    B.useTech('cleave'); const armed = document.querySelector('#spellbar [data-tech="cleave"]').getAttribute('aria-pressed');
    s.char.hp = 3; s.char.fight = {}; B.useTech('wind'); const hp1 = s.char.hp; B.useTech('wind'); const hp2 = s.char.hp;
    return { armed, hp1, hp2 };
  });
  assert(r.armed === 'false', 'armed while cooling down'); assert(r.hp1 > 3 && r.hp2 === r.hp1, JSON.stringify(r));
  return `3 → ${r.hp1} HP`;
});

await check('ranger: Aimed Shot and Tumble at level 1; Tumble adds movement', async () => {
  await enter('crypt', ['ranger']); await wait(0.5);
  const r = await D(() => { const B = battleBoard.dev, s = B.state; s.creatures.find(c => c.type === 'skeleton').aware = true; B.refresh(); const m0 = s.turn.move; B.useTech('tumble'); return { t: B.knownTechs(), m0, m1: s.turn.move }; });
  assert(r.t.includes('aimed') && r.t.includes('tumble') && r.m1 === r.m0 + 4, JSON.stringify(r));
  return r.t.join(', ');
});

await check('no uncaught errors', async () => { assert(errors.length === 0, errors.join(' | ')); });
const pass = results.filter(r => r.ok).length;
console.log(`\n${pass}/${results.length} passed in ${Math.round((Date.now() - t0) / 1000)} s`);
if (reportOut) fs.writeFileSync(reportOut, JSON.stringify({ results, errors }, null, 2));
await browser.close(); server.close();
process.exit(pass === results.length ? 0 : 1);
