#!/usr/bin/env node
/**
 * VÉRIFIE LE CRITÈRE BINAIRE DE LA LENTILLE : le flux ne bouge JAMAIS au
 * défilement.
 *
 * Le porteur a posé l'arbitrage en ces termes — « le flux ne bouge jamais au
 * défilement, ou on garde les cartes ». Il n'y a donc pas de demi-mesure à
 * mesurer : soit la position de mise en page de chaque rangée est invariable
 * pendant tout le défilement, soit la peau plate ne tient pas sa promesse et
 * les cartes valaient mieux.
 *
 * CE QU'IL MESURE
 *
 * 1. `offsetTop` de chaque case, AVANT et PENDANT le défilement. C'est la
 *    position de MISE EN PAGE — celle qu'un changement de hauteur, de marge ou
 *    de padding déplacerait. Elle doit être identique au pixel près.
 * 2. La hauteur de chaque case : 84, toujours, magnifiée ou non.
 * 3. Que la magnification opère bien — sans quoi le test 1 serait trivialement
 *    vert sur une liste qui ne fait rien.
 * 4. Que seuls `transform` et `opacity` diffèrent d'une rangée à l'autre.
 * 5. Que `prefers-reduced-motion` rend toutes les opacités à 1 — et que
 *    l'élection SURVIT : on perd le relief, jamais le repère.
 * 6. L'APLATISSEMENT AU REPOS (#5694, écart 2) — au bout de
 *    `SCENE_REST_DELAY_MS` + `SCENE_FLATTEN_DURATION_MS` d'immobilité,
 *    `opacity === 1` sur TOUTES les rangées et plus AUCUNE magnifiée ; un
 *    nouveau défilement réarme.
 *
 * POURQUOI UN NAVIGATEUR RÉEL. Rien de tout cela n'est observable dans un
 * test unitaire : la loi peut être juste et la peau la trahir, en animant une
 * propriété de mise en page. C'est la mesure de `offsetTop` sous défilement
 * réel qui tranche, et elle seule.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { launchChromium } from './lib/browser.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  const p = normalize(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
  for (const f of [join(DIST, p), join(DIST, `${p}.html`), join(DIST, p, 'index.html'), join(DIST, 'index.html')]) {
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
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await launchChromium();

const failures = [];
const constate = (ok, what) => {
  if (!ok) failures.push(what);
};

/** La géométrie de MISE EN PAGE de chaque case — jamais son apparence. */
const geometrie = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-row]')].map((li) => ({
      id: li.dataset.row,
      haut: li.offsetTop,
      height: li.offsetHeight,
    })),
  );

const apparence = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-row]')].map((li) => {
      const v = li.firstElementChild;
      const s = getComputedStyle(v);
      return { id: li.dataset.row, opacity: Number(s.opacity), transform: s.transform };
    }),
  );

// ---------------------------------------------------------------- mouvement normal
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'load' });
await page.waitForSelector('[data-row]');
await page.waitForTimeout(300);

const before = await geometrie(page);
constate(before.length > 0, 'aucune rangée rendue — la liste est vide');
constate(
  before.every((r) => r.height === 84),
  `une case ne mesure pas 84 : ${JSON.stringify(before.filter((r) => r.height !== 84))}`,
);

/**
 * §5.9 de la spécification #5676 (D-23) — l'aperçu de liste de la Salle
 * sécurisée (`c-protection`) NE SERT JAMAIS son sujet flouté : la rangée
 * annonce « 1 message caché », jamais le texte protégé.
 */
const protectedRow = await page.evaluate(() => {
  const li = document.querySelector('[data-row="c-protection"]');
  return li === null ? null : li.textContent ?? '';
});
constate(protectedRow !== null, 'la rangée « c-protection » est introuvable dans la Lentille');
constate(
  protectedRow !== null && !protectedRow.includes('7741'),
  `la rangée « c-protection » fuit le sujet du message flouté : ${JSON.stringify(protectedRow)}`,
);
constate(
  protectedRow !== null && protectedRow.includes('1 message caché'),
  `la rangée « c-protection » ne dit pas « 1 message caché » : ${JSON.stringify(protectedRow)}`,
);

