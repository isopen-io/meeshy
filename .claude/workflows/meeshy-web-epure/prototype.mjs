import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2]; const ALL = JSON.parse(readFileSync(process.argv[3],'utf8')); const only = process.argv.slice(4);
const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, colorScheme:'light', locale:'fr-FR' });
const stats = {};
for (const [name, {path, rules}] of Object.entries(ALL)) {
  if (only.length && !only.includes(name)) continue;
  for (let attempt=0; attempt<4; attempt++) {
  const page = await ctx.newPage(); await page.clock.setFixedTime(new Date('2026-09-07T10:00:00Z'));
  await page.goto('http://localhost:4173'+path, { waitUntil:'networkidle' }); await page.waitForFunction(() => document.body.innerText.trim().split(/\s+/).length > 12, null, {timeout:8000}).catch(()=>{}); await page.waitForTimeout(700);
  const res = await page.evaluate((rules) => {
    const norm = s => s.replace(/\s+/g,' ').trim();
    const find = (prefix) => { const m = [...document.body.querySelectorAll('*')].filter(e => norm(e.textContent).startsWith(prefix)); return m.filter(e => ![...e.children].some(c => norm(c.textContent).startsWith(prefix))); };
    const badge = () => { const s = document.createElement('span'); s.dataset.b='1'; s.textContent='i'; s.style.cssText='display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;margin-inline-start:7px;border:1.5px solid #6366f1;color:#6366f1;border-radius:50%;font:italic 700 11px/1 Georgia,serif;vertical-align:middle;flex:none'; return s; };
    const miss = [];
    for (const [op, a, c] of rules) {
      if (op==='hud') { for (const p of ['1 960 jusqu','180 jusqu','12 440 étincelles']) for (const e of find(p)) { if (e.getBoundingClientRect().top < 90) e.style.display='none'; } continue; }
      const els = find(a); if (!els.length) { miss.push(a); continue; }
      for (const e of els) {
        if (op==='hide') e.style.display='none';
        if (op==='up') { let t=e; for(let i=0;i<c;i++) t=t.parentElement; t.style.display='none'; }
        if (op==='text') { const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT); const first=w.nextNode(); let n; while((n=w.nextNode())) { if(!n.parentElement.dataset.b) n.textContent=''; } if(first) first.textContent=c; }
        if (op==='info') { const prev = e.previousElementSibling; e.style.display='none'; if (prev) prev.appendChild(badge()); else e.parentElement.insertBefore(badge(), e); }
      }
    }
    let inView=0, total=0; const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT); let n;
    while((n=w.nextNode())){ const s=n.textContent.trim(); if(!s) continue; const el=n.parentElement; const r=el.getBoundingClientRect(); const cs=getComputedStyle(el); if(r.width<2||r.height<2||cs.visibility==='hidden'||cs.opacity==='0') continue; const k=s.split(/\s+/).length; total+=k; if(r.top<844&&r.bottom>0) inView+=k; }
    return { miss, inView, total, scrollH: Math.max(document.documentElement.scrollHeight, ...[...document.querySelectorAll('main,#contenu')].map(e=>e.scrollHeight)) };
  }, rules);
  await page.waitForTimeout(200);
  await page.screenshot({ path:`${OUT}/${name}.jpg`, type:'jpeg', quality:72 });
  stats[name]=res; await page.close(); if (res.total>5) { console.log(name, JSON.stringify(res)); break; }
  }
}
writeFileSync(`${OUT}/stats.json`, JSON.stringify(stats,null,1)); await b.close();
