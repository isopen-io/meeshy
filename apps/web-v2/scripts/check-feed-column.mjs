#!/usr/bin/env node
/**
 * LE FIL SE LIT DANS UNE COLONNE, ET ON Y PUBLIE (#7449).
 *
 * Les témoins `bun test` prouvent l'ARITHMÉTIQUE de la colonne
 * (`lib/view/reading-column.test.ts`), la loi du brouillon
 * (`lib/publish/draft.test.ts`), le port (`lib/api/posts-publish.test.ts`) et
 * les deux adresses de la porte (`components/feed-create-door.test.tsx`).
 * Aucun d'eux ne peut dire ce qui se PEINT : ce gate mesure au navigateur, sur
 * le `dist` construit (source fixtures), dans les deux schémas.
 *
 * LE GABARIT LARGE EST TOUT LE SUJET. Les trente-huit autres gates mesurent
 * 390 × 844 et 320 × 568 — deux téléphones. C'est exactement pour cela que le
 * fil a pu s'étaler sur 1416 px pendant des mois sans qu'aucun ne rougisse :
 * un défaut qui ne se voit qu'au-delà des gabarits mesurés est invisible par
 * construction. Ce gate ajoute 1440 × 900, et garde les 390 × 844 pour prouver
 * l'autre moitié — que la borne ne MORD PAS sur un téléphone.
 *
 *  1. à 1440 × 900, le CHROME prend la fenêtre — en-tête, plateau des stories
 *     et scrollport ;
 *  2. le CONTENU prend la colonne — chaque carte fait exactement la colonne et
 *     se centre, et la FICHE d'une publication (à un tap du fil) la suit ;
 *  3. à 390 × 844, la carte fait la largeur du téléphone moins ses gouttières
 *     — rien n'a changé ;
 *  4. la porte de création est dans l'en-tête, atteignable, 44 au moins, et
 *     « Lancer les Réels » RESTE le contrôle le plus à droite ;
 *  5. elle ouvre deux lignes, vers /posts/new et /posts/new?type=reel ;
 *  6. la ligne « Réel » ouvre le composeur AU FORMAT RÉEL ;
 *  7. un réel de texte seul est REFUSÉ en le disant, et « Publier » est éteint ;
 *  8. basculer sur « Publication » rallume « Publier » et RETIRE le format de
 *     l'adresse — la saisie survit à la bascule ;
 *  9. publier ramène au Flux ;
 * 10. les Réels se lisent eux aussi dans une colonne 9:16 centrée, et leur
 *     bouton « Retour » s'ancre à la COLONNE, pas au bord de la fenêtre ;
 * 11. aucun défilement horizontal, aucune erreur de page.
 *
 * `CAPTURE_DIR=<dossier>` écrit les captures de recette.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';

/** Les deux cotes de `src/lib/view/reading-column.ts`, relues ici comme
 * `check-curve.mjs` relit la sienne : par EXTRACTION, pour qu'un changement de
 * la constante fasse bouger le gate avec elle plutôt que de le faire mentir. */
import { readFileSync } from 'node:fs';
const LAW = readFileSync(new URL('../src/lib/view/reading-column.ts', import.meta.url), 'utf8');
const COLUMN_MAX = Number(/READING_COLUMN_MAX = (\d+)/.exec(LAW)?.[1]);
const REEL_RATIO = 9 / 16;
if (!Number.isFinite(COLUMN_MAX)) {
  console.error('check-feed-column : READING_COLUMN_MAX introuvable dans lib/view/reading-column.ts');
  process.exit(1);
}

const DIST = new URL('../dist/', import.meta.url).pathname;
const served = await startDistServer(DIST, { serviceWorker: false });
const BASE = served.base;

const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
if (CAPTURE_DIR !== null) await mkdir(CAPTURE_DIR, { recursive: true });

const failures = [];
let invariants = 0;
const check = (ok, what) => {
  invariants += 1;
  if (!ok) failures.push(what);
};

const TAP_FLOOR = 44;
const WIDE = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