/**
 * #5780 — une conversation SANS HISTORIQUE (`lastMessage` absent, aucun
 * message jamais envoyé) ne doit jamais rendre une ligne 2 vide : elle dit
 * « Nouvelle conversation », et l'heure de création reste servie
 * (`lastMessageAt` n'est jamais absent sur le wire — `schema.prisma:495`).
 */
const nouvelleRow = await page.evaluate(() => {
  const li = document.querySelector('[data-row="c-nouvelle"]');
  if (li === null) return null;
  return { text: li.textContent ?? '', hasTime: li.querySelector('[data-time]') !== null };
});
constate(nouvelleRow !== null, 'la rangée « c-nouvelle » (conversation sans historique) est introuvable dans la Lentille');
constate(
  nouvelleRow !== null && nouvelleRow.text.includes('Nouvelle conversation'),
  `la rangée « c-nouvelle » ne dit pas « Nouvelle conversation » : ${JSON.stringify(nouvelleRow?.text)}`,
);
constate(
  nouvelleRow !== null && nouvelleRow.hasTime,
  'la rangée « c-nouvelle » ne montre aucune heure — lastMessageAt devrait pourtant toujours être servi',
);

/**
 * LE RAIL NE DÉPLACE PAS LA LISTE, PARCE QUE SA HAUTEUR NE VARIE JAMAIS
 * (#6070, révisé #6080).
 *
 * L'invariant de MISE EN PAGE ci-dessous (`moves.length === 0`) serait
 * trivialement vert sur un rail qui prendrait toute la place et n'en
 * bougerait plus — c'est la régression inverse, et elle a EU LIEU : le rail
 * partait à 88 px de tuile, soit un huitième de l'écran pour trois entrées,
 * et la liste commençait sous la ligne de flottaison.
 *
 * #6070 y répondait par une COMPACTION au défilement (88 → 37 px), compensée
 * par une tuile fantôme pour que le flux ne bouge pas. #6080 tranche par la
 * cote : le rail des stories porte celle d'iOS — `LentilleMetrics.Rail.size`
 * = 48 px — et ne compacte plus du tout. Une hauteur qui ne varie pas ne peut
 * rien pousser ; il n'y a plus de fantôme à tenir.
 *
 * Ce qui reste à GARDER est donc la PROPRIÉTÉ, pas le mécanisme : la tuile
 * part à la cote iOS, et elle y RESTE après défilement. Les deux bornes
 * attrapent les deux régressions — un rail qui regrossit, et un rail qui se
 * remet à varier.
 *
 * (La bande compacte épinglée d'iOS — `PinnedStoryTrailBand`, anneaux à 36 dans
 * l'en-tête replié — n'est portée par aucune des deux versions : c'est l'écart
 * restant, suivi par #6121, pas une régression de ce lot.)
 */
const COTE_RAIL_IOS = 48;
const railWidthBefore = await page.evaluate(
  () => document.querySelector('[data-story-tile]')?.getBoundingClientRect().width ?? null,
);
constate(railWidthBefore !== null, "aucune tuile de story trouvée ([data-story-tile]) avant défilement");
constate(
  railWidthBefore !== null && Math.abs(railWidthBefore - COTE_RAIL_IOS) <= 1,
  `la tuile du rail ne porte pas la cote iOS (${COTE_RAIL_IOS} px) : ${railWidthBefore}`,
);

/** On défile PAR PALIERS, en relevant la géométrie à chaque, et on la compare. */
const readings = [];
for (const y of [40, 120, 240, 400, 600]) {
  await page.evaluate((v) => document.getElementById('contenu')?.scrollTo({ top: v }), y);
  await page.waitForTimeout(90);
  readings.push({ y, geo: await geometrie(page), app: await apparence(page) });
}

for (const { y, geo } of readings) {
  const moves = geo.filter((r, i) => before[i] === undefined || r.haut !== before[i].haut || r.height !== before[i].height);
  constate(
    moves.length === 0,
    `à ${y} px de défilement, ${moves.length} case(s) ont bougé en MISE EN PAGE — ` +
      `${JSON.stringify(moves.slice(0, 3))}`,
  );
}

