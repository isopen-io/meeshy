#!/usr/bin/env node
/**
 * LE GATE DE POIDS de la v4 — l'heritier direct de check-bundle-budget.mjs de
 * la v3, porte du manifeste Next au manifeste Vite.
 *
 * Il mesure ce que le lecteur TELECHARGE AVANT LE PREMIER PIXEL, pas la somme
 * du repertoire : seuls comptent le document, sa feuille et les modules que le
 * document reference lui-meme. Un chunk d'ecran charge a la demande ne se
 * compte pas ici — c'est tout l'interet de l'avoir sorti du socle.
 *
 * Usage :
 *   node scripts/measure-weight.mjs [--dist <chemin>] [--json] [--ratchet]
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const args = process.argv.slice(2);
const valueOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const dist = join(ROOT, valueOf('--dist', 'dist'));
const asJson = args.includes('--json');
const ratchet = args.includes('--ratchet');

const BUDGETS_PATH = join(ROOT, 'budgets.json');
const MEASURES_PATH = join(ROOT, 'budgets-measured.json');

if (!existsSync(dist)) {
  console.error(`Rien a mesurer : ${dist} n'existe pas. Lancer d'abord \`bun run build\`.`);
  process.exit(1);
}

const gz = (path) => gzipSync(readFileSync(path), { level: 9 }).length;
const kb = (bytes) => Math.round((bytes / 1024) * 100) / 100;

/**
 * Ce que le DOCUMENT reference — la seule definition honnete de « avant le
 * premier pixel ». On lit l'index produit plutot que le manifeste : c'est ce
 * que le navigateur lit, lui aussi.
 */
const index = readFileSync(join(dist, 'index.html'), 'utf8');
const documentReferences = [
  ...index.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g),
]
  /**
   * La base de construction change la FORME des chemins : « /assets/x.js » en
   * web, « ./assets/x.js » sous Capacitor (base relative). Sans cette
   * normalisation, les chunks critiques ne se retrouvaient pas dans
   * l'inventaire du repertoire et se comptaient une SECONDE fois comme
   * « a la demande » — un chiffre faux dans le sens rassurant.
   */
  .map((m) => m[1].replace(/^\.?\//, ''));

const critical = documentReferences
  .filter((f) => existsSync(join(dist, f)))
  .map((f) => ({ file: f, gzip: gz(join(dist, f)) }));

const documentGzip = gzipSync(Buffer.from(index), { level: 9 }).length;

// Tout le reste du repertoire : les ecrans a la demande.
const allAssets = [];
const walk = (dir, prefix = '') => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const relatif = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(path, relatif);
    else if (/\.(js|css)$/.test(entry.name)) allAssets.push({ file: relatif, gzip: gz(path) });
  }
};
walk(dist);

const criticalNames = new Set(critical.map((c) => c.file));
const onDemand = allAssets.filter((a) => !criticalNames.has(a.file));

const criticalJs = critical.filter((c) => c.file.endsWith('.js')).reduce((s, c) => s + c.gzip, 0);
const criticalCss = critical.filter((c) => c.file.endsWith('.css')).reduce((s, c) => s + c.gzip, 0);
const firstPaint = documentGzip + criticalJs + criticalCss;

const budgets = JSON.parse(readFileSync(BUDGETS_PATH, 'utf8'));
const profile = budgets.network.profile;
/** Le temps de TELECHARGEMENT seul, hors latence — un plancher, jamais un LCP. */
const seconds = (bytes) => Math.round(((bytes * 8) / profile.download_bps) * 100) / 100;

const measure = {
  runtime: process.env.MEESHY_RUNTIME === 'react' ? 'react' : 'preact',
  target: process.env.MEESHY_TARGET === 'capacitor' ? 'capacitor' : 'web',
  document_gzip_9_bytes: documentGzip,
  critical_js_gzip_9_bytes: criticalJs,
  critical_css_gzip_9_bytes: criticalCss,
  first_paint_gzip_9_bytes: firstPaint,
  first_paint_kb: kb(firstPaint),
  requests_before_first_pixel: 1 + critical.length,
  download_3g_s: seconds(firstPaint),
  on_demand_gzip_9_bytes: onDemand.reduce((s, a) => s + a.gzip, 0),
  critical_detail: Object.fromEntries(critical.map((c) => [c.file, c.gzip])),
};

if (asJson) {
  console.log(JSON.stringify(measure, null, 2));
} else {
  console.log(`\n  runtime ${measure.runtime} · cible ${measure.target}\n`);
  for (const c of critical) console.log(`  ${String(kb(c.gzip)).padStart(8)} Ko  ${c.file}`);
  console.log(`  ${String(kb(documentGzip)).padStart(8)} Ko  index.html`);
  console.log(`  ${'-'.repeat(48)}`);
  console.log(`  ${String(measure.first_paint_kb).padStart(8)} Ko  AVANT LE PREMIER PIXEL`);
  console.log(`  ${String(measure.requests_before_first_pixel).padStart(8)}     requetes`);
  console.log(`  ${String(measure.download_3g_s).padStart(8)} s   de telechargement seul sur ${profile.name}`);
  console.log(`  ${String(kb(measure.on_demand_gzip_9_bytes)).padStart(8)} Ko  a la demande (hors premiere peinture)\n`);
}

const cap = budgets.first_paint?.kb?.value;
let rc = 0;
if (typeof cap === 'number') {
  if (measure.first_paint_kb > cap) {
    console.error(
      `\n  DEPASSEMENT : ${measure.first_paint_kb} Ko > plafond ${cap} Ko` +
        ` (budgets.json › first_paint.kb)\n`,
    );
    rc = 1;
  }
}

if (ratchet) {
  const metrics = existsSync(MEASURES_PATH) ? JSON.parse(readFileSync(MEASURES_PATH, 'utf8')) : {};
  metrics.date = new Date().toISOString().slice(0, 10);
  metrics.variants = metrics.variants ?? {};
  metrics.variants[`${measure.runtime}-${measure.target}`] = measure;
  writeFileSync(MEASURES_PATH, `${JSON.stringify(metrics, null, 2)}\n`);
  console.log(`  releve inscrit dans budgets-measured.json › variantes.${measure.runtime}-${measure.target}\n`);
}

process.exit(rc);
