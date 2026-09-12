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

  /** Le haut de `#contenu` sur un corpus PEUPLÉ — la référence contre
   * laquelle le corpus VIDE se mesure (bloc 4) : sans le rail, l'écran doit
   * RÉCUPÉRER cette bande, jamais la garder vide. */
  let populatedContentTop = 0;

  const browser = await launchChromium();

  // --- 1. SANS session : redirection, AUCUNE requête de conversations ----
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const requests = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/conversations')) requests.push(req.url());
    });
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    const path = await page.evaluate(() => window.location.pathname);
    check(path === '/login', `sans session, "/" redirige vers /login (obtenu : ${path})`);
    check(requests.length === 0, `sans session, aucune requête /api/v1/conversations (obtenu : ${requests.length})`);
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
       cesser de mesurer (leçon 561). L'invariant, lui, est inchangé — à corpus
       vide, aucun rail ne prend de place au-dessus de l'état vide. */
    const rails = await page.locator('[aria-label="Stories"]').count();
    check(rails === 0, `corpus VIDE : aucune région « Stories » peinte (obtenu : ${rails})`);

    const emptyContentTop = await page.locator('#contenu').evaluate((e) => Math.round(e.getBoundingClientRect().top));
    check(
      emptyContentTop < populatedContentTop,
      'corpus VIDE : la bande du rail est RÉCUPÉRÉE, jamais laissée vide au-dessus de l’état vide ' +
        `(peuplé ${populatedContentTop} px, vide ${emptyContentTop} px)`,
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