/** Après défilement, la cote n'a pas bougé — c'est ce qui rend le fantôme inutile. */
const railWidthAfter = await page.evaluate(
  () => document.querySelector('[data-story-tile]')?.getBoundingClientRect().width ?? null,
);
constate(railWidthAfter !== null, "aucune tuile de story trouvée ([data-story-tile]) après défilement");
constate(
  railWidthAfter !== null && railWidthAfter === railWidthBefore,
  `la cote du rail a varié pendant le défilement (${railWidthBefore} → ${railWidthAfter}) — ` +
    `une hauteur qui varie repousse la liste`,
);

/**
 * Le témoin 3 : la magnification opère. Sans lui, tout ce qui précède serait
 * vert sur une liste qui ne fait strictement rien — le piège classique d'un
 * témoin d'invariance.
 */
const seenOpacities = new Set(readings.flatMap((r) => r.app.map((a) => a.opacity.toFixed(3))));
constate(seenOpacities.size > 1, "la perspective n'opère pas : toutes les opacités sont identiques");

const seenTransforms = new Set(readings.flatMap((r) => r.app.map((a) => a.transform)));
constate(seenTransforms.size > 1, "aucune transformation n'a varié pendant le défilement");

const magnified = await page.evaluate(
  () => document.querySelectorAll('[aria-hidden="false"].lens-extra').length,
);
constate(magnified > 0, "aucune rangée n'est magnifiée après défilement");

/**
 * L'APLATISSEMENT AU REPOS (#5694, écart 2) — miroir
 * `LentilleSceneActivity.flatten()` : après `SCENE_REST_DELAY_MS` (4,5 s) +
 * `SCENE_FLATTEN_DURATION_MS` (0,45 s) d'immobilité, TOUTES les rangées
 * reviennent à l'identité (`opacity === 1`) et plus AUCUNE n'est magnifiée
 * — la carte élue redevient une rangée comme les autres, quelle que soit sa
 * distance à la bande de focus au moment de l'arrêt. Puis un nouveau
 * défilement RÉARME la magnification — l'élection survit au repos, elle ne
 * disparaît pas.
 */
await page.waitForTimeout(4_500 + 450 + 250);
const restAppearance = await apparence(page);
constate(
  restAppearance.every((a) => a.opacity === 1),
  `au repos, ${restAppearance.filter((a) => a.opacity !== 1).length} rangée(s) restent estompées : ` +
    `${JSON.stringify(restAppearance.filter((a) => a.opacity !== 1))}`,
);
const magnifiedAtRest = await page.evaluate(
  () => document.querySelectorAll('[aria-hidden="false"].lens-extra').length,
);
constate(magnifiedAtRest === 0, `au repos, ${magnifiedAtRest} rangée(s) restent magnifiées`);

await page.evaluate(() => document.getElementById('contenu')?.scrollTo({ top: 200 }));
await page.waitForTimeout(300);
const magnifiedAfterReturn = await page.evaluate(
  () => document.querySelectorAll('[aria-hidden="false"].lens-extra').length,
);
constate(magnifiedAfterReturn > 0, 'un nouveau défilement ne réarme pas la magnification après aplatissement');

await page.close();
await context.close();

// -------------------------------------------------------- stickers collants
/**
 * LES STICKERS DE SECTION SONT COLLANTS (#5694, écart 6) — `position:
 * sticky` posé par `LensSticker`, jamais un second conteneur de défilement.
 * Contexte SÉPARÉ (page neuve) pour ne pas perturber la machine à états du
 * témoin précédent (aplatissement, magnification).
 */
const stickyContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const stickyPage = await stickyContext.newPage();
await stickyPage.goto(`${BASE}/`, { waitUntil: 'load' });
await stickyPage.waitForSelector('[data-sticker]');
await stickyPage.waitForTimeout(200);

