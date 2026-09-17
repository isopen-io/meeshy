#!/usr/bin/env node
/**
 * VÉRIFIE, DANS UN NAVIGATEUR RÉEL, QU'UNE NOUVELLE VERSION S'ANNONCE ET
 * S'APPLIQUE SANS DÉCONNECTER PERSONNE (#6936).
 *
 * Directive porteur 2026-09-17 : « réutilise le même COMPORTEMENT et API que le
 * legacy pour afficher une bannière mise à jour de l'application lorsqu'une
 * nouvelle mise à jour est distribuée afin d'invalider tout le cache de
 * l'application en cours (en préservant la session) ».
 *
 * CE QUE CE GATE MESURE, ET QU'AUCUN TÉMOIN UNITAIRE NE PEUT MESURER. Les
 * témoins de `lib/app-update/` bouchonnent le conteneur de service workers :
 * ils prouvent la LOI (quand annoncer, quoi purger, quand recharger), jamais
 * que le navigateur la joue. Ce qui ne se voit qu'ici :
 *
 *   · le service worker généré par Workbox répond bien au message
 *     `SKIP_WAITING` — c'est son MODÈLE qui le câble, sous la seule condition
 *     `skipWaiting: false` (`vite.config.ts` § VitePWA) ;
 *   · `registration.update()` déclenché au retour au premier plan trouve la
 *     version neuve et la met EN ATTENTE ;
 *   · l'activation de cette version retire du précache les entrées de
 *     l'ancienne — la moitié de « invalider tout le cache » que la page ne
 *     fait PAS elle-même, et qu'elle ne doit surtout pas faire
 *     (`lib/sw-caches.ts` § WORKBOX_PRECACHE_PREFIX) ;
 *   · la SESSION survit : le lecteur reste sur `/` au lieu de retomber sur
 *     `/login`, ce que seule une construction `VITE_DATA_SOURCE=gateway`
 *     rend observable (la garde de route ne mord pas sous fixtures).
 *
 * COMMENT DEUX VERSIONS SONT FABRIQUÉES. La construction est DÉTERMINISTE :
 * bâtir deux fois de suite donne deux `dist` identiques au bit, donc un
 * `sw.js` identique, donc AUCUNE mise à jour à détecter. La version B est donc
 * la version A dont `index.html` porte un marqueur (`data-meeshy-build="b"`)
 * et dont le manifeste de précache porte la NOUVELLE empreinte de ce document
 * — exactement ce qu'un vrai déploiement produit : Workbox grave `revision:
 * md5(index.html)` pour les fichiers non empreintés (mesuré sur `dist/sw.js`),
 * et c'est ce champ qui fait différer le worker. Aucun interrupteur de
 * construction n'est ajouté au produit pour les besoins d'un témoin.
 *
 * LE MARQUEUR EST LA PREUVE DE « LA PAGE TOURNE SUR B » : il est dans le
 * DOCUMENT, donc il ne peut apparaître que si le rechargement a servi
 * `index.html` de B — depuis le précache du worker neuf.
 *
 * `dist-app-update-{a,b}` : couverts par le motif `dist-*` du `.gitignore`,
 * jamais commités — même discipline que `check-gateway-build.mjs`.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { cp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { launchChromium } from './lib/browser.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const A_DIR = 'dist-app-update-a';
const B_DIR = 'dist-app-update-b';
const A = join(ROOT, A_DIR);
const B = join(ROOT, B_DIR);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

/** La session d'un lecteur CONNECTÉ, dans la forme que `session.ts` persiste. */
const SESSION = {
  token: 'jwt-check-app-update',
  sessionToken: 'sess-check-app-update',
  user: { id: 'u-maj', username: 'lecteur-maj' },
  expiresAt: Date.now() + 24 * 60 * 60 * 1000,
};

/**
 * CE QUI DOIT SURVIVRE À LA MISE À JOUR — la session et les PRÉFÉRENCES, qui
 * vivent dans le même `localStorage` que le cache. Une purge qui effacerait
 * largement puis restaurerait « ce qu'elle regrette » les perdrait : la seule
 * forme sûre est une purge qui NOMME ce qu'elle efface.
 */
