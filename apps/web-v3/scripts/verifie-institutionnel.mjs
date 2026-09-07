#!/usr/bin/env node
/**
 * VÉRIFIE QUE LES CINQ PAGES INSTITUTIONNELLES SONT ENTIÈREMENT EN CACHE — et
 * qu'elles restent ELLES-MÊMES une fois le service worker installé.
 *
 * POURQUOI CE TÉMOIN EXISTE
 *
 * #5554 les a livrées en HTML statique : une requête, zéro script, la feuille
 * inlinée. Cette propriété a été mesurée sur une visite FROIDE — la seule que
 * personne ne remet en question. À la deuxième visite, le service worker
 * répondait à toute navigation par `index.html`, la coquille de l'application :
 *
 *   /about  visite 1 → « À propos de Meeshy », un h1, 0 script
 *   /about  visite 2 → « Meeshy »,            aucun h1, 2 scripts
 *
 * La coquille n'a pas de route `/about` : le visiteur qui revenait recevait une
 * page blanche. Le défaut ne pouvait pas se voir dans un test de construction
 * (les fichiers étaient bien sur le disque), ni dans une mesure de première
 * peinture (elle n'installe le service worker qu'à la fin), ni à l'œil (il faut
 * revenir). Il fallait un navigateur RÉEL et une DEUXIÈME visite.
 *
 * CE QU'IL MESURE, pour chacune des cinq adresses et dans les deux formes
 * qu'elles servent (`/about` et `/about/`) :
 *
 *   1. le document servi est bien le sien — son titre, son h1 ;
 *   2. il vient du service worker, pas du réseau ;
 *   3. il ne coûte AUCUNE requête réseau à la deuxième visite ;
 *   4. il porte toujours zéro script externe ;
 *   5. il s'ouvre RÉSEAU COUPÉ.
 *
 * Le 3 est celui que le porteur a demandé — « entièrement caché, elles ne
 * changent que très rarement ». Le 1 est celui qui manquait.
 */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { chromium } from '@playwright/test';

import {
  CHEMINS_INSTITUTIONNELS,
  ROUTES_INSTITUTIONNELLES,
} from './lib/routes-institutionnelles.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

/**
 * Un serveur STATIQUE, et volontairement SANS repli d'application à page
 * unique. C'est le point du témoin : si une adresse institutionnelle n'a pas
 * son fichier, elle doit rendre 404 ici — jamais être rattrapée par un repli
 * qui masquerait l'absence, comme le service worker le faisait.
 */
const candidats = (chemin) => {
  const p = normalize(chemin).replace(/^\/+/, '');
  if (p === '' || p.endsWith('/')) return [join(DIST, p, 'index.html')];
  return [join(DIST, p), join(DIST, `${p}.html`), join(DIST, p, 'index.html')];
};

const serveur = createServer(async (req, res) => {
  for (const f of candidats(new URL(req.url, 'http://x').pathname)) {
    try {
      if (!(await stat(f)).isFile()) continue;
      const corps = await readFile(f);
      res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
      res.end(corps);
      return;
    } catch {
      /* candidat suivant */
    }
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('404');
});

await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${serveur.address().port}`;

/**
 * LE BINAIRE N'EST PAS AU MÊME ENDROIT PARTOUT, et un chemin en dur rendrait ce
 * témoin ininstallable ailleurs que sur la machine qui l'a écrit. Trois sources,
 * dans cet ordre : la variable d'environnement (qui tranche), le conteneur de
 * développement s'il porte le binaire, puis la résolution de Playwright
 * lui-même — celle qui vaut en intégration continue, après
 * `playwright install chromium`.
 */
const binaire = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navigateur = await chromium.launch(
  existsSync(binaire) ? { executablePath: binaire } : {},
);
const contexte = await navigateur.newContext({ viewport: { width: 390, height: 844 } });

/**
 * `fromServiceWorker()` sépare ce que le cache rend de ce que le réseau coûte.
 * L'événement `response` se déclenche pour les DEUX : les compter ensemble
 * rendrait une visite depuis le cache aussi « chère » que la première, et ferait
 * conclure que le précache ne sert à rien — l'inverse exact de la vérité.
 */
const observe = (page) => {
  const reseau = [];
  const cache = [];
  page.on('response', (r) => (r.fromServiceWorker() ? cache : reseau).push(r.url()));
  return { reseau, cache };
};

const echecs = [];
const constate = (ok, quoi) => {
  if (!ok) echecs.push(quoi);
  return ok;
};

// --- Visite 1 : froide. Elle installe le service worker et son précache.
const p1 = await contexte.newPage();
await p1.goto(`${BASE}/`, { waitUntil: 'load' });
await p1.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
  timeout: 20_000,
});
await p1.waitForTimeout(1500);
await p1.close();

// --- Visite 2 : le service worker contrôle. Chaque adresse, dans ses deux formes.
console.log('\n  adresse            document                          réseau  cache  scripts');
const lignes = [];
for (const chemin of CHEMINS_INSTITUTIONNELS) {
  const page = await contexte.newPage();
  const { reseau, cache } = observe(page);
  await page.goto(`${BASE}${chemin}`, { waitUntil: 'load' });

  const titre = await page.title();
  const h1 = await page.evaluate(() => document.querySelector('h1')?.textContent ?? '');
  const scripts = await page.evaluate(() => document.querySelectorAll('script[src]').length);
  await page.close();

  const route = chemin.replace(/\//g, '') || '/';
  constate(titre !== 'Meeshy' && titre.length > 0, `${chemin} sert la coquille (titre « ${titre} »)`);
  constate(h1.length > 0, `${chemin} n'a pas de h1 — la coquille de l'application, pas le document`);
  constate(scripts === 0, `${chemin} porte ${scripts} script(s) externe(s), attendu 0`);
  constate(reseau.length === 0, `${chemin} coûte ${reseau.length} requête(s) RÉSEAU en visite 2`);
  constate(cache.length > 0, `${chemin} n'est servi par aucun cache`);

  lignes.push(
    `  ${chemin.padEnd(18)} ${titre.slice(0, 32).padEnd(33)} ${String(reseau.length).padStart(5)}  ${String(cache.length).padStart(5)}  ${String(scripts).padStart(7)}`,
  );
  void route;
}
console.log(lignes.join('\n'));

// --- Visite 3 : RÉSEAU COUPÉ. Une page « entièrement en cache » s'ouvre sans réseau.
await contexte.setOffline(true);
const horsLigne = [];
for (const r of ROUTES_INSTITUTIONNELLES) {
  const page = await contexte.newPage();
  let ok = false;
  try {
    await page.goto(`${BASE}/${r}`, { waitUntil: 'domcontentloaded', timeout: 10_000 });
    ok = (await page.evaluate(() => (document.querySelector('h1')?.textContent ?? '').length)) > 0;
  } catch {
    ok = false;
  }
  await page.close();
  constate(ok, `/${r} ne s'ouvre pas réseau coupé`);
  horsLigne.push(`/${r} ${ok ? '✓' : '✗'}`);
}
await navigateur.close();
serveur.close();

console.log(`\n  hors ligne         ${horsLigne.join('  ')}`);

if (echecs.length > 0) {
  console.error(`\n  ${echecs.length} invariant(s) rompu(s) :`);
  for (const e of echecs) console.error(`    · ${e}`);
  process.exit(1);
}
console.log(
  `\n  Les ${ROUTES_INSTITUTIONNELLES.length} pages institutionnelles sont servies depuis le cache,` +
    ' dans leurs deux formes, à zéro requête réseau, et s\'ouvrent réseau coupé.\n',
);
