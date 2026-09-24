#!/usr/bin/env node
/**
 * VÉRIFIE LES DEUX PORTES DE MA CELLULE DU RAIL DE STORIES (#6150).
 *
 * Directive porteur du 2026-09-17, mot pour mot : « mettre le bouton (+) au
 * dessus de gauche de l'avatar de l'auteur pour créer une nouvelle story et
 * (bulle pensant) en bas droite pour créer un mood ou afficher le smiley animé
 * du mood en cours comme sous iOS ».
 *
 * CE QU'IL MESURE, ET POURQUOI UN NAVIGATEUR RÉEL
 *
 *  1. LA GÉOGRAPHIE. Le (+) est au-dessus ET au DÉBUT de ligne par rapport au
 *     centre de l'avatar ; la pastille d'humeur est en dessous ET à la FIN.
 *     C'est une mesure de PIXELS : les témoins unitaires ne voient que des
 *     classes, et une classe juste sur un parent non positionné peint les deux
 *     pastilles au même endroit — un défaut qu'aucune assertion de DOM
 *     n'attrape.
 *  2. LES DEUX CIBLES NE SE RECOUVRENT PAS. Deux pastilles sur un même avatar,
 *     c'est LE piège : deux boutons dont les zones de 44 px se chevauchent sont
 *     un seul bouton du point de vue du doigt, et le lecteur d'écran en annonce
 *     deux. On mesure l'intersection des rectangles, pas leur existence.
 *  3. CHAQUE PORTE MÈNE OÙ ELLE DIT. Le (+) ouvre le studio, la pastille ouvre
 *     la composition d'humeur — par un VRAI clic, jamais par la lecture d'un
 *     `href` (un lien peut porter la bonne adresse et être couvert par un
 *     voisin : c'est ce que le point 2 empêche, et ce clic qui le prouve).
 *  4. 💭 SANS HUMEUR, L'EMOJI AVEC — et l'emoji apparaît au retour de la
 *     composition, ce qui mesure la CHAÎNE entière (pastille → écran → choix →
 *     publication → rail) plutôt que deux états posés à la main.
 *  4 bis. HORS LIGNE, PUBLIER EST INERTE. `performMoodPost` refuse hors ligne ;
 *     un bouton resté ACTIF donnerait un clic sans le moindre effet visible —
 *     ni humeur, ni message, ni mouvement. Le réseau est vraiment coupé
 *     (`context.setOffline`), pas simulé par un drapeau : c'est la seule façon
 *     de mesurer ce que le lecteur vivrait.
 *  5. LE RAIL EXISTE QUAND PERSONNE D'AUTRE N'A PUBLIÉ. Miroir
 *     `LentilleRailPolicy.shouldRender(selfEntry:entries:)` — sans lui, un
 *     compte neuf n'aurait AUCUN chemin vers ses deux composeurs.
 *  6. RTL MIROITE LA GÉOGRAPHIE. « haut-gauche » et « bas-droite » nomment un
 *     DÉBUT et une FIN de ligne : en arabe, le (+) doit passer à droite. Une
 *     pose en `left`/`right` passerait les points 1 et 2 et échouerait ici.
 *  7. CLAIR ET SOMBRE RENDENT LA MÊME GÉOMÉTRIE.
 *
 * MUTATION DE CONTRÔLE — remplacer `start-0`/`end-0` par `left-0`/`right-0`
 * dans `story-rail-self-tile.tsx` fait rougir le point 6 et lui seul ;
 * remplacer `absolute` par `static` fait rougir 1 et 2 ensemble.
 */
import { join } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
/* Le serveur vit dans `lib/` depuis #6988 : celui qui était écrit ici
   repliait TOUT sur `index.html`, y compris un `/assets/*.js` dont la lecture
   échouait — le navigateur rendait alors « Failed to fetch dynamically imported
   module » pour une panne transitoire, sans aucune trace au journal. */
const served = await startDistServer(DIST);
const BASE = served.base;

const failures = [];
let invariants = 0;
const check = (ok, what) => {
  invariants += 1;
  if (!ok) failures.push(what);
};

const MIN_TARGET = 44;
const round = (v) => Math.round(v * 100) / 100;

/** La session SEMÉE — le rail n'offre ses deux portes qu'à un lecteur
 * IDENTIFIÉ, et `main.tsx` lit `localStorage` à l'IMPORT : sans elle, aucune
 * cellule à mesurer (et le gate serait vert par ABSENCE). */
