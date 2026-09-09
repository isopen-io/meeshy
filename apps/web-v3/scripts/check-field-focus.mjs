#!/usr/bin/env node
/**
 * VÉRIFIE QU'UN COUPLE DE FOCUS NE SE DEMI-ANNULE PAS (#5816).
 *
 * La règle 17 (`styles/app.css`) pose le focus en COUPLE : un ANNEAU
 * (`outline`) et un CONTRE-ANNEAU (`box-shadow` de la couleur opposée), parce
 * qu'aucune couleur seule ne tient sur les huit fonds de la table.
 *
 * Une saisie posée DANS un bloc de champ porte `outline-none` — la boîte
 * dessine déjà sa bordure teintée, un anneau de plus la doublerait. Mais
 * `outline-none` n'annule QUE l'anneau : le contre-anneau restait, c'est-à-dire
 * un halo blanc de 2 px peint PAR-DESSUS la bordure de la boîte sur toute la
 * largeur de la saisie. La bordure paraissait COUPÉE dès que le champ prenait
 * le focus — et `autoFocus` (lien magique, mot de passe oublié) en faisait le
 * premier pixel de l'écran.
 *
 * CE QU'IL MESURE, sur chaque saisie d'un `.field-box`, une fois FOCALISÉE :
 *   1. `box-shadow: none` — aucune moitié orpheline du couple ;
 *   2. `outline-style: none` — l'anneau reste bien porté par la boîte ;
 *   3. la BOÎTE change de couleur de bordure entre repos et focus — le focus
 *      demeure SIGNALÉ, sans quoi corriger le halo l'aurait simplement effacé.
 *
 * POURQUOI UN NAVIGATEUR RÉEL. Le défaut naît de la CASCADE entre une classe
 * utilitaire posée sur la saisie et une règle de base posée sur `:focus-visible` :
 * aucun test unitaire ne charge la feuille de style, donc aucun ne peut le voir.
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

/** Les trois portes d'entrée qui montent un `Field` sans session. */
const ECRANS = ['/auth/magic-link', '/forgot-password', '/login'];

const browser = await launchChromium();
const failures = [];
const constate = (ok, what) => {
  if (!ok) failures.push(what);
};

let mesures = 0;
for (const route of ECRANS) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${BASE}${route}`, { waitUntil: 'load' });
  await page.waitForSelector('.field-box', { timeout: 5000 }).catch(() => {});

  /* La teinte de la boîte vient d'un ÉTAT React (`focused`), posé par
     `onFocus` : elle n'existe qu'APRÈS le rendu suivant. Lire le style dans
     la même évaluation que le `focus()` mesure donc toujours le repos, et le
     témoin rougirait sur un produit sain. D'où une lecture par champ, avec un
     tour de boucle d'événements entre le geste et la mesure. */
  const combien = await page.evaluate(
    () => document.querySelectorAll('.field-box :is(input, select, textarea)').length,
  );
  const lu = [];
  for (let i = 0; i < combien; i += 1) {
    const repos = await page.evaluate((n) => {
      const el = document.querySelectorAll('.field-box :is(input, select, textarea)')[n];
      el.blur();
      return getComputedStyle(el.parentElement).borderTopColor;
    }, i);
    await page.waitForTimeout(120);
    const focus = await page.evaluate((n) => {
      document.querySelectorAll('.field-box :is(input, select, textarea)')[n].focus();
    }, i);
    void focus;
    await page.waitForTimeout(120);
    lu.push({
      i,
      ...(await page.evaluate(
        ({ n, repos: r }) => {
          const el = document.querySelectorAll('.field-box :is(input, select, textarea)')[n];
          const c = getComputedStyle(el);
          return {
            type: el.getAttribute('type') ?? el.tagName.toLowerCase(),
            boxShadow: c.boxShadow,
            outlineStyle: c.outlineStyle,
            bordureRepos: r,
            bordureFocus: getComputedStyle(el.parentElement).borderTopColor,
          };
        },
        { n: i, repos },
      )),
    });
  }

  constate(lu.length > 0, `${route} — aucun champ trouvé : le témoin ne mesure rien`);
  for (const champ of lu) {
    mesures += 1;
    constate(
      champ.boxShadow === 'none',
      `${route} champ #${champ.i} (${champ.type}) — contre-anneau ORPHELIN au focus : ` +
        `box-shadow \`${champ.boxShadow}\` recouvre la bordure de la boîte`,
    );
    constate(
      champ.outlineStyle === 'none',
      `${route} champ #${champ.i} (${champ.type}) — anneau posé sur la SAISIE ` +
        `(\`${champ.outlineStyle}\`) : il doit l'être sur la boîte`,
    );
    constate(
      champ.bordureRepos !== champ.bordureFocus,
      `${route} champ #${champ.i} (${champ.type}) — la boîte ne change pas de bordure ` +
        `au focus (\`${champ.bordureFocus}\`) : le focus n'est plus signalé du tout`,
    );
  }
  await context.close();
}

await browser.close();
server.close();

console.log(`
  écrans mesurés   ${ECRANS.join(', ')}
  champs focalisés ${mesures}`);

if (failures.length > 0) {
  console.error(`\n  ${failures.length} invariant(s) rompu(s) :`);
  for (const e of failures) console.error(`    · ${e}`);
  console.error(
    "\n  Un couple de focus ne se demi-annule pas : la saisie n'en porte AUCUNE" +
      '\n  moitié, la boîte les porte toutes les deux.\n',
  );
  process.exit(1);
}
console.log("\n  Aucune moitié orpheline : la bordure des champs survit au focus.\n");