const stickyAtRest = await stickyPage.evaluate(() => {
  const first = document.querySelector('[data-sticker]');
  return first === null ? null : { position: getComputedStyle(first).position };
});
constate(stickyAtRest !== null, 'aucun sticker de section trouvé — la Lentille ne rend aucune section');
constate(
  stickyAtRest !== null && stickyAtRest.position === 'sticky',
  `le sticker déclare position: sticky (${stickyAtRest?.position})`,
);

/**
 * LE BALAYAGE — un palier FIXE ne prouve rien ici : selon le corpus, 600 px
 * peut tomber dans la QUEUE de liste (sous la dernière section), où aucun
 * en-tête ne colle et où le témoin rougissait à tort. On parcourt donc TOUTE
 * la hauteur de défilement et on relève plusieurs faits d'un coup :
 *
 *  · un en-tête COLLE bien à un moment, et pas seulement au palier `y = 0`
 *    (#5694, correction défaut 4) — au premier palier, un en-tête posé en
 *    FLUX ORDINAIRE (`position: static`) occupe exactement le même `top` que
 *    l'ancre : `y = 0` est le SEUL palier où « collant » et « en flux »
 *    rendent le même verdict, donc un témoin qui n'exige de collage QU'à ce
 *    palier ne peut jamais échouer. Falsifié : `sticky` retiré, ou neutralisé
 *    par un ancêtre `overflow: hidden` — les deux gardent `firstStuck =
 *    {y: 0}` (`bestRun` chute de 14 à 1). On exige donc une SÉRIE
 *    CONSÉCUTIVE de paliers collés (`bestRun >= 3`), impossible à satisfaire
 *    sans un collage RÉEL qui survit au défilement ;
 *  · JAMAIS DEUX À LA FOIS (revue #5694) — la cible iOS n'en montre qu'un
 *    (`targets/lentille.scrolled.{light,dark}.png` : « AUJOURD'HUI » tient le
 *    haut, « EPINGLES » a été chassé). Posés à plat dans un même conteneur,
 *    les en-têtes s'EMPILENT tous : mesuré avant correction, « HIER » et
 *    « CETTE SEMAINE » collés l'un sous l'autre, deux bandes prises à la
 *    liste — six avec toutes les sections. C'est le BLOC de section
 *    (`LensSection`) qui borne le collant et fait chasser l'un par l'autre ;
 *  · AUCUN PIXEL DE RANGÉE au bord de clip du scrollport quand un en-tête y
 *    est collé (#5694, correction défaut 3, DÉCOUPLÉE de la sonde en revue
 *    du même numéro — voir ci-dessous) — `document.elementFromPoint` juste
 *    sous ce bord, LÀ où l'en-tête collant doit peindre, ne doit jamais
 *    retomber sur un `[data-row]`.
 *
 *  CE QUE LA REVUE A TROUVÉ SUR CETTE SONDE, ET CE QUI A CHANGÉ. La
 *  première version armait `sliverBreaches` UNIQUEMENT dans la branche
 *  `stuck.length > 0` (« collé » défini à `<= 1` px de l'ancre) — donc
 *  jamais pour une régression qui DÉCALE le repère de collage sans
 *  l'empêcher d'opérer : mesuré (`pt-2` réintroduit sur le scrollport,
 *  l'état exact d'avant la correction du défaut 3), l'en-tête se colle à
 *  `top: 8`, jamais `top: 0` (`position: sticky` s'ancre à la boîte de
 *  PADDING de son ascendant défilant, mesurée séparément — script
 *  autonome, scrollport `padding-top: 8px`, sticky `top: 0` : stuck à
 *  `y = 8` avant ET après défilement, jamais `y = 0`), donc AUCUN palier
 *  n'entrait jamais dans `stuck` et la sonde ne s'exécutait pas une seule
 *  fois — `sliverBreaches` restait à 0 sur la régression qu'elle prétendait
 *  attraper (la remontait alors seule : `bestRun`, chute de 14 à 0, parce
 *  que le seuil `<= 1` px ratait le collage décalé lui aussi). Deux
 *  correctifs, INDÉPENDANTS l'un de l'autre :
 *    1. La sonde tourne désormais dès qu'un en-tête est à MOINS DE 12 px de
 *       l'ancre (`near`, découplé de `stuck`) — assez large pour couvrir un
 *       décalage de 8 px, sans se déclencher en queue de liste où aucun
 *       en-tête n'approche du bord ;
 *    2. Le repère lui-même est vérifié À CÔTÉ, indépendamment de toute
 *       sonde : le scrollport ne doit JAMAIS porter de `padding-top` — un
 *       padding non nul rend le collage au bord de clip inatteignable PAR
 *       CONSTRUCTION (mesuré ci-dessus), donc cette assertion échoue sur la
 *       régression sans dépendre d'aucun seuil de détection de collage.
 *  Rejoué : `pt-2` réintroduit fait échouer L'ASSERTION DE PADDING (`8px`
 *    au lieu de `0px`) ET, désormais, `sliverBreaches` (12 brèches
 *    relevées par la sonde élargie sur ce même état, contre 0 avant ce
 *    correctif) — les deux rougissent, plus seulement `bestRun`.
 *
 *  UN EN-TÊTE TRANSPARENT est une régression VOISINE — `elementFromPoint`
 *  est aveugle à l'opacité (il rend l'élément le plus haut, transparence
 *  comprise) et ne peut donc jamais l'attraper : `opaqueBreaches` mesure
 *  l'alpha de `background-color` de chaque en-tête PROCHE du bord de clip
 *  et refuse toute valeur < 1.
 */