const SEEDED_SESSION = JSON.stringify({
  token: 'gate-token',
  sessionToken: 'gate-session',
  user: { id: 'u-viewer', username: 'viewer-gate' },
  expiresAt: Date.now() + 3_600_000,
});

const boxOf = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  }, selector);

const overlap = (a, b) => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? round(w * h) : 0;
};

const browser = await launchChromium();

const CELL = 'li[data-story-self]';
const CREATE = '[data-self-create]';
const MOOD = '[data-self-mood]';
/** Le DISQUE peint, distinct de la CIBLE ci-dessus (#7449). */
const CREATE_DISC = '[data-self-create-disc]';
const MOOD_DISC = '[data-self-mood-disc]';

async function openList(context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForSelector(CELL, { timeout: 8000 });
  return { page, errors };
}

async function runScheme({ colorScheme, locale, dir }) {
  const tag = `[${colorScheme} ${locale} ${dir}]`;
  const context = await browser.newContext({
    colorScheme,
    locale,
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  await context.addInitScript((session) => {
    localStorage.setItem('meeshy.session', session);
  }, SEEDED_SESSION);
  /**
   * `dir` EST POSÉ PAR CE GATE, ET C'EST UN AVEU À FAIRE À VOIX HAUTE :
   * **web-v2 ne pose `dir="rtl"` NULLE PART** (mesuré le 2026-09-17 —
   * `index.html` porte `<html lang="fr">` sans `dir`, et ni le script inline
   * de langue ni `interface-language.ts` ne le touchent). Une locale `ar` seule
   * laisse donc le document en LTR : sans cette pose, ce gate mesurerait la
   * géographie LTR sous un nom arabe et rendrait un verdict sans rapport.
   *
   * Ce qu'il prouve reste donc exactement ce qu'il doit prouver ici : que MA
   * géographie est écrite en propriétés LOGIQUES et miroite d'elle-même le jour
   * où l'application posera `dir`. Que l'application ne le pose pas est une
   * dette GLOBALE, à son issue — pas quelque chose qu'un lot de rail corrige en
   * passant, et surtout pas quelque chose qu'un gate doit cacher.
   */
  await context.addInitScript((d) => {
    /* `documentElement` est NULL au moment où un script d'initialisation
       s'exécute (le document n'a pas encore d'élément racine) : la pose doit
       attendre `DOMContentLoaded`, sinon elle lève — et une erreur de page est
       un échec de ce gate, à juste titre. */
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.dir = d;
    });
  }, dir);
  const { page, errors } = await openList(context);

  /* ── 1. LA GÉOGRAPHIE, EN PIXELS ───────────────────────────────────────── */
  const anneau = await boxOf(page, `${CELL} [data-anneau]`);
  const plus = await boxOf(page, CELL + ' ' + CREATE);
  const humeur = await boxOf(page, CELL + ' ' + MOOD);

  check(anneau !== null, `${tag} : aucun anneau dans ma cellule`);
  check(plus !== null, `${tag} : aucun badge de création [data-self-create]`);
  check(humeur !== null, `${tag} : aucune pastille d'humeur [data-self-mood]`);

  if (anneau !== null && plus !== null && humeur !== null) {
    check(plus.cy < anneau.cy, `${tag} : le (+) doit être AU-DESSUS du centre de l'avatar — ${round(plus.cy)} / ${round(anneau.cy)}`);
    check(
      humeur.cy > anneau.cy,
      `${tag} : la pastille d'humeur doit être EN DESSOUS du centre — ${round(humeur.cy)} / ${round(anneau.cy)}`,
    );

    /* DÉBUT / FIN de ligne, jamais gauche / droite : c'est ce qui rend la
       mesure valable dans les deux sens d'écriture (point 6). */
    const versLaFin = dir === 'rtl' ? -1 : 1;
    check(
      (plus.cx - anneau.cx) * versLaFin < 0,
      `${tag} : le (+) doit être au DÉBUT de ligne (${dir}) — ${round(plus.cx)} / ${round(anneau.cx)}`,
    );
    check(
      (humeur.cx - anneau.cx) * versLaFin > 0,
      `${tag} : la pastille d'humeur doit être à la FIN de ligne (${dir}) — ${round(humeur.cx)} / ${round(anneau.cx)}`,
    );

    /* ── 2. DEUX CIBLES, ET ELLES NE SE TOUCHENT PAS ──────────────────── */
    check(
      plus.width >= MIN_TARGET && plus.height >= MIN_TARGET,
      `${tag} : le (+) doit se toucher sur ${MIN_TARGET} px — ${round(plus.width)}×${round(plus.height)}`,
    );
    check(
      humeur.width >= MIN_TARGET && humeur.height >= MIN_TARGET,
      `${tag} : l'humeur doit se toucher sur ${MIN_TARGET} px — ${round(humeur.width)}×${round(humeur.height)}`,
    );
    check(overlap(plus, humeur) === 0, `${tag} : les deux cibles se recouvrent sur ${overlap(plus, humeur)} px²`);

    /* ── 2 bis. LA CIBLE N'EST PAS LE DISQUE (#7449) ────────────────────
       `width: badge` et `minWidth: 44` vivaient sur le MÊME élément, celui qui
       portait le fond : le minimum gagnait et le (+) était PEINT à 44 px sur
       un anneau de 94 — presque la moitié du visage. Le doc-comment du
       composant promettait pourtant « MESURE ~26, TOUCHE 44 » depuis toujours.
       Un contrôle de CIBLE ne peut pas attraper ça : il mesure la même boîte,
       et 44 est la réponse juste. Celui-ci mesure ce qui est PEINT. */
    for (const [quoi, prise] of [['(+)', CREATE_DISC], ["l'humeur", MOOD_DISC]]) {
      const disque = await boxOf(page, prise);
      check(
        disque !== null && disque.width < MIN_TARGET && disque.width >= 12,
        `${tag} : le disque de ${quoi} n'est pas peint à SA taille (${disque === null ? 'absent' : round(disque.width)}, cible ${MIN_TARGET})`,
      );
    }
  }

  /* ── 3. DEUX LIBELLÉS DISTINCTS, ET AUCUN VIDE ────────────────────────── */
  const labels = await page.evaluate(
    ([c, m]) => [
      document.querySelector(c)?.getAttribute('aria-label') ?? null,
      document.querySelector(m)?.getAttribute('aria-label') ?? null,
    ],
    [CREATE, MOOD],
  );
  check(labels[0] !== null && labels[0] !== '', `${tag} : le (+) n'a pas d'aria-label`);
  check(labels[1] !== null && labels[1] !== '', `${tag} : l'humeur n'a pas d'aria-label`);
  check(labels[0] !== labels[1], `${tag} : les deux pastilles portent le MÊME libellé — « ${labels[0]} »`);

  /* ── 4. 💭 TANT QU'AUCUNE HUMEUR N'EST POSÉE ──────────────────────────── */
  const avant = await page.evaluate(
    (m) => ({
      mood: document.querySelector(m)?.getAttribute('data-mood') ?? null,
      texte: document.querySelector(m)?.textContent ?? '',
      anime: document.querySelector(`${m} [data-mood-animates]`) !== null,
    }),
    MOOD,
  );
  check(avant.mood === null, `${tag} : aucune humeur n'est posée, data-mood devrait être absent — « ${avant.mood} »`);
  check(avant.texte.includes('\u{1F4AD}'), `${tag} : sans humeur, la pastille doit rendre 💭 — « ${avant.texte} »`);
  check(!avant.anime, `${tag} : rien ne doit respirer quand il n'y a pas d'humeur`);

  /* ── 5. CHAQUE PORTE MÈNE OÙ ELLE DIT — par un VRAI clic ──────────────── */
  await page.click(CELL + ' ' + CREATE);
  await page.waitForFunction(() => location.pathname === '/stories/new', { timeout: 8000 });
  check(true, `${tag} : le (+) ouvre le studio de story`);

  await page.goBack();
  await page.waitForSelector(CELL, { timeout: 8000 });
  await page.click(CELL + ' ' + MOOD);
  await page.waitForFunction(() => location.pathname === '/status/new', { timeout: 8000 });
  check(true, `${tag} : la pastille ouvre la composition d'humeur`);

  /* ── 6. LA CHAÎNE COMPLÈTE — choisir, publier, revoir l'emoji ─────────── */
  await page.waitForSelector('[data-mood-grid]', { timeout: 8000 });
  await page.click('[data-mood-choice="\u{1F389}"]');
  const publishable = await page.evaluate(() => document.querySelector('[data-mood-publish]')?.disabled ?? null);
  check(publishable === false, `${tag} : Publier doit s'activer une fois l'humeur choisie — ${publishable}`);

  /* ── 6 bis. HORS LIGNE, PUBLIER EST INERTE (loi 4) ────────────────────
     `performMoodPost` refuse hors ligne : un bouton resté ACTIF donnerait un
     clic sans effet visible. On coupe le réseau, on vérifie que le bouton
     s'éteint et que l'état hors ligne est DESSINÉ, puis on rebranche. */
  await context.setOffline(true);
  await page.waitForFunction(() => document.querySelector('[data-mood-publish]')?.disabled === true, { timeout: 8000 });
  check(
    await page.evaluate(() => document.querySelector('[data-mood-offline]') !== null),
    `${tag} : hors ligne, l'état doit être DESSINÉ, pas seulement subi`,
  );
  await context.setOffline(false);
  await page.waitForFunction(() => document.querySelector('[data-mood-publish]')?.disabled === false, { timeout: 8000 });
  check(true, `${tag} : le réseau revenu, Publier se rallume`);

  await page.click('[data-mood-publish]');

  await page.waitForSelector(`${MOOD}[data-mood]`, { timeout: 8000 });
  const apres = await page.evaluate(
    (m) => ({
      mood: document.querySelector(m)?.getAttribute('data-mood') ?? null,
      anime: document.querySelector(`${m} [data-mood-animates="true"]`) !== null,
    }),
    MOOD,
  );
  check(apres.mood === '\u{1F389}', `${tag} : l'humeur posée doit apparaître sur ma pastille — « ${apres.mood} »`);
  check(apres.anime, `${tag} : l'emoji de l'humeur EN COURS doit respirer (directive porteur)`);

  check(errors.length === 0, `${tag} : erreurs de page — ${errors.join(' | ')}`);

  const geometry =
    anneau === null || plus === null || humeur === null
      ? null
      : {
          plus: { dx: round(plus.cx - anneau.cx), dy: round(plus.cy - anneau.cy) },
          humeur: { dx: round(humeur.cx - anneau.cx), dy: round(humeur.cy - anneau.cy) },
        };

  await context.close();
  return geometry;
}

