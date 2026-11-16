// Coupe une planche-document trop haute en deux artboards, à la frontière d'un enfant direct de la racine.
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const R = path.resolve(__dirname, '..'); const OUT = process.env.OUT || R + '/project';
const VOID = new Set(['img', 'br', 'input', 'hr', 'meta', 'link', 'source', 'wbr', 'col']);
function children(inner) { const out = []; let depth = 0, start = -1; const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g; let m;
  while ((m = re.exec(inner))) { const t = m[2].toLowerCase(); if (VOID.has(t)) { if (depth === 0) out.push([m.index, re.lastIndex]); continue; }
    if (!m[1]) { if (depth === 0) start = m.index; depth++; } else { depth--; if (depth === 0) out.push([start, re.lastIndex]); } }
  return out; }
(async () => { const b = await chromium.launch(); const res = {};
  for (const f of process.argv.slice(2)) { const s = fs.readFileSync(`${R}/project/${f}`, 'utf8');
    const a = s.indexOf('</helmet>') + 9; const z = s.indexOf('</x-dc>'); const body = s.slice(a, z);
    const ro = body.search(/<div class="mx[ "]/); const roEnd = body.indexOf('>', ro) + 1; const rc = body.lastIndexOf('</div>');
    const inner = body.slice(roEnd, rc); const kids = children(inner);
    const style = (s.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${style}</style></head><body>${body}</body></html>`); await p.waitForTimeout(120);
    const g = await p.evaluate(() => { const r = document.querySelector('.mx'); const t = r.getBoundingClientRect().top; return { h: r.getBoundingClientRect().height, k: [...r.children].map((c) => ({ top: c.getBoundingClientRect().top - t, abs: getComputedStyle(c).position === 'absolute' })) }; });
    await p.close();
    if (g.k.length !== kids.length) { res[f] = { err: `enfants ${g.k.length} ≠ ${kids.length}` }; continue; }
    let best = -1, bd = 1e9; g.k.forEach((k, i) => { if (k.abs || i === 0) return; const d = Math.abs(k.top - g.h / 2); if (d < bd) { bd = d; best = i; } });
    const part = (keep) => s.slice(0, a) + body.slice(0, roEnd) + kids.filter((_, i) => g.k[i].abs || keep(i)).map(([x, y]) => inner.slice(x, y)).join('\n') + '\n' + body.slice(rc) + s.slice(z);
    const base = f.replace('.dc.html', '');
    const t = (x, n) => x.replace(/<title>([^<]*)<\/title>/, `<title>$1 (${n}/2)</title>`);
    fs.writeFileSync(`${OUT}/${base}-1.dc.html`, t(part((i) => i < best), 1)); fs.writeFileSync(`${OUT}/${base}-2.dc.html`, t(part((i) => i >= best), 2));
    res[f] = { cut: best, of: kids.length, at: Math.round(g.k[best].top), h: Math.round(g.h) }; }
  await b.close(); console.log(JSON.stringify(res)); })();
