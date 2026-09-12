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
 *     `core-list.ts:880-889`, 9 conversations, RETARDÉ de 800 ms) : SIX
 *     `[data-skeleton-row]` de 84 px sont peints AVANT la résolution, NEUF
 *     `[data-row]` APRÈS — et le premier `offsetTop` ne bouge PAS entre les
 *     deux (la géométrie du squelette est celle de la rangée réelle, F5).
 *  3. `/login` avec une session déjà active redirige vers `/`.
 *  4. CORPUS VIDE (ni conversation ni story) : aucun rail peint, et la bande
 *     qu'il occupait revient à l'état de démarrage.
 *  5. ÉCHEC à cache vide : une ALERTE, jamais « Chargement », et l'en-tête
 *     garde son titre.
 *  6. `/conversations/new` est PRIVÉE (un visiteur sans session en est sorti) et
 *     une recherche en ÉCHEC y peint une ALERTE, jamais un écran blanc (#5652).
 *  7. AUCUN octet ne part vers la PRODUCTION (#5652) — tout ce qui vise
 *     `gate.meeshy.me` est stubbé ou abandonné-et-relevé (`armerPasserelle`).
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

/** La CHARGE de la liste — le corps de `core-list.ts:880-889`, neuf
 * conversations. Minimale mais dans la FORME servie : `id`, `title`,
 * `type`, `memberCount`, `participants`, `unreadCount`, `createdAt`,
 * `updatedAt`, `lastMessage` — ce que `decodeConversations`/`LensRow`
 * consomment. */
const NINE_CONVERSATIONS = Array.from({ length: 9 }, (_, i) => ({
  id: `c-gw-${i}`,
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
}));

const SESSION = {
  token: 'jwt-check-gateway-build',
  sessionToken: 'sess-check-gateway-build',
  user: { id: 'u-check', username: 'check' },
  expiresAt: Date.now() + 24 * 60 * 60 * 1000,
};

/**
 * LE RAIL DE STORIES (#5652) — sa charge, et surtout SON INTERCEPTION.
 *
 * L'écran de la Lentille émet DEUX requêtes de plus depuis #5652
 * (`?scope=stories&projection=tray` et `?scope=statuses`, `api/stories.ts`).
 * Ce gate ne routait que `/api/v1/conversations` et `/socket.io/` : les deux
 * nouvelles partaient donc pour de VRAI vers `https://gate.meeshy.me` — la
 * base de PRODUCTION, puisque cette construction ne pose aucune surcharge —
 * ce que la doctrine de ce fichier interdit explicitement (« ne JAMAIS
 * laisser partir un octet réel vers un serveur de production depuis ce gate »,
 * #5793). `armerPasserelle` ferme la porte : tout ce qui vise la production
 * est soit STUBBÉ ici, soit ABANDONNÉ et RELEVÉ — et la liste des fuites est
 * une assertion, pas une trace qu'on lit à l'œil.
 *
 * La forme est celle que `envoyerFeedUnifie` sert (`routes/posts/feed.ts:147`)
 * : `data` = le TABLEAU des posts, `pagination.form = 'keyset'`, `meta` avec
 * ses tombstones. Le corps d'un post de tray suit `trayStorySelect`
 * (`services/posts/postIncludes.ts:275-296`) + `isViewedByMe`, ajouté par
 * `PostFeedService:510`.
 */
const storyPost = ({ id, authorId, displayName, isViewedByMe, minutesAgo }) => ({
  id,
  type: 'STORY',
  visibility: 'FRIENDS',
  createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  updatedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  viewCount: 0,
  author: { id: authorId, username: authorId, displayName },
  media: [],
  isViewedByMe,
});

const UN_AUTEUR_AVEC_UNE_STORY = [
  storyPost({ id: 's-gw-1', authorId: 'u-gw-bruno', displayName: 'Bruno Bêta', isViewedByMe: false, minutesAgo: 30 }),
];

const feedBody = (items) =>
  JSON.stringify({
    success: true,
    data: items,
    pagination: { limit: 20, hasMore: false, nextCursor: null, form: 'keyset' },
    meta: { deletedIds: [], deletedIdsTruncated: false },
  });

/**
 * `stories` : ce que `?scope=stories` sert. `fuites` : le tableau où sont
 * relevées les requêtes vers la production qu'aucun stub n'attendait — il doit
 * rester VIDE, c'est vérifié en fin de course.
 */
async function armerPasserelle(page, { stories, fuites }) {
  await page.route('**/api/v1/social/posts**', async (route) => {
    const url = route.request().url();
    const body = url.includes('scope=statuses') ? feedBody([]) : feedBody(stories);
    await route.fulfill({ status: 200, contentType: 'application/json', body });
  });
  await page.route(
    (url) =>
      url.hostname === 'gate.meeshy.me' &&
      !url.pathname.startsWith('/api/v1/conversations') &&
      !url.pathname.startsWith('/api/v1/social/posts') &&
      !url.pathname.startsWith('/socket.io/'),
    async (route) => {
      fuites.push(route.request().url());
      await route.abort();
    },
  );
}

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
  /** Les requêtes vers la PRODUCTION qu'aucun stub n'attendait (#5652) —
   * assertion en fin de course, jamais une trace à lire à l'œil. */
  const fuites = [];
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
    await armerPasserelle(page, { stories: UN_AUTEUR_AVEC_UNE_STORY, fuites });
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
    const context = await browser.newContext();
    await context.addInitScript((session) => {
      window.localStorage.setItem('meeshy.session', JSON.stringify(session));
    }, SESSION);
    const page = await context.newPage();

    await page.route('**/api/v1/conversations', async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: NINE_CONVERSATIONS,
          pagination: { limit: 30, offset: 0, total: 9, hasMore: false },
        }),
      });
    });

    // Le socket est ABANDONNÉ (jamais un octet réel vers `gate.meeshy.me`
    // depuis ce gate), mais la REQUÊTE elle-même doit PARTIR : c'est la
    // preuve que `lib/api/realtime.ts` ouvre une connexion dès qu'une
    // session existe (#5793).
    const socketRequestPromise = page.waitForRequest((req) => req.url().includes('/socket.io/'), { timeout: 10000 });
    await page.route('**/socket.io/**', (route) => route.abort());
    /* LE RAIL EST PEINT ICI — un auteur, une story non vue : c'est la
       référence contre laquelle le bloc 4 mesure que son ABSENCE rend la
       bande à l'état vide (#5652). */
    await armerPasserelle(page, { stories: UN_AUTEUR_AVEC_UNE_STORY, fuites });

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

    check(rowCount === 9, `neuf [data-row] APRÈS la résolution (obtenu : ${rowCount})`);
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

  // --- 4. CORPUS VIDE : aucun rail peint, aucun trou au-dessus de l'état --
  //        vide (revue-correction #5650) ------------------------------------
  {
    const context = await browser.newContext();
    await context.addInitScript((session) => {
      window.localStorage.setItem('meeshy.session', JSON.stringify(session));
    }, SESSION);
    const page = await context.newPage();
    await page.route('**/api/v1/conversations', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [], pagination: { limit: 30, offset: 0, total: 0, hasMore: false } }),
      });
    });
    /* AUCUNE story non plus : c'est le corpus d'un compte NEUF, celui que
       l'écran de démarrage adresse (#5652). Le rail n'a alors rien à montrer
       — ni story d'un ami, ni la mienne (`useStoryRail` ne compose l'entrée
       « moi » que quand elle porte une story ou une humeur) — et la bande
       qu'il occupait doit revenir à l'état vide. */
    await armerPasserelle(page, { stories: [], fuites });
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#contenu:not([aria-busy])', { timeout: 5000 });

    /* Le rail ne partage PLUS le corpus de la liste (#5652) : il ne disparaît
       donc pas « parce qu'il n'y a pas de conversation » mais parce qu'il n'y
       a pas de STORY. L'ancienne assertion visait `aria-label="Accès rapide
       aux conversations"`, un libellé que plus rien ne pose — elle passait
       donc en comptant zéro pour une raison FAUSSE. */
    const rails = await page.locator('[data-rail="grande"]').count();
    check(rails === 0, `corpus de stories VIDE : aucun rail peint (obtenu : ${rails})`);

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
    await page.route('**/api/v1/conversations', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Internal server error' }),
      });
    });
    /* Ni conversation ni story : le SEUL état, atteignable par un navigateur,
       où le grand rail quitte le DOM — donc le seul où « pas de rail » pourrait
       se confondre avec « le rail est sorti du champ » (voir l'assertion
       d'en-tête plus bas). */
    await armerPasserelle(page, { stories: [], fuites });
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
    await armerPasserelle(anonPage, { stories: [], fuites });
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
    await armerPasserelle(page, { stories: [], fuites });
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

  check(
    fuites.length === 0,
    `AUCUNE requête réelle ne part vers la production depuis ce gate (fuites : ${fuites.length === 0 ? 'aucune' : fuites.join(', ')})`,
  );

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
