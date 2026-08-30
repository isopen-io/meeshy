#!/usr/bin/env node
/**
 * Compare le rendu REEL de la v3 web a sa vue CIBLE, et mesure ce qu'il coute.
 *
 *   node docs/product/MeeshyWebV3Design/compare-rendu.js --base http://127.0.0.1:3300 [--vues join,rights] [--json rapport.json]
 *
 * Pour chaque vue de vues.json portant une route implementee, en 390x844,
 * en theme SOMBRE puis CLAIR :
 *   - capture le rendu dans rendu/<id>.<theme>.png ;
 *   - le compare a cible/<id>.png ;
 *   - mesure les octets transferes, le nombre de requetes, et le temps
 *     jusqu'au premier pixel utile (LCP).
 *
 * SUR LA MESURE DE CONFORMITE. Un ecart pixel a pixel entre une planche de
 * design et une application reelle n'est jamais proche de zero : les donnees
 * different, les polices different, la planche est un dessin. Un seuil pose
 * sur ce chiffre serait une fausse precision. Le gate porte donc sur la
 * SIGNATURE STRUCTURELLE : le profil de luminance ligne par ligne, qui dit ou
 * commencent et finissent les blocs, dans quel ordre et a quelle hauteur.
 * C'est ce que « conformite = disposition, hierarchie, etats et gestes »
 * (CLAUDE.md) veut dire, et c'est ce qui bouge quand un ecran devie.
 * L'ecart pixel est rendu a titre INDICATIF, jamais comme gate.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '../../..');
const CACHE = path.join(ROOT, '.cache/dc-vendor');
const NM = path.join(CACHE, 'node_modules');
const CIBLE = path.join(HERE, 'cible');
const RENDU = path.join(HERE, 'rendu');

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:3300').replace(/\/$/, '');
const ONLY = (arg('--vues', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const JSON_OUT = arg('--json', path.join(HERE, 'rapport-conformite.json'));

// Gates. Le seuil structurel est volontairement large : il attrape un bloc
// deplace, absent ou de la mauvaise hauteur, pas une nuance de gris.
const SEUIL_STRUCTURE = Number(arg('--seuil', '0.15'));
const BUDGET = {
  'role-premier': { octets: 120 * 1024, requetes: 12 },
  defaut: { octets: 300 * 1024, requetes: 30 },
};

function chromiumPath() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const cands = [process.env.CHROMIUM_PATH, path.join(base, 'chromium/chrome-linux/chrome'), path.join(base, 'chromium')];
  for (const c of cands) { try { if (c && fs.statSync(c).isFile()) return c; } catch { /* suivant */ } }
  throw new Error(`Aucun Chromium trouve sous ${base}`);
}

/**
 * Profil d'ENCRE : par ligne, la fraction de pixels qui s'ecartent du fond de
 * l'image. Le fond est le mode de l'histogramme de luminance, donc le profil
 * dit OU se trouve du contenu, jamais de quelle couleur il est — c'est ce qui
 * rend la mesure invariante au theme (verifie : ecart 0,0000 entre une cible
 * sombre et son inverse clair) et a l'echelle (<= 0,005 entre 2x et 1x).
 */
function profilEncre(png) {
  const { width, height, data } = png;
  const lum = i => (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  const hist = new Array(32).fill(0);
  for (let i = 0; i < data.length; i += 4) hist[Math.min(31, Math.floor(lum(i) * 32))]++;
  const fond = (hist.indexOf(Math.max(...hist)) + 0.5) / 32;
  const out = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    let n = 0;
    for (let x = 0; x < width; x++) if (Math.abs(lum((y * width + x) * 4) - fond) > 0.12) n++;
    out[y] = n / width;
  }
  return out;
}

/** Reechantillonne un profil a N points, pour comparer deux hauteurs differentes. */
function reechantillonne(p, n) {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = (i * (p.length - 1)) / (n - 1);
    const a = Math.floor(t), b = Math.min(a + 1, p.length - 1);
    out[i] = p[a] + (p[b] - p[a]) * (t - a);
  }
  return out;
}

function pearson(a, b) {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  const d = Math.sqrt(da * db);
  return d ? num / d : 0;
}

/**
 * Ecart structurel dans [0, 1] : 0 = memes blocs aux memes hauteurs.
 * Etalonne sur les 37 cibles : identite 0,000 ; deux ecrans de meme
 * disposition (appel audio / appel video) 0,109 ; deux ecrans differents
 * 0,354 a 0,555. Le seuil de 0,15 passe donc une variante de disposition
 * et refuse un ecran qui n'est pas le bon.
 */
function ecartStructurel(a, b) {
  const N = 512;
  return (1 - pearson(reechantillonne(a, N), reechantillonne(b, N))) / 2;
}

