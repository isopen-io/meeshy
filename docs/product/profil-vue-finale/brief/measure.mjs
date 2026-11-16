import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
const R = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(R + '/project').filter((f) => f.endsWith('.dc.html'));
const b = await chromium.launch(); const out = {};
for (const f of files) {
  const s = fs.readFileSync(`${R}/project/${f}`, 'utf8');
  const style = (s.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
  const body = s.slice(s.indexOf('</helmet>') + 9, s.indexOf('</x-dc>'));
  const w = Number((s.match(/class="mx"[^>]*style="[^"]*?width:\s*(\d+)px/) || [])[1] || 1440);
  const p = await b.newPage({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1 });
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${style}</style></head><body>${body}</body></html>`);
  await p.waitForTimeout(150);
  const m = await p.evaluate(() => { const r = document.querySelector('.mx'); const rr = r.getBoundingClientRect(); const ov = [...document.querySelectorAll('.mx *')].filter((e) => { const b = e.getBoundingClientRect(); if (!(b.width > 0 && b.right > rr.right + 1)) return false; for (let a = e; a && a !== r; a = a.parentElement) { const c = getComputedStyle(a); if (c.position === 'absolute' || c.overflowX !== 'visible') return false; } return true; }).length; return { h: Math.ceil(rr.height), w: Math.ceil(rr.width), sw: document.documentElement.scrollWidth, ov }; });
  out[f] = m;
  if (process.env.SHOT) { await p.setViewportSize({ width: w, height: Math.min(m.h, 5000) }); await p.waitForTimeout(900); await p.screenshot({ path: `${R}/shots/${f.replace('.dc.html', '')}.png` }); }
  await p.close();
}
await b.close(); console.log(JSON.stringify(out));
