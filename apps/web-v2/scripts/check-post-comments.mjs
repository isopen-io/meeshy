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
 *  4. **LES DEUX CLASSES D'ISSUE, ET CE QUE CHACUNE OFFRE** (revue-correction
 *     #7135). Ce bloc mesurait l'ACTE — « Réessayer repart » — jamais
 *     l'ISSUE, et il était donc vert sur la seule classe où le rejeu ne peut
 *     PAS aboutir : un 403 retapé rend la même alerte indéfiniment
 *     (`outcome.ts:40-55`, la règle depuis #5813). Désormais un refus
 *     PERMANENT dit sa RAISON et n'offre aucun bouton, tandis qu'un 500 EN
 *     LIGNE — la classe que le gate ne jouait pas du tout — offre le rejeu,
 *     sans accuser le réseau, et le rejeu repart AVEC LE MÊME VERBE sur un
 *     optimiste resté posé ;
 *  5. **« Modifier » ouvre le champ SUR PLACE**, sur l'ORIGINAL et non sur la
 *     traduction affichée, et « Annuler » le referme SANS aucune requête ;
 *  6. **« ENREGISTRER » DÉCLARE LA LANGUE DU TEXTE CORRIGÉ**, jamais celle de
 *     l'interface. Ce bloc MANQUAIT : le gate ouvrait le champ et l'annulait
 *     sans jamais appuyer sur « Enregistrer », si bien que la seule chose qui
 *     se décide à l'enregistrement — ce que la passerelle ÉCRIT dans
 *     `originalLanguage` avant de purger les traductions — n'était mesurée
 *     par rien. La rangée à soi est donc de RANG 2 (espagnol lu en français),
 *     parce qu'en français la règle juste et le relabel rendent le même
 *     verdict (leçon 261) ;
 *  7. **« SUPPRIMER » S'ARME PUIS CONFIRME**, retire la rangée et décrémente
 *     le compteur de la PUBLICATION — le travail principal du lot (#7135 : le
 *     compte ne bougeait que dans deux caches sur quatre) n'avait aucun témoin
 *     de navigateur, alors que son symptôme se lit sur des PIXELS. Le gate
 *     tapait UNE fois et le commentaire partait ; iOS demande deux gestes
 *     (menu « … » puis `Button(role: .destructive)`), et la v3.1 fait de même
 *     sur place. **Et son refus PASSAGER (500) REMET tout** : rangée,
 *     compteur, alerte et rejeu — sans quoi l'écran affirmait une suppression
 *     que la passerelle venait de refuser ;
 *  8. **LES CIBLES FONT AU MOINS 44 px ET S'ÉCARTENT D'AU MOINS 8** — mesurées
 *     au rectangle, jamais lues dans une feuille de style (dimension 5). Le
 *     bloc ne mesurait que la HAUTEUR : « Supprimer » vivait à 4 px du verbe
 *     RÉVERSIBLE voisin ;
 *  9. **LE FOCUS NE TOMBE JAMAIS SUR `<body>`** — ni après « Annuler », ni
 *     après « Enregistrer », ni après une suppression : qui navigue au clavier
 *     garde sa place (WCAG 2.4.3) ;
 * 10. **LES DEUX SCHÉMAS** se peignent sans erreur de page.
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

/**
 * LA RANGÉE À SOI EST DE RANG 2, DÉLIBÉRÉMENT (revue #7135) — écrite en
 * ESPAGNOL, lue en FRANÇAIS. C'est la seule forme qui rend mesurables trois
 * affirmations que la même rangée en français rendait indistinguables :
 *
 *  · le corps affiché est la TRADUCTION (le Prisme descend jusqu'au pixel) ;
 *  · « Modifier » ouvre sur l'ORIGINAL — ouvrir sur la traduction ferait
 *    RÉÉCRIRE le commentaire dans la langue du lecteur au premier
 *    enregistrement, en croyant corriger une faute ;
 *  · le `PATCH` déclare `es`, jamais la langue d'interface `fr`. La
 *    passerelle ÉCRIT cette déclaration et purge les traductions
 *    (`PostCommentService.ts:313-316`) : une déclaration fausse fait
 *    retraduire l'espagnol comme du français pour TOUS ses lecteurs (#6600).
 *
 * Un témoin de rang s'écrit sur un rang AUTRE que le premier (leçon 261) : en
 * `fr`, la règle juste et le relabel rendent le même verdict.
 */
const COMMENTS = [
  {
    id: MINE,
    content: 'Lo probé esta mañana, aguanta bien.',
    createdAt: '2026-09-19T09:40:00.000Z',
    author: author(VIEWER_ID, 'Vous', 'gate-viewer'),
    originalLanguage: 'es',
    translations: { fr: { text: 'Je l’ai testé ce matin, ça tient.', translationModel: 'nllb-200' } },
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
    /* NON NUL, DÉLIBÉRÉMENT — la rangée ne peint son compte que s'il est
       supérieur à zéro (`comment-row.tsx:128`). À zéro, « le refus remet le
       compte à sa valeur exacte » comparerait deux chaînes VIDES : vert sur un
       rollback juste, et vert aussi sur un rollback qui remettrait la rangée à
       un état qu'aucun chiffre ne montre. Un témoin se mesure sur une valeur
       qui S'AFFICHE. */
    likeCount: 7,
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
  /* TRADUIT, DÉLIBÉRÉMENT (#7141) — une publication déjà dans la langue du
     lecteur n'a AUCUNE pastille à porter (règle 1 du Prisme), et l'invariant
     « cliquer change le texte lu » n'aurait rien à mesurer. L'original est
     espagnol, la traduction française : les deux chaînes DIFFÈRENT, donc le
     verdict peut tomber. Le contenu du post n'est asserté nulle part ailleurs
     dans ce gate. */
  content: 'La reunión se traslada a las tres.',
  originalLanguage: 'es',
  translations: { fr: { text: 'La réunion est déplacée à quinze heures.', translationModel: 'nllb-200' } },
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

  /* LE FILET, POSÉ EN PREMIER — Playwright apparie les routes en ordre INVERSE
     d'enregistrement : la DERNIÈRE posée gagne. Un filet posé en dernier
     intercepterait donc la publication et son fil, qui rendraient une charge
     vide, et la carte se peindrait sur un `createdAt` absent (mesuré : la page
     lève « Invalid time value » et aucune rangée n'apparaît). Il vient donc
     AVANT les routes précises, pour ne recevoir que ce qu'elles n'ont pas pris.
     Sa raison d'être : aucune requête ne doit partir vers un hôte réel, et une
     requête non prévue qui resterait EN VOL ferait expirer le gate sur un
     `waitForSelector` qui ne dirait pas pourquoi. */
  await page.route('**/api/v1/**', (route) => json(route, envelope([])));

  /** Le scénario du `like`, réécrit d'un bloc à l'autre. */
  let likePlan = { kind: 'ok' };
  /** Celui du `DELETE` — la suppression est le geste DESTRUCTEUR, et c'est
   * son refus PASSAGER que la revue a trouvé silencieux (défaut majeur 4). */
  let deletePlan = { kind: 'ok' };

  await page.route(
    (url) => url.pathname.startsWith(`/api/v1/posts/${POST_ID}/comments/`) && url.pathname.endsWith('/like'),
    async (route) => {
      const request = route.request();
      sent.push({ method: request.method(), path: new URL(request.url()).pathname });
      if (likePlan.kind === 'delay') {
        await new Promise((resolve) => setTimeout(resolve, likePlan.ms));
        /* LE COMPTE SERVI EST COHÉRENT AVEC L'OPTIMISTE — la passerelle rend
           un `likeCount` ABSOLU, que `servedLikeCount` substitue à
           l'estimation. Un stub qui rendrait n'importe quel chiffre ferait
           reculer le compteur sous les yeux du lecteur, et les captures de
           recette montreraient ce recul comme s'il venait du produit. */
        return json(route, envelope({ liked: true, likeCount: likePlan.served }));
      }
      if (likePlan.kind === 'refuse') {
        /* 404 `COMMENT_NOT_FOUND` est ce que la passerelle rend hors audience
           d'interaction (jamais un 403, qui révélerait l'existence) ; 403 est
           ce qu'elle rend sur un commentaire qu'on n'a pas écrit. Les deux sont
           des refus PERMANENTS : c'est cette classe-là qu'on mesure. */
        return refusal(route, 403, 'FORBIDDEN', 'Not authorized');
      }
      if (likePlan.kind === 'flaky') {
        /* UNE PANNE DE PASSERELLE, EN LIGNE — la classe PASSAGÈRE, celle où
           un rejeu à l'identique peut aboutir. Elle n'était mesurée nulle
           part : le gate ne connaissait que le refus permanent, et c'est
           précisément la classe où « Réessayer » était offert à tort
           (revue-correction #7135, défaut majeur 1). */
        return refusal(route, 500, 'INTERNAL', 'Gateway failure');
      }
      return json(route, envelope({ liked: true, likeCount: 1 }));
    },
  );

  await page.route(
    (url) => /^\/api\/v1\/posts\/[^/]+\/comments\/[^/]+$/.test(url.pathname),
    async (route) => {
      const request = route.request();
      if (request.method() === 'DELETE') {
        sent.push({ method: 'DELETE', path: new URL(request.url()).pathname });
        if (deletePlan.kind === 'refuse5xx') return refusal(route, 500, 'INTERNAL', 'Gateway failure');
        return json(route, envelope({ deleted: true }));
      }
      const body = JSON.parse(request.postData() ?? '{}');
      /* LE CORPS EST RETENU — sans lui, « le PATCH déclare la bonne langue »
         n'est pas mesurable, et c'est très exactement le défaut qui a traversé
         le lot : la langue d'INTERFACE partait sur chaque correction. */
      sent.push({ method: request.method(), path: new URL(request.url()).pathname, body });
      const target = COMMENTS.find((c) => request.url().endsWith(c.id));
      /* LA PASSERELLE PURGE LES TRADUCTIONS DÈS QUE LE TEXTE CHANGE
         (`PostCommentService.ts:313`) — les servir encore ferait peindre la
         traduction de l'ANCIEN texte au-dessus du nouveau, et le gate
         montrerait un écran que la passerelle ne sert jamais. */
      return json(
        route,
        envelope({ ...target, content: body.content ?? target?.content, translations: {}, isEdited: true }),
      );
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

  /* ---------------------------------- 1 bis. LE PRISME S'ANNONCE, ET S'OUVRE
     (#7141) — **la loi 4 appliquée au Prisme.**

     Le défaut que ce bloc existe pour empêcher n'est pas « la pastille est
     absente » : c'est une pastille qui ANNONCE une langue sans la SERVIR.
     `PostCard` l'a déjà coûté au dépôt (cycle 123 du `CLAUDE.md` racine) — une
     zone « traductions disponibles » cliquable dont le clic ne changeait RIEN.
     Un témoin de composant ne l'attrape pas : il peut monter la pastille, lire
     son `aria-label` et verdir sans jamais regarder le TEXTE.

     L'assertion n'interroge donc ni le rang ni le prisme, mais l'EFFET :
     **cliquer change-t-il le texte lu ?** Les deux surfaces sont mesurées — le
     CORPS de la publication et la RANGÉE de commentaire — parce qu'elles
     portent deux composants différents et que l'une pourrait être câblée sans
     l'autre. */
  const prismeCorps = await page.evaluate(async () => {
    const noeud = () => document.querySelector('[data-feed-text]');
    const bouton = noeud()?.closest('div')?.querySelector('[data-prism-toggle]') ?? null;
    const avant = noeud()?.textContent?.trim() ?? '';
    const langueAvant = noeud()?.getAttribute('lang') ?? null;
    bouton?.click();
    await new Promise((r) => setTimeout(r, 60));
    const apres = noeud()?.textContent?.trim() ?? '';
    const langueApres = noeud()?.getAttribute('lang') ?? null;
    /* ON REFERME. Un invariant qui AGIT doit rendre l'écran à son état : les
       blocs suivants lisent le corps servi, et le laisser ouvert sur
       l'original les ferait rougir sur une mesure qu'ils n'ont pas prise.
       Mesuré : sans ce second clic, « le corps AFFICHÉ est bien la traduction
       servie » tombait dans les DEUX schémas. */
    bouton?.click();
    await new Promise((r) => setTimeout(r, 60));
    return {
      pastille: bouton !== null,
      avant,
      apres,
      langueAvant,
      langueApres,
      rendu: noeud()?.textContent?.trim() ?? '',
    };
  });
  check(prismeCorps.pastille, say(`le CORPS de la publication porte la pastille du Prisme — ${JSON.stringify(prismeCorps)}`));
  check(
    prismeCorps.avant !== '' && prismeCorps.apres !== '' && prismeCorps.avant !== prismeCorps.apres,
    say(`… et cliquer CHANGE le texte lu — ${JSON.stringify(prismeCorps)}`),
  );
  check(
    prismeCorps.langueAvant !== prismeCorps.langueApres,
    say(`… la voix suit le texte : \`lang\` change avec lui — ${JSON.stringify(prismeCorps)}`),
  );

  const prismeRangee = await page.evaluate(async (id) => {
    const rangee = () => document.querySelector(`[data-comment-row="${id}"]`);
    const texte = () => rangee()?.querySelector('p')?.textContent?.trim() ?? '';
    const bouton = rangee()?.querySelector('[data-prism-toggle]') ?? null;
    const avant = texte();
    bouton?.click();
    await new Promise((r) => setTimeout(r, 60));
    const apres = texte();
    /* ON REFERME — même raison que ci-dessus. */
    bouton?.click();
    await new Promise((r) => setTimeout(r, 60));
    return { pastille: bouton !== null, avant, apres, rendu: texte() };
  }, MINE);
  check(prismeRangee.pastille, say(`la RANGÉE traduite porte la pastille du Prisme — ${JSON.stringify(prismeRangee)}`));
  check(
    prismeRangee.avant !== '' && prismeRangee.apres !== '' && prismeRangee.avant !== prismeRangee.apres,
    say(`… et cliquer CHANGE le texte lu — ${JSON.stringify(prismeRangee)}`),
  );

  /* LE CONTRE-TÉMOIN — une rangée DÉJÀ dans la langue du lecteur ne porte
     aucune pastille. Sans lui, les deux verdicts ci-dessus resteraient verts
     sur une pastille posée INCONDITIONNELLEMENT, qui mentirait partout. */
  const sansPrisme = await page.evaluate(
    (id) => document.querySelector(`[data-comment-row="${id}"]`)?.querySelector('[data-prism-toggle]') !== null,
    OTHER,
  );
  check(!sansPrisme, say(`… et une rangée NON traduite n'annonce rien — pastille présente : ${sansPrisme}`));
  check(
    prismeCorps.rendu === prismeCorps.avant && prismeRangee.rendu === prismeRangee.avant,
    say(`… et le geste REFERMÉ rend l'écran à son état — ${JSON.stringify({ corps: prismeCorps.rendu, rangee: prismeRangee.rendu })}`),
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

  /* **ET ELLES SE MESURENT AUSSI EN ÉCARTEMENT** (revue-correction #7135,
     défaut majeur 5). Ce bloc ne mesurait que la HAUTEUR : « Supprimer »
     vivait à 4 px de « Modifier » — moitié moins que le minimum entre cibles
     adjacentes, et la cible voisine est IRRÉVERSIBLE. Un pouce qui vise le
     verbe réversible atteignait le destructeur. La géométrie se lit au
     RECTANGLE, jamais au texte : `px-2` donne l'illusion d'un écart que le
     doigt ne rencontre pas. */
  const ecart = await page.evaluate((id) => {
    const rect = (geste) =>
      document.querySelector(`[data-comment-row="${id}"] [data-comment-gesture="${geste}"]`)?.getBoundingClientRect() ?? null;
    const edit = rect('edit');
    const supprimer = rect('delete');
    if (edit === null || supprimer === null) return null;
    return { editRight: Math.round(edit.right), deleteLeft: Math.round(supprimer.left), ecart: Math.round(supprimer.left - edit.right) };
  }, MINE);
  check(
    ecart !== null && ecart.ecart >= 8,
    say(`« Supprimer » est ÉCARTÉ de « Modifier » d'au moins 8 px — ${JSON.stringify(ecart)}`),
  );

  // ------------------------------------------------ 3. l'optimiste SE PEINT
  const compteDe = (id) => page.$eval(`[data-comment-row="${id}"] [data-comment-gesture="like"]`, (b) => (b.textContent ?? '').trim());
  const presseDe = (id) =>
    page.$eval(`[data-comment-row="${id}"] [data-comment-gesture="like"]`, (b) => b.getAttribute('aria-pressed'));

  const avant = await compteDe(THIRD);
  /* `served: 6` et non 5 — une autre personne a aimé pendant que la requête
     volait. Le compte SERVI est absolu et doit remplacer l'estimation locale
     (`servedLikeCount`) ; servir exactement l'optimiste rendrait ce témoin
     incapable de distinguer « le servi a gagné » de « rien ne s'est passé ». */
  likePlan = { kind: 'delay', ms: 1200, served: 6 };
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
  const apresServi = await compteDe(THIRD);
  check(
    apresServi === '6',
    say(`le compte SERVI par la passerelle remplace l'estimation locale — « ${pendant} » optimiste puis « ${apresServi} » servi`),
  );

  // ------------------------------------------------ 4. le refus reprend TOUT
  likePlan = { kind: 'refuse' };
  const avantRefus = await compteDe(OTHER);
  const appelsAvant = sent.filter((r) => r.path === likePathOf(OTHER)).length;
  await page.click(`[data-comment-row="${OTHER}"] [data-comment-gesture="like"]`);
  await page.waitForSelector(`[data-comment-row="${OTHER}"] [data-comment-gesture-error]`);
  const apresRefus = await compteDe(OTHER);
  const presséApres = await presseDe(OTHER);
  /* LE GESTE A BIEN EU LIEU — sans ce constat, « le compte est revenu à sa
     valeur » serait vert sur un bouton qui n'a RIEN fait : les deux lectures
     sont alors égales pour la pire des raisons. La moitié qui mord est
     celle-ci ; celle qui rassure est la suivante. */
  check(
    sent.filter((r) => r.path === likePathOf(OTHER)).length === appelsAvant + 1,
    say(`le tap a bien ENVOYÉ son geste avant d'être refusé — ${appelsAvant} puis ${sent.filter((r) => r.path === likePathOf(OTHER)).length}`),
  );
  check(
    apresRefus === avantRefus && avantRefus !== '',
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
  check(alerte.hauteurRetry === 0 || alerte.hauteurRetry >= 44, say(`toute cible offerte fait au moins 44 px — ${alerte.hauteurRetry}`));

  /* **UN REFUS PERMANENT N'OFFRE PAS DE REJEU, IL DIT SA RAISON**
     (revue-correction #7135, défaut majeur 1). Le gate mesurait l'ACTE — « le
     rejeu repart » — jamais l'ISSUE, donc il était vert sur la classe où le
     rejeu ne peut PAS aboutir : un 403 retapé rend la même alerte
     indéfiniment (`outcome.ts:40-55`, qui déclare cette règle depuis #5813).
     Le verdict s'inverse ici : pas de bouton, et une cause. */
  const issueRefus = await page.$eval(
    `[data-comment-row="${OTHER}"] [data-comment-gesture-error]`,
    (el) => el.getAttribute('data-comment-gesture-issue'),
  );
  check(issueRefus === 'refused', say(`… et il porte sa CLASSE d'issue — ${issueRefus}`));
  check(!alerte.retry, say(`un refus PERMANENT n'offre AUCUN rejeu — retry=${alerte.retry}`));
  check(
    alerte.texte.includes('ouvert') || alerte.texte.includes('Session'),
    say(`… il dit la RAISON à la place — « ${alerte.texte} »`),
  );

  const voisines = await page.evaluate(
    (ids) => ids.filter((id) => document.querySelector(`[data-comment-row="${id}"] [data-comment-gesture-error]`) !== null),
    [MINE, THIRD],
  );
  check(voisines.length === 0, say(`les rangées VOISINES restent muettes — ${JSON.stringify(voisines)}`));
  await capture(page, `feed.post-comment-failure.${scheme}`);

  // ------------------------------------------------ 5. LA PANNE PASSAGÈRE, elle, se REJOUE
  /* LA CLASSE QUE LE GATE NE CONNAISSAIT PAS — un 500 EN LIGNE. C'est ICI que
     « Réessayer » sert, et c'est ici seulement qu'il est offert désormais. Le
     message, lui, ne doit PAS nommer le réseau : `navigator.onLine` vaut
     `true`, et « hors ligne » enverrait l'utilisateur vérifier son wifi. */
  likePlan = { kind: 'flaky' };
  await page.click(`[data-comment-row="${THIRD}"] [data-comment-gesture="like"]`);
  await page.waitForSelector(`[data-comment-row="${THIRD}"] [data-comment-gesture-error]`);
  const passagere = await page.$eval(`[data-comment-row="${THIRD}"] [data-comment-gesture-error]`, (el) => ({
    issue: el.getAttribute('data-comment-gesture-issue'),
    texte: (el.textContent ?? '').trim(),
    retry: el.querySelector('[data-comment-gesture-retry]') !== null,
    hauteurRetry: Math.round(el.querySelector('[data-comment-gesture-retry]')?.getBoundingClientRect().height ?? 0),
  }));
  check(passagere.issue === 'unconfirmed', say(`un 500 EN LIGNE est une issue PASSAGÈRE — ${passagere.issue}`));
  check(passagere.retry && passagere.hauteurRetry >= 44, say(`… et c'est LÀ que « Réessayer » se pose — ${JSON.stringify(passagere)}`));
  check(
    !passagere.texte.toLowerCase().includes('hors ligne'),
    say(`… sans accuser le réseau alors que la connexion est bonne — « ${passagere.texte} »`),
  );

  const avantRejeu = sent.filter((r) => r.path === likePathOf(THIRD)).length;
  const verbeAvant = sent.filter((r) => r.path === likePathOf(THIRD)).at(-1)?.method;
  await page.click(`[data-comment-row="${THIRD}"] [data-comment-gesture-retry]`);
  await page.waitForTimeout(600);
  const rejoues = sent.filter((r) => r.path === likePathOf(THIRD));
  check(
    rejoues.length === avantRejeu + 1,
    say(`« Réessayer » REJOUE la requête exacte — ${avantRejeu} puis ${rejoues.length} appels sur ${likePathOf(THIRD)}`),
  );
  /* **ET AVEC LE MÊME VERBE** (défaut majeur 2). L'optimiste est RESTÉ posé
     — le cœur est plein — donc un module qui relit sa direction dans le cache
     enverrait un `DELETE` là où le lecteur demandait un `POST`. Ce témoin
     était IMPOSSIBLE à écrire avant, le rejeu ne survenant qu'après rollback. */
  check(
    rejoues.at(-1)?.method === verbeAvant && verbeAvant !== undefined,
    say(`… et avec le MÊME verbe, sur un optimiste NON défait — ${verbeAvant} puis ${rejoues.at(-1)?.method}`),
  );
  likePlan = { kind: 'ok' };

  // ------------------------------------------------ 6. modifier SUR PLACE
  /* LE CORPS SE LIT AVANT L'ÉDITION — le champ REMPLACE le paragraphe. */
  const corpsAffiche = await page.$eval(`[data-comment-row="${MINE}"] p.text-body`, (p) => ({
    texte: (p.textContent ?? '').trim(),
    lang: p.getAttribute('lang'),
  }));
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
  /* **SUR L'ORIGINAL, JAMAIS SUR LA TRADUCTION.** La rangée AFFICHE le
     français (rang 2 du Prisme) ; le champ doit s'ouvrir sur l'ESPAGNOL.
     Ouvrir sur ce qui est peint ferait réécrire le commentaire dans la langue
     du lecteur au premier « Enregistrer », en croyant corriger une faute —
     et le texte d'origine serait perdu pour tout le monde. */
  check(
    enEdition.valeur === COMMENTS[0].content,
    say(`« Modifier » ouvre le champ sur l'ORIGINAL, pas sur la traduction affichée — « ${enEdition.valeur} »`),
  );
  check(
    corpsAffiche.texte === COMMENTS[0].translations.fr.text,
    say(`… alors que le corps AFFICHÉ est bien la traduction servie — « ${corpsAffiche.texte} »`),
  );
  check(
    enEdition.gestes === 0,
    say(`et retire les gestes de la rangée en cours d'édition — on ne supprime pas ce qu'on corrige (${enEdition.gestes})`),
  );
  check(enEdition.save && enEdition.cancel, say('le champ offre « Enregistrer » et « Annuler »'));
  /* LE FOCUS SUIT LE GESTE — happy-dom a un modèle de focus approximatif ;
     seul un moteur réel dit où le curseur a ATTERRI après que « Modifier » a
     démonté le bouton qu'on venait d'actionner. */
  await settleFocus(page, () => document.activeElement?.hasAttribute?.('data-comment-edit-field') === true);
  const focus = await page.evaluate(() => ({
    champ: document.activeElement?.getAttribute('data-comment-edit-field') ?? null,
    curseur: document.activeElement?.selectionStart ?? null,
    actif: document.activeElement?.tagName + ' ' + (document.activeElement?.getAttribute('data-comment-gesture') ?? document.activeElement?.className ?? ''),
  }));
  check(
    focus.champ === MINE && focus.curseur === COMMENTS[0].content.length,
    say(`« Modifier » DONNE le focus au champ, curseur à la fin — ${JSON.stringify(focus)}`),
  );
  await capture(page, `feed.post-comment-edit.${scheme}`);

  await page.click(`[data-comment-row="${MINE}"] [data-comment-edit-cancel]`);
  await page.waitForSelector(`[data-comment-edit-field="${MINE}"]`, { state: 'detached' });
  check(sent.length === avantEdition, say(`« Annuler » referme le champ SANS aucune requête — ${sent.length - avantEdition}`));

  /* **LE RETOUR VAUT L'ALLER** (revue-correction #7135, défaut majeur 6). Ce
     bloc mesurait le focus à l'OUVERTURE et jamais à la FERMETURE : « Annuler »
     et « Enregistrer » démontaient le champ ET leurs deux boutons sans rendre
     le focus à rien, et qui navigue au clavier repartait du haut du document.
     La moitié manquante du correctif `473a1289a5`, dont le doc-comment
     nommait pourtant le risque. */
  await settleFocus(page, () => document.activeElement?.getAttribute?.('data-comment-gesture') === 'edit');
  const focusApresAnnuler = await page.evaluate(() => ({
    geste: document.activeElement?.getAttribute('data-comment-gesture') ?? null,
    rangee: document.activeElement?.closest('[data-comment-row]')?.getAttribute('data-comment-row') ?? null,
  }));
  check(
    focusApresAnnuler.geste === 'edit' && focusApresAnnuler.rangee === MINE,
    say(`« Annuler » REND le focus au bouton « Modifier » — ${JSON.stringify(focusApresAnnuler)}`),
  );

  // ------------------------------------------------ 7. ENREGISTRER, et la langue qui part avec
  /* CE BLOC MANQUAIT (revue #7135) : le gate ouvrait le champ, l'annulait, et
     n'appuyait JAMAIS sur « Enregistrer ». Tout ce qui se joue à
     l'enregistrement — le texte qui se repeint, et surtout la LANGUE déclarée
     à la passerelle — n'était donc mesuré par rien, ni ici ni en `bun test` :
     c'est là que le relabel de la langue est passé. */
  const CORRIGE = 'Lo probé esta mañana, aguanta perfectamente.';
  await page.click(`[data-comment-row="${MINE}"] [data-comment-gesture="edit"]`);
  await page.waitForSelector(`[data-comment-edit-field="${MINE}"]`);
  /**
   * **LE CHAMP PORTE SON TEXTE AVANT QU'ON LE REMPLACE** (#7176).
   *
   * `waitForSelector` rend la main dès que le nœud est DANS le document ;
   * `EditForm` pose sa valeur au rendu et son curseur dans un EFFET, qui court
   * après. Remplir à cet instant fabriquait, sous charge, un champ qui portait
   * l'ANCIEN texte SUIVI du nouveau — et c'est ce que la passerelle recevait :
   *
   *     « Lo probé esta mañana, aguanta bien.Lo probé esta mañana, aguanta perfectamente. »
   *
   * Le gate rendait alors « … avec le texte corrigé » en échec, sur un produit
   * qui n'avait rien de faux. Attendre le FAIT — le champ porte exactement
   * l'original — retire la course sans rien retirer à la mesure : ce qu'on
   * vérifie ensuite reste le PATCH, que ce gate est seul à voir.
   */
  await page.waitForFunction(
    (sel) => (document.querySelector(sel)?.value ?? '') !== '',
    `[data-comment-edit-field="${MINE}"]`,
  );
  await page.fill(`[data-comment-edit-field="${MINE}"]`, CORRIGE);
  /* … et il porte le NOUVEAU avant qu'on enregistre : `fill` écrit par
     événements, React repeint au tour suivant. Sans cette seconde attente,
     « Enregistrer » pouvait partir sur une valeur que le champ n'avait pas
     encore. */
  await page.waitForFunction(
    ([sel, attendu]) => document.querySelector(sel)?.value === attendu,
    [`[data-comment-edit-field="${MINE}"]`, CORRIGE],
  );
  await page.click(`[data-comment-row="${MINE}"] [data-comment-edit-save]`);
  await page.waitForSelector(`[data-comment-edit-field="${MINE}"]`, { state: 'detached' });
  /**
   * **PUIS LE FAIT, ET SA STABILITÉ** (leçon 634). Le délai de 400 ms qui
   * tenait cette place était un PARI sur la vitesse de la machine.
   *
   * Ce qu'on attend ici n'est PAS « la rangée porte le texte corrigé » — ce
   * serait rendre tautologique le témoin qui le vérifie trois lignes plus bas.
   * On attend que la rangée ne CHANGE PLUS : deux lectures identiques à un
   * tour d'intervalle. Le gate lit alors un état arrêté, et reste libre de le
   * trouver faux.
   */
  await page.waitForFunction(
    (sel) => {
      const lu = (document.querySelector(sel)?.textContent ?? '').trim();
      const precedent = globalThis.__meeshyDernierTexte;
      globalThis.__meeshyDernierTexte = lu;
      return lu !== '' && lu === precedent;
    },
    `[data-comment-row="${MINE}"] p.text-body`,
    { polling: 100 },
  );

  const patch = sent.filter((r) => r.method === 'PATCH' && r.path.endsWith(MINE)).at(-1);
  check(patch !== undefined, say(`« Enregistrer » ENVOIE son PATCH — ${JSON.stringify(patch ?? null)}`));
  check(
    patch?.body?.content === CORRIGE,
    say(`… avec le texte corrigé — « ${patch?.body?.content ?? ''} »`),
  );
  /* L'INVARIANT DE #6600 : corriger une faute ne change pas la langue d'un
     texte. La langue d'interface est `fr` (le contexte est ouvert en fr-FR) ;
     déclarer `fr` ici ferait retraduire l'espagnol comme du français pour
     TOUS les lecteurs, la passerelle écrivant la déclaration et purgeant les
     traductions dans le même mouvement. */
  check(
    patch?.body?.originalLanguage === 'es',
    say(`… et DÉCLARE la langue du commentaire corrigé, jamais celle de l'interface — « ${patch?.body?.originalLanguage ?? '(absente)'} »`),
  );
  const apresEnregistrement = await page.$eval(`[data-comment-row="${MINE}"] p.text-body`, (p) => (p.textContent ?? '').trim());
  check(
    apresEnregistrement === CORRIGE,
    say(`et la rangée peint le texte servi, traductions purgées — « ${apresEnregistrement} »`),
  );
  await settleFocus(page, () => document.activeElement?.getAttribute?.('data-comment-gesture') === 'edit');
  const focusApresSauver = await page.evaluate(() => document.activeElement?.getAttribute('data-comment-gesture') ?? null);
  check(focusApresSauver === 'edit', say(`« Enregistrer » aussi rend le focus au geste qui l'a ouvert — ${focusApresSauver}`));

  // ------------------------------------------------ 8. SUPPRIMER, et les compteurs qui suivent
  /* LE TRAVAIL PRINCIPAL DU LOT N'AVAIT AUCUN TÉMOIN DE NAVIGATEUR : le
     compteur de commentaires de la publication ne bougeait que dans DEUX
     caches sur quatre, et le symptôme — « on supprime son commentaire, la
     carte garde l'ancien chiffre » — se lit ICI, sur la rangée de
     statistiques que la fiche peint au-dessus du fil. Un témoin de cache dit
     que la valeur a changé ; celui-ci dit qu'un pixel l'a montrée. */
  const compteurCartes = () =>
    page.$eval('[data-feed-actions]', (row) => ((row.children[1]?.textContent ?? '').trim()));
  const avantSuppression = await compteurCartes();

  /* **SUPPRIMER REFUSÉ PAR UN 500 : L'ÉCRAN NE DOIT PAS AFFIRMER LA
     SUPPRESSION** (revue-correction #7135, défaut majeur 4). La rangée
     partait, le compteur décrémentait, aucune alerte ne se posait (la rangée
     n'existait plus pour la porter), aucune file ne rejouait rien — et la
     seule phrase de l'écran disait « hors ligne » pendant que la connexion
     était bonne. Le témoin se pose sur un 500 EN LIGNE, rang AUTRE que le
     hors-ligne. */
  deletePlan = { kind: 'refuse5xx' };
  await page.click(`[data-comment-row="${MINE}"] [data-comment-gesture="delete"]`);
  await page.click(`[data-comment-row="${MINE}"] [data-comment-gesture="delete"]`);
  await page.waitForSelector(`[data-comment-row="${MINE}"] [data-comment-gesture-error]`);
  const refusSuppression = await page.evaluate(
    (id) => {
      const row = document.querySelector(`[data-comment-row="${id}"]`);
      const alerte = row?.querySelector('[data-comment-gesture-error]');
      return {
        rangee: row !== null,
        issue: alerte?.getAttribute('data-comment-gesture-issue') ?? null,
        retry: alerte?.querySelector('[data-comment-gesture-retry]') !== null && alerte !== null,
        texte: (alerte?.textContent ?? '').trim(),
      };
    },
    MINE,
  );
  check(refusSuppression.rangee, say(`un 500 sur SUPPRIMER REMET la rangée — elle n'a jamais été supprimée`));
  check(
    (await compteurCartes()) === avantSuppression,
    say(`… et le compteur de la publication REVIENT — « ${avantSuppression} » puis « ${await compteurCartes()} »`),
  );
  check(refusSuppression.issue === 'unconfirmed' && refusSuppression.retry, say(`… l'échec est ANNONCÉ sur SA rangée avec « Réessayer » — ${JSON.stringify(refusSuppression)}`));
  check(
    !refusSuppression.texte.toLowerCase().includes('hors ligne'),
    say(`… sans accuser le réseau — « ${refusSuppression.texte} »`),
  );
  await capture(page, `feed.post-comment-delete-refused.${scheme}`);

  /* **ET LE PREMIER TAP NE DÉTRUIT PAS** (défaut majeur 5) — il ARME. iOS
     enferme le verbe dans un menu « … » : deux gestes. Le gate tapait UNE
     fois et le commentaire partait. */
  deletePlan = { kind: 'ok' };
  const departsAvant = sent.filter((r) => r.method === 'DELETE' && r.path.endsWith(MINE)).length;
  await page.click(`[data-comment-row="${MINE}"] [data-comment-gesture="delete"]`);
  await page.waitForTimeout(150);
  const arme = await page.$eval(`[data-comment-row="${MINE}"] [data-comment-gesture="delete"]`, (b) => ({
    arme: b.hasAttribute('data-comment-delete-armed'),
    libelle: (b.textContent ?? '').trim(),
  }));
  check(
    arme.arme && sent.filter((r) => r.method === 'DELETE' && r.path.endsWith(MINE)).length === departsAvant,
    say(`le PREMIER tap sur « Supprimer » n'envoie RIEN — il arme, et se renomme « ${arme.libelle} »`),
  );
  check(
    (await page.$(`[data-comment-row="${MINE}"]`)) !== null,
    say('… et la rangée est toujours là : rien d’irréversible au premier tap'),
  );

  await page.click(`[data-comment-row="${MINE}"] [data-comment-gesture="delete"]`);
  await page.waitForSelector(`[data-comment-row="${MINE}"]`, { state: 'detached' });
  await page.waitForTimeout(200);
  const apresSuppression = await compteurCartes();
  check(
    avantSuppression === String(COMMENTS.length) && apresSuppression === String(COMMENTS.length - 1),
    say(`le SECOND tap retire la rangée ET décrémente le compteur — « ${avantSuppression} » puis « ${apresSuppression} »`),
  );
  check(
    sent.some((r) => r.method === 'DELETE' && r.path.endsWith(MINE)),
    say(`et la suppression est bien PARTIE — ${JSON.stringify(sent.filter((r) => r.method === 'DELETE'))}`),
  );
  /* LA PLACE DU LECTEUR NE DISPARAÎT PAS AVEC LA RANGÉE (défaut majeur 6). */
  await settleFocus(page, () => document.activeElement?.getAttribute?.('data-comment-gesture') === 'like');
  const focusApresSuppression = await page.evaluate(() => ({
    geste: document.activeElement?.getAttribute('data-comment-gesture') ?? null,
    rangee: document.activeElement?.closest('[data-comment-row]')?.getAttribute('data-comment-row') ?? null,
    fil: document.activeElement?.hasAttribute('data-comment-thread') ?? false,
  }));
  check(
    focusApresSuppression.geste === 'like' || focusApresSuppression.fil,
    say(`SUPPRIMER passe le focus à la rangée suivante, ou au fil à défaut — ${JSON.stringify(focusApresSuppression)}`),
  );

  // ------------------------------------------------ 9. aucune erreur de page
  check(errors.length === 0, say(`aucune erreur de page — ${JSON.stringify(errors)}`));
  await context.close();
}

/**
 * ATTENDRE QUE LE FOCUS SE POSE, SANS EN FAIRE LE VERDICT. Un
 * `waitForSelector` rend la main dès que le nœud est DANS le document — les
 * effets de React, eux, courent après la peinture, et c'est un effet qui pose
 * le focus. Lire `document.activeElement` à cet instant mesurait donc la
 * course, pas la règle (observé : vert en sombre, rouge en clair, sur le même
 * code). Le dépassement de délai est AVALÉ volontairement : c'est le `check`
 * qui suit qui juge, et qui dit alors OÙ le focus a atterri — un `timeout` de
 * Playwright ne l'aurait pas dit.
 */
const settleFocus = async (page, predicat) => {
  await page.waitForFunction(predicat, null, { timeout: 2000 }).catch(() => undefined);
};

const capture = async (page, name) => {
  if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `${name}.png`) });
};

await main();
