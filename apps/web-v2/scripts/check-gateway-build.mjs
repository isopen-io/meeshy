#!/usr/bin/env node
/**
 * VÉRIFIE QUE `VITE_DATA_SOURCE=gateway` CONSTRUIT UNE APPLICATION QUI PARLE
 * RÉELLEMENT À LA PASSERELLE (#5650, F2/F5, § 5 étape 11).
 *
 * La garde de `vite.config.ts` qui refusait cette valeur (#5605) a disparu
 * dans ce même diff — ce gate est ce qui la REMPLACE : un navigateur RÉEL,
 * sur un `dist` construit avec `VITE_DATA_SOURCE=gateway`, qui prouve les
 * DEUX moitiés du critère (a)+(d)+squelette de l'issue #5650 :
 *
 *  1. SANS session : `/` redirige vers `/login` (`SessionGate`,
 *     `resolveRouteAccess`) et N'ÉMET AUCUNE requête vers
 *     `/api/v1/conversations` — la garde mord AVANT que l'écran (et son
 *     `useConversations()`) ne monte.
 *  2. AVEC une session posée dans `localStorage` (`meeshy.session`,
 *     `expiresAt` futur) et `GET /api/v1/conversations` intercepté (corps de
 *     `core-list.ts:916-937`, 45 conversations sur DEUX pages, page 1
 *     RETARDÉE de 800 ms) : SIX `[data-skeleton-row]` de 84 px sont peints
 *     AVANT la résolution, TRENTE `[data-row]` APRÈS — et le premier
 *     `offsetTop` ne bouge PAS entre les deux (la géométrie du squelette est
 *     celle de la rangée réelle, F5). Défiler jusqu'à la queue charge la
 *     page 2 (45 rangées, UNE requête par page, `#6195`) et le pied passe à
 *     « tout chargé ».
 *  2b. Une page 2 en ÉCHEC (500) rend le pied « Réessayer », qui recharge la
 *     même page (#6195).
 *  2c. Tirer la liste depuis le haut refait la page 1 + les stories/humeurs
 *     EN PARALLÈLE, sans squelette (#6195).
 *  3. `/login` avec une session déjà active redirige vers `/`.
 *  4. `/conversations/new` est PRIVÉE (un visiteur sans session en est sorti) et
 *     une recherche en ÉCHEC y peint une ALERTE, jamais un écran blanc (#5652).
 *
 * Construit dans `dist-gateway` (couvert par le motif `dist-*` du
 * `.gitignore`, jamais commité) — même discipline que `check-shell-dist.mjs`.
 */
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, rm, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

import { launchChromium } from './lib/browser.mjs';
import { allFiles } from './lib/files.mjs';
import { FIXTURE_MARKERS } from './lib/fixture-markers.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OUT_DIR = 'dist-gateway';
const OUT = join(ROOT, OUT_DIR);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

/**
 * `isConversationsList` (#6195) — PRÉDICAT d'URL, jamais un glob : depuis la
 * pagination, TOUTE requête de liste porte `?limit=30[&before=<id>]`
 * (`api/conversations.ts::loadConversationsPage`), et le glob
 * `'**\/api/v1/conversations'` — sans wildcard de fin — ne matche PAS une URL
 * qui porte une query string (mesuré : la requête part vers le RÉSEAU réel,
 * jamais interceptée, et `[data-row]` n'apparaît jamais). Un prédicat sur le
 * SEUL `pathname` reste vrai quels que soient les paramètres.
 */
const isConversationsList = (url) => url.pathname === '/api/v1/conversations';

/**
 * 45 conversations synthétiques pour le bloc 2 (#6195) — `lastMessageAt`
 * strictement décroissant, comme `core-list.ts` les sert triées. Mime la
 * FORME de `pageOfConversations` (`fixtures-pagination.ts`) sans en
 * importer le TypeScript (ce script est du `.mjs` pur, exécuté par `node`).
 */
const FORTY_FIVE_CONVERSATIONS = Array.from({ length: 45 }, (_, i) => ({
  id: `c-gw-${String(i).padStart(2, '0')}`,
  title: `Conversation ${i}`,
  type: 'direct',
  memberCount: 2,
  participants: [],
  unreadCount: 0,
  isActive: true,
  status: 'active',
  visibility: 'private',
  createdAt: new Date(Date.now() - i * 60_000).toISOString(),
  updatedAt: new Date(Date.now() - i * 60_000).toISOString(),
  lastMessageAt: new Date(Date.now() - i * 60_000).toISOString(),
}));

/** Mime `core-list.ts:916-937` : `pagination` ET `cursorPagination`, SIBLINGS
 * de `data` — `before` INCONNU laisse la fenêtre intacte (page 1 resservie,
 * `:245`), exactement la loi de `pageOfConversations`. */
function pageOfSynthetic(before, limit = 30) {
  const sorted = FORTY_FIVE_CONVERSATIONS;
  const cursorIndex = before === null ? -1 : sorted.findIndex((c) => c.id === before);
  const windowed = cursorIndex === -1 ? sorted : sorted.slice(cursorIndex + 1);
  const page = windowed.slice(0, limit);
  const hasMore = page.length === limit;
  const lastId = page.length > 0 ? page[page.length - 1].id : null;
  const total = before === null ? sorted.length : 0;
  return {
    success: true,
    data: page,
    pagination: { limit, offset: 0, total, hasMore: before === null ? page.length < total : hasMore },
    cursorPagination: { limit, hasMore, nextCursor: hasMore ? lastId : null },
  };
}

