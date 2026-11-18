// Battle Board: checks for starting skills, the level 1 area attacks, and the easier first floors of the Descent.
// Pass --shots DIR to save screenshots.
//
//   node tests/skills.mjs [--shots dir] [--report out.json]
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

console.log('Skills');
const shots = arg('--shots');
const shot = async n => { if (shots) await page.screenshot({ path: path.join(shots, n + '.png'), timeout: 0, animations: 'disabled' }); };
const D = (fn, a) => page.evaluate(fn, a);
const press = sel => D(sel => { const b = document.querySelector(sel); if (!b) throw new Error('no ' + sel); b.click(); }, sel);
const settle = () => page.waitForFunction(() => document.getElementById('curtain').hidden, null, { timeout: 0 });
const idle = async () => { for (let i = 0; i < 80 && !(await D(() => battleBoard.dev.idle2())); i++) await wait(0.25); };
const mark = m => D(m => battleBoard.dev.state.log.push({ kind: '', html: m }), m);
const logSince = m => D(m => { const L = battleBoard.dev.state.log, i = L.findLastIndex(l => l.html === m); return L.slice(i + 1).map(l => l.html.replace(/<[^>]+>/g, '')); }, m);
// a hero made the way the screen makes them, with picks, dropped into a map
const hero = (kit, picks, key = 'crypt', level = 1) => D(([kit, picks, key, level]) => { const B = battleBoard.dev, c = B.applyKit(B.newCharacter(), kit); c.picks = picks; c.level = level; c.name = 'Test'; B.enterPlay(B.freshState(key, [c])); }, [kit, picks, key, level]);
await page.setViewportSize({ width: 1280, height: 900 });

await check('Create a hero: pick 3 spells for a Sorcerer; the list has area spells; a 4th is blocked', async () => {
  await press('[data-go="heroes"]'); await wait(0.3); await press('[data-act="newHero"]'); await wait(0.3);
  const r = await D(() => ({ opts: [...document.querySelectorAll('[data-act="hPick"]')].map(b => b.dataset.k), on: [...document.querySelectorAll('[data-act="hPick"][aria-pressed="true"]')].map(b => b.dataset.k), aoe: document.querySelectorAll('.pickrow .aoe').length, disabled: document.querySelectorAll('[data-act="hPick"]:disabled').length }));
  assert(r.on.length === 3 && r.opts.includes('s:earthshot') && r.opts.includes('s:frostfan') && r.opts.includes('s:thunderclap') && r.aoe >= 3 && r.disabled === r.opts.length - 3, JSON.stringify(r));
  await D(() => document.querySelector('.pickrow').scrollIntoView()); await shot('skills-sorcerer');
  return `${r.opts.length} options, ${r.aoe} area`;
});

await check('switching class resets the picks: a Warrior picks 3 skills, a Ranger 1 spell and 2 skills', async () => {
  await press('[data-act="hKit"][data-k="warrior"]'); await wait(0.2);
  const w = await D(() => ({ opts: [...document.querySelectorAll('[data-act="hPick"]')].map(b => b.dataset.k), on: [...document.querySelectorAll('[data-act="hPick"][aria-pressed="true"]')].map(b => b.dataset.k) }));
  await D(() => document.querySelector('.pickrow').scrollIntoView()); await shot('skills-warrior');
  await press('[data-act="hKit"][data-k="ranger"]'); await wait(0.2);
  const r = await D(() => [...document.querySelectorAll('[data-act="hPick"][aria-pressed="true"]')].map(b => b.dataset.k));
  assert(w.on.length === 3 && w.opts.includes('s:earthshaker') && w.opts.includes('t:cyclone') && r.length === 3 && r.includes('s:thornspray'), JSON.stringify({ w, r }));
  return `warrior ${w.on.join(', ')} · ranger ${r.join(', ')}`;
});

