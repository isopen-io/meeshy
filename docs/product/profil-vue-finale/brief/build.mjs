import fs from 'node:fs'; import path from 'node:path';
const R = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PH = path.resolve(R, '../../../node_modules/@phosphor-icons/core/assets');
const kit = fs.readFileSync(R + '/brief/kit.css', 'utf8').trim();
const map = fs.readFileSync(R + '/brief/map.svg.txt', 'utf8').trim();
const icon = (name) => {
  const fill = name.endsWith('-fill');
  const f = `${PH}/${fill ? 'fill' : 'regular'}/${name}.svg`;
  if (!fs.existsSync(f)) return null;
  return fs.readFileSync(f, 'utf8').replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<(path|circle|rect|line|polyline|polygon|ellipse)([^>]*?)\/>/g, '<$1$2></$1>');
};
const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(R + '/src').filter((f) => f.endsWith('.dc.html'));
let bad = 0;
for (const name of files) {
  const errs = [];
  let s = fs.readFileSync(`${R}/src/${path.basename(name)}`, 'utf8');
  s = s.replace('[[kit]]', kit).replaceAll('[[map]]', map);
  s = s.replace(/\[\[ic:([a-z0-9-]+)(?: (s|l|xl))?\]\]/g, (m, n, z) => {
    const b = icon(n);
    if (!b) { errs.push(`icône inconnue : ${n}`); return m; }
    return `<svg class="ic${z ? ' ' + z : ''}" viewBox="0 0 256 256" aria-hidden="true">${b}</svg>`;
  });
  if (/\[\[/.test(s)) errs.push('jeton [[…]] non résolu : ' + (s.match(/\[\[[^\]]*\]\]/g) || []).slice(0, 5).join(' '));
  if (!s.includes('<script src="./support.js"></script>')) errs.push('ligne support.js absente ou modifiée');
  if (!/<script type="text\/x-dc" data-dc-script/.test(s)) errs.push('bloc data-dc-script absent');
  const interactive = /Prototype/.test(name);
  const body = s.slice(s.indexOf('<x-dc>') + 6, s.indexOf('</x-dc>')).replace(/<style>[\s\S]*?<\/style>/g, '');
  if (!interactive && /\{\{|\}\}/.test(body)) errs.push('{{ ou }} dans le balisage');
  if (/\p{Extended_Pictographic}/u.test(body.replace(/[©®™↔⇄▾·→←↑↓]/g, ''))) errs.push('émoji ou pictogramme Unicode : ' + [...new Set(body.match(/\p{Extended_Pictographic}/gu))].join(' '));
  if (/position:\s*fixed/.test(body)) errs.push('position:fixed interdit');
  if (/<(iframe|object|embed)\b/.test(body)) errs.push('iframe/object/embed interdit');
  if (/<img[^>]+src="http/.test(body)) errs.push('image externe interdite');
  if (/\son(click|load|error)=/.test(body)) errs.push('attribut on…= en minuscules (événement HTML) interdit');
  const voids = new Set(['img', 'br', 'input', 'hr', 'meta', 'link', 'source', 'wbr', 'col']);
  const stack = [];
  const markup = body.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  for (const m of markup.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g)) {
    const [, close, tag, attrs] = m; const t = tag.toLowerCase();
    if (voids.has(t)) continue;
    if (/\/\s*$/.test(attrs)) { errs.push(`balise auto-fermante <${tag}/>`); continue; }
    if (!close) stack.push(t);
    else { const top = stack.pop(); if (top !== t) { errs.push(`fermeture </${t}> alors que <${top}> est ouvert (vers l'offset ${m.index})`); break; } }
  }
  if (stack.length && !errs.some((e) => e.startsWith('fermeture'))) errs.push('balises non fermées : ' + stack.slice(-4).join(' > '));
  if (/<div[^>]*\srole="button"|<span[^>]*\srole="button"/.test(body)) errs.push('role=button sur div/span');
  fs.mkdirSync(R + '/project', { recursive: true });
  fs.writeFileSync(`${R}/project/${path.basename(name)}`, s);
  if (errs.length) { bad++; console.log(`✗ ${name}\n  - ` + [...new Set(errs)].slice(0, 12).join('\n  - ')); } else console.log(`OK ${name} (${(s.length / 1024).toFixed(0)} ko)`);
}
process.exit(bad ? 1 : 0);