(async () => {
  const { chromium } = require(path.join(NM, 'playwright-core'));
  const { PNG } = require(path.join(NM, 'pngjs'));
  const pixelmatch = require(path.join(NM, 'pixelmatch')).default || require(path.join(NM, 'pixelmatch'));

  const index = JSON.parse(fs.readFileSync(path.join(HERE, 'vues.json'), 'utf8'));
  let vues = index.vues.filter(v => !/:/.test(v.route));
  if (ONLY.length) vues = index.vues.filter(v => ONLY.includes(v.id));
  if (!vues.length) throw new Error('Aucune vue a comparer (les routes parametrees sont ignorees sans --vues).');

  fs.mkdirSync(RENDU, { recursive: true });
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
  const rapport = [];

  for (const v of vues) {
    for (const theme of ['dark', 'light']) {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        colorScheme: theme,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      });
      const page = await ctx.newPage();
      let octets = 0, requetes = 0;
      const erreurs = [];
      page.on('response', async r => {
        requetes++;
        const len = Number(r.headers()['content-length'] || 0);
        if (len) octets += len;
        else { try { octets += (await r.body()).length; } catch { /* corps indisponible */ } }
      });
      page.on('pageerror', e => erreurs.push(String(e.message)));

      const entree = { vue: v.id, route: v.route, theme };
      try {
        const t0 = Date.now();
        const resp = await page.goto(BASE + v.route, { waitUntil: 'networkidle', timeout: 45000 });
        entree.statut = resp ? resp.status() : 0;
        entree.ms = Date.now() - t0;
        entree.lcp = await page.evaluate(() => new Promise(res => {
          let val = 0;
          try {
            new PerformanceObserver(list => { for (const e of list.getEntries()) val = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
          } catch { /* non supporte */ }
          setTimeout(() => res(Math.round(val)), 400);
        }));
        const buf = await page.screenshot();
        fs.writeFileSync(path.join(RENDU, `${v.id}.${theme}.png`), buf);

        const cible = path.join(CIBLE, `${v.id}.png`);
        if (fs.existsSync(cible)) {
          const a = PNG.sync.read(fs.readFileSync(cible));
          const b = PNG.sync.read(buf);
          entree.structure = Number(ecartStructurel(profilEncre(a), profilEncre(b)).toFixed(4));
          entree.conforme = entree.structure <= SEUIL_STRUCTURE;
          if (a.width === b.width && a.height === b.height) {
            const diff = new PNG({ width: a.width, height: a.height });
            const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.15 });
            entree.pixels_indicatif = Number((n / (a.width * a.height)).toFixed(4));
            fs.writeFileSync(path.join(RENDU, `${v.id}.${theme}.diff.png`), PNG.sync.write(diff));
          }
        } else {
          entree.note = 'aucune cible pour cette vue';
        }
      } catch (e) {
        entree.erreur = String(e.message).slice(0, 200);
        entree.conforme = false;
      }

      const budget = /^\/(l\/|stories\/|post\/|feed$)/.test(v.route) ? BUDGET['role-premier'] : BUDGET.defaut;
      entree.octets = octets;
      entree.requetes = requetes;
      entree.budget_octets = budget.octets;
      entree.budget_requetes = budget.requetes;
      entree.dans_le_budget = octets <= budget.octets && requetes <= budget.requetes;
      if (erreurs.length) entree.erreurs_page = erreurs.slice(0, 3);
      rapport.push(entree);
      process.stderr.write(
        `[compare] ${v.id.padEnd(16)} ${theme.padEnd(5)} ` +
        `structure=${entree.structure ?? '—'} ${entree.conforme === false ? 'HORS-CIBLE' : 'ok'.padEnd(10)} ` +
        `${(octets / 1024).toFixed(0)}Ko/${requetes}req ${entree.dans_le_budget ? '' : 'HORS-BUDGET'} ${entree.erreur || ''}\n`);
      await ctx.close();
    }
  }

  await browser.close();
  const echecs = rapport.filter(r => r.conforme === false || !r.dans_le_budget);
  fs.writeFileSync(JSON_OUT, JSON.stringify({
    base: BASE, seuil_structure: SEUIL_STRUCTURE, total: rapport.length, echecs: echecs.length, rapport,
  }, null, 1) + '\n');
  process.stderr.write(`[compare] ${rapport.length - echecs.length}/${rapport.length} conformes et dans le budget — rapport: ${JSON_OUT}\n`);
  process.exit(echecs.length ? 1 : 0);
})().catch(e => { process.stderr.write(`[compare] ECHEC: ${e.stack || e.message}\n`); process.exit(2); });