await check('you cannot create a hero with picks missing; a full set creates a hero who knows exactly them', async () => {
  await press('[data-act="hKit"][data-k="sorcerer"]'); await wait(0.2);
  await press('[data-act="hPick"][data-k="s:firebolt"]'); await wait(0.2);   // un-pick one
  await D(() => { document.getElementById('hName').value = 'Pyra'; document.getElementById('hName').dispatchEvent(new Event('input', { bubbles: true })); });
  await press('[data-act="createHero"]'); await wait(0.4);
  const blocked = await D(() => !JSON.parse(localStorage.getItem('battleboard.heroes.v1') || '[]').some(h => h.char.name === 'Pyra'));
  await press('[data-act="hPick"][data-k="s:thunderclap"]'); await press('[data-act="createHero"]'); await wait(0.4);
  const h = await D(() => JSON.parse(localStorage.getItem('battleboard.heroes.v1')).find(h => h.char.name === 'Pyra'));
  assert(blocked && h && h.char.picks.length === 3 && h.char.picks.includes('s:thunderclap'), JSON.stringify({ blocked, picks: h?.char.picks }));
  await hero('sorcerer', h.char.picks, 'crypt'); await settle();
  const known = await D(() => battleBoard.dev.knownSpells()), at3 = await D(() => { battleBoard.dev.setLevel(3); return battleBoard.dev.knownSpells(); });
  assert(known.length === 3 && !known.includes('hex') && at3.includes('hex') && at3.includes('firebolt'), JSON.stringify({ known, at3 }));
  return `level 1: ${known.join(', ')}; level 3 adds the rest`;
});

await check('Earth Shot: a cone of rocks, hardest up close (3 dice, then 2, then 1)', async () => {
  const e0 = errCount();
  await hero('sorcerer', ['s:earthshot', 's:firebolt', 's:frostfan'], 'trainingYard'); await settle(); await wait(0.5);
  await D(() => { const B = battleBoard.dev, p = B.state.pos; for (const d of [1, 2, 3]) { const id = B.spawn('zombie', p.x, p.z + d, true); B.state.creatures.find(c => c.id === id).hp = 200; } });
  const p = await D(() => battleBoard.dev.state.pos);
  await mark('E1'); await D(p => battleBoard.dev.cast('earthshot', p.x, p.z + 2), p); await wait(0.35); await shot('skills-earthshot'); await idle(); await wait(0.3);
  const hits = (await logSince('E1')).filter(l => /Earth Shot/.test(l));
  const dmg = await D(() => battleBoard.dev.state.creatures.filter(c => c.type === 'zombie').sort((a, b) => a.z - b.z).map(c => 200 - c.hp));
  assert(hits.length >= 3 && dmg.every(n => n > 0), JSON.stringify({ hits, dmg }));
  noNewErrors(e0); return `near → far: ${dmg.join(', ')} damage`;
});

await check('Frost Fan chills, and Thunderclap goes off around you at once', async () => {
  const e0 = errCount();
  await hero('sorcerer', ['s:frostfan', 's:thunderclap', 's:earthshot'], 'trainingYard'); await settle(); await wait(0.5);
  await D(() => { const B = battleBoard.dev, p = B.state.pos; for (const [dx, dz] of [[0, 2], [1, 2], [-1, 1], [1, -1]]) { const id = B.spawn('zombie', p.x + dx, p.z + dz, true); B.state.creatures.find(c => c.id === id).hp = 200; } });
  const p = await D(() => battleBoard.dev.state.pos);
  await mark('F1'); await D(p => battleBoard.dev.cast('frostfan', p.x, p.z + 2), p); await idle(); await wait(0.3);
  const L1 = await logSince('F1'), chilled = await D(() => battleBoard.dev.state.creatures.filter(c => (c.status || []).some(s => s.id === 'chilled')).length);
  await mark('T1'); await D(() => battleBoard.dev.selectSpell('thunderclap')); await wait(0.3); await shot('skills-thunderclap'); await idle(); await wait(0.3);
  const L2 = (await logSince('T1')).filter(l => /Thunderclap/.test(l));
  assert(L1.some(l => /Frost Fan/.test(l)) && L2.length >= 2, JSON.stringify({ L1, L2, chilled }));
  noNewErrors(e0); return `${chilled} chilled; Thunderclap ${L2.length - 1} hits`;
});

