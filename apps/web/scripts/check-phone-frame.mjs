#!/usr/bin/env node
/**
 * SUR UN TÉLÉPHONE, LE CADRE NE DÉFILE JAMAIS DE CÔTÉ, ET LA CONNEXION TIENT
 * DANS LA VUE (#8418).
 *
 * Signalé par le porteur le 2026-09-27 depuis son smartphone, sur meeshy.me :
 * « la page qui demande de se connecter ne prend pas toute la page, on doit
 * scroller la scène ; il en va de même sur toutes les autres pages ; il faut
 * éviter de faire scroller tout le frame horizontalement ».
 *
 * POURQUOI LE GATE D'ACCÈS NE L'A PAS VU. `check-access-column.mjs` mesure
 * `document.documentElement.scrollWidth` à 390 px, et il avait raison : le
 * DOCUMENT ne débordait jamais. Chaque écran de la v2 est une racine `h-dvh`
 * qui porte SON propre défilement (`overflow-y-auto`) — et `overflow-y: auto`
 * rend `overflow-x` défilant lui aussi (CSS Overflow 3 : un axe `visible` en
 * face d'un axe défilant se calcule `auto`). Un contenu trop large ne pousse
 * donc pas la page : il fait défiler de côté la COLONNE entière, que le doigt
 * emporte. Le témoin mesure ici chaque conteneur défilant, pas le seul
 * document.
 *
 * CE QU'IL MESURE, pour chaque adresse servie (écrans du routeur et documents
 * institutionnels, lus par `v31Routes()` — un écran ajouté demain entre sous
 * garde sans que personne y pense), à 320 × 568, 375 × 667 et 390 × 844 :
 *
 *   1. le document ne défile pas horizontalement ;
 *   2. aucun conteneur défilant ne défile horizontalement, SAUF une BANDE —
 *      un conteneur qui coupe son axe vertical, ou qui (lui ou son unique
 *      enfant) se range en LIGNE (`flex` en rangée sans retour, ou `grid` en
 *      flux de colonnes) : le plateau des stories,
 *      les filtres, le carrousel d'un post sont faits pour glisser de côté.
 *      Une colonne qui déborde nomme son COUPABLE (l'élément le plus
 *      extérieur qui dépasse son bord), jamais le seul symptôme ;
 *   3. chaque champ de saisie visible est écrit à 16 px au moins. Sous ce
 *      seuil, Safari iOS ZOOME la page au focus et ne la rend jamais : le
 *      cadre entier se met alors à glisser de côté, sur l'écran touché ET sur
 *      tous ceux que l'on ouvre ensuite — le symptôme exact du signalement,
 *      que Chromium ne reproduit pas ;
 *
 * et, pour la connexion (porte par défaut ET porte du mot de passe), à
 * 375 × 667 (iPhone SE, le plus petit téléphone courant) :
 *
 *   4. rien ne défile : l'écran tient entier dans la vue.
 *
 * GARDES DE VACUITÉ — un témoin d'absence est vert sur une page vide : chaque
 * adresse doit avoir peint au moins un contenu perceptible, et le relevé doit
 * avoir mesuré au moins un champ de saisie et au moins une bande.
 */
import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';
import { waitForValueSettled } from './lib/settle-value.mjs';
import { v31Routes } from './lib/v31-routes.mjs';

const TELEPHONES = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
];
const IPHONE_SE = { width: 375, height: 667 };
const TOLERANCE = 1;
const CHAMP_MIN_PX = 16;

/** Une valeur plausible du corpus pour chaque paramètre d'adresse — un écran
 * « introuvable » reste un écran, et il doit tenir dans le cadre lui aussi. */
const EXEMPLES = {
  conversation: 'c-salon-riviere',
  post: 'post-mine',
  username: 'kwame-mensah',
  tag: 'meeshy',
  link: 'mshy_inconnu',
  callId: 'call-amina-manque',
  community: 'communaute-inconnue',
  token: 'jeton-du-temoin',
  user: 'membre-inconnu',
  participant: 'participant-inconnu',
};