const capture = async (page, name) => {
  if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `${name}.png`) });
};

/** La boîte d'un élément, plus « son centre est-il ATTEIGNABLE » — un contrôle
 * couvert par une couche est un contrôle absent. */
const boxOf = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
      centerX: r.left + r.width / 2,
      atteint: hit !== null && (hit === el || el.contains(hit)),
    };
  }, selector);

const near = (a, b, tolerance = 1.5) => Math.abs(a - b) <= tolerance;

const browser = await launchChromium();

for (const scheme of ['light', 'dark']) {
  const label = scheme === 'light' ? 'clair' : 'sombre';

  // ============================================ 1-2. le Flux au GABARIT LARGE
  {
    const context = await browser.newContext({ viewport: WIDE, colorScheme: scheme, locale: 'fr-FR' });
    const page = await context.newPage();
    await page.goto(`${BASE}/feed`, { waitUntil: 'load' });
    await page.waitForSelector('[data-feed-card]');

    /* LE CHROME PREND LA FENÊTRE — en-tête, plateau des stories et scrollport
       (donc la barre de défilement). C'est la directive porteur du 2026-09-22,
       et c'est le témoin qui a manqué à la première écriture du lot : bornée
       sur le scrollport, la colonne emportait le titre et le plateau. */
    const scrollport = await boxOf(page, '#contenu');
    check(
      scrollport !== null && near(scrollport.width, WIDE.width),
      `${label} 1440×900 : le scrollport du Flux ne prend pas la fenêtre (${scrollport?.width} ≠ ${WIDE.width})`,
    );

    const entete = await boxOf(page, 'header');
    check(
      entete !== null && near(entete.width, WIDE.width),
      `${label} 1440×900 : l'en-tête ne prend pas la fenêtre (${JSON.stringify(entete)})`,
    );

    const plateau = await boxOf(page, '[data-rail="grande"]');
    check(
      plateau !== null && near(plateau.width, WIDE.width),
      `${label} 1440×900 : le plateau des stories ne court pas de bord à bord (${JSON.stringify(plateau)})`,
    );

    /* ...ET LE CONTENU PREND LA COLONNE : chaque carte fait exactement la
       colonne, et elle est centrée dans la fenêtre. */
    const cartes = await page.evaluate(
      (max) =>
        [...document.querySelectorAll('[data-feed-card]')].map((el) => {
          const r = el.getBoundingClientRect();
          return { w: r.width, cx: r.left + r.width / 2 };
        }),
      COLUMN_MAX,
    );
    check(cartes.length > 0, `${label} 1440×900 : aucune carte peinte — le témoin de largeur ne peut pas tomber`);
    check(
      cartes.every((c) => near(c.w, COLUMN_MAX)),
      `${label} 1440×900 : une carte ne fait pas la colonne (${JSON.stringify(cartes.filter((c) => !near(c.w, COLUMN_MAX)))})`,
    );
    check(
      cartes.every((c) => near(c.cx, WIDE.width / 2)),
      `${label} 1440×900 : une carte n'est pas centrée dans la fenêtre (${JSON.stringify(cartes.filter((c) => !near(c.cx, WIDE.width / 2)))})`,
    );
    check(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${label} 1440×900 : la page défile horizontalement`,
    );
    await capture(page, `feed-column-wide.${scheme}`);

    /* LA FICHE D'UNE PUBLICATION SUIT LA MÊME COLONNE — elle est à UN tap du
       fil, et pleine largeur elle aurait étiré la carte que le fil venait de
       borner. Un seul écran centré sur deux est pire que zéro : l'incohérence
       se voit, la borne non. */
    await page.goto(`${BASE}/post/post-text-rank2`, { waitUntil: 'load' });
    await page.waitForSelector('[data-feed-card]');
    const fiche = await boxOf(page, '#contenu');
    check(
      fiche !== null && near(fiche.width, COLUMN_MAX) && near(fiche.centerX, WIDE.width / 2),
      `${label} 1440×900 : la fiche d'une publication ne suit pas la colonne (${JSON.stringify(fiche)})`,
    );
    await capture(page, `post-detail-column-wide.${scheme}`);
    await context.close();
  }

  // ========================= 3-9. le téléphone : rien n'a changé, et on publie
  {
    const context = await browser.newContext({ viewport: PHONE, colorScheme: scheme, locale: 'fr-FR', hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${BASE}/feed`, { waitUntil: 'load' });
    await page.waitForSelector('[data-feed-card]');

    // ------------------------------------------------- 3. la borne ne mord pas
    const carte = await boxOf(page, '[data-feed-card]');
    check(
      carte !== null && near(carte.width, PHONE.width - 24),
      `${label} 390×844 : la colonne a RÉTRÉCI la carte du téléphone (${carte?.width} ≠ ${PHONE.width - 24})`,
    );

    // --------------------------------- 4. la porte, et les Réels restent à droite
    const porte = await boxOf(page, '[data-feed-create]');
    const reels = await boxOf(page, '[data-feed-reels]');
    check(
      porte !== null && porte.atteint && porte.width >= TAP_FLOOR && porte.height >= TAP_FLOOR,
      `${label} : la porte de création n'est pas atteignable à 44 px (${JSON.stringify(porte)})`,
    );
    check(
      porte !== null && reels !== null && porte.right <= reels.left,
      `${label} : la porte de création n'est pas À GAUCHE de « Lancer les Réels » (${JSON.stringify([porte, reels])})`,
    );
    check(
      reels !== null && PHONE.width - reels.right <= 16,
      `${label} : « Lancer les Réels » n'est plus le contrôle le plus à droite (${PHONE.width - (reels?.right ?? 0)})`,
    );

    // -------------------------------------------- 5. deux lignes, deux adresses
    await page.click('[data-feed-create]');
    await page.waitForSelector('[data-feed-create-choice="reel"]');
    const choix = await page.evaluate(() =>
      [...document.querySelectorAll('[data-feed-create-choice]')].map((el) => ({
        id: el.getAttribute('data-feed-create-choice'),
        href: el.getAttribute('href'),
        tag: el.tagName,
        h: Math.round(el.getBoundingClientRect().height),
      })),
    );
    check(
      choix.length === 2 &&
        choix[0].id === 'post' &&
        choix[0].href === '/posts/new' &&
        choix[1].id === 'reel' &&
        choix[1].href === '/posts/new?type=reel' &&
        choix.every((c) => c.tag === 'A' && c.h >= TAP_FLOOR),
      `${label} : les deux lignes de la porte ne visent pas les deux formats (${JSON.stringify(choix)})`,
    );
    await capture(page, `feed-create-menu.${scheme}`);

    // ------------------------------------- 6. la ligne « Réel » ouvre le format
    await page.click('[data-feed-create-choice="reel"]');
    await page.waitForSelector('[data-post-format]');
    const format = () => page.evaluate(() => document.querySelector('[data-post-format-choice][aria-checked="true"]')?.getAttribute('data-post-format-choice') ?? null);
    check((await format()) === 'REEL', `${label} : la ligne « Réel » n'ouvre pas le composeur au format RÉEL (${await format()})`);

    // ------------------- 7. un réel de texte seul est refusé, en le DISANT
    await page.fill('[data-post-text]', 'un réel de texte seul');
    const refus = await page.evaluate(() => document.querySelector('[data-post-refusal]')?.getAttribute('data-post-refusal') ?? null);
    check(refus === 'reel-without-qualifying-media', `${label} : un réel sans média n'est pas refusé en le disant (${refus})`);
    check(
      await page.evaluate(() => document.querySelector('[data-post-publish]')?.hasAttribute('disabled') === true),
      `${label} : « Publier » reste allumé sur un réel non qualifiant`,
    );
    await capture(page, `post-compose-reel-refus.${scheme}`);

    // ------------- 8. la bascule rallume, retire le format, et GARDE la saisie
    await page.click('[data-post-format-choice="POST"]');
    check((await format()) === 'POST', `${label} : la bascule ne passe pas au format POST`);
    check(
      await page.evaluate(() => document.querySelector('[data-post-text]')?.value === 'un réel de texte seul'),
      `${label} : la bascule de format a PERDU la saisie`,
    );
    check(
      await page.evaluate(() => `${location.pathname}${location.search}`) === '/posts/new',
      `${label} : l'adresse garde le format réel après la bascule (${await page.evaluate(() => location.search)})`,
    );
    check(
      await page.evaluate(() => document.querySelector('[data-post-publish]')?.hasAttribute('disabled') === false),
      `${label} : « Publier » reste éteint sur un post qui porte un texte`,
    );
    await capture(page, `post-compose-post.${scheme}`);

    // ------------------------------------------------- 9. publier ramène au Flux
    await page.click('[data-post-publish]');
    check(
      await page
        .waitForFunction(() => location.pathname === '/feed', undefined, { timeout: 5000 })
        .then(() => true, () => false),
      `${label} : publier ne ramène pas au Flux (${await page.evaluate(() => location.pathname)})`,
    );
    check(errors.length === 0, `${label} : erreurs de page sur le Flux et le composeur — ${errors.join(' | ')}`);
    await context.close();
  }

  // ================================== 10. les Réels, en colonne 9:16 centrée
  for (const viewport of [WIDE, PHONE]) {
    const g = `${label} ${viewport.width}×${viewport.height}`;
    const context = await browser.newContext({ viewport, colorScheme: scheme, locale: 'fr-FR' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${BASE}/reels`, { waitUntil: 'load' });
    await page.waitForSelector('[data-reel-index="0"]');

    const attendu = Math.min(viewport.width, viewport.height * REEL_RATIO);
    const colonne = await boxOf(page, '[data-reels-column]');
    check(
      colonne !== null && near(colonne.width, attendu, 1),
      `${g} : la colonne des Réels ne fait pas hauteur × 9/16 (${colonne?.width} ≠ ${attendu})`,
    );
    check(
      colonne !== null && near(colonne.centerX, viewport.width / 2),
      `${g} : la colonne des Réels n'est pas centrée (${colonne?.centerX} ≠ ${viewport.width / 2})`,
    );

    /* Le « Retour » s'ancre à la COLONNE : au gabarit large, il doit être à
       l'intérieur d'elle, jamais collé au bord de la fenêtre — sinon le
       contrôle part à 460 px du contenu qu'il ferme. */
    const retour = await boxOf(page, '[data-reels-back]');
    check(
      retour !== null && colonne !== null && retour.left >= colonne.left - 0.5 && retour.right <= colonne.right + 0.5,
      `${g} : « Retour » n'est pas ancré à la colonne (${JSON.stringify([retour, colonne])})`,
    );
    check(retour !== null && retour.atteint && retour.width >= TAP_FLOOR, `${g} : « Retour » n'est pas atteignable à 44 px`);
    check(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${g} : la page des Réels défile horizontalement`,
    );
    check(errors.length === 0, `${g} : erreurs de page sur les Réels — ${errors.join(' | ')}`);
    await capture(page, `reels-column.${scheme}.${viewport.width}x${viewport.height}`);
    await context.close();
  }
}

await browser.close();
served.close();

if (failures.length > 0) {
  console.error(`check-feed-column : ${failures.length} échec(s) sur ${invariants} invariants`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `check-feed-column : vert — ${invariants} invariants, 2 schémas : à 1440×900 le chrome du Flux prend la fenêtre (en-tête, ` +
    `plateau, scrollport) pendant que chaque carte fait ${COLUMN_MAX} px centrés, la fiche d’une publication suit, le téléphone ` +
    'est intact à 390×844 ; la porte de création à gauche des Réels qui restent au bord, ses deux formats, le refus nommé d’un ' +
    'réel non qualifiant, la bascule qui garde la saisie, la publication qui ramène au Flux, et les Réels en colonne 9:16 centrée.',
);