const clair = await runScheme({ colorScheme: 'light', locale: 'fr-FR', dir: 'ltr' });
const sombre = await runScheme({ colorScheme: 'dark', locale: 'fr-FR', dir: 'ltr' });
check(
  JSON.stringify(clair) === JSON.stringify(sombre),
  `clair et sombre ne rendent pas la même géométrie — ${JSON.stringify(clair)} / ${JSON.stringify(sombre)}`,
);

/* LE MIROIR RTL — en arabe, « haut-gauche » devient haut-DROITE. Les deux
   décalages horizontaux doivent s'inverser exactement ; une pose en
   `left`/`right` les laisserait identiques, et ce gate le dirait. */
const rtl = await runScheme({ colorScheme: 'light', locale: 'ar', dir: 'rtl' });
if (clair !== null && rtl !== null) {
  check(
    Math.sign(rtl.plus.dx) === -Math.sign(clair.plus.dx),
    `RTL : le (+) n'a pas miroité — ltr ${clair.plus.dx} / rtl ${rtl.plus.dx}`,
  );
  check(
    Math.sign(rtl.humeur.dx) === -Math.sign(clair.humeur.dx),
    `RTL : la pastille d'humeur n'a pas miroité — ltr ${clair.humeur.dx} / rtl ${rtl.humeur.dx}`,
  );
  check(
    rtl.plus.dy === clair.plus.dy && rtl.humeur.dy === clair.humeur.dy,
    `RTL : la VERTICALE ne doit pas bouger — ltr ${JSON.stringify(clair)} / rtl ${JSON.stringify(rtl)}`,
  );
}

await browser.close();
served.close();

if (failures.length > 0) {
  console.error(`check-story-self-rail : ${failures.length} échec(s) sur ${invariants} invariants`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `check-story-self-rail : vert — ${invariants} invariants : ma cellule porte DEUX pastilles distinctes, le (+) au-dessus au ` +
    "début de ligne et l'humeur en dessous à la fin, deux cibles de 44 px qui ne se recouvrent pas, deux aria-label distincts, " +
    '💭 tant qu\'aucune humeur n\'est posée, le (+) ouvre le studio et la pastille la composition d\'humeur (vrais clics), ' +
    "Publier s'éteint quand le réseau tombe et se rallume à son retour, l'humeur choisie revient sur la pastille et y " +
    'respire — clair, sombre et RTL miroité.',
);
