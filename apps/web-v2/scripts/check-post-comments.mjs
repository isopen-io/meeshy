#!/usr/bin/env node
/**
 * LES GESTES D'UNE RANGÉE DE COMMENTAIRE — DANS UN VRAI NAVIGATEUR, SUR UN
 * VRAI CHEMIN RÉSEAU (#7135, première tranche de #7118).
 *
 * Les 46 témoins `bun test` du lot prouvent les LOIS : le cache bouge avant la
 * réponse, le rollback remet la rangée à sa PLACE, la borne de longueur mord
 * des deux côtés. **Aucun ne traverse le rendu.** Un cœur peut basculer dans le
 * cache sans jamais se remplir à l'écran ; une cible peut mesurer 20 px ; un
 * « Réessayer » peut être un bouton mort. Et surtout : sous `fixtures`, le port
 * des gestes COURT-CIRCUITE le transport (`sendCommentRequest`), si bien
 * qu'aucun témoin du dépôt ne voit un refus PASSER PAR LE RÉSEAU.
 *
 * Ce gate construit donc une application `VITE_DATA_SOURCE=gateway` — le même
 * chemin que le staging sert — et mesure ce que la page FAIT :
 *
 *  1. **TOUTE rangée porte son cœur**, et « Modifier »/« Supprimer » ne sont
 *     offerts QUE sur la rangée dont on est l'auteur. C'est le reflet exact de
 *     la garde de la passerelle : `PATCH` et `DELETE` ne gardent PAS l'audience
 *     du post, leur seule garde est le contrôle d'AUTEUR
 *     (`routes/posts/comments.ts:497-523`) — offrir ces boutons ailleurs serait
 *     un 403 au premier tap (loi 4) ;
 *  2. **L'OPTIMISTE SE PEINT AVANT LA RÉPONSE** — la requête `like` est
 *     RETARDÉE, et le compte a déjà bougé à l'écran pendant qu'elle est en vol.
 *     C'est la moitié qu'un témoin de cache ne peut pas rendre : il dit que la
 *     valeur a changé, pas qu'un pixel l'a montrée ;
 *  3. **LE REFUS DÉFAIT L'OPTIMISTE À LA VALEUR EXACTE**, et l'annonce sur SA
 *     rangée — la rangée voisine reste muette. C'est la capture
 *     `feed.post-comment-failure`, prouvée plutôt que décrite ;
 *  4. **« Réessayer » REPART** : une seconde requête est observée. Un état
 *     d'erreur dont le bouton ne rejoue rien serait le contrôle inerte que la
 *     loi 4 interdit — et aucun témoin de rendu ne l'aurait distingué ;
 *  5. **« Modifier » ouvre le champ SUR PLACE**, « Annuler » le referme SANS
 *     aucune requête (le transport reste muet) ;
 *  6. **LES CIBLES FONT AU MOINS 44 px** — mesurées au rectangle, jamais lues
 *     dans une feuille de style (dimension 5) ;
 *  7. **LES DEUX SCHÉMAS** se peignent sans erreur de page.
 *
 * Et il PRODUIT les captures de recette (`CAPTURE_DIR`) : sans elles, les
 * images de l'écran étaient prises par un script ad hoc jamais versé — la
 * recette de demain ne pouvait pas les refaire, et rien ne rougissait quand la
 * rangée dérivait.
 *
 * `dist-gateway-comments/` est couvert par le motif `dist-*` du `.gitignore`,
 * jamais commité — même discipline que `check-gateway-build.mjs`.
 */
import { spawnSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OUT_DIR = 'dist-gateway-comments';
const OUT = join(ROOT, OUT_DIR);

const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;

const POST_ID = 'post-gate-comments';
const VIEWER_ID = 'u-gate-viewer';

/** Le corps de session que `resolveViewer` lit en mode `gateway` — c'est son
 * `user.id` qui décide de `isMine`, donc des deux verbes de la rangée. */
const SESSION = {
  token: 'jwt-check-post-comments',
  sessionToken: 'sess-check-post-comments',
  user: { id: VIEWER_ID, username: 'gate-viewer', displayName: 'Vous' },
  expiresAt: Date.now() + 24 * 60 * 60 * 1000,
};

/**
 * LA CHARGE QUE LA PASSERELLE SERT VRAIMENT — prise dans son code, jamais
 * inventée : `GET /api/v1/posts/:postId/comments` rend les commentaires de
 * PREMIER NIVEAU, `createdAt desc`, dans l'enveloppe `{ success, data,
 * pagination }` (`routes/posts/comments.ts:66`,
 * `PostCommentService.getComments:402-455`). `isLikedByMe` est servi
 * EXPLICITEMENT, `false` compris (`:471-483`).
 */
const MINE = 'cm-gate-mine';
const OTHER = 'cm-gate-other';
const THIRD = 'cm-gate-third';

const author = (id, displayName, username) => ({ id, displayName, username });

const COMMENTS = [
  {
    id: MINE,
    content: 'Je l’ai testé ce matin, ça tient.',
    createdAt: '2026-09-19T09:40:00.000Z',
    author: author(VIEWER_ID, 'Vous', 'gate-viewer'),
    originalLanguage: 'fr',
    isLikedByMe: true,
    likeCount: 2,
  },
  {
    id: OTHER,
    content: 'Merci pour le partage, c’est très clair.',
    createdAt: '2026-09-19T09:20:00.000Z',
    author: author('u-ines', 'Inès Lefèvre', 'ines'),
    originalLanguage: 'fr',
    isLikedByMe: false,
    likeCount: 0,
  },
  {
    id: THIRD,
    content: 'Je garde ça sous le coude.',
    createdAt: '2026-09-19T09:00:00.000Z',
    author: author('u-noa', 'Noa Berger', 'noa'),
    originalLanguage: 'fr',
    isLikedByMe: false,
    likeCount: 4,
  },
];

const POST = {
  id: POST_ID,
  type: 'POST',
  createdAt: '2026-09-19T08:30:00.000Z',
  author: author('u-sofia', 'Sofia Marín', 'sofia'),
  content: 'La réunion est déplacée à quinze heures.',
  originalLanguage: 'fr',
  likeCount: 3,
  commentCount: COMMENTS.length,
};

const envelope = (data, pagination) =>
  JSON.stringify({ success: true, data, ...(pagination === undefined ? {} : { pagination }) });

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body });

/** `error` est une CHAÎNE PLATE — la forme que `sendError()` émet
 * (`utils/response.ts`, `errorResponseSchema`), jamais un objet. */
const refusal = (route, status, code, error) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: false, error, code }) });

const isCommentsList = (url) => url.pathname === `/api/v1/posts/${POST_ID}/comments`;
const isPostDetail = (url) => url.pathname === `/api/v1/posts/${POST_ID}`;
const likePathOf = (commentId) => `/api/v1/posts/${POST_ID}/comments/${commentId}/like`;

async function main() {
  await rm(OUT, { recursive: true, force: true });
  if (CAPTURE_DIR !== null) await mkdir(CAPTURE_DIR, { recursive: true });

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

  const served = await startDistServer(OUT, { serviceWorker: false });
  const failures = [];
  const check = (ok, what) => {
    if (ok) console.log(`  ok    ${what}`);
    else failures.push(what);
  };

  const browser = await launchChromium();
  try {
    for (const scheme of ['light', 'dark']) {
      await runScheme({ browser, base: served.base, scheme, check });
    }
  } finally {
    await browser.close();
    served.close();
  }

  if (failures.length > 0) {
    console.error(`\n  ${failures.length} invariant(s) rompu(s) :`);
    for (const f of failures) console.error(`    · ${f}`);
    process.exit(1);
  }
  console.log('\n  Aimer, modifier et supprimer un commentaire : offert à qui en a le droit, immédiat, et repris au refus.\n');
}

/**
 * UNE PASSE COMPLÈTE DANS UN SCHÉMA. Les deux schémas rejouent les MÊMES
 * invariants — un jeton qui ne se résout que dans l'un ferait un bouton
 * invisible, et une mesure de rectangle prise dans le seul schéma clair ne dit
 * rien du sombre.
 */
