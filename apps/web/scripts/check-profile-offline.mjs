#!/usr/bin/env node
/**
 * LA MOITIÉ QUE `check-profile.mjs` NE PEUT PAS PROUVER (#7083) — le chemin
 * SERVICE WORKER.
 *
 * `check-profile.mjs` sert le `dist` SANS coquille
 * (`startDistServer(DIST, { serviceWorker: false })`) : il mesure l'après-visite
 * — réseau coupé sur une page DÉJÀ ouverte — jamais le RECHARGEMENT À FROID.
 * Or c'est ce rechargement-là que le resserrement de `/^\/u\//` achète : jusqu'à
 * #7083, `/u/<pseudo>` était laissée au réseau, donc la fiche n'existait pas
 * hors ligne. Le témoin unitaire (`lib/net/network-only-navigations.test.ts`)
 * prouve que la navigation revient à la coquille ; CE script prouve que la
 * coquille, une fois servie, rouvre la fiche.
 *
 * Il demande la variante A ENTIÈRE, service worker compris :
 *
 *   bun run build && bunx vite preview --port 4173
 *   BASE=http://localhost:4173 CHROMIUM='' node scripts/check-profile-offline.mjs
 *
 * `CAPTURE_DIR=<dossier>` écrit les captures de recette.
 *
 * MESURE DE L'OUTIL, à dire plutôt qu'à contourner : après une NAVIGATION,
 * `navigator.onLine` revient à `true` sous `context.setOffline(true)` — la
 * condition est posée par `Network.emulateNetworkConditions` sur la session du
 * document, et le document neuf repart du drapeau par défaut (mesuré le
 * 2026-09-19 : `true` après `reload`, `false` dès la ré-application, sans
 * qu'aucune requête n'aboutisse entre-temps). Un appareil réellement hors ligne
 * rend `false` au chargement. La condition est donc RÉ-APPLIQUÉE après le
 * rechargement : sans cela ce script mesurerait l'émulateur, pas le produit.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { launchChromium } from './lib/browser.mjs';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
if (CAPTURE_DIR !== null) await mkdir(CAPTURE_DIR, { recursive: true });

const HANDLE = 'kwame-mensah';
const failures = [];
const check = (ok, what) => {
  if (ok) console.log(`  ok    ${what}`);
  else failures.push(what);
};

const browser = await launchChromium();
try {
  for (const scheme of ['light', 'dark']) {
    const label = scheme === 'light' ? 'clair' : 'sombre';
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, locale: 'fr-FR' });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);

    // ------------------------------------------------ 1. la visite qui remplit les deux caches
    await page.goto(`${BASE}/u/${HANDLE}`, { waitUntil: 'load' });
    await page.waitForSelector('[data-profile-posts] [data-feed-card-id]');
    /* Le service worker s'installe puis PRÉCACHE — et c'est lui qui servira la
       coquille au rechargement. Partir avant, c'est mesurer une installation
       inachevée. */
    await page.waitForTimeout(2500);
    check(true, `${label} : la fiche se peint en ligne`);

    // ------------------------------------------------ 2. RÉSEAU COUPÉ, RECHARGEMENT À FROID
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    const rouverte = await page
      .waitForFunction(() => (document.querySelector('[data-user-hero]')?.textContent ?? '').includes('Kwame'), null, { timeout: 12_000 })
      .then(() => true, () => false);
    check(rouverte, `${label} : réseau coupé, un RECHARGEMENT de /u/${HANDLE} ROUVRE la fiche`);

    // ------------------------------------------------ 3. et l'écran le DIT (condition ré-appliquée — § doc-comment)
    await context.setOffline(false);
    await context.setOffline(true);
    const dit = await page.waitForSelector('[data-profile-offline]', { timeout: 5_000 }).then(() => true, () => false);
    check(dit, `${label} : le bandeau hors ligne le dit`);
    const actifs = await page.$$eval('[data-profile-action]', (els) => els.filter((el) => !el.disabled).length).catch(() => -1);
    check(actifs === 0, `${label} : aucun geste d'écriture n'est offert (${actifs} actif(s)) — la v3.1 n'a pas de file d'écriture`);
    const cartes = await page.$$eval('[data-profile-posts] [data-feed-card-id]', (els) => els.length).catch(() => 0);
    check(cartes > 0, `${label} : les publications se repeignent depuis le cache persisté (${cartes})`);

    if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `profil-public-recharge-hors-ligne-${scheme}.png`) });
    await context.close();
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`\n  ${failures.length} invariant(s) rompu(s) :`);
  for (const f of failures) console.error(`    · ${f}`);
  process.exit(1);
}
console.log(`\n  Réseau coupé, /u/<pseudo> se RECHARGE — la coquille prend la navigation, et la fiche revient du cache.\n`);