/**
 * Fabrique de bouchon POUR LA LISTE (#6195) — un compteur PAR `before`
 * (« un par page »), un délai optionnel (squelette AVANT contenu, bloc 2
 * historique) et un échec CONTRÔLÉ PAR DRAPEAU optionnel sur un `before`
 * nommé (bloc 2b, « erreur puis Réessayer »).
 *
 * `failWhile` — POURQUOI un DRAPEAU MUTABLE et pas un compte fixe : le cache
 * de requêtes est PARTAGÉ (`appQueryClient`, `defaultOptions.retry:
 * shouldRetry`, `query-client.ts`) et `fetchNextPage()` en hérite comme
 * n'importe quelle requête — la politique de reprise retente
 * AUTOMATIQUEMENT (mesuré : jusqu'à QUATRE tentatives au total avant de
 * surfacer `isFetchNextPageError`, pas trois — deviner ce nombre est
 * fragile). Faire échouer TANT QUE le témoin n'a pas VU le pied « error »,
 * puis lever le drapeau juste avant le clic manuel, tient quel que soit le
 * nombre exact de tentatives que la politique de reprise choisit.
 */
function conversationsRouteHandler({ requestCounts, delayMs = 0, failWhile = null } = {}) {
  return async (route) => {
    const url = new URL(route.request().url());
    const before = url.searchParams.get('before');
    const key = before ?? '';
    if (requestCounts) requestCounts.set(key, (requestCounts.get(key) ?? 0) + 1);
    if (failWhile !== null && failWhile(before)) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'panne' }) });
      return;
    }
    // Le délai ne vise QUE la page 1 — c'est elle que le témoin du squelette
    // mesure (bloc 2) ; le retarder sur les pages suivantes n'aurait ralenti
    // ce gate pour rien de plus observé.
    if (delayMs > 0 && before === null) await new Promise((r) => setTimeout(r, delayMs));
    const limit = Number(url.searchParams.get('limit')) || 30;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pageOfSynthetic(before, limit)) });
  };
}

/* Trois stories, deux auteurs — assez pour que le rail se peigne et que
   `groupStoriesByAuthor` ait quelque chose à grouper. */
const TRAY_STORIES = [
  {
    id: 's-gw-1', type: 'STORY',
    createdAt: new Date(Date.now() - 3 * 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 21 * 60 * 60_000).toISOString(),
    author: { id: 'u-camille', username: 'camille', displayName: 'Camille Roy' },
  },
  {
    id: 's-gw-2', type: 'STORY',
    createdAt: new Date(Date.now() - 9 * 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 20 * 60 * 60_000).toISOString(),
    author: { id: 'u-camille', username: 'camille', displayName: 'Camille Roy' },
  },
  {
    id: 's-gw-3', type: 'STORY',
    createdAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 19 * 60 * 60_000).toISOString(),
    author: { id: 'u-ines', username: 'ines', displayName: 'Inès Baraka' },
  },
];

const SESSION = {
  token: 'jwt-check-gateway-build',
  sessionToken: 'sess-check-gateway-build',
  user: { id: 'u-check', username: 'check' },
  expiresAt: Date.now() + 24 * 60 * 60 * 1000,
};