async function runScheme({ browser, base, scheme, check }) {
  const say = (what) => `[${scheme}] ${what}`;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    locale: 'fr-FR',
    serviceWorkers: 'block',
  });
  await context.addInitScript((session) => {
    window.localStorage.setItem('meeshy.session', JSON.stringify(session));
  }, SESSION);

  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  /** CE QUE LE TRANSPORT A VRAIMENT DEMANDÉ — l'unique façon de prouver qu'un
   * geste est parti, et qu'« Annuler » n'a rien envoyé. */
  const sent = [];

  /* Le socket vise la base de PRODUCTION dans une construction `gateway` sans
     surcharge : abandonné, pour ne jamais laisser partir un octet réel. */
  await page.route('**/socket.io/**', (route) => route.abort());

  /** Le scénario du `like`, réécrit d'un bloc à l'autre. */
  let likePlan = { kind: 'ok' };

  await page.route(
    (url) => url.pathname.startsWith(`/api/v1/posts/${POST_ID}/comments/`) && url.pathname.endsWith('/like'),
    async (route) => {
      const request = route.request();
      sent.push({ method: request.method(), path: new URL(request.url()).pathname });
      if (likePlan.kind === 'delay') {
        await new Promise((resolve) => setTimeout(resolve, likePlan.ms));
        return json(route, envelope({ liked: true, likeCount: 1 }));
      }
      if (likePlan.kind === 'refuse') {
        /* 404 `COMMENT_NOT_FOUND` est ce que la passerelle rend hors audience
           d'interaction (jamais un 403, qui révélerait l'existence) ; 403 est
           ce qu'elle rend sur un commentaire qu'on n'a pas écrit. Les deux sont
           des refus PERMANENTS : c'est cette classe-là qu'on mesure. */
        return refusal(route, 403, 'FORBIDDEN', 'Not authorized');
      }
      return json(route, envelope({ liked: true, likeCount: 1 }));
    },
  );

  await page.route(
    (url) => /^\/api\/v1\/posts\/[^/]+\/comments\/[^/]+$/.test(url.pathname),
    async (route) => {
      const request = route.request();
      sent.push({ method: request.method(), path: new URL(request.url()).pathname });
      if (request.method() === 'DELETE') return json(route, envelope({ deleted: true }));
      const body = JSON.parse(request.postData() ?? '{}');
      const target = COMMENTS.find((c) => request.url().endsWith(c.id));
      return json(route, envelope({ ...target, content: body.content ?? target?.content }));
    },
  );

  await page.route(isCommentsList, async (route) => {
    if (route.request().method() !== 'GET') {
      sent.push({ method: route.request().method(), path: new URL(route.request().url()).pathname });
      return json(route, envelope(COMMENTS[0]), 201);
    }
    return json(route, envelope(COMMENTS, { limit: 20, hasMore: false, nextCursor: null }));
  });

  await page.route(isPostDetail, (route) => json(route, envelope(POST)));

  /* LE FILET — toute autre route d'API rend une charge VIDE plutôt que de
     partir vers un hôte réel. Sans lui, une requête non prévue reste en vol et
     le gate expire sur un `waitForSelector` qui ne dit pas pourquoi. */
  await page.route('**/api/v1/**', (route) => json(route, envelope([])));

  await page.goto(`${base}/post/${POST_ID}`, { waitUntil: 'load' });
  await page.waitForSelector(`[data-comment-row="${OTHER}"]`);
  await page.waitForTimeout(200);
  await capture(page, `feed.post-comments.${scheme}`);

  // ------------------------------------------------ 1. qui a le droit de quoi
  const offered = await page.evaluate(() =>
    [...document.querySelectorAll('[data-comment-row]')].map((row) => ({
      id: row.getAttribute('data-comment-row'),
      gestes: [...row.querySelectorAll('[data-comment-gesture]')].map((b) => b.getAttribute('data-comment-gesture')),
    })),
  );
  check(offered.length === COMMENTS.length, say(`les ${COMMENTS.length} rangées du corpus sont peintes — ${offered.length}`));
  check(
    offered.every((row) => row.gestes.includes('like')),
    say(`AIMER est offert sur TOUTE rangée — ${JSON.stringify(offered)}`),
  );
  const mine = offered.find((row) => row.id === MINE);
  const others = offered.filter((row) => row.id !== MINE);
  check(
    mine !== undefined && mine.gestes.includes('edit') && mine.gestes.includes('delete'),
    say(`MODIFIER et SUPPRIMER sont offerts sur SA propre rangée — ${JSON.stringify(mine)}`),
  );
  check(
    others.every((row) => !row.gestes.includes('edit') && !row.gestes.includes('delete')),
    say(`… et sur AUCUNE autre : la passerelle les garde sur l'AUTEUR — ${JSON.stringify(others)}`),
  );

  // ------------------------------------------------ 2. les cibles se mesurent
  const hauteurs = await page.evaluate(() =>
    [...document.querySelectorAll('[data-comment-gesture]')].map((b) => ({
      geste: b.getAttribute('data-comment-gesture'),
      h: Math.round(b.getBoundingClientRect().height),
    })),
  );
  check(
    hauteurs.length > 0 && hauteurs.every((t) => t.h >= 44),
    say(`chaque cible de geste fait au moins 44 px — ${JSON.stringify(hauteurs)}`),
  );

  // ------------------------------------------------ 3. l'optimiste SE PEINT
  const compteDe = (id) => page.$eval(`[data-comment-row="${id}"] [data-comment-gesture="like"]`, (b) => (b.textContent ?? '').trim());
  const presseDe = (id) =>
    page.$eval(`[data-comment-row="${id}"] [data-comment-gesture="like"]`, (b) => b.getAttribute('aria-pressed'));

  const avant = await compteDe(THIRD);
  likePlan = { kind: 'delay', ms: 1200 };
  await page.click(`[data-comment-row="${THIRD}"] [data-comment-gesture="like"]`);
  await page.waitForTimeout(250);
  const pendant = await compteDe(THIRD);
  const presséPendant = await presseDe(THIRD);
  check(
    avant === '4' && pendant === '5',
    say(`le compte bouge À L'ÉCRAN avant la réponse réseau — « ${avant} » → « ${pendant} » pendant que la requête est en vol`),
  );
  check(presséPendant === 'true', say(`et le cœur est annoncé PRESSÉ dans le même temps — aria-pressed=${presséPendant}`));
  await page.waitForTimeout(1300);

  // ------------------------------------------------ 4. le refus reprend TOUT
  likePlan = { kind: 'refuse' };
  const avantRefus = await compteDe(OTHER);
  await page.click(`[data-comment-row="${OTHER}"] [data-comment-gesture="like"]`);
  await page.waitForSelector(`[data-comment-row="${OTHER}"] [data-comment-gesture-error]`);
  const apresRefus = await compteDe(OTHER);
  const presséApres = await presseDe(OTHER);
  check(
    apresRefus === avantRefus,
    say(`le refus REMET le compte à sa valeur EXACTE — « ${avantRefus} » puis « ${apresRefus} »`),
  );
  check(presséApres === 'false', say(`et le cœur redevient vide — aria-pressed=${presséApres}`));

  const alerte = await page.$eval(`[data-comment-row="${OTHER}"] [data-comment-gesture-error]`, (el) => ({
    role: el.getAttribute('role'),
    texte: (el.textContent ?? '').trim(),
    retry: el.querySelector('[data-comment-gesture-retry]') !== null,
    hauteurRetry: Math.round(el.querySelector('[data-comment-gesture-retry]')?.getBoundingClientRect().height ?? 0),
  }));
  check(alerte.role === 'alert', say(`l'échec est ANNONCÉ en alerte — role=${alerte.role}`));
  check(alerte.texte !== '', say(`et il porte un texte lisible — « ${alerte.texte} »`));
  check(alerte.retry, say('et il offre « Réessayer »'));
  check(alerte.hauteurRetry >= 44, say(`dont la cible fait au moins 44 px — ${alerte.hauteurRetry}`));

  const voisines = await page.evaluate(
    (ids) => ids.filter((id) => document.querySelector(`[data-comment-row="${id}"] [data-comment-gesture-error]`) !== null),
    [MINE, THIRD],
  );
  check(voisines.length === 0, say(`les rangées VOISINES restent muettes — ${JSON.stringify(voisines)}`));
  await capture(page, `feed.post-comment-failure.${scheme}`);

  // ------------------------------------------------ 5. « Réessayer » REPART
  const avantRejeu = sent.filter((r) => r.path === likePathOf(OTHER)).length;
  await page.click(`[data-comment-row="${OTHER}"] [data-comment-gesture-retry]`);
  await page.waitForTimeout(600);
  const apresRejeu = sent.filter((r) => r.path === likePathOf(OTHER)).length;
  check(
    apresRejeu === avantRejeu + 1,
    say(`« Réessayer » REJOUE la requête exacte — ${avantRejeu} puis ${apresRejeu} appels sur ${likePathOf(OTHER)}`),
  );

  // ------------------------------------------------ 6. modifier SUR PLACE
  const avantEdition = sent.length;
  await page.click(`[data-comment-row="${MINE}"] [data-comment-gesture="edit"]`);
  await page.waitForSelector(`[data-comment-edit-field="${MINE}"]`);
  const enEdition = await page.evaluate(
    (id) => {
      const row = document.querySelector(`[data-comment-row="${id}"]`);
      return {
        valeur: row?.querySelector('[data-comment-edit-field]')?.value ?? null,
        gestes: [...(row?.querySelectorAll('[data-comment-gesture]') ?? [])].length,
        save: row?.querySelector('[data-comment-edit-save]') !== null,
        cancel: row?.querySelector('[data-comment-edit-cancel]') !== null,
      };
    },
    MINE,
  );
  check(
    enEdition.valeur === COMMENTS[0].content,
    say(`« Modifier » ouvre le champ SUR PLACE, garni du texte existant — « ${enEdition.valeur} »`),
  );
  check(
    enEdition.gestes === 0,
    say(`et retire les gestes de la rangée en cours d'édition — on ne supprime pas ce qu'on corrige (${enEdition.gestes})`),
  );
  check(enEdition.save && enEdition.cancel, say('le champ offre « Enregistrer » et « Annuler »'));
  await capture(page, `feed.post-comment-edit.${scheme}`);

  await page.click(`[data-comment-row="${MINE}"] [data-comment-edit-cancel]`);
  await page.waitForSelector(`[data-comment-edit-field="${MINE}"]`, { state: 'detached' });
  check(sent.length === avantEdition, say(`« Annuler » referme le champ SANS aucune requête — ${sent.length - avantEdition}`));

  // ------------------------------------------------ 7. aucune erreur de page
  check(errors.length === 0, say(`aucune erreur de page — ${JSON.stringify(errors)}`));
  await context.close();
}

const capture = async (page, name) => {
  if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `${name}.png`) });
};

await main();
