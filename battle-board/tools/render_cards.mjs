// Renders every card in the hand (spells, techniques, actions, and each kit's Attack card) as a PNG, for docs/spells-and-actions.xlsx.
//   node tools/render_cards.mjs <out-dir>     (set THREE_LOCAL=/path/to/node_modules/three to serve Three.js from disk)
import { createRequire } from 'node:module'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const server = http.createServer((q, r) => { const p = path.join(root, new URL(q.url, 'http://x').pathname); const f = fs.existsSync(p) && fs.statSync(p).isDirectory() ? p + '/index.html' : p; if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/javascript' }); fs.createReadStream(f).pipe(r); });
await new Promise(r => server.listen(0, r));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 2 });
pg.on('pageerror', e => console.log('ERR', String(e).slice(0, 300)));
await pg.addInitScript(() => localStorage.setItem('battleboard.prefs', JSON.stringify({ sandbox: true, quality: 'low', sound: false })));
if (process.env.THREE_LOCAL) await pg.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)/, r => r.fulfill({ path: path.join(process.env.THREE_LOCAL, r.request().url().match(/three@[^/]+\/(.*)$/)[1]), contentType: 'application/javascript' }));
await pg.route(/fonts\.g/, r => r.abort());
await pg.goto(`http://localhost:${server.address().port}/`, { timeout: 0 });
await pg.waitForFunction(() => window.battleBoard?.dev, null, { timeout: 0 });
await pg.addStyleTag({ content: '.cardzoom { background: #1a1410 !important; backdrop-filter: none !important; } .card .art::before { animation: none !important; } .cardzoom .card.big .cx { -webkit-line-clamp: 12 !important; }' });
const shoot = async (id, file) => {
  const info = await pg.evaluate(id => battleBoard.dev.showCard(id), id);
  await pg.waitForTimeout(150);
  await pg.locator('#cardZoom .card.big').screenshot({ path: path.join(out, file + '.png'), animations: 'disabled', timeout: 0 });
  return info;
};
const meta = {};
for (const kit of ['spellblade', 'warden', 'ranger']) {
  await pg.evaluate(kit => { const B = battleBoard.dev, c = B.applyKit(B.newCharacter(), kit); B.enterPlay(B.freshState('crypt', [c])); }, kit);
  await pg.waitForTimeout(1500);
  meta['atk-' + kit] = await shoot('atk', 'atk-' + kit);
}
const ids = await pg.evaluate(() => battleBoard.dev.allIds());
for (const id of [...ids.spells, ...ids.techs, ...ids.acts]) meta[id] = await shoot(id, id.replace(':', '-'));
fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(meta, null, 1));
console.log(Object.keys(meta).length, 'cards');
await b.close(); server.close();