const SURVIVORS = {
  'meeshy.session': JSON.stringify(SESSION),
  'meeshy.scheme': 'dark',
  'meeshy.draft.u-maj.c-1': 'un brouillon que la mise à jour ne doit pas manger',
};

/** Ce qui doit DISPARAÎTRE — le cache de requêtes persisté de la version A. */
const QUERY_CACHE_KEY = 'meeshy.query-cache';

/** Le journal des gestes sur cette clé, et le repère du rechargement. */
const JOURNAL_KEY = '__journal-cache-de-requetes';
const SEED_KEY = '__amorce-du-gate';
const RELOAD_MARK = 'rechargement';

/** Les sentinelles posées dans les seaux du service worker, version A. */
const SENTINELS = {
  api: '/api/v1/__sentinelle-de-a',
  media: '/__sentinelle-media-de-a.png',
  legacy: 'meeshy-cache-a',
};

const MARKER = 'b';

function stubApi(pathname) {
  if (pathname === '/api/v1/conversations') {
    return {
      success: true,
      data: [
        {
          id: 'c-maj-1',
          title: 'Conversation de recette',
          type: 'direct',
          memberCount: 2,
          participants: [],
          unreadCount: 0,
          isActive: true,
          status: 'active',
          visibility: 'private',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastMessageAt: new Date().toISOString(),
        },
      ],
      pagination: { limit: 30, offset: 0, total: 1, hasMore: false },
      cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
    };
  }
  return { success: true, data: [] };
}

/**
 * UN SEUL SERVEUR pour les fichiers ET l'API : le service worker doit rester
 * ACTIF (c'est le sujet), et une interception `page.route()` est court-circuitée
 * par sa stratégie `NetworkFirst` dès qu'il l'est (mesuré par
 * `check-gateway-build.mjs`, qui bloque les workers pour cette raison). Le
 * bouchon vit donc DERRIÈRE le réseau, là où le worker le laisse passer.
 */
async function serve() {
  const state = { dist: A };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/socket.io/')) {
      res.writeHead(404).end('pas de socket dans ce gate');
      return;
    }
    if (url.pathname.startsWith('/api/v1/')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(stubApi(url.pathname)));
      return;
    }
    const p = normalize(url.pathname).replace(/^\/+/, '');
    for (const f of [
      join(state.dist, p),
      join(state.dist, `${p}.html`),
      join(state.dist, p, 'index.html'),
      join(state.dist, 'index.html'),
    ]) {
      try {
        if (!(await stat(f)).isFile()) continue;
        const headers = { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' };
        /* LE WORKER NE SE MET JAMAIS EN CACHE HTTP — `nginx.conf` le pose en
           production, et sans lui ce gate mesurerait le cache du navigateur
           plutôt que la détection de version. */
        if (p === 'sw.js' || p === 'index.html' || p === '') {
          headers['cache-control'] = 'no-cache, no-store, must-revalidate';
        }
        res.writeHead(200, headers);
        res.end(await readFile(f));
        return;
      } catch {
        /* candidat suivant */
      }
    }
    res.writeHead(404).end('404');
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  return { server, state, base: `http://127.0.0.1:${server.address().port}` };
}

/**
 * B = A + un marqueur dans le document + le manifeste de précache mis à jour.
 * Voir le doc-comment de tête : c'est la forme MINIMALE d'un vrai déploiement,
 * et la seule qui ne demande aucun interrupteur de construction au produit.
 */
