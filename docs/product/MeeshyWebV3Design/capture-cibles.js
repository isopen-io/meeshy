#!/usr/bin/env node
/**
 * Regenere les captures de reference des 31 vues de la planche web v3.
 *
 *   node docs/product/MeeshyWebV3Design/capture-cibles.js [dossier-de-sortie]
 *
 * Sortie par defaut : docs/product/MeeshyWebV3Design/cible/
 * Chaque .png est la CIBLE d'implementation d'une vue ; vues.json en porte
 * le titre, le sous-titre et la ROUTE web. vues.md en est l'index lisible.
 *
 * Ce fichier est une SOURCE, pas un tableau de bord : l'etat d'implementation
 * de chaque vue vit dans son issue GitHub, jamais ici.
 *
 * La planche est un prototype VIVANT (runtime dc + React). Le harnais :
 *   1. sert le dossier en HTTP local, en substituant les assets absents
 *      (_ds/nocturne-*: jetons -> ds-shim.css, bundle -> vide) ;
 *   2. intercepte unpkg.com (bloque derriere le proxy sortant) vers un cache
 *      npm local, cree a la demande ;
 *   3. pilote le navigateur de la planche (le panneau de droite liste chaque
 *      ecran avec sa route) et capture le cadre telephone, ecran par ecran.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '../../..');
const DOC = 'MeeshyWebV3.dc.html';
const OUT = process.argv[2] || path.join(HERE, 'cible');
const CACHE = path.join(ROOT, '.cache/dc-vendor');

const VENDOR = {
  'react@18.3.1/umd/react.production.min.js': 'react/umd/react.production.min.js',
  'react-dom@18.3.1/umd/react-dom.production.min.js': 'react-dom/umd/react-dom.production.min.js',
  '@babel/standalone@7.29.0/babel.min.js': '@babel/standalone/babel.min.js',
};
const PKGS = ['react@18.3.1', 'react-dom@18.3.1', '@babel/standalone@7.29.0', '@phosphor-icons/web@2.1.1', '@fontsource/inter@5.2.8', 'playwright-core@1.62.1'];
const INTER_WEIGHTS = [400, 500, 600, 700];

const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const mime = p => MIME[path.extname(p)] || 'application/octet-stream';

function ensureVendor() {
  const marker = path.join(CACHE, 'node_modules/.vendor-ok');
  if (fs.existsSync(marker)) return;
  fs.mkdirSync(CACHE, { recursive: true });
  if (!fs.existsSync(path.join(CACHE, 'package.json'))) {
    fs.writeFileSync(path.join(CACHE, 'package.json'), JSON.stringify({ name: 'dc-vendor', private: true, version: '0.0.0' }));
  }
  process.stderr.write(`[capture] cache absent — npm i ${PKGS.join(' ')} dans ${CACHE}\n`);
  execFileSync('npm', ['i', '--no-audit', '--no-fund', '--loglevel', 'error', ...PKGS], { cwd: CACHE, stdio: 'inherit' });
  fs.writeFileSync(marker, '');
}

function chromiumPath() {
  const direct = process.env.CHROMIUM_PATH;
  if (direct && fs.existsSync(direct)) return direct;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const candidates = [
    path.join(base, 'chromium/chrome-linux/chrome'),
    path.join(base, 'chromium'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  for (const c of candidates) {
    try { if (fs.statSync(c).isFile()) return c; } catch { /* suivant */ }
  }
  if (fs.existsSync(base)) {
    const hit = fs.readdirSync(base).find(d => d.startsWith('chromium-'));
    if (hit) {
      const p = path.join(base, hit, 'chrome-linux/chrome');
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error(`Aucun Chromium trouve (cherche sous ${base}). Poser CHROMIUM_PATH.`);
}

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    // Le design system externe de la planche n'est pas dans le depot :
    // on sert les jetons reconstitues, et un bundle vide.
    if (/^\/_ds\/[^/]+\/styles\.css$/.test(url)) {
      res.writeHead(200, { 'content-type': 'text/css' });
      return res.end(fs.readFileSync(path.join(HERE, 'ds-shim.css')));
    }
    if (/^\/_ds\//.test(url)) {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      return res.end('/* _ds bundle absent — non requis pour la capture */');
    }
    // Inter servi depuis le cache npm : la capture doit etre reproductible hors-ligne.
    const font = /^\/__fonts\/(.+)$/.exec(url);
    if (font) {
      const f = path.join(CACHE, 'node_modules/@fontsource/inter/files', font[1]);
      if (fs.existsSync(f)) {
        res.writeHead(200, { 'content-type': 'font/woff2', 'access-control-allow-origin': '*' });
        return res.end(fs.readFileSync(f));
      }
      res.writeHead(404); return res.end('no font');
    }
    const file = path.join(HERE, url === '/' ? DOC : url.replace(/^\/+/, ''));
    if (!file.startsWith(HERE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end('not found');
    }
    res.writeHead(200, { 'content-type': mime(file) });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

(async () => {
  ensureVendor();
  const NM = path.join(CACHE, 'node_modules');
  const { chromium } = require(path.join(NM, 'playwright-core'));
  const executablePath = chromiumPath();
  fs.mkdirSync(OUT, { recursive: true });

  const { server, port } = await serve();
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--font-render-hinting=none'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1500 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));

  // unpkg est bloque derriere le proxy sortant : on sert le cache npm local.
  await page.route('**://unpkg.com/**', route => {
    const spec = new URL(route.request().url()).pathname.replace(/^\/+/, '');
    const local = VENDOR[spec];
    if (local) {
      const f = path.join(NM, local);
      if (fs.existsSync(f)) {
        return route.fulfill({ status: 200, contentType: mime(f), body: fs.readFileSync(f) });
      }
    }
    // Les fontes Phosphor : @phosphor-icons/web@2.1.1/src/<poids>/<fichier>
    const m = /^@phosphor-icons\/web@[^/]+\/(.+)$/.exec(spec);
    if (m) {
      const f = path.join(NM, '@phosphor-icons/web', m[1]);
      if (fs.existsSync(f)) {
        return route.fulfill({ status: 200, contentType: mime(f), body: fs.readFileSync(f) });
      }
    }
    return route.fulfill({ status: 404, body: '' });
  });

  // Google Fonts est remplace par Inter local : aucun appel reseau sortant.
  const interCss = INTER_WEIGHTS.map(w =>
    `@font-face{font-family:'Inter';font-style:normal;font-weight:${w};font-display:block;` +
    `src:url(http://127.0.0.1:${port}/__fonts/inter-latin-${w}-normal.woff2) format('woff2');}`).join('');
  await page.route('**://fonts.googleapis.com/**', route =>
    route.fulfill({ status: 200, contentType: 'text/css', body: interCss }));
  await page.route('**://fonts.gstatic.com/**', route => route.fulfill({ status: 404, body: '' }));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => document.querySelectorAll('i.ph').length > 5, null, { timeout: 60000 });
  await page.waitForTimeout(1200);

  // React normalise les styles inline ("width: 390px"), donc aucun selecteur CSS
  // par sous-chaine ne tient : on marque les noeuds nous-memes, une fois.
  await page.waitForFunction(() => {
    const has = (el, re) => re.test(el.getAttribute('style') || '');
    const frame = [...document.querySelectorAll('div')].find(d => has(d, /width:\s*390px/) && has(d, /height:\s*844px/));
    const nodes = [...document.querySelectorAll('div')].filter(d => has(d, /min-width:\s*150px/));
    if (!frame || !nodes.length) return false;
    frame.setAttribute('data-capture', 'frame');
    nodes.forEach((n, i) => n.setAttribute('data-capture-node', String(i)));
    return true;
  }, null, { timeout: 30000 });
  const FRAME = '[data-capture="frame"]';

  // Le panneau de droite est le navigateur de la planche : une carte par ecran,
  // portant son libelle et sa route. C'est lui qui donne l'inventaire.
  const nodes = await page.$$eval('[data-capture-node]', els => els.map((e, i) => {
    const spans = e.querySelectorAll('span');
    const divs = e.querySelectorAll('div');
    return {
      index: i,
      label: (spans[0] && spans[0].textContent || '').trim(),
      route: (divs[divs.length - 1] && divs[divs.length - 1].textContent || '').trim(),
      group: (() => {
        let n = e.closest('div[style*="flex-wrap"]');
        n = n && n.parentElement && n.parentElement.firstElementChild;
        return n ? n.textContent.trim() : '';
      })(),
    };
  }));
  if (!nodes.length) throw new Error(`Navigateur de la planche introuvable. Erreurs page: ${errors.join(' | ') || 'aucune'}`);

  // Les identifiants viennent de la source (const MAP), jamais des libelles :
  // deux ecrans partagent un libelle ("Story", "Notifications") et se seraient
  // ecrases l'un l'autre.
  const src = fs.readFileSync(path.join(HERE, DOC), 'utf8');
  const mapBlock = /const MAP = \[([\s\S]*?)\n\];/.exec(src);
  if (!mapBlock) throw new Error('const MAP introuvable dans la planche');
  const KEYS = [...mapBlock[1].matchAll(/\['([A-Za-z]+)',\s*'ph-/g)].map(m => m[1]);
  if (KEYS.length !== nodes.length) {
    throw new Error(`Desaccord planche/navigateur : ${KEYS.length} cles MAP contre ${nodes.length} cartes`);
  }
  const meta = [];
  const remark = () => page.evaluate(() => {
    const has = (el, re) => re.test(el.getAttribute('style') || '');
    const frame = [...document.querySelectorAll('div')].find(d => has(d, /width:\s*390px/) && has(d, /height:\s*844px/));
    if (frame) frame.setAttribute('data-capture', 'frame');
    [...document.querySelectorAll('div')].filter(d => has(d, /min-width:\s*150px/))
      .forEach((n, i) => n.setAttribute('data-capture-node', String(i)));
  });

  for (const n of nodes) {
    await remark();
    await page.click(`[data-capture-node="${n.index}"]`);
    await page.waitForTimeout(650);
    await remark();
    const head = await page.$eval(FRAME, f => {
      const t = [...f.querySelectorAll('div')].find(d => /font:\s*700\s*22px/.test(d.getAttribute('style') || ''));
      const s = t && t.nextElementSibling;
      return { title: t ? t.textContent.trim() : '', subtitle: s ? s.textContent.trim() : '' };
    });
    const id = KEYS[n.index];
    const frame = await page.$(FRAME);
    await frame.screenshot({ path: path.join(OUT, `${id}.png`) });
    meta.push({ id, label: n.label, route: n.route, group: n.group, title: head.title, subtitle: head.subtitle, png: `cible/${id}.png` });
    process.stderr.write(`[capture] ${id.padEnd(16)} ${n.route}\n`);
  }

  // Les fiches de reglages sont un ecran unique (screen 'detail') a sept
  // contenus : le navigateur ne les liste pas, on y entre par les rangees.
  const settingsIndex = KEYS.indexOf('settings');
  if (settingsIndex >= 0) {
    const DETAIL_KEYS = ['profile', 'privacy', 'security', 'media', 'message', 'notification', 'application'];
    for (let row = 0; row < DETAIL_KEYS.length; row++) {
      await remark();
      await page.click(`[data-capture-node="${settingsIndex}"]`);
      await page.waitForTimeout(500);
      await remark();
      const clicked = await page.evaluate(i => {
        const f = document.querySelector('[data-capture="frame"]');
        const rows = [...f.querySelectorAll('div')].filter(d => /border-radius:\s*12px/.test(d.getAttribute('style') || '') && d.querySelector('i.ph'));
        const target = rows[i] && rows[i].closest('div[style*="cursor"]') || rows[i];
        if (!target) return false;
        target.click();
        return true;
      }, row);
      if (!clicked) { process.stderr.write(`[capture] rangee ${DETAIL_KEYS[row]} introuvable — ignoree\n`); continue; }
      await page.waitForTimeout(600);
      await remark();
      const head = await page.$eval(FRAME, f => {
        const t = [...f.querySelectorAll('div')].find(d => /font:\s*700\s*22px/.test(d.getAttribute('style') || ''));
        const s2 = t && t.nextElementSibling;
        return { title: t ? t.textContent.trim() : '', subtitle: s2 ? s2.textContent.trim() : '' };
      });
      const id = `detail-${DETAIL_KEYS[row]}`;
      const frame = await page.$(FRAME);
      await frame.screenshot({ path: path.join(OUT, `${id}.png`) });
      meta.push({ id, label: head.title || DETAIL_KEYS[row], route: `/settings/${DETAIL_KEYS[row]}`, group: 'ESPACE MEMBRE — FICHES DE REGLAGES', title: head.title, subtitle: head.subtitle, png: `cible/${id}.png` });
      process.stderr.write(`[capture] ${id.padEnd(22)} /settings/${DETAIL_KEYS[row]}\n`);
    }
  }

  fs.writeFileSync(path.join(HERE, 'vues.json'), JSON.stringify({ source: DOC, count: meta.length, vues: meta }, null, 1) + '\n');

  const groups = [];
  for (const m of meta) {
    let g = groups.find(x => x.name === m.group);
    if (!g) groups.push(g = { name: m.group, items: [] });
    g.items.push(m);
  }
  const esc = s => String(s).replace(/\|/g, '\\|');
  const md = [
    '# Meeshy web v3 — les vues cibles',
    '',
    "> **Ce fichier est une SOURCE, pas un tableau de bord.** L'etat d'implementation de chaque vue vit",
    '> dans son issue GitHub, jamais ici. Regenere par `capture-cibles.js` — ne pas editer a la main.',
    '',
    `La planche \`${DOC}\` porte **${meta.length} ecrans**, chacun avec sa route web.`,
    '',
    ...groups.flatMap(g => [
      `## ${g.name}`,
      '',
      '| Vue | Route | Titre | Capture |',
      '|---|---|---|---|',
      ...g.items.map(m => `| ${esc(m.label)} | \`${esc(m.route)}\` | ${esc(m.title)} | ![${m.id}](${m.png}) |`),
      '',
    ]),
  ].join('\n');
  fs.writeFileSync(path.join(HERE, 'vues.md'), md);

  await browser.close();
  server.close();
  if (errors.length) process.stderr.write(`[capture] erreurs de page (non bloquantes): ${errors.slice(0, 5).join(' | ')}\n`);
  process.stderr.write(`[capture] ${meta.length} vues capturees dans ${OUT}\n`);
})().catch(e => { process.stderr.write(`[capture] ECHEC: ${e.stack || e.message}\n`); process.exit(1); });
