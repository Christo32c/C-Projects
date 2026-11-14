// Battle Board: checks for the hand of cards and the camera lens that keeps the board clear of it.
// Desktop, phone portrait and phone landscape. Pass --shots DIR to save screenshots.
//
//   node tests/cards.mjs [--shots dir] [--report out.json]
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

console.log('Cards');
const shots = arg('--shots');
const shot = async (n, pg = page) => { if (shots) await pg.screenshot({ path: path.join(shots, n + '.png'), timeout: 0, animations: 'disabled' }); };
const D = (fn, a, pg = page) => pg.evaluate(fn, a);
const enter = (key, kits = ['spellblade'], pg = page) => D(([key, kits]) => {
  const B = battleBoard.dev, chars = kits.map((k, i) => { const c = B.applyKit(B.newCharacter(), k); c.name = 'Hero ' + i; return c; });
  B.enterPlay(B.freshState(key, chars));
}, [key, kits], pg);
const settle = async (pg = page) => { await pg.waitForFunction(() => document.getElementById('curtain').hidden, null, { timeout: 30000 }); };
const cardBox = (id, pg = page) => pg.evaluate(id => { const b = document.querySelector(`#spellbar .card[data-id="${id}"]`).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + Math.min(b.height / 2, 20), top: b.top, w: b.width }; }, id);

await page.setViewportSize({ width: 1280, height: 800 });
await check('desktop: an Attack card leads the hand, the board is centred above it', async () => {
  await enter('crypt', ['warden']); await settle(); await wait(1.5);
  const r = await D(() => { const B = battleBoard.dev, L = B.lens(); return { hand: B.hand(), cards: document.querySelectorAll('#spellbar .card').length, bot: L.bot, prof: L.prof.id, view: L.view, tops: [...document.querySelectorAll('#spellbar .card')].map(b => Math.round(b.getBoundingClientRect().top)) }; });
  assert(r.hand[0] === 'atk' && r.cards === r.hand.length, 'hand: ' + JSON.stringify(r.hand));
  assert(r.prof === 'wide' && r.bot > 60 && r.view && r.view.offsetY > 0, 'lens: ' + JSON.stringify(r));
  assert(Math.min(...r.tops) > 800 - 130, 'cards stand too tall at rest: ' + r.tops);
  await shot('cards-desktop');
  return `${r.cards} cards, board shifted up ${Math.round(r.view.offsetY / 2)} px`;
});

await check('desktop: hovering lifts a card to full size; neighbours make room', async () => {
  const b = await cardBox('t:cleave');
  await page.mouse.move(b.x, b.y + 10); await wait(0.6);
  const r = await D(() => { const c = document.querySelector('#spellbar .card.lift'); return c && { id: c.dataset.id, top: Math.round(c.getBoundingClientRect().top), h: Math.round(c.getBoundingClientRect().height) }; });
  assert(r && r.id === 't:cleave' && r.top + r.h < 800, 'not lifted: ' + JSON.stringify(r));
  await shot('cards-desktop-hover');
  await page.mouse.move(640, 300); await wait(0.4);
  return `lifted to ${r.h} px tall`;
});

await check('desktop: drag the Attack card up onto the training dummy to strike it', async () => {
  const e0 = errCount();
  await enter('trainingYard', ['warden']); await settle(); await wait(1.5);
  const id = await D(() => { const B = battleBoard.dev, s = B.state, c = s.creatures.find(c => c.alive); c.hp = 200; s.turn.action = true; B.refresh(); return c.id; });
  await wait(0.5);
  const a = await cardBox('atk'), t = await D(id => battleBoard.dev.screenOf(id), id);
  await page.mouse.move(a.x, a.y + 10); await page.mouse.down();
  for (let k = 1; k <= 12; k++) { await page.mouse.move(a.x + (t.x - a.x) * k / 12, a.y + (t.y - a.y) * k / 12); }
  await wait(0.3);
  const mid = await D(() => ({ ghost: !!document.querySelector('.card.ghost.over'), armed: document.body.classList.contains('hand-armed') }));
  await shot('cards-desktop-drag');
  await page.mouse.up(); await wait(2.5);
  const r = await D(id => { const s = battleBoard.dev.state; return { action: s.turn.action, hp: s.creatures.find(c => c.id === id).hp, ghost: !!document.querySelector('.card.ghost') }; }, id);
  assert(mid.ghost && mid.armed, 'no ghost over the board while dragging: ' + JSON.stringify(mid));
  assert(!r.action && !r.ghost, 'the drop did not attack: ' + JSON.stringify(r));
  noNewErrors(e0);
  return r.hp < 200 ? `hit for ${200 - r.hp}` : 'swung and missed';
});

await check('aiming a spell card frames everything in range; putting it down returns the camera', async () => {
  await enter('crypt', ['spellblade']); await settle(); await wait(1.5);
  const d0 = await D(() => battleBoard.dev.camDist());
  const sp = await D(() => battleBoard.dev.hand().find(h => h.startsWith('s:')));
  const b = await cardBox(sp); await page.mouse.click(b.x, b.y + 10); await wait(1.2);
  const r = await D(() => ({ armed: document.body.classList.contains('hand-armed'), spell: battleBoard.dev.lens().framed, d: battleBoard.dev.camDist(), pressed: document.querySelector('#spellbar .card[aria-pressed="true"]')?.dataset.id }));
  await shot('cards-desktop-aim');
  await page.keyboard.press('Escape'); await wait(1.2);
  const r2 = await D(() => ({ armed: document.body.classList.contains('hand-armed'), framed: battleBoard.dev.lens().framed, d: battleBoard.dev.camDist() }));
  assert(r.armed && r.spell && r.pressed === sp && r.d > d0 + 1, 'not framed: ' + JSON.stringify({ d0, r }));
  assert(!r2.armed && !r2.framed && r2.d < r.d, 'did not come back: ' + JSON.stringify(r2));
  return `${sp.slice(2)}: camera ${d0.toFixed(1)} → ${r.d.toFixed(1)} → ${r2.d.toFixed(1)}`;
});