async function fabriquerB() {
  await rm(B, { recursive: true, force: true });
  await cp(A, B, { recursive: true });

  const documentA = await readFile(join(A, 'index.html'), 'utf8');
  const empreinteA = createHash('md5').update(documentA, 'utf8').digest('hex');
  if (!documentA.includes('<html')) throw new Error('index.html de A ne porte pas de balise <html>');
  const documentB = documentA.replace('<html', `<html data-meeshy-build="${MARKER}"`);
  await writeFile(join(B, 'index.html'), documentB);
  const empreinteB = createHash('md5').update(documentB, 'utf8').digest('hex');

  const workerA = await readFile(join(A, 'sw.js'), 'utf8');
  const entree = `{url:"index.html",revision:"${empreinteA}"}`;
  if (!workerA.includes(entree)) {
    throw new Error(
      `le manifeste de précache de A ne porte pas ${entree} — la forme du manifeste a changé, ` +
        'ce gate doit être relu plutôt que contourné.',
    );
  }
  await writeFile(join(B, 'sw.js'), workerA.replace(entree, `{url:"index.html",revision:"${empreinteB}"}`));

  return { empreinteA, empreinteB };
}

function construire(base) {
  console.log(`  construction VITE_DATA_SOURCE=gateway → ${A_DIR}/ …`);
  const build = spawnSync('bunx', ['vite', 'build', '--outDir', A_DIR], {
    cwd: ROOT,
    env: { ...process.env, VITE_DATA_SOURCE: 'gateway', VITE_API_BASE: base },
    stdio: 'inherit',
  });
  if (build.status !== 0) {
    console.error('\n  la construction a échoué — voir la sortie ci-dessus.\n');
    process.exit(1);
  }
}

