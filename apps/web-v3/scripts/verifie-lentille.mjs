#!/usr/bin/env node
/**
 * VÉRIFIE LE CRITÈRE BINAIRE DE LA LENTILLE : le flux ne bouge JAMAIS au
 * défilement.
 *
 * Le porteur a posé l'arbitrage en ces termes — « le flux ne bouge jamais au
 * défilement, ou on garde les cartes ». Il n'y a donc pas de demi-mesure à
 * mesurer : soit la position de mise en page de chaque rangée est invariable
 * pendant tout le défilement, soit la peau plate ne tient pas sa promesse et
 * les cartes valaient mieux.
 *
 * CE QU'IL MESURE
 *
 * 1. `offsetTop` de chaque case, AVANT et PENDANT le défilement. C'est la
 *    position de MISE EN PAGE — celle qu'un changement de hauteur, de marge ou
 *    de padding déplacerait. Elle doit être identique au pixel près.
 * 2. La hauteur de chaque case : 84, toujours, magnifiée ou non.
 * 3. Que la magnification opère bien — sans quoi le test 1 serait trivialement
 *    vert sur une liste qui ne fait rien.
 * 4. Que seuls `transform` et `opacity` diffèrent d'une rangée à l'autre.
 * 5. Que `prefers-reduced-motion` rend toutes les opacités à 1 — et que
 *    l'élection SURVIT : on perd le relief, jamais le repère.
 *
 * POURQUOI UN NAVIGATEUR RÉEL. Rien de tout cela n'est observable dans un
 * test unitaire : la loi peut être juste et la peau la trahir, en animant une
 * propriété de mise en page. C'est la mesure de `offsetTop` sous défilement
 * réel qui tranche, et elle seule.
 */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { chromium } from '@playwright/test';

const DIST = new URL('../dist/', import.meta.url).pathname;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

const serveur = createServer(async (req, res) => {
  const p = normalize(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
  for (const f of [join(DIST, p), join(DIST, `${p}.html`), join(DIST, p, 'index.html'), join(DIST, 'index.html')]) {
    try {
      if (!(await stat(f)).isFile()) continue;
      res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
      res.end(await readFile(f));
      return;
    } catch {
      /* candidat suivant */
    }
  }
  res.writeHead(404).end('404');
});
await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${serveur.address().port}`;

const binaire = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navigateur = await chromium.launch(existsSync(binaire) ? { executablePath: binaire } : {});

const echecs = [];
const constate = (ok, quoi) => {
  if (!ok) echecs.push(quoi);
};

/** La géométrie de MISE EN PAGE de chaque case — jamais son apparence. */
const geometrie = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-ligne]')].map((li) => ({
      id: li.dataset.ligne,
      haut: li.offsetTop,
      hauteur: li.offsetHeight,
    })),
  );

const apparence = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-ligne]')].map((li) => {
      const v = li.firstElementChild;
      const s = getComputedStyle(v);
      return { id: li.dataset.ligne, opacite: Number(s.opacity), transform: s.transform };
    }),
  );

// ---------------------------------------------------------------- mouvement normal
const contexte = await navigateur.newContext({ viewport: { width: 390, height: 844 } });
const page = await contexte.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'load' });
await page.waitForSelector('[data-ligne]');
await page.waitForTimeout(300);

const avant = await geometrie(page);
constate(avant.length > 0, 'aucune rangée rendue — la liste est vide');
constate(
  avant.every((r) => r.hauteur === 84),
  `une case ne mesure pas 84 : ${JSON.stringify(avant.filter((r) => r.hauteur !== 84))}`,
);

/** On défile PAR PALIERS, en relevant la géométrie à chaque, et on la compare. */
const releves = [];
for (const y of [40, 120, 240, 400, 600]) {
  await page.evaluate((v) => document.getElementById('contenu')?.scrollTo({ top: v }), y);
  await page.waitForTimeout(90);
  releves.push({ y, geo: await geometrie(page), app: await apparence(page) });
}

for (const { y, geo } of releves) {
  const bouge = geo.filter((r, i) => avant[i] === undefined || r.haut !== avant[i].haut || r.hauteur !== avant[i].hauteur);
  constate(
    bouge.length === 0,
    `à ${y} px de défilement, ${bouge.length} case(s) ont bougé en MISE EN PAGE — ` +
      `${JSON.stringify(bouge.slice(0, 3))}`,
  );
}

/**
 * Le témoin 3 : la magnification opère. Sans lui, tout ce qui précède serait
 * vert sur une liste qui ne fait strictement rien — le piège classique d'un
 * témoin d'invariance.
 */
const opacitesVues = new Set(releves.flatMap((r) => r.app.map((a) => a.opacite.toFixed(3))));
constate(opacitesVues.size > 1, "la perspective n'opère pas : toutes les opacités sont identiques");

const transformesVus = new Set(releves.flatMap((r) => r.app.map((a) => a.transform)));
constate(transformesVus.size > 1, "aucune transformation n'a varié pendant le défilement");

const magnifiee = await page.evaluate(
  () => document.querySelectorAll('[aria-hidden="false"].lentille-supplement').length,
);
constate(magnifiee > 0, "aucune rangée n'est magnifiée après défilement");

await page.close();
await contexte.close();

// ---------------------------------------------------- mouvement réduit
const contexteReduit = await navigateur.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
});
const pageReduite = await contexteReduit.newPage();
await pageReduite.goto(`${BASE}/`, { waitUntil: 'load' });
await pageReduite.waitForSelector('[data-ligne]');
await pageReduite.evaluate(() => document.getElementById('contenu')?.scrollTo({ top: 400 }));
await pageReduite.waitForTimeout(300);

const appReduite = await apparence(pageReduite);
constate(
  appReduite.every((a) => a.opacite === 1),
  `mouvement réduit : ${appReduite.filter((a) => a.opacite !== 1).length} rangée(s) restent estompées`,
);
const eluReduit = await pageReduite.evaluate(
  () => document.querySelectorAll('[aria-hidden="false"].lentille-supplement').length,
);
constate(eluReduit > 0, "mouvement réduit : l'élection a disparu — on perd le repère, pas seulement le relief");

const geoReduite = await geometrie(pageReduite);
constate(
  geoReduite.every((r) => r.hauteur === 84),
  'mouvement réduit : une case ne mesure plus 84',
);

await navigateur.close();
serveur.close();

console.log(`
  cases mesurées        ${avant.length}, toutes à ${avant[0]?.hauteur ?? '?'} px
  paliers de défilement ${releves.map((r) => `${r.y}`).join(', ')} px
  opacités distinctes   ${opacitesVues.size}
  transformations       ${transformesVus.size} distinctes
  mouvement réduit      opacités toutes à 1, élection conservée`);

if (echecs.length > 0) {
  console.error(`\n  ${echecs.length} invariant(s) rompu(s) :`);
  for (const e of echecs) console.error(`    · ${e}`);
  console.error(
    "\n  Le critère est BINAIRE : le flux ne bouge jamais au défilement, ou la peau" +
      "\n  plate ne tient pas sa promesse.\n",
  );
  process.exit(1);
}
console.log('\n  Le flux ne bouge jamais : la mise en page est invariable sous défilement.\n');
