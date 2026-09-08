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
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { launchChromium } from './lib/browser.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
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
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await launchChromium();

const failures = [];
const constate = (ok, what) => {
  if (!ok) failures.push(what);
};

/** La géométrie de MISE EN PAGE de chaque case — jamais son apparence. */
const geometrie = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-row]')].map((li) => ({
      id: li.dataset.row,
      haut: li.offsetTop,
      height: li.offsetHeight,
    })),
  );

const apparence = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-row]')].map((li) => {
      const v = li.firstElementChild;
      const s = getComputedStyle(v);
      return { id: li.dataset.row, opacity: Number(s.opacity), transform: s.transform };
    }),
  );

// ---------------------------------------------------------------- mouvement normal
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'load' });
await page.waitForSelector('[data-row]');
await page.waitForTimeout(300);

const before = await geometrie(page);
constate(before.length > 0, 'aucune rangée rendue — la liste est vide');
constate(
  before.every((r) => r.height === 84),
  `une case ne mesure pas 84 : ${JSON.stringify(before.filter((r) => r.height !== 84))}`,
);

/**
 * §5.9 de la spécification #5676 (D-23) — l'aperçu de liste de la Salle
 * sécurisée (`c-protection`) NE SERT JAMAIS son sujet flouté : la rangée
 * annonce « 1 message caché », jamais le texte protégé.
 */
const protectedRow = await page.evaluate(() => {
  const li = document.querySelector('[data-row="c-protection"]');
  return li === null ? null : li.textContent ?? '';
});
constate(protectedRow !== null, 'la rangée « c-protection » est introuvable dans la Lentille');
constate(
  protectedRow !== null && !protectedRow.includes('7741'),
  `la rangée « c-protection » fuit le sujet du message flouté : ${JSON.stringify(protectedRow)}`,
);
constate(
  protectedRow !== null && protectedRow.includes('1 message caché'),
  `la rangée « c-protection » ne dit pas « 1 message caché » : ${JSON.stringify(protectedRow)}`,
);

/** On défile PAR PALIERS, en relevant la géométrie à chaque, et on la compare. */
const readings = [];
for (const y of [40, 120, 240, 400, 600]) {
  await page.evaluate((v) => document.getElementById('contenu')?.scrollTo({ top: v }), y);
  await page.waitForTimeout(90);
  readings.push({ y, geo: await geometrie(page), app: await apparence(page) });
}

for (const { y, geo } of readings) {
  const moves = geo.filter((r, i) => before[i] === undefined || r.haut !== before[i].haut || r.height !== before[i].height);
  constate(
    moves.length === 0,
    `à ${y} px de défilement, ${moves.length} case(s) ont bougé en MISE EN PAGE — ` +
      `${JSON.stringify(moves.slice(0, 3))}`,
  );
}

/**
 * Le témoin 3 : la magnification opère. Sans lui, tout ce qui précède serait
 * vert sur une liste qui ne fait strictement rien — le piège classique d'un
 * témoin d'invariance.
 */
const seenOpacities = new Set(readings.flatMap((r) => r.app.map((a) => a.opacity.toFixed(3))));
constate(seenOpacities.size > 1, "la perspective n'opère pas : toutes les opacités sont identiques");

const seenTransforms = new Set(readings.flatMap((r) => r.app.map((a) => a.transform)));
constate(seenTransforms.size > 1, "aucune transformation n'a varié pendant le défilement");

const magnified = await page.evaluate(
  () => document.querySelectorAll('[aria-hidden="false"].lens-extra').length,
);
constate(magnified > 0, "aucune rangée n'est magnifiée après défilement");

await page.close();
await context.close();

// ---------------------------------------------------- mouvement réduit
const contexteReduit = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
});
const pageReduite = await contexteReduit.newPage();
await pageReduite.goto(`${BASE}/`, { waitUntil: 'load' });
await pageReduite.waitForSelector('[data-row]');
await pageReduite.evaluate(() => document.getElementById('contenu')?.scrollTo({ top: 400 }));
await pageReduite.waitForTimeout(300);

const reducedApp = await apparence(pageReduite);
constate(
  reducedApp.every((a) => a.opacity === 1),
  `mouvement réduit : ${reducedApp.filter((a) => a.opacity !== 1).length} rangée(s) restent estompées`,
);
const eluReduit = await pageReduite.evaluate(
  () => document.querySelectorAll('[aria-hidden="false"].lens-extra').length,
);
constate(eluReduit > 0, "mouvement réduit : l'élection a disparu — on perd le repère, pas seulement le relief");

const geoReduite = await geometrie(pageReduite);
constate(
  geoReduite.every((r) => r.height === 84),
  'mouvement réduit : une case ne mesure plus 84',
);

await browser.close();
server.close();

console.log(`
  cases mesurées        ${before.length}, toutes à ${before[0]?.height ?? '?'} px
  paliers de défilement ${readings.map((r) => `${r.y}`).join(', ')} px
  opacités distinctes   ${seenOpacities.size}
  transformations       ${seenTransforms.size} distinctes
  mouvement réduit      opacités toutes à 1, élection conservée`);

if (failures.length > 0) {
  console.error(`\n  ${failures.length} invariant(s) rompu(s) :`);
  for (const e of failures) console.error(`    · ${e}`);
  console.error(
    "\n  Le critère est BINAIRE : le flux ne bouge jamais au défilement, ou la peau" +
      "\n  plate ne tient pas sa promesse.\n",
  );
  process.exit(1);
}
console.log('\n  Le flux ne bouge jamais : la mise en page est invariable sous défilement.\n');
