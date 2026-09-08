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
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { launchChromium } from './lib/browser.mjs';

import {
  INSTITUTIONAL_PATHS,
  INSTITUTIONAL_ROUTES,
} from './lib/institutional-routes.mjs';

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
const candidates = (path) => {
  const p = normalize(path).replace(/^\/+/, '');
  if (p === '' || p.endsWith('/')) return [join(DIST, p, 'index.html')];
  return [join(DIST, p), join(DIST, `${p}.html`), join(DIST, p, 'index.html')];
};

const server = createServer(async (req, res) => {
  for (const f of candidates(new URL(req.url, 'http://x').pathname)) {
    try {
      if (!(await stat(f)).isFile()) continue;
      const body = await readFile(f);
      res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
      res.end(body);
      return;
    } catch {
      /* candidat suivant */
    }
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('404');
});

await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });

/**
 * `fromServiceWorker()` sépare ce que le cache rend de ce que le réseau coûte.
 * L'événement `response` se déclenche pour les DEUX : les compter ensemble
 * rendrait une visite depuis le cache aussi « chère » que la première, et ferait
 * conclure que le précache ne sert à rien — l'inverse exact de la vérité.
 */
const observe = (page) => {
  const network = [];
  const cache = [];
  page.on('response', (r) => (r.fromServiceWorker() ? cache : network).push(r.url()));
  return { network, cache };
};

const failures = [];
const constate = (ok, what) => {
  if (!ok) failures.push(what);
  return ok;
};

// --- Visite 1 : froide. Elle installe le service worker et son précache.
const p1 = await context.newPage();
await p1.goto(`${BASE}/`, { waitUntil: 'load' });
await p1.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
  timeout: 20_000,
});
await p1.waitForTimeout(1500);
await p1.close();

// --- Visite 2 : le service worker contrôle. Chaque adresse, dans ses deux formes.
console.log('\n  adresse            document                          réseau  cache  scripts');
const rows = [];
for (const path of INSTITUTIONAL_PATHS) {
  const page = await context.newPage();
  const { network, cache } = observe(page);
  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });

  const title = await page.title();
  const h1 = await page.evaluate(() => document.querySelector('h1')?.textContent ?? '');
  const scripts = await page.evaluate(() => document.querySelectorAll('script[src]').length);
  await page.close();

  const route = path.replace(/\//g, '') || '/';
  constate(title !== 'Meeshy' && title.length > 0, `${path} sert la coquille (titre « ${title} »)`);
  constate(h1.length > 0, `${path} n'a pas de h1 — la coquille de l'application, pas le document`);
  constate(scripts === 0, `${path} porte ${scripts} script(s) externe(s), attendu 0`);
  constate(network.length === 0, `${path} coûte ${network.length} requête(s) RÉSEAU en visite 2`);
  constate(cache.length > 0, `${path} n'est servi par aucun cache`);

  rows.push(
    `  ${path.padEnd(18)} ${title.slice(0, 32).padEnd(33)} ${String(network.length).padStart(5)}  ${String(cache.length).padStart(5)}  ${String(scripts).padStart(7)}`,
  );
  void route;
}
console.log(rows.join('\n'));

// --- Visite 3 : RÉSEAU COUPÉ. Une page « entièrement en cache » s'ouvre sans réseau.
await context.setOffline(true);
const offline = [];
for (const r of INSTITUTIONAL_ROUTES) {
  const page = await context.newPage();
  let ok = false;
  try {
    await page.goto(`${BASE}/${r}`, { waitUntil: 'domcontentloaded', timeout: 10_000 });
    ok = (await page.evaluate(() => (document.querySelector('h1')?.textContent ?? '').length)) > 0;
  } catch {
    ok = false;
  }
  await page.close();
  constate(ok, `/${r} ne s'ouvre pas réseau coupé`);
  offline.push(`/${r} ${ok ? '✓' : '✗'}`);
}
await browser.close();
server.close();

console.log(`\n  hors ligne         ${offline.join('  ')}`);

if (failures.length > 0) {
  console.error(`\n  ${failures.length} invariant(s) rompu(s) :`);
  for (const e of failures) console.error(`    · ${e}`);
  process.exit(1);
}
console.log(
  `\n  Les ${INSTITUTIONAL_ROUTES.length} pages institutionnelles sont servies depuis le cache,` +
    ' dans leurs deux formes, à zéro requête réseau, et s\'ouvrent réseau coupé.\n',
);