await check('keys still play the hand: 1 arms the first card after Attack; right-click reads a card', async () => {
  const first = await D(() => battleBoard.dev.hand()[1]);
  await page.mouse.move(640, 200); await page.keyboard.press('1'); await wait(0.4);
  const on = await D(() => document.querySelector('#spellbar .card[aria-pressed="true"]')?.dataset.id);
  await page.keyboard.press('Escape');
  const b = await cardBox(first); await page.mouse.click(b.x, b.y + 10, { button: 'right' }); await wait(0.4);
  const z = await D(() => ({ open: !document.getElementById('cardZoom').hidden, name: document.querySelector('#cardZoom .cn')?.textContent }));
  await shot('cards-desktop-read');
  await page.keyboard.press('Escape');
  assert(on === first && z.open && z.name, JSON.stringify({ first, on, z }));
  return `${z.name}`;
});

// --- a phone held upright, and on its side ---
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
phone.on('pageerror', e => errors.push(String(e)));
await phone.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('battleboard.prefs', JSON.stringify({ sandbox: true, quality: 'low', sound: false }));
  let fake = 0; window.__t = () => fake; performance.now = () => fake;
  const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => raf(() => { fake += 1000 / 30; cb(fake); });
});
if (process.env.THREE_LOCAL) await phone.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)/, r => r.fulfill({ path: path.join(process.env.THREE_LOCAL, r.request().url().match(/three@[^/]+\/(.*)$/)[1]), contentType: 'application/javascript' }));
await phone.route(/fonts\.g/, r => r.abort());
await phone.goto(url, { waitUntil: 'load', timeout: 0 });
await phone.waitForFunction(() => window.battleBoard?.dev, null, { timeout: 60000 });

await check('phone upright: a top-down camera, a small hand that fits the screen', async () => {
  const e0 = errCount();
  await enter('crypt', ['ranger'], phone); await settle(phone); await phone.waitForTimeout(2500);
  const r = await D(() => { const B = battleBoard.dev, L = B.lens(), cs = [...document.querySelectorAll('#spellbar .card')].map(b => b.getBoundingClientRect());
    return { prof: L.prof, bot: L.bot, fov: L.fov, left: Math.min(...cs.map(c => c.left)), right: Math.max(...cs.map(c => c.right)), top: Math.min(...cs.map(c => c.top)), n: cs.length }; }, null, phone);
  assert(r.prof.id === 'portrait' && r.fov > 55, 'profile: ' + JSON.stringify(r.prof));
  assert(r.left >= 0 && r.right <= 390 && r.top > 844 - 110, 'hand does not fit: ' + JSON.stringify(r));
  await shot('cards-phone', phone);
  noNewErrors(e0);
  return `${r.n} cards, fov ${Math.round(r.fov)}°, hand ${Math.round(r.bot)} px`;
});

await check('phone: tapping an aimed card lifts it, tucks the rest away and frames the targets', async () => {
  const b = await cardBox('t:aimed', phone);
  await phone.touchscreen.tap(b.x, b.y + 6); await phone.waitForTimeout(1500);
  const r = await D(() => ({ armed: document.body.classList.contains('hand-armed'), bot: battleBoard.dev.lens().bot, framed: battleBoard.dev.lens().framed, pressed: [...document.querySelectorAll('#spellbar .card[aria-pressed="true"]')].map(b => b.dataset.id) }), null, phone);
  await shot('cards-phone-aim', phone);
  assert(r.armed && r.bot < 40 && r.pressed.includes('t:aimed'), JSON.stringify(r));
  await D(() => battleBoard.dev.useTech('aimed'), null, phone); await phone.waitForTimeout(800);
  return `hand drops to ${Math.round(r.bot)} px`;
});

await check('phone: hold a card to read it', async () => {
  await D(() => battleBoard.dev.inspectCard('t:tumble'), null, phone); await phone.waitForTimeout(500);
  const open = await D(() => !document.getElementById('cardZoom').hidden, null, phone);
  await shot('cards-phone-read', phone);
  await D(() => { document.getElementById('cardZoom').hidden = true; }, null, phone);
  assert(open, 'no zoomed card'); return 'Tumble';
});

await check('phone on its side: a higher camera, the hand along the bottom', async () => {
  await phone.setViewportSize({ width: 844, height: 390 }); await phone.waitForTimeout(2000);
  const r = await D(() => ({ prof: battleBoard.dev.lens().prof.id, n: document.querySelectorAll('#spellbar .card').length }), null, phone);
  await shot('cards-phone-landscape', phone);
  assert(r.prof === 'short', JSON.stringify(r));
  return `${r.n} cards`;
});

await check('no uncaught errors', async () => { assert(errors.length === 0, errors.slice(0, 3).join(' | ')); });

const pass = results.filter(r => r.ok).length;
console.log(`\n${pass}/${results.length} passed in ${Math.round((Date.now() - t0) / 1000)} s`);
if (reportOut) fs.writeFileSync(reportOut, JSON.stringify(results, null, 2));
await browser.close(); server.close();
process.exit(pass === results.length ? 0 : 1);