const concretise = (pattern) =>
  pattern.replace(/:([A-Za-z0-9_]+)/g, (_, nom) => {
    const valeur = EXEMPLES[nom];
    if (valeur === undefined) throw new Error(`check-phone-frame : aucun exemple pour le paramètre « ${nom} » de ${pattern}`);
    return valeur;
  });

const ADRESSES = v31Routes().map(({ url }) => concretise(url));
const CONNEXION = ['/login', '/login?methode=password'];

const DIST = new URL('../dist/', import.meta.url).pathname;
const served = await startDistServer(DIST, { serviceWorker: false });
const BASE = served.base;

const browser = await launchChromium();
const failures = [];
const constate = (vrai, quoi) => {
  if (!vrai) failures.push(quoi);
};
const bilan = { mesures: 0, champs: 0, bandes: 0 };

/** Le relevé, dans la page — voir le doc-comment de tête. */
const releve = () => {
  const vw = document.documentElement.clientWidth;
  const visible = (el) => {
    if (el.closest('[aria-hidden="true"]') !== null) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none';
  };
  const nom = (el) => {
    const id = el.id === '' ? '' : `#${el.id}`;
    const classes = [...el.classList].slice(0, 6).join('.');
    return `${el.tagName.toLowerCase()}${id}${classes === '' ? '' : `.${classes}`}`;
  };
  const enLigne = (el) => {
    const s = getComputedStyle(el);
    if (s.display.endsWith('flex')) return s.flexDirection.startsWith('row') && s.flexWrap === 'nowrap';
    if (s.display.endsWith('grid')) return s.gridAutoFlow.startsWith('column');
    return false;
  };
  /* Un conteneur qui COUPE son axe vertical (`overflow-y: hidden | clip`) ne
     défile, par déclaration, que de côté : c'est une bande, quel que soit
     l'agencement de ses enfants (le carrousel d'un post pose ses pages en
     absolu). */
  const verticalCoupe = (el) => /(hidden|clip)/.test(getComputedStyle(el).overflowY);
  const estBande = (el) => verticalCoupe(el) || enLigne(el) || (el.children.length === 1 && enLigne(el.children[0]));
  const defileEnX = (el) => /(auto|scroll)/.test(getComputedStyle(el).overflowX);

  /** L'élément le plus EXTÉRIEUR qui dépasse le bord droit du conteneur. */
  const coupables = (conteneur) => {
    const bord = conteneur.getBoundingClientRect().right + 0.5;
    const depasse = (el) => el.getBoundingClientRect().right > bord;
    return [...conteneur.querySelectorAll('*')]
      .filter((el) => visible(el) && depasse(el) && (el.parentElement === conteneur || !depasse(el.parentElement)))
      .slice(0, 3)
      .map((el) => `${nom(el)} (bord droit ${Math.round(el.getBoundingClientRect().right)} px)`);
  };

  const colonnes = [];
  let bandes = 0;
  for (const el of document.querySelectorAll('body *')) {
    if (!defileEnX(el) || el.scrollWidth <= el.clientWidth + 1) continue;
    if (estBande(el)) {
      bandes += 1;
      continue;
    }
    colonnes.push({ conteneur: nom(el), debord: el.scrollWidth - el.clientWidth, coupables: coupables(el) });
  }

  const champs = [
    ...document.querySelectorAll(
      'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="color"]):not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select, [contenteditable="true"], [contenteditable=""]',
    ),
  ].filter(visible);
  const petits = champs
    .map((el) => ({ el, taille: parseFloat(getComputedStyle(el).fontSize) }))
    .filter(({ taille }) => taille < 16)
    .map(({ el, taille }) => `${nom(el)} à ${taille} px`);

  const defileEnY = [...document.querySelectorAll('body *')]
    .filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1)
    .map((el) => ({ conteneur: nom(el), debord: el.scrollHeight - el.clientHeight }));
  const documentY = document.documentElement.scrollHeight - innerHeight;
  if (documentY > 1) defileEnY.push({ conteneur: 'document', debord: documentY });

  const perceptible = [...document.querySelectorAll('body *')].some(
    (el) => visible(el) && ([...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '') || el.matches('input, button, a, img, svg, video, canvas')),
  );

  return {
    chemin: location.pathname + location.search,
    documentX: document.documentElement.scrollWidth - vw,
    colonnes,
    bandes,
    champs: champs.length,
    petits,
    defileEnY,
    perceptible,
  };
};