const stickySweep = await stickyPage.evaluate(async () => {
  const scrollport = document.getElementById('contenu');
  if (scrollport === null) return null;
  const settle = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
  const alphaOf = (colorStr) => {
    const m = colorStr.match(/rgba?\(([^)]+)\)/);
    if (m === null) return 1;
    const parts = m[1].split(',').map((s) => Number(s.trim()));
    return parts.length === 4 ? parts[3] : 1;
  };
  // Distance, en pixels, en deçà de laquelle un en-tête est assez proche du
  // bord de clip pour que les sondes (liseré, opacité) s'arment — DÉCOUPLÉE
  // du seuil strict (`<= 1`) qui définit « collé » pour `bestRun`/`maxStuck` :
  // un en-tête décalé de 8 px par un `padding-top` régressé ne serait jamais
  // « collé » à 1 px près, et les sondes ne s'armeraient donc jamais pour lui.
  const NEAR_CLIP_PX = 12;
  let maxStuck = 0;
  let firstStuck = null;
  let stuckSteps = 0;
  let bestRun = 0;
  let currentRun = 0;
  const sliverBreaches = [];
  const opaqueBreaches = [];
  for (let y = 0; y <= scrollport.scrollHeight - scrollport.clientHeight; y += 24) {
    scrollport.scrollTo({ top: y });
    await settle();
    const rect = scrollport.getBoundingClientRect();
    const anchor = rect.top;
    const stickers = [...document.querySelectorAll('[data-sticker]')];
    const stuck = stickers.filter((el) => Math.abs(el.getBoundingClientRect().top - anchor) <= 1);
    const near = stickers.filter((el) => Math.abs(el.getBoundingClientRect().top - anchor) <= NEAR_CLIP_PX);
    if (stuck.length > maxStuck) maxStuck = stuck.length;
    if (stuck.length > 0) {
      stuckSteps += 1;
      currentRun += 1;
      if (currentRun > bestRun) bestRun = currentRun;
      if (firstStuck === null) firstStuck = { y, id: stuck[0].getAttribute('data-sticker') };
    } else {
      currentRun = 0;
    }
    // SEULEMENT quand un en-tête est PROCHE du bord de clip — collé au sens
    // strict ou décalé par une régression : le point juste sous ce bord, LÀ
    // où l'en-tête collant doit peindre, ne doit jamais retomber sur une
    // rangée. Hors ce voisinage (queue de liste, avant que la première
    // section n'ait atteint le haut), un `[data-row]` à ce point est le
    // comportement ATTENDU d'un flux ordinaire, pas un défaut.
    if (near.length > 0) {
      const probeX = rect.left + rect.width / 2;
      const above = document.elementFromPoint(probeX, anchor + 2)?.closest('[data-row]');
      if (above !== null && above !== undefined) sliverBreaches.push({ y, id: above.getAttribute('data-row') });
      for (const el of near) {
        const alpha = alphaOf(getComputedStyle(el).backgroundColor);
        if (alpha < 1) opaqueBreaches.push({ y, id: el.getAttribute('data-sticker'), alpha });
      }
    }
  }
  return {
    maxStuck,
    firstStuck,
    stuckSteps,
    bestRun,
    sliverBreaches,
    opaqueBreaches,
    scrollportPaddingTop: getComputedStyle(scrollport).paddingTop,
  };
});
constate(
  stickySweep !== null && stickySweep.scrollportPaddingTop === '0px',
  `le scrollport porte un padding-top de ${stickySweep?.scrollportPaddingTop} — \`position: sticky\` s'ancre à la boîte de PADDING de son ascendant défilant (mesuré séparément : un scrollport \`padding-top: 8px\` colle un enfant \`top: 0\` à \`y = 8\`, jamais \`y = 0\`), donc un padding-top non nul rend le collage au bord de clip INATTEIGNABLE PAR CONSTRUCTION — l'espace au-dessus d'un en-tête est une MARGE de \`LensSection\`, jamais un padding de scrollport`,
);
constate(
  stickySweep !== null && stickySweep.bestRun >= 3,
  `la plus longue série de paliers COLLÉS CONSÉCUTIFS n'est que ${stickySweep?.bestRun} ` +
    `(${stickySweep?.stuckSteps} palier(s) collé(s) au total, premier à ${JSON.stringify(stickySweep?.firstStuck)}) — ` +
    "un témoin qui ne rougit qu'au palier y=0 ne distingue pas un en-tête RÉELLEMENT collant d'un en-tête en flux ordinaire",
);
constate(
  stickySweep !== null && stickySweep.maxStuck <= 1,
  `${stickySweep?.maxStuck} en-têtes de section collent EN MÊME TEMPS au haut du scrollport — la cible iOS n'en montre qu'un`,
);
constate(
  stickySweep !== null && stickySweep.sliverBreaches.length === 0,
  `une rangée est peinte au bord de clip du scrollport pendant qu'un en-tête y colle ou en approche — ${JSON.stringify(stickySweep?.sliverBreaches.slice(0, 3))}`,
);
constate(
  stickySweep !== null && stickySweep.opaqueBreaches.length === 0,
  `un en-tête de section n'est pas totalement opaque près du bord de clip — une rangée peut se peindre à travers lui : ${JSON.stringify(stickySweep?.opaqueBreaches.slice(0, 3))}`,
);

