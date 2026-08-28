#!/usr/bin/env node
// Régénère les captures de référence des vues du document de design.
//   node docs/product/MeeshyComposerDesign/capture-cibles.js [dossier-de-sortie]
// Sortie par défaut : docs/product/MeeshyComposerDesign/cible/
// Chaque .png est la CIBLE d'implémentation d'une vue ; vues.json en porte le texte.
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '../../..');
const DOC = path.join(HERE, 'MeeshyComposerMobile.dc.html');
const OUT = process.argv[2] || path.join(HERE, 'cible');

function findPlaywright() {
  const bun = path.join(ROOT, 'node_modules/.bun');
  if (fs.existsSync(bun)) {
    const hit = fs.readdirSync(bun).find(d => d.startsWith('playwright-core@'));
    if (hit) return path.join(bun, hit, 'node_modules/playwright-core');
  }
  return 'playwright-core';
}

function findChrome() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  return candidates.find(c => fs.existsSync(c));
}

(async () => {
  const { chromium } = require(findPlaywright());
  const executablePath = findChrome();
  if (!executablePath) throw new Error('Aucun Chrome/Chromium trouvé — installer Chrome ou `npx playwright install chromium`');

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1400 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DOC, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  const meta = await page.$$eval('.dv-opt', els => els.map(e => {
    const frame = e.querySelector('div[style*="height:"]');
    const words = frame ? [...frame.querySelectorAll('*')].map(n =>
      [...n.childNodes].filter(c => c.nodeType === 3).map(c => c.textContent.trim()).join(' ')
    ).filter(t => t && t.length > 1) : [];
    return {
      id: e.id,
      turn: e.closest('.dv-turn')?.querySelector('.dv-tname')?.textContent?.trim() || '',
      label: (e.querySelector('.dv-olabel')?.textContent || '').trim().replace(/^\d+[a-z]/, '').trim(),
      cap: (e.querySelector('.dv-cap')?.textContent || '').trim(),
      isScreen: frame ? Math.round(frame.getBoundingClientRect().width) < 500 : false,
      words: [...new Set(words)].slice(0, 60),
    };
  }));

  for (const m of meta) {
    const el = await page.$(`[id="${m.id}"] > div[style*="height:"]`) || await page.$(`[id="${m.id}"]`);
    await el.screenshot({ path: path.join(OUT, `${m.id}.png`) });
  }
  fs.writeFileSync(path.join(HERE, 'vues.json'), JSON.stringify(meta, null, 1));


  // Index lisible — SOURCE, jamais un tableau de bord : l'état vit dans les issues.
  const turns = [];
  for (const m of meta) {
    let t = turns.find(x => x.name === m.turn);
    if (!t) turns.push(t = { name: m.turn, items: [] });
    t.items.push(m);
  }
  const esc = s => s.replace(/\|/g, '\\|');
  const md = [
    '# MeeshyComposer — les vues mobiles cibles',
    '',
    "> **Ce fichier est une SOURCE, pas un tableau de bord.** L'état d'implémentation de chaque vue vit",
    '> dans son issue GitHub, jamais ici. Régénéré par `capture-cibles.js` — ne pas éditer à la main.',
    '',
    'Le document `MeeshyComposerMobile.dc.html` porte 34 planches : **31 écrans** à implémenter et',
    '**3 planches de doctrine** (pipeline, refus motivés, budgets) qui sont des critères de recette.',
    '',
    '```bash',
    'node docs/product/MeeshyComposerDesign/capture-cibles.js',
    '```',
    '',
    'Chaque `cible/<id>.png` est la **référence d\'implémentation** de sa vue. La conformité se juge sur la',
    'disposition, la hiérarchie, les états et les gestes — polices, couleurs et rayons passent par le design',
    'system Meeshy (`MeeshyColors`, `MeeshyFont`, `accentColor` de conversation).',
    '',
  ];
  for (const t of turns) {
    md.push(`## ${t.name}`, '', '| Vue | Ce que la vue établit | Doctrine |', '|---|---|---|');
    for (const m of t.items) {
      md.push(`| [\`${m.id}\`](cible/${m.id}.png)${m.isScreen ? '' : ' *(planche)*'} | ${esc(m.label)} | ${esc(m.cap)} |`);
    }
    md.push('');
  }
  fs.writeFileSync(path.join(HERE, 'vues.md'), md.join('\n'));

  const screens = meta.filter(m => m.isScreen).length;
  console.log(`${meta.length} captures dans ${OUT} — ${screens} écrans, ${meta.length - screens} planches de doctrine`);
  if (errors.length) console.error('ERREURS JS:', errors.slice(0, 5));
  await browser.close();
})().catch(e => { console.error('ÉCHEC:', e.message); process.exit(1); });
