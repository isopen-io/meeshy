// Régénère vues/*.jpg depuis project/ (après `node brief/build.mjs`). NODE_PATH=$(npm root -g) node brief/vues.cjs
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const R = path.resolve(__dirname, '..');
(async () => { const b = await chromium.launch();
  for (const f of fs.readdirSync(R + '/project').filter((x) => x.endsWith('.dc.html') && !/-[12]\.dc\.html$/.test(x))) {
    const s = fs.readFileSync(`${R}/project/${f}`, 'utf8'); const style = (s.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
    const body = s.slice(s.indexOf('</helmet>') + 9, s.indexOf('</x-dc>')); const w = Number((s.match(/class="mx[^"]*"[^>]*style="[^"]*?width:\s*(\d+)px/) || [])[1] || 1440);
    const p = await b.newPage({ viewport: { width: w, height: 800 } });
    await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${style}</style></head><body>${body}</body></html>`); if (w > 500) await p.evaluate(() => { document.body.style.zoom = '0.6'; }); await p.waitForTimeout(700);
    await p.screenshot({ path: `${R}/vues/${f.replace('.dc.html', '')}.jpg`, type: 'jpeg', quality: w > 500 ? 60 : 72, fullPage: true }); await p.close(); }
  await b.close(); })();