await stickyPage.close();
await stickyContext.close();

// ------------------------------------------- rythme vertical vs. barre de recherche
/**
 * LA JONCTION AJOUTÉE PAR CHAQUE EN-TÊTE (#5694, correction défaut 3 — revue
 * défaut 2) NE PEUT PAS DÉPLACER LA BARRE DE RECHERCHE. `check-lens.mjs`
 * mesure déjà que la MISE EN PAGE des rangées ne bouge jamais au défilement
 * (témoin 1) ; celui-ci mesure la question SŒUR posée en revue — la
 * hauteur AJOUTÉE par les sections (stickers + jonctions, #5694 écart 6)
 * pousse-t-elle la barre de recherche, ou la dernière rangée sous elle ?
 *
 * Structurellement NON : `<div id="contenu">` (`flex-1 overflow-y-auto`) et
 * la barre (`shrink-0`) sont des FRÈRES d'une colonne flex de hauteur FIXE
 * (`h-dvh`) — la hauteur de CONTENU de la liste, quelle qu'elle soit, est
 * bornée par `flex-1` et défile en interne ; elle ne peut redimensionner un
 * frère `shrink-0`. Mesuré ici plutôt qu'assumé : un futur qui romprait
 * cette garantie (ex. `overflow: visible`, un frère qui redevient `flex:
 * auto`) romprait ce témoin, jamais seulement une capture manuelle.
 */
const layoutContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const layoutPage = await layoutContext.newPage();
await layoutPage.goto(`${BASE}/`, { waitUntil: 'load' });
await layoutPage.waitForSelector('[data-row]');
await layoutPage.waitForTimeout(200);

const layoutSweep = await layoutPage.evaluate(async () => {
  const scrollport = document.getElementById('contenu');
  const searchBar = document.querySelector('input[type="search"]')?.closest('div.shrink-0');
  if (scrollport === null || searchBar === null || searchBar === undefined) return null;
  const settle = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
  const searchTop = searchBar.getBoundingClientRect().top;
  const readings = [];
  for (const top of [0, scrollport.scrollHeight]) {
    scrollport.scrollTo({ top });
    await settle();
    const scrollportBottom = scrollport.getBoundingClientRect().bottom;
    const probeY = Math.round((scrollportBottom + searchTop) / 2);
    const overRow = document
      .elementFromPoint(Math.round(scrollport.getBoundingClientRect().left + scrollport.clientWidth / 2), probeY)
      ?.closest('[data-row]');
    readings.push({
      top,
      scrollportBottom,
      searchTop,
      rowUnderSearch: overRow?.getAttribute('data-row') ?? null,
    });
  }
  return { searchTop, readings };
});
constate(layoutSweep !== null, "la barre de recherche ou le scrollport sont introuvables — impossible de mesurer leur jonction");
constate(
  layoutSweep !== null && layoutSweep.readings.every((r) => r.scrollportBottom <= r.searchTop + 1),
  `le scrollport de la liste déborde sur la barre de recherche — ${JSON.stringify(layoutSweep?.readings)}`,
);
constate(
  layoutSweep !== null && layoutSweep.readings.every((r) => r.rowUnderSearch === null),
  `une rangée est peinte SOUS la barre de recherche (zone entre le bas du scrollport et le haut de la barre) — ${JSON.stringify(layoutSweep?.readings)}`,
);

await layoutPage.close();
await layoutContext.close();

// ---------------------------------------------------- mouvement réduit
const contexteReduit = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
});
const pageReduite = await contexteReduit.newPage();
await pageReduite.goto(`${BASE}/`, { waitUntil: 'load' });
await pageReduite.waitForSelector('[data-row]');
await pageReduite.evaluate(() => document.getElementById('contenu')?.scrollTo({ top: 400 }));
await pageReduite.waitForTimeout(300);

const reducedApp = await apparence(pageReduite);
constate(
  reducedApp.every((a) => a.opacity === 1),
  `mouvement réduit : ${reducedApp.filter((a) => a.opacity !== 1).length} rangée(s) restent estompées`,
);
const eluReduit = await pageReduite.evaluate(
  () => document.querySelectorAll('[aria-hidden="false"].lens-extra').length,
);
constate(eluReduit > 0, "mouvement réduit : l'élection a disparu — on perd le repère, pas seulement le relief");

const geoReduite = await geometrie(pageReduite);
constate(
  geoReduite.every((r) => r.height === 84),
  'mouvement réduit : une case ne mesure plus 84',
);

await browser.close();
server.close();

console.log(`
  cases mesurées        ${before.length}, toutes à ${before[0]?.height ?? '?'} px
  paliers de défilement ${readings.map((r) => `${r.y}`).join(', ')} px
  opacités distinctes   ${seenOpacities.size}
  transformations       ${seenTransforms.size} distinctes
  mouvement réduit      opacités toutes à 1, élection conservée`);

if (failures.length > 0) {
  console.error(`\n  ${failures.length} invariant(s) rompu(s) :`);
  for (const e of failures) console.error(`    · ${e}`);
  console.error(
    "\n  Le critère est BINAIRE : le flux ne bouge jamais au défilement, ou la peau" +
      "\n  plate ne tient pas sa promesse.\n",
  );
  process.exit(1);
}
console.log('\n  Le flux ne bouge jamais : la mise en page est invariable sous défilement.\n');
