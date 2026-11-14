import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const root = process.argv[2];
const files = [];
const walk = d => { for (const f of readdirSync(d)) { const p = join(d,f); if (statSync(p).isDirectory()) walk(p); else if (/(-fr\.ts$|-fr-|catalog-fr)/.test(f) && !f.includes('.test.')) files.push(p); } };
walk(root);
const rows = []; const all = [];
for (const f of files) {
  const src = readFileSync(f,'utf8');
  const re = /^\s*['"]?([\w.\-:]+)['"]?\s*:\s*\n?\s*(['"`])((?:\\.|(?!\2).)*)\2,?\s*$/gm;
  let m; let n=0, chars=0, long=0, words=0;
  while ((m = re.exec(src))) { const v = m[3]; n++; chars+=v.length; const w=v.trim().split(/\s+/).length; words+=w; if (v.length>80) long++; all.push({f:f.replace(root+'/',''),k:m[1],v}); }
  rows.push({f:f.replace(root+'/',''), n, chars, long, words});
}
rows.sort((a,b)=>b.long-a.long);
const tot = rows.reduce((a,r)=>({n:a.n+r.n,chars:a.chars+r.chars,long:a.long+r.long,words:a.words+r.words}),{n:0,chars:0,long:0,words:0});
console.log('files',files.length,JSON.stringify(tot));
const b = [0,0,0,0,0]; for (const s of all){const l=s.v.length; b[l<=20?0:l<=40?1:l<=80?2:l<=140?3:4]++;} console.log('buckets <=20,<=40,<=80,<=140,>140',b);
const kw = /(hint|help|description|desc|subtitle|explain|note|caption|detail|body|intro|lede|about|why|info)/i;
console.log('explanatory keys', all.filter(s=>kw.test(s.k)).length, 'words', all.filter(s=>kw.test(s.k)).reduce((a,s)=>a+s.v.split(/\s+/).length,0));
for (const r of rows.slice(0,45)) console.log(r.long, r.n, r.words, r.f);
import { writeFileSync } from 'node:fs'; writeFileSync(process.argv[3], JSON.stringify(all));