const cors = (request) => ({
  'access-control-allow-origin': request.headers().origin ?? '*',
  'access-control-allow-credentials': 'true',
});

const ouvre = async (viewport) => {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await context.route('**/*', (route) => {
    const request = route.request();
    if (new URL(request.url()).origin === BASE) return route.continue();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(request) });
    return route.abort();
  });
  return context;
};

const mesure = async (context, adresse) => {
  const page = await context.newPage();
  await page.goto(`${BASE}${adresse}`, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const m = await waitForValueSettled(page, releve);
  await page.close();
  return m;
};

try {
  for (const viewport of TELEPHONES) {
    const gabarit = `${viewport.width}×${viewport.height}`;
    const context = await ouvre(viewport);
    for (const adresse of ADRESSES) {
      const tag = `${adresse} @ ${gabarit}`;
      const m = await mesure(context, adresse);
      if (m === undefined) {
        constate(false, `${tag} : le relevé ne s'est jamais stabilisé — le témoin ne mesure rien`);
        continue;
      }
      bilan.mesures += 1;
      bilan.champs += m.champs;
      bilan.bandes += m.bandes;
      constate(m.perceptible, `${tag} : aucun contenu perceptible — le témoin ne mesure rien (${m.chemin})`);
      constate(m.documentX <= TOLERANCE, `${tag} : la page défile horizontalement (${m.documentX} px de trop, ${m.chemin})`);
      for (const c of m.colonnes) {
        constate(false, `${tag} : ${c.conteneur} défile de côté (${c.debord} px de trop, ${m.chemin}) — coupable : ${c.coupables.join(' · ') || 'introuvable'}`);
      }
      for (const p of m.petits) {
        constate(false, `${tag} : champ ${p} — sous ${CHAMP_MIN_PX} px, Safari iOS zoome au focus et le cadre glisse de côté (${m.chemin})`);
      }
    }
    await context.close();
  }

  const context = await ouvre(IPHONE_SE);
  for (const adresse of CONNEXION) {
    const tag = `${adresse} @ ${IPHONE_SE.width}×${IPHONE_SE.height}`;
    const m = await mesure(context, adresse);
    if (m === undefined) {
      constate(false, `${tag} : le relevé ne s'est jamais stabilisé`);
      continue;
    }
    constate(m.champs > 0, `${tag} : aucun champ mesuré — ce n'est pas l'écran de connexion (${m.chemin})`);
    for (const y of m.defileEnY) {
      constate(false, `${tag} : l'écran de connexion ne tient pas dans la vue — ${y.conteneur} défile de ${y.debord} px`);
    }
  }
  await context.close();
} finally {
  await browser.close();
  served.close();
}

constate(bilan.champs > 0, 'aucun champ de saisie mesuré sur toutes les adresses — la règle des 16 px ne mesure rien');
constate(bilan.bandes > 0, 'aucune bande horizontale rencontrée — l’exemption des bandes ne se prouve sur rien');

if (failures.length > 0) {
  console.error(`\ncheck-phone-frame : ${failures.length} échec(s)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `\ncheck-phone-frame : vert — ${ADRESSES.length} adresses × ${TELEPHONES.length} téléphones (${bilan.mesures} relevés, ${bilan.champs} champs, ${bilan.bandes} bandes) : ` +
    `aucun cadre ne défile de côté, aucun champ sous ${CHAMP_MIN_PX} px, la connexion tient dans ${IPHONE_SE.width}×${IPHONE_SE.height}.\n`,
);