async function main() {
  await rm(A, { recursive: true, force: true });

  const { server, state, base } = await serve();
  construire(base);
  const { empreinteA, empreinteB } = await fabriquerB();

  const failures = [];
  const check = (ok, what) => {
    if (ok) console.log(`  ok    ${what}`);
    else failures.push(what);
  };

  const browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
  /**
   * L'AMORÇAGE NE SE REJOUE PAS AU RECHARGEMENT, et c'est essentiel : un
   * `addInitScript` s'exécute à CHAQUE document, donc il réécrirait le cache de
   * requêtes juste après la purge — le gate mesurerait son propre amorçage et
   * rendrait vert le défaut qu'il doit attraper.
   *
   * ET IL JOURNALISE CE QUI ARRIVE À LA CLÉ DU CACHE PERSISTÉ. « La clé est
   * absente après le rechargement » n'est pas mesurable : la version neuve
   * repersiste légitimement son propre cache dans les 250 ms. Ce qui se mesure,
   * c'est la SUITE des événements — le dernier geste avant le rechargement doit
   * être un RETRAIT. Sans le verrou de persistance (`discardPersisted`), le
   * `pagehide` du rechargement ajoute une écriture après ce retrait, et cette
   * assertion rougit. `sessionStorage` survit au rechargement dans le même
   * onglet : c'est ce qui rend la suite lisible APRÈS le voyage.
   */
  await context.addInitScript(
    ([survivors, queryCacheKey, journalKey, seedKey, reloadMark]) => {
      const proto = window.Storage.prototype;
      const setItem = proto.setItem;
      const removeItem = proto.removeItem;
      const note = (entry) => {
        const courant = window.sessionStorage.getItem(journalKey) ?? '';
        setItem.call(window.sessionStorage, journalKey, courant === '' ? entry : `${courant},${entry}`);
      };
      proto.setItem = function (key, value) {
        if (key === queryCacheKey) note('+');
        return setItem.call(this, key, value);
      };
      proto.removeItem = function (key) {
        if (key === queryCacheKey) note('-');
        return removeItem.call(this, key);
      };
      /* LE DRAPEAU D'AMORÇAGE VIT DANS `sessionStorage`, jamais dans le
         `localStorage` qu'il amorce — mesuré : avec une mutation qui fait
         `localStorage.clear()` à la purge, un drapeau rangé là disparaissait
         AVEC la session, l'amorçage se rejouait au rechargement et
         RÉPARAIT ce que le produit venait de détruire. Le témoin rendait alors
         « session intacte » sur un produit qui l'avait effacée. */
      if (window.sessionStorage.getItem(seedKey) === null) {
        for (const [key, value] of Object.entries(survivors)) window.localStorage.setItem(key, value);
        window.localStorage.setItem(
          queryCacheKey,
          JSON.stringify({ buster: 'version-a', state: { mutations: [], queries: [] } }),
        );
        window.sessionStorage.setItem(seedKey, '1');
      } else {
        note(reloadMark);
      }
    },
    [SURVIVORS, QUERY_CACHE_KEY, JOURNAL_KEY, SEED_KEY, RELOAD_MARK],
  );

  const page = await context.newPage();
  const navigations = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });

  // --- 1. VERSION A : le lecteur est connecté, le worker contrôle la page ---
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
  check(
    (await page.evaluate(() => window.location.pathname)) === '/',
    'version A : un lecteur avec session reste sur « / » (jamais /login)',
  );
  check(
    (await page.evaluate(() => document.documentElement.dataset.meeshyBuild ?? 'a')) === 'a',
    'version A : le document ne porte pas le marqueur de B',
  );
  check(
    (await page.$('[data-app-update="banner"]')) === null,
    'version A : aucune bannière — il n’y a pas de version en attente',
  );

  // --- 2. Les caches de A sont remplis, sentinelles comprises ---------------
  await page.evaluate(async (sentinels) => {
    const api = await caches.open('api');
    await api.put(new Request(sentinels.api), new Response('{"de":"a"}'));
    const medias = await caches.open('medias');
    await medias.put(new Request(sentinels.media), new Response('image-de-a'));
    const legacy = await caches.open(sentinels.legacy);
    await legacy.put(new Request('/legacy-de-a'), new Response('legacy'));
  }, SENTINELS);

  const cachesA = await page.evaluate(() => caches.keys());
  check(
    cachesA.includes('api') && cachesA.includes('medias') && cachesA.includes(SENTINELS.legacy),
    `version A : les seaux « api », « medias » et « ${SENTINELS.legacy} » existent (obtenu : ${cachesA.join(', ')})`,
  );
  const precacheName = cachesA.find((name) => name.startsWith('workbox-precache'));
  check(precacheName !== undefined, `version A : le précache de Workbox existe (obtenu : ${cachesA.join(', ')})`);
  const documentPrecacheA = await page.evaluate(async (name) => {
    const cache = await caches.open(name);
    return (await cache.keys()).map((r) => r.url).filter((url) => url.includes('index.html'));
  }, precacheName);
  check(
    documentPrecacheA.some((url) => url.includes(empreinteA)),
    `version A : son document est précaché sous son empreinte (obtenu : ${documentPrecacheA.join(', ')})`,
  );

  // --- 3. VERSION B servie : le retour au premier plan la trouve ------------
  state.dist = B;
  const navigationsAvant = navigations.length;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  let banniere = true;
  try {
    await page.waitForSelector('[data-app-update="banner"]', { timeout: 40_000 });
  } catch {
    banniere = false;
  }
  check(banniere, 'version B servie : le retour au premier plan fait apparaître la bannière');

  if (banniere) {
    check(
      (await page.getAttribute('[data-app-update="banner"]', 'role')) === 'status' &&
        (await page.getAttribute('[data-app-update="banner"]', 'aria-live')) === 'polite',
      'la bannière est annoncée au lecteur d’écran (role=status, aria-live=polite)',
    );
    await page.waitForTimeout(1500);
    check(
      navigations.length === navigationsAvant &&
        (await page.evaluate(() => document.documentElement.dataset.meeshyBuild ?? 'a')) === 'a',
      'sans clic, RIEN ne recharge : la page tourne toujours sur A',
    );

    // --- 4. Le clic : purge, activation, UN rechargement -------------------
    await page.click('[data-app-update="banner"] button:not([aria-label])');
    let surB = true;
    try {
      await page.waitForFunction(
        (marker) => document.documentElement.dataset.meeshyBuild === marker,
        MARKER,
        { timeout: 40_000 },
      );
    } catch {
      surB = false;
    }
    check(surB, 'le clic recharge la page SUR LA VERSION B (marqueur du document)');

    /* Le rendu de B doit être arrivé avant de lire ses caches : le worker neuf
       nettoie son précache à l'activation, qui précède le rechargement. */
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });

    check(
      (await page.evaluate(() => window.location.pathname)) === '/',
      'après la mise à jour, le lecteur est TOUJOURS CONNECTÉ (« / », jamais /login)',
    );

    const gardes = await page.evaluate(
      (keys) => Object.fromEntries(keys.map((key) => [key, window.localStorage.getItem(key)])),
      Object.keys(SURVIVORS),
    );
    for (const [key, value] of Object.entries(SURVIVORS)) {
      check(gardes[key] === value, `« ${key} » est intacte après la mise à jour`);
    }

    /* LA SUITE DES GESTES, pas l'état final — voir l'amorçage : la version
       neuve repersiste légitimement son cache, donc « la clé est absente »
       n'est pas mesurable. Le dernier geste AVANT le rechargement doit être un
       retrait. */
    const journal = await page.evaluate((key) => window.sessionStorage.getItem(key) ?? '', JOURNAL_KEY);
    const gestes = journal.split(',');
    const repere = gestes.indexOf(RELOAD_MARK);
    const avantRechargement = repere === -1 ? gestes : gestes.slice(0, repere);
    check(
      repere !== -1 && avantRechargement.at(-1) === '-',
      `le dernier geste sur « ${QUERY_CACHE_KEY} » avant le rechargement est son RETRAIT ` +
        `(journal : ${journal || '(vide)'})`,
    );

    /* LES SENTINELLES, jamais les NOMS de seaux : la version neuve recrée
       « api » et « medias » à sa première requête (c'est la stratégie de
       Workbox qui les ouvre), donc un nom présent ne dit rien. Ce qui compte
       est qu'AUCUNE réponse écrite par A ne soit encore servable. */
    const restes = await page.evaluate(async (sentinels) => {
      const trouves = [];
      for (const nom of await caches.keys()) {
        const cache = await caches.open(nom);
        for (const url of [sentinels.api, sentinels.media]) {
          if ((await cache.match(new Request(url))) !== undefined) trouves.push(`${nom} → ${url}`);
        }
      }
      return trouves;
    }, SENTINELS);
    check(
      restes.length === 0,
      `aucune réponse mise en cache par A n’est encore servable (obtenu : ${restes.join(', ')})`,
    );

    const cachesB = await page.evaluate(() => caches.keys());
    check(
      !cachesB.includes(SENTINELS.legacy),
      `le seau « ${SENTINELS.legacy} » du legacy a disparu (obtenu : ${cachesB.join(', ')})`,
    );

    const precacheApres = (await page.evaluate(() => caches.keys())).find((name) =>
      name.startsWith('workbox-precache'),
    );
    const documentPrecacheB = await page.evaluate(async (name) => {
      const cache = await caches.open(name);
      return (await cache.keys()).map((r) => r.url).filter((url) => url.includes('index.html'));
    }, precacheApres);
    check(
      documentPrecacheB.some((url) => url.includes(empreinteB)),
      `le précache porte le document de B (obtenu : ${documentPrecacheB.join(', ')})`,
    );
    check(
      !documentPrecacheB.some((url) => url.includes(empreinteA)),
      `le précache ne porte PLUS le document de A (obtenu : ${documentPrecacheB.join(', ')})`,
    );

    check(
      navigations.length - navigationsAvant === 1,
      `UN seul rechargement, jamais deux (obtenu : ${navigations.length - navigationsAvant})`,
    );
  }

  await context.close();
  await browser.close();
  server.close();

  if (failures.length > 0) {
    console.error(`\n  ${failures.length} défaut(s) du parcours de mise à jour :\n`);
    for (const f of failures) console.error(`  ROUGE ${f}`);
    console.error('');
    process.exit(1);
  }

  console.log(
    '\n  une nouvelle version s’annonce par la bannière, le clic purge les caches de l’ancienne, ' +
      'recharge UNE fois sur la neuve — et le lecteur est toujours connecté.\n',
  );
}

await main();