await check('Earthshaker (Warrior) and Scatter Shot (Ranger): cones that cost no mana and cool down', async () => {
  const e0 = errCount();
  await hero('warrior', ['t:cyclone', 's:earthshaker', 't:wind'], 'crypt'); await settle(); await wait(0.5);
  await D(() => { const B = battleBoard.dev, p = B.state.pos; B.spawn('zombie', p.x, p.z + 1, true); B.spawn('zombie', p.x, p.z + 2, true); });
  const p = await D(() => battleBoard.dev.state.pos), mp0 = await D(() => battleBoard.dev.state.char.mp);
  await mark('W1'); await D(p => { battleBoard.dev.state.turn.action = true; battleBoard.dev.selectSpell('earthshaker'); battleBoard.dev.cast('earthshaker', p.x, p.z + 2); }, p); await wait(0.35); await shot('skills-earthshaker'); await idle(); await wait(0.3);
  const w = { L: (await logSince('W1')).filter(l => /Earthshaker/.test(l)), cd: await D(() => battleBoard.dev.state.char.cd?.earthshaker), mp: await D(() => battleBoard.dev.state.char.mp) };
  await hero('ranger', ['s:thornspray', 't:trishot', 's:scattershot'], 'crypt'); await settle(); await wait(0.5);
  await D(() => { const B = battleBoard.dev, p = B.state.pos; B.spawn('zombie', p.x, p.z + 3, true); B.spawn('zombie', p.x + 1, p.z + 3, true); });
  const q = await D(() => battleBoard.dev.state.pos), a0 = await D(() => battleBoard.dev.state.char.inventory.find(i => i.key === 'arrowVenom')?.qty);
  await mark('R1'); await D(q => { battleBoard.dev.state.turn.action = true; battleBoard.dev.cast('scattershot', q.x, q.z + 3); }, q); await wait(0.3); await shot('skills-scattershot'); await idle(); await wait(0.3);
  const r = { L: (await logSince('R1')).filter(l => /Scatter Shot/.test(l)), cd: await D(() => battleBoard.dev.state.char.cd?.scattershot), a: await D(() => battleBoard.dev.state.char.inventory.find(i => i.key === 'arrowVenom')?.qty) };
  assert(w.L.length >= 2 && w.cd === 3 && w.mp === mp0, JSON.stringify(w));
  assert(r.L.length >= 2 && r.cd === 3 && a0 - r.a === 1, JSON.stringify({ r, a0 }));
  noNewErrors(e0); return `Earthshaker ${w.L.length - 1} hits, Scatter Shot ${r.L.length - 1}`;
});

await check('the Descent\'s first floor: goblins hit a level 1 Sorcerer about half as often and as hard', async () => {
  await hero('sorcerer', ['s:earthshot', 's:firebolt', 's:frostfan'], 'descent1'); await settle(); await wait(0.5);
  const r = await D(() => { const B = battleBoard.dev, s = B.state, g = s.creatures.find(c => c.type === 'goblin'), boss = s.creatures.find(c => c.type === 'wolfRider'); return { ease: B.ease(), g: B.foeAtk(g.id), boss: B.foeAtk(boss.id), def: B.derived().ac, hp: s.char.hp }; });
  const per = (atk, avg) => Math.max(0.05, Math.min(0.95, (21 - (r.def - atk)) / 20)) * avg;
  const before = per(4, 5.5), after = per(r.g, 3.5), bossB = per(5, 10), bossA = per(r.boss, 6);
  assert(r.ease && r.g === 2 && after < before * 0.6 && bossA < bossB * 0.6, JSON.stringify({ r, before, after }));
  return `goblin ${before.toFixed(1)} → ${after.toFixed(1)} a turn, wolf rider ${bossB.toFixed(1)} → ${bossA.toFixed(1)}, against ${r.hp} HP`;
});

await check('no uncaught errors', async () => { assert(errors.length === 0, errors.slice(0, 3).join(' | ')); });
const pass = results.filter(r => r.ok).length;
console.log(`\n${pass}/${results.length} passed in ${Math.round((Date.now() - t0) / 1000)} s`);
if (reportOut) fs.writeFileSync(reportOut, JSON.stringify(results, null, 2));
await browser.close(); server.close();
process.exit(pass === results.length ? 0 : 1);