async function serve(dist) {
  const server = createServer(async (req, res) => {
    const p = normalize(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    for (const f of [join(dist, p), join(dist, `${p}.html`), join(dist, p, 'index.html'), join(dist, 'index.html')]) {
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
  return server;
}

async function main() {
  await rm(OUT, { recursive: true, force: true });

  console.log(`  construction VITE_DATA_SOURCE=gateway → ${OUT_DIR}/ …`);
  const build = spawnSync('bunx', ['vite', 'build', '--outDir', OUT_DIR], {
    cwd: ROOT,
    env: { ...process.env, VITE_DATA_SOURCE: 'gateway' },
    stdio: 'inherit',
  });
  if (build.status !== 0) {
    console.error('\n  la construction VITE_DATA_SOURCE=gateway a échoué — voir la sortie ci-dessus.\n');
    process.exit(1);
  }

  const server = await serve(OUT);
  const base = `http://127.0.0.1:${server.address().port}`;

  const failures = [];
  const check = (ok, what) => {
    if (ok) console.log(`  ok    ${what}`);
    else failures.push(what);
  };

  /**
   * AUCUNE FIXTURE NE VOYAGE DANS UNE CONSTRUCTION `gateway` (revue #5815).
   *
   * `__FIXTURES__` (`vite.config.ts` § `define`) + la règle d'élagage qui
   * déclare `src/lib/api/fixtures*.ts` sans effet de bord font disparaître le
   * jeu de données ENTIER — mesuré : le morceau partagé par la liste et le
   * fil passe de 16,53 à 10,03 Ko gzip. C'est ce gate qui le TIENT : la
   * mesure manuelle qui le précédait ne regardait que `{index,core}-*.js` et
   * ratait `thread-*.js` et `use-reader-*.js`, où les fixtures vivaient.
   *
   * Balayage de TOUT le dist (jamais d'un motif de nom : un morceau neuf
   * s'appellerait autrement, et c'est précisément le morceau neuf qu'on veut
   * attraper), sur la liste PARTAGÉE avec `build-shells.mjs`.
   */
  const carriers = [];
  for (const file of allFiles(OUT)) {
    if (!/\.(?:js|html|json)$/.test(file)) continue;
    const text = await readFile(file, 'utf8');
    const marker = FIXTURE_MARKERS.find((m) => text.includes(m));
    if (marker !== undefined) carriers.push(`${file.slice(OUT.length + 1)} (« ${marker} »)`);
  }
  check(
    carriers.length === 0,
    `aucun marqueur de fixture dans le dist gateway${carriers.length === 0 ? '' : ` — ${carriers.join(', ')}`}`,
  );

  /**
   * LES RÉFÉRENCES contre lesquelles le corpus VIDE se mesure (bloc 4) —
   * réancrées DANS le scrollport depuis que le rail y vit (#6103, décision
   * #6070). `populatedContentTop` (la position ABSOLUE de `#contenu`) ne
   * dépend plus du corpus — le rail et les filtres sont désormais des
   * ENFANTS de `#contenu`, jamais des frères qui déplaceraient son propre
   * `top` en disparaissant — donc ce même repère DOIT rester identique,
   * peuplé ou vide (assertion ci-dessous). `populatedFirstSectionOffset`
   * (la distance ENTRE le haut de `#contenu` et sa première section, donc
   * la hauteur du rail + des filtres) reste la référence de « sans le rail,
   * l'état vide doit RÉCUPÉRER cette bande » : l'état vide n'a ni rail ni
   * filtres visibles au-dessus de lui, donc son propre décalage interne
   * doit être STRICTEMENT plus petit.
   */
  let populatedContentTop = 0;
  let populatedFirstSectionOffset = 0;

  const browser = await launchChromium();

  // --- 1. SANS session : redirection, AUCUNE requête de conversations,   --
  //        AUCUNE poignée de main socket -----------------------------------
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const requests = [];
    const socketRequests = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/conversations')) requests.push(req.url());
      if (req.url().includes('/socket.io/')) socketRequests.push(req.url());
    });
    // Le socket VISE `gate.meeshy.me` (base de PRODUCTION, aucune surcharge
    // dans cette construction) — abandonné ici pour ne JAMAIS laisser partir
    // un octet réel vers un serveur de production depuis ce gate (#5793).
    await page.route('**/socket.io/**', (route) => route.abort());
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    const path = await page.evaluate(() => window.location.pathname);
    check(path === '/login', `sans session, "/" redirige vers /login (obtenu : ${path})`);
    check(requests.length === 0, `sans session, aucune requête /api/v1/conversations (obtenu : ${requests.length})`);
    /**
     * `main.tsx` amorce `lib/api/realtime.ts` INCONDITIONNELLEMENT (`import()`
     * après la première peinture) — c'est `sessionStore` qui décide si une
     * connexion s'ouvre (`syncConnection`, #5793) : sans session, AUCUNE
     * poignée de main ne doit partir, quel que soit le module chargé.
     */
    check(
      socketRequests.length === 0,
      `sans session, aucune poignée de main /socket.io/ (obtenu : ${socketRequests.length})`,
    );
    await context.close();
  }

  // --- 2. AVEC session : squelette (six lignes) → contenu (neuf lignes), --
  //        sans saut de géométrie ----------------------------------------
  {
    /**
     * `serviceWorkers: 'block'` (#6195, revue-correction) — SANS lui, une
     * fois le service worker du PWA ACTIF (`clientsClaim`), la DEUXIÈME URL
     * distincte demandée dans une même session (`?limit=30&before=c-gw-29`)
     * est interceptée par SA PROPRE stratégie `NetworkFirst`
     * (`vite.config.ts` § runtimeCaching) plutôt que par `page.route()` — le
     * fetch reste EN VOL indéfiniment (mesuré : `isFetchingNextPage` reste
     * vrai, aucune requête n'atteint jamais le bouchon). Une PREMIÈRE requête
     * (bloc 2 historique, single-page) ne le révélait jamais : c'est la
     * PAGINATION qui, en demandant une DEUXIÈME URL, a rendu ce défaut latent
     * observable pour la première fois.
     */
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.addInitScript((session) => {
      window.localStorage.setItem('meeshy.session', JSON.stringify(session));
    }, SESSION);
    const page = await context.newPage();

    const block2Counts = new Map();
    await page.route(isConversationsList, conversationsRouteHandler({ requestCounts: block2Counts, delayMs: 800 }));
    /* L'ÉCRAN A DEUX CORPUS DEPUIS #6080, et ce gate n'en bouchonnait qu'un.
       Le rail des stories interroge sa propre route ; non bouchonnée, elle
       partait vers un hôte inexistant et la requête restait EN VOL pendant
       les tentatives de react-query — le rail peignait son squelette tout ce
       temps, dans les deux blocs. Le bloc « corpus VIDE » mesurait donc un
       corpus à moitié vide, et il l'a dit. */
    await page.route('**/api/v1/posts/feed/stories**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: TRAY_STORIES }),
      });
    });

    // Le socket est ABANDONNÉ (jamais un octet réel vers `gate.meeshy.me`
    // depuis ce gate), mais la REQUÊTE elle-même doit PARTIR : c'est la
    // preuve que `lib/api/realtime.ts` ouvre une connexion dès qu'une
    // session existe (#5793).
    const socketRequestPromise = page.waitForRequest((req) => req.url().includes('/socket.io/'), { timeout: 10000 });
    await page.route('**/socket.io/**', (route) => route.abort());

    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });

    // Le squelette doit être peint AVANT la résolution (800 ms) — on le
    // mesure tôt, avant d'attendre les rangées réelles.
    await page.waitForSelector('[data-skeleton-row]', { timeout: 5000 });
    const skeletonCount = await page.locator('[data-skeleton-row]').count();
    const skeletonHeights = await page.locator('[data-skeleton-row]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    const skeletonFirstTop = await page.locator('[data-skeleton-row]').first().evaluate((e) => e.getBoundingClientRect().top);

    check(skeletonCount === 6, `six [data-skeleton-row] AVANT la résolution (obtenu : ${skeletonCount})`);
    check(
      skeletonHeights.every((h) => Math.round(h) === 84),
      `chaque squelette mesure 84px (obtenu : ${JSON.stringify(skeletonHeights.map(Math.round))})`,
    );

    await page.waitForSelector('[data-row]', { timeout: 5000 });
    const rowCount = await page.locator('[data-row]').count();
    const rowFirstTop = await page.locator('[data-row]').first().evaluate((e) => e.getBoundingClientRect().top);

    check(rowCount === 30, `trente [data-row] APRÈS la résolution — page 1 (obtenu : ${rowCount})`);
    check(
      Math.round(rowFirstTop) === Math.round(skeletonFirstTop),
      `AUCUN saut : offsetTop de la première rangée identique avant/après (squelette ${skeletonFirstTop}, réel ${rowFirstTop})`,
    );

    populatedContentTop = await page.locator('#contenu').evaluate((e) => Math.round(e.getBoundingClientRect().top));
    populatedFirstSectionOffset = await page.evaluate(() => {
      const contenu = document.getElementById('contenu');
      const firstSection = document.querySelector('[data-section]');
      if (contenu === null || firstSection === null) return null;
      return Math.round(firstSection.getBoundingClientRect().top - contenu.getBoundingClientRect().top);
    });
    check(
      populatedFirstSectionOffset !== null,
      'corpus PEUPLÉ : aucune [data-section] trouvée pour mesurer le décalage du rail + des filtres',
    );

    /**
     * LE DÉFILEMENT INFINI (#6195) — 5 rangs avant la queue déclenche la
     * page 2 (`useLoadMoreSentinel`, `rootMargin` = 420 px) EN UNE requête
     * par page (le compteur `block2Counts`), et le pied passe à « tout
     * chargé » au-delà de 30. Mesuré APRÈS `populatedFirstSectionOffset` —
     * défiler au fond déplacerait la première section hors du repère que ce
     * décalage compare (bloc 4, corpus vide).
     */
    await page.evaluate(() => {
      const el = document.getElementById('contenu');
      el?.scrollTo({ top: el.scrollHeight });
    });
    await page.waitForFunction(() => document.querySelectorAll('[data-row]').length === 45, undefined, { timeout: 10_000 });
    const rowCountAfterScroll = await page.locator('[data-row]').count();
    check(rowCountAfterScroll === 45, `45 [data-row] après le défilement infini (obtenu : ${rowCountAfterScroll})`);
    check(
      block2Counts.get('') === 1 && block2Counts.get('c-gw-29') === 1,
      `une requête par page (obtenu : ${JSON.stringify([...block2Counts.entries()])})`,
    );
    const footerState = await page.getAttribute('[data-pagination-footer]', 'data-pagination-footer').catch(() => null);
    check(footerState === 'exhausted', `le pied de pagination est « exhausted » après 45 rangées (obtenu : ${footerState})`);
    const footerText = await page.locator('[data-pagination-footer="exhausted"]').textContent().catch(() => null);
    check(
      footerText !== null && footerText.includes('Toutes les conversations sont chargées'),
      `le pied « exhausted » porte le texte attendu (obtenu : ${JSON.stringify(footerText)})`,
    );

    const socketRequest = await socketRequestPromise.catch(() => null);
    check(
      socketRequest !== null,
      'AVEC session, une poignée de main /socket.io/ PART (obtenu : ' +
        (socketRequest === null ? 'aucune requête' : socketRequest.url()) +
        ')',
    );

    // --- 3. /login avec une session ⇒ /  ---------------------------------
    await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
    const pathAfterLogin = await page.evaluate(() => window.location.pathname);
    check(pathAfterLogin === '/', `/login avec une session active redirige vers / (obtenu : ${pathAfterLogin})`);

    await context.close();
  }

  // --- 2b. PAGE 2 EN ÉCHEC : le pied dit « Réessayer », qui recharge la ----
  //         MÊME page (#6195) ------------------------------------------------
  {
    // `serviceWorkers: 'block'` — voir le doc-comment du bloc 2.
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.addInitScript((session) => {
      window.localStorage.setItem('meeshy.session', JSON.stringify(session));
    }, SESSION);
    const page = await context.newPage();

    const block2bCounts = new Map();
    let block2bStillFailing = true;
    await page.route(
      isConversationsList,
      conversationsRouteHandler({ requestCounts: block2bCounts, failWhile: (before) => before === 'c-gw-29' && block2bStillFailing }),
    );
    await page.route('**/api/v1/posts/feed/stories**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    });
    await page.route('**/socket.io/**', (route) => route.abort());

    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-row]', { timeout: 5000 });
    check((await page.locator('[data-row]').count()) === 30, 'page 2b : la page 1 rend bien 30 rangées avant le défilement');

    await page.evaluate(() => {
      const el = document.getElementById('contenu');
      el?.scrollTo({ top: el.scrollHeight });
    });
    // 15 s : le budget de la politique de reprise (`shouldRetry`,
    // `query-client.ts`) — plusieurs tentatives à délai croissant avant que
    // `isFetchNextPageError` ne surface — plus la marge d'une CI chargée
    // (même budget que le bloc « recherche en échec », § 6).
    await page.waitForSelector('[data-pagination-footer="error"]', { timeout: 15_000 });
    const attemptsBeforeManualRetry = block2bCounts.get('c-gw-29') ?? 0;
    const errorText = await page.locator('[data-pagination-footer="error"]').textContent();
    check(errorText.includes('Impossible de charger plus'), `le pied « error » porte le texte attendu (obtenu : ${JSON.stringify(errorText)})`);
    check(
      (await page.locator('[data-row]').count()) === 30,
      'page 2b : les 30 rangées déjà chargées RESTENT après l’échec de la page 2',
    );

    const retryButton = page.locator('[data-pagination-footer="error"] button');
    check((await retryButton.count()) === 1, 'page 2b : le bouton « Réessayer » est offert');
    block2bStillFailing = false;
    await retryButton.click();

    await page.waitForFunction(() => document.querySelectorAll('[data-row]').length === 45, undefined, { timeout: 10_000 });
    check((await page.locator('[data-row]').count()) === 45, 'page 2b : Réessayer charge bien la page 2 (45 rangées)');
    check(
      (block2bCounts.get('c-gw-29') ?? 0) === attemptsBeforeManualRetry + 1,
      'page 2b : Réessayer ne fait QU’UNE requête de plus (pas de doublon) ' +
        `(avant : ${attemptsBeforeManualRetry}, après : ${block2bCounts.get('c-gw-29')})`,
    );

    await context.close();
  }

  // --- 2c. TIRER-POUR-RAFRAÎCHIR : conversations + stories/humeurs EN -------
  //         PARALLÈLE, sans squelette (#6195) --------------------------------
  {
    // `serviceWorkers: 'block'` — voir le doc-comment du bloc 2.
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.addInitScript((session) => {
      window.localStorage.setItem('meeshy.session', JSON.stringify(session));
    }, SESSION);
    const page = await context.newPage();

    const block2cCounts = new Map();
    let storiesRequests = 0;
    let statusesRequests = 0;
    let skeletonSeenDuringRefresh = false;

    await page.route(isConversationsList, conversationsRouteHandler({ requestCounts: block2cCounts }));
    await page.route('**/api/v1/posts/feed/stories**', async (route) => {
      storiesRequests += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    });
    // PRÉDICAT, pas un glob (motif `isConversationsList`) — le `?` d'une
    // query string dans un glob Playwright n'est PAS un caractère littéral.
    const isStatusMoods = (url) => url.pathname === '/api/v1/social/posts' && url.searchParams.get('scope') === 'statuses';
    await page.route(isStatusMoods, async (route) => {
      statusesRequests += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    });
    await page.route('**/socket.io/**', (route) => route.abort());

    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-row]', { timeout: 5000 });
    check((await page.locator('[data-row]').count()) === 30, 'page 2c : 30 rangées avant le tirer');
    check(block2cCounts.get('') === 1, 'page 2c : une seule requête de conversations avant le tirer');

    /**
     * UN FILTRE QUI NE REND AUCUNE RANGÉE NE CHARGE RIEN (revue-correction
     * #6195). iOS déclenche `loadMore()` depuis l'`onAppear` d'une RANGÉE
     * (`triggerLoadMoreIfNeeded`, `ConversationListView.swift:1045-1060`) :
     * zéro rangée ⇒ zéro chargement. Sans la garde `visible.length > 0`, la
     * sentinelle se posait en HAUT d'un champ vide, immédiatement intersectée,
     * et chaque page arrivée la remontait — l'écran vidait le corpus ENTIER du
     * compte en autant de requêtes séquentielles, pour rester vide. Les 45
     * conversations synthétiques sont toutes `direct` et aucune n'est
     * épinglée : « Épinglés » rend donc exactement zéro rangée.
     */
    await page.getByRole('button', { name: 'Épinglés' }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-row]').length === 0, undefined, { timeout: 3000 });
    await page.waitForTimeout(1200);
    check(
      block2cCounts.size === 1 && block2cCounts.get('') === 1,
      `page 2c : un filtre à ZÉRO rangée ne demande AUCUNE page de plus (obtenu : ${JSON.stringify([...block2cCounts.entries()])})`,
    );
    /**
     * LE PIED DE PAGINATION NE SE REND PAS SUR UNE LISTE FILTRÉE VIDE
     * (revue-correction #6195, défaut 5) — miroir du doc-comment iOS sur
     * `ConversationPaginationFooter()` (`ConversationListView.swift:1829-1851`) :
     * « Pagination is only meaningful when there is content to page through. »
     * Sans la garde `visible.length > 0` posée au même site que la sentinelle
     * ci-dessus, « Épinglés » (zéro rangée) affichait « Toutes les
     * conversations sont chargées » seul, en indigo, au-dessus de l'état vide.
     */
    check(
      (await page.locator('[data-pagination-footer]').count()) === 0,
      'page 2c : sous un filtre à ZÉRO rangée, le pied de pagination est ABSENT',
    );
    await page.getByRole('button', { name: 'Tous' }).click();
    // `>= 30`, jamais `=== 30` : sur une régression de la garde ci-dessus, le
    // retour sur « Tous » rend les 45 rangées que la cascade a chargées — ce
    // qui doit RAPPORTER un échec, pas faire expirer une attente et abattre le
    // gate avant son résumé (mesuré en falsifiant la garde).
    await page.waitForFunction(() => document.querySelectorAll('[data-row]').length >= 30, undefined, { timeout: 3000 });
    const rowsBackOnAll = await page.locator('[data-row]').count();
    check(rowsBackOnAll === 30, `page 2c : retour sur « Tous » rend les 30 rangées de la page 1 (obtenu : ${rowsBackOnAll})`);

    /**
     * LE GESTE — `TouchEvent` SYNTHÉTIQUES (motif § 4.4 de la spécification
     * #6195) : `touchstart` à y=100 → `touchmove` à y=200 (distance 100,
     * seuil 90 : ARMÉ) → `touchend` (déclenche `onRefresh`). `#contenu` est
     * déjà `scrollTop === 0` au montage — condition de départ du geste. Les
     * TROIS réponses de rafraîchissement sont la CONDITION attendue — jamais
     * un délai devinée.
     */
    const pollSkeleton = setInterval(() => {
      page
        .locator('[data-skeleton-row]')
        .count()
        .then((n) => {
          if (n > 0) skeletonSeenDuringRefresh = true;
        })
        .catch(() => undefined);
    }, 20);
    const refreshSettled = Promise.all([
      page.waitForResponse((res) => isConversationsList(new URL(res.url())) && new URL(res.url()).searchParams.get('before') === null, { timeout: 5000 }),
      page.waitForResponse((res) => res.url().includes('/api/v1/posts/feed/stories'), { timeout: 5000 }),
      page.waitForResponse((res) => res.url().includes('/api/v1/social/posts?scope=statuses'), { timeout: 5000 }),
    ]);
    /**
     * TROIS `page.evaluate()` DISTINCTS, jamais un seul (revue-correction) —
     * React 18 BATCHE les mises à jour d'état à l'intérieur d'un même tour de
     * boucle d'événements : trois `dispatchEvent` synchrones dans le MÊME
     * appel laissent `phaseRef.current` (mis à jour au RENDU) périmé au
     * moment du `touchend`, qui lit alors encore `idle` — exactement le
     * défaut qu'un vrai doigt ne produit jamais (chaque `touchmove` du
     * système arrive après un rendu). Un aller-retour Playwright par
     * événement laisse le rendu React se rejouer entre chacun.
     */
    const dispatchTouch = (type, clientY) =>
      page.evaluate(
        ({ type, clientY }) => {
          const el = document.getElementById('contenu');
          if (el === null) return;
          const touch = new Touch({ identifier: 1, target: el, clientX: 10, clientY });
          el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
        },
        { type, clientY },
      );
    await dispatchTouch('touchstart', 100);
    await dispatchTouch('touchmove', 200);
    await dispatchTouch('touchend', 200);
    await refreshSettled;
    // Laisse React/TanStack rejouer le rendu à partir de la réponse déjà
    // reçue — la sentinelle qui REVIENT est la condition, jamais un délai.
    await page.waitForSelector('[data-load-more-sentinel]', { timeout: 3000 }).catch(() => undefined);
    clearInterval(pollSkeleton);

    check(block2cCounts.get('') === 2, `page 2c : le tirer refait UNE requête de conversations (obtenu : ${block2cCounts.get('')})`);
    // Chaque compteur inclut la requête du CHARGEMENT INITIAL — 1 avant le
    // tirer (déjà vérifié plus haut) + 1 REFAITE par le tirer = 2.
    check(storiesRequests === 2, `page 2c : le tirer refait la requête stories (obtenu : ${storiesRequests})`);
    check(statusesRequests === 2, `page 2c : le tirer refait la requête statuses (obtenu : ${statusesRequests})`);
    check(!skeletonSeenDuringRefresh, 'page 2c : aucun squelette pendant le tirer (fetch-then-replace, cache non vide)');
    check((await page.locator('[data-row]').count()) === 30, 'page 2c : 30 rangées après le tirer (page 1 seule, curseur reset)');
    check(
      (await page.locator('[data-load-more-sentinel]').count()) === 1,
      'page 2c : la sentinelle de défilement infini est de retour après le tirer',
    );

    await context.close();
  }

  // --- 4. CORPUS VIDE : aucun rail peint, aucun trou au-dessus de l'état --
  //        vide (revue-correction #5650) ------------------------------------
  {
    const context = await browser.newContext();
    await context.addInitScript((session) => {
      window.localStorage.setItem('meeshy.session', JSON.stringify(session));
    }, SESSION);
    const page = await context.newPage();
    await page.route(isConversationsList, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [], pagination: { limit: 30, offset: 0, total: 0, hasMore: false } }),
      });
    });
    /* VIDE des DEUX côtés — sans quoi « corpus vide » ne décrit que la moitié
       de l'écran (voir le bloc 2). */
    await page.route('**/api/v1/posts/feed/stories**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    });
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#contenu:not([aria-busy])', { timeout: 5000 });

    /* LE RAIL A CHANGÉ DE NOM ET D'OBJET (#6080) : « Accès rapide aux
       conversations » n'existe plus — ce rail peignait des CONVERSATIONS sous
       un anneau de story et a été remplacé par le rail des STORIES, région
       « Stories ». Le gate interrogeait donc une étiquette morte : il passait
       par ABSENCE, ce qui est la façon la plus discrète qu'a un témoin de
       cesser de mesurer (leçon 560). L'invariant, lui, est inchangé — à corpus
       vide, aucun rail ne prend de place au-dessus de l'état vide. */
    const rails = await page.locator('[aria-label="Stories"]').count();
    check(rails === 0, `corpus VIDE : aucune région « Stories » peinte (obtenu : ${rails})`);

    /**
     * RÉANCRÉ DANS LE SCROLLPORT (#6103) — le rail vivant désormais À
     * L'INTÉRIEUR de `#contenu`, sa disparition ne peut plus déplacer le
     * `top` ABSOLU de `#contenu` lui-même (c'est le point que #5650 gardait
     * à l'origine) : ce repère doit rester IDENTIQUE, peuplé ou vide. Ce qui
     * doit RÉCUPÉRER la bande du rail, c'est le décalage INTERNE de l'état
     * vide par rapport à ce même haut de scrollport — comparé à celui de la
     * première section d'un corpus peuplé (bloc 2).
     */
    const emptyContentTop = await page.locator('#contenu').evaluate((e) => Math.round(e.getBoundingClientRect().top));
    check(
      emptyContentTop === populatedContentTop,
      `corpus VIDE : le haut de #contenu a bougé sans le rail (peuplé ${populatedContentTop} px, vide ${emptyContentTop} px) — ` +
        'il vit maintenant DANS le scrollport (#6103), son absence ne doit plus déplacer #contenu lui-même',
    );

    const emptyStateOffset = await page.evaluate(() => {
      const contenu = document.getElementById('contenu');
      const empty = [...(contenu?.querySelectorAll('li') ?? [])].find((li) =>
        (li.textContent ?? '').includes('Aucune conversation pour l’instant.'),
      );
      if (contenu === null || empty === undefined) return null;
      return Math.round(empty.getBoundingClientRect().top - contenu.getBoundingClientRect().top);
    });
    check(emptyStateOffset !== null, "corpus VIDE : l'état « Aucune conversation pour l’instant. » est introuvable");
    check(
      emptyStateOffset !== null && emptyStateOffset < populatedFirstSectionOffset,
      'corpus VIDE : la bande du rail + des filtres est RÉCUPÉRÉE, jamais laissée vide au-dessus de l’état vide ' +
        `(décalage peuplé ${populatedFirstSectionOffset} px, décalage vide ${emptyStateOffset} px)`,
    );
    await context.close();
  }

  // --- 5. ÉCHEC À CACHE VIDE : une ALERTE, jamais « Chargement » ----------
  {
    const context = await browser.newContext();
    await context.addInitScript((session) => {
      window.localStorage.setItem('meeshy.session', JSON.stringify(session));
    }, SESSION);
    const page = await context.newPage();
    await page.route(isConversationsList, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Internal server error' }),
      });
    });
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#contenu [role="alert"]', { timeout: 20000 });

    const busy = await page.locator('#contenu[aria-busy="true"]').count();
    check(
      busy === 0,
      `échec à cache vide : la liste n'est plus annoncée « Chargement » (aria-busy trouvé : ${busy})`,
    );
    const retry = page.locator('#contenu [role="alert"] button');
    check((await retry.count()) === 1, 'échec à cache vide : un bouton « Réessayer » est offert');
    const box = await retry.first().boundingBox();
    check(
      box !== null && Math.round(box.height) >= 44,
      `« Réessayer » mesure au moins 44 px (obtenu : ${box === null ? 'absent' : Math.round(box.height)})`,
    );

    /**
     * L'EN-TÊTE GARDE SON TITRE QUAND LE RAIL N'EXISTE PAS (#6103, revue).
     * C'est le SEUL état, atteignable par un navigateur, où le grand rail
     * QUITTE le DOM — `ConversationRail` ne peint rien sur un corpus vide —
     * et donc le seul où « pas de rail » pourrait se confondre avec « le rail
     * est sorti du champ ». La confusion a été MESURÉE en unitaire
     * (`use-out-of-view.test.tsx`, témoin « la cible qui DISPARAÎT relâche la
     * bande ») : la forme livrée gardait `pinned = true` après le démontage
     * de la cible, ce qui efface le titre (`opacity: 0`, `aria-hidden`)
     * au-dessus d'une bande qui, corpus vide, ne peint rien non plus — un
     * en-tête VIDE sur l'écran qui doit précisément dire où l'on est.
     *
     * Ici on garde la CONSÉQUENCE, au niveau du rendu réel : sans rail, ni
     * bande épinglée ni titre effacé. Le témoin unitaire garde la règle ;
     * celui-ci garde ce que l'utilisateur voit.
     */
    const headerOnError = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return h1 === null
        ? null
        : { text: (h1.textContent ?? '').trim(), opacity: Number(getComputedStyle(h1).opacity), hidden: h1.getAttribute('aria-hidden') };
    });
    check(
      headerOnError !== null && headerOnError.opacity === 1 && headerOnError.hidden === null && headerOnError.text.length > 0,
      "échec à cache vide : le titre de l'en-tête reste lisible — sans rail, rien ne doit épingler de bande à sa place " +
        `(obtenu : ${JSON.stringify(headerOnError)})`,
    );
    const pinnedOnError = await page.locator('[data-rail="pinned"]').count();
    check(
      pinnedOnError === 0,
      `échec à cache vide : aucune bande épinglée ne se matérialise sans grand rail (obtenu : ${pinnedOnError})`,
    );
    await context.close();
  }

  // --- 6. `/conversations/new` : route PRIVÉE, et un échec de recherche ------
  //        se VOIT (jamais un écran blanc) — #5652 ---------------------------
  {
    /* SANS session : la garde sort le visiteur (`PRIVATE_ROUTES`,
       `lib/session-guard.ts`). La route est arrivée avec son écran sans être
       déclarée privée — un visiteur anonyme y trouvait une recherche que la
       passerelle refuse, au lieu de l'écran de connexion. */
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.route(isConversationsList, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [], pagination: { limit: 30, offset: 0, total: 0, hasMore: false } }),
      });
    });
    await anonPage.route('**/api/v1/posts/feed/stories**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    });
    await anonPage.route('**/socket.io/**', (route) => route.abort());
    await anonPage.goto(`${base}/conversations/new`, { waitUntil: 'networkidle' });
    const anonPath = await anonPage.evaluate(() => window.location.pathname);
    check(anonPath !== '/conversations/new', `sans session, /conversations/new ne s'ouvre pas (obtenu : ${anonPath})`);
    await anonContext.close();

    /* AVEC session, recherche en ÉCHEC : une ALERTE et un « Réessayer », jamais
       une liste vide — « erreur avalée en VIDE = vide légitime ». */
    const context = await browser.newContext();
    await context.addInitScript((session) => {
      window.localStorage.setItem('meeshy.session', JSON.stringify(session));
    }, SESSION);
    const page = await context.newPage();
    await page.route(isConversationsList, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [], pagination: { limit: 30, offset: 0, total: 0, hasMore: false } }),
      });
    });
    await page.route('**/api/v1/posts/feed/stories**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    });
    await page.route('**/socket.io/**', (route) => route.abort());
    await page.route('**/api/v1/directory/people**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Internal server error' }),
      });
    });
    await page.goto(`${base}/conversations/new`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[aria-label="Rechercher un contact"]', { timeout: 5000 });
    await page.fill('input[aria-label="Rechercher un contact"]', 'ami');
    /* L'ATTENTE EST PEINTE AVANT L'ALERTE — sinon l'écran est blanc pendant
       toute la politique de reprise (`shouldRetry` : deux reprises, délai qui
       double, ~10 s mesurées). */
    const attente = await page
      .waitForSelector('li[aria-live="polite"]', { timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    check(attente, "recherche en cours : l'attente est PEINTE, jamais un écran blanc");
    /* 15 s : le budget de `shouldRetry` (3 tentatives, délai doublant) plus la
       marge d'une CI chargée — jamais un nombre choisi au hasard. */
    await page.waitForSelector('[role="alert"]', { timeout: 15000 }).catch(() => {});
    const alerte = await page.locator('[role="alert"]').count();
    check(alerte >= 1, `recherche en échec : une ALERTE est peinte, jamais un écran blanc (obtenu : ${alerte})`);
    const retry = page.locator('[role="alert"] button');
    const retryBox = (await retry.count()) === 0 ? null : await retry.first().boundingBox();
    check(
      retryBox !== null && Math.round(retryBox.height) >= 44,
      `recherche en échec : « Réessayer » est offert à 44 px au moins (obtenu : ${retryBox === null ? 'absent' : Math.round(retryBox.height)})`,
    );
    await context.close();
  }

  await browser.close();
  server.close();
  await rm(OUT, { recursive: true, force: true });

  if (failures.length > 0) {
    console.error(`\n  ${failures.length} défaut(s) de la construction VITE_DATA_SOURCE=gateway :\n`);
    for (const f of failures) console.error(`    · ${f}`);
    console.error('');
    process.exit(1);
  }

  console.log(
    '\n  VITE_DATA_SOURCE=gateway construit une application qui parle réellement à la passerelle : ' +
      'la garde de session mord, le squelette précède le contenu sans saut.\n',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
