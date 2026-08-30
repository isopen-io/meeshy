/**
 * OU SE TROUVE LE NAVIGATEUR, ET OU SE TROUVENT LES PAQUETS QU'IL LUI FAUT.
 *
 * UNE seule reponse pour tout le depot. Trois outils de la machine de
 * verification de la v3 posaient la meme question — `capture-cibles.js`
 * (les 37 cibles), `compare-rendu.js` (le rendu reel) et la mesure de poids
 * reseau — et deux y repondaient deja par deux copies divergentes de la meme
 * fonction : celle de `capture-cibles.js` connaissait les chemins macOS, celle
 * de `compare-rendu.js` non. Une jumelle a une lettre pres, exactement ce que
 * la conception interdit.
 *
 * Le cache npm local (`.cache/dc-vendor`, gitignore) existe parce qu'`unpkg`
 * est bloque par le proxy sortant : la machine doit tourner HORS-LIGNE une fois
 * le cache cree. La liste des paquets est donc, elle aussi, unique.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const CACHE = path.join(ROOT, '.cache/dc-vendor');
const NODE_MODULES = path.join(CACHE, 'node_modules');
const MARQUEUR = path.join(NODE_MODULES, '.vendor-ok');

const PAQUETS = [
  'react@18.3.1',
  'react-dom@18.3.1',
  '@babel/standalone@7.29.0',
  '@phosphor-icons/web@2.1.1',
  '@fontsource/inter@5.2.8',
  'playwright-core@1.62.1',
  'pngjs@5.0.0',
  'pixelmatch@7.2.0',
];

function ensureVendor(journal) {
  if (fs.existsSync(MARQUEUR)) return NODE_MODULES;
  fs.mkdirSync(CACHE, { recursive: true });
  if (!fs.existsSync(path.join(CACHE, 'package.json'))) {
    fs.writeFileSync(
      path.join(CACHE, 'package.json'),
      JSON.stringify({ name: 'dc-vendor', private: true, version: '0.0.0' }),
    );
  }
  (journal || (m => process.stderr.write(m)))(`[vendor] cache absent — npm i ${PAQUETS.join(' ')} dans ${CACHE}\n`);
  execFileSync('npm', ['i', '--no-audit', '--no-fund', '--loglevel', 'error', ...PAQUETS], {
    cwd: CACHE,
    stdio: 'inherit',
  });
  fs.writeFileSync(MARQUEUR, '');
  return NODE_MODULES;
}

function vendorRequire(nom) {
  const cible = path.join(NODE_MODULES, nom);
  if (!fs.existsSync(cible)) {
    throw new Error(
      `${nom} absent de ${NODE_MODULES} — lancer d'abord ` +
        'node docs/product/MeeshyWebV3Design/capture-cibles.js (il cree le cache).',
    );
  }
  const mod = require(cible);
  return mod && mod.default ? mod.default : mod;
}

function chromiumPath() {
  const direct = process.env.CHROMIUM_PATH;
  if (direct && fs.existsSync(direct)) return direct;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const candidats = [
    path.join(base, 'chromium/chrome-linux/chrome'),
    path.join(base, 'chromium'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  for (const c of candidats) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {
      /* candidat suivant */
    }
  }
  if (fs.existsSync(base)) {
    const revision = fs.readdirSync(base).find(d => d.startsWith('chromium-'));
    const dans = revision && path.join(base, revision, 'chrome-linux/chrome');
    if (dans && fs.existsSync(dans)) return dans;
  }
  throw new Error(
    `Aucun Chromium trouve sous ${base} — poser PLAYWRIGHT_BROWSERS_PATH ou CHROMIUM_PATH.`,
  );
}

module.exports = { ROOT, CACHE, NODE_MODULES, PAQUETS, ensureVendor, vendorRequire, chromiumPath };
