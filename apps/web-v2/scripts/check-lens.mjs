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
 *
 * 7. LA COMPACTION DU TRAIL NE DÉPLACE PLUS LES RANGÉES (#6103, décision
 *    #6070). Deux règles étaient candidates : (a) compacter le rail SUR
 *    PLACE, hors flux, dans la même boîte qu'une réserve fantôme (l'ANCIENNE
 *    forme, #5946) ; (b) reprendre la GÉOGRAPHIE iOS — le grand rail vit
 *    DANS le flux qui défile et en SORT normalement
 *    (`ConversationListView.swift:1659-1671`), une bande épinglée
 *    compacte le remplaçant dans la fente du TITRE de l'en-tête
 *    (`PinnedStoryTrailBand`, `StoryTrayView.swift:656-671`,
 *    `CollapsibleHeader.swift:108-112`). **C'est (b) qui est retenue** :
 *    (a) tenait l'invariant de MISE EN PAGE mais créait une réserve VIDE
 *    entre l'en-tête et les filtres une fois défilé — un défaut visible que
 *    (b) supprime en ne peignant JAMAIS les deux rails au même endroit à la
 *    fois. Quatre faces mesurées :
 *      · le grand rail (`[data-rail="grande"]`) ne compacte PLUS jamais
 *        lui-même — sa tuile reste à la cote GRANDE tout le défilement ;
 *      · il SORT normalement du scrollport (son rect passe sous le haut du
 *        scrollport) — c'est du flux ordinaire, rien de plus ;
 *      · une bande compacte (`[data-rail="pinned"]`) apparaît DANS l'en-tête
 *        une fois le grand rail sorti, et DISPARAÎT quand il revient ;
 *      · ni l'en-tête ni le scrollport ne changent de géométrie quand la
 *        bande se révèle — elle est `position: absolute` DANS la fente du
 *        titre, jamais un flux qui pousserait quoi que ce soit.
 *
 * 8.  LE GRAND RAIL HORS CHAMP NE DOUBLE PAS LA BANDE (#6103, revue-
 *     correction) — pendant que la bande est active, un SEUL nœud porte
 *     l'`aria-label` « Stories », et deux `Tab` depuis sa dernière tuile ne
 *     rejoignent ni le grand rail ni ne déplacent le `scrollTop` du scrollport
 *     (`inert={pinned}`, `components/story-rail.tsx`).
 *
 *     L'ÉTIQUETTE ET LA PRISE ONT CHANGÉ DE NOM À LA FUSION DE #6080 (2026-09-
 *     12) : ce rail peignait des CONVERSATIONS sous un anneau qui promettait
 *     une story, il peint désormais les STORIES — « Accès rapide aux
 *     conversations » → « Stories », `a[data-conversation]` →
 *     `a[data-story-author]`. Le gate a d'abord rougi pour la BONNE raison
 *     (l'enveloppe du grand plateau gardait son étiquette hors de portée de
 *     `inert`, reconstituant le doublon), et pour une MAUVAISE en même temps :
 *     ses deux sélecteurs interrogeaient des noms morts. Un témoin qui cherche
 *     un nom mort ne mesure plus rien — ici il rougissait, ce qui est la
 *     chance ; l'autre moitié du temps il passe par ABSENCE (leçon 560, « un
 *     lot qui RENOMME rend anti-corrélé tout garde qui reconnaissait par le
 *     nom » — et sa sonde dont la cible a disparu, qui sort VERTE).
 *
 * 9.  L'HORLOGE DE CHAQUE PAGE EST FIGÉE SUR `INSTANT` (#6228). La §9
 *     pagination (#6195) a fait rougir ce gate sur `dev` — la rangée
 *     `c-live` bougeait de 32 px « après immobilité », dans les deux
 *     schémas. Mesuré : PAS un défaut de défilement. `LIVE_SCHEDULE`
 *     (`fixtures-realtime.ts`) ADOPTE `live-1` comme dernier message de
 *     `c-live` 4 500 ms après `connect()`, avec `lastMessageAt:
 *     LIVE_1.createdAt` — un horaire ancré sur `minutesAgo(40)`, donc sur
 *     l'HEURE RÉELLE du runner. Dans les quarante premières minutes après
 *     minuit LOCAL, ce ré-étiquetage fait franchir à `c-live` la frontière
 *     « Aujourd'hui »/« Hier » PENDANT le test — un séparateur de jour
 *     s'insère ou disparaît au-dessus de sa rangée, qui n'est pas un
 *     `[data-row]` et ne compte donc dans aucune des deux mesures de
 *     hauteur, seulement dans le décalage qu'il produit. C'est exactement
 *     la classe que #6130 (`lib/instant.mjs`) a fermée pour les autres
 *     gates de ce répertoire — restée ouverte ici parce que la §9 est
 *     arrivée après #6130 sans reprendre son remède. `setFixedTime` (jamais
 *     `clock.install`, qui gèle aussi `setTimeout`/`performance.now()`
 *     et désarmerait l'aplatissement au repos que ce même gate mesure) posé
 *     AVANT chaque `goto` — les fixtures lisent `minutesAgo(...)` à
 *     l'import du module, donc dans la page, donc après la navigation.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { INSTANT } from './lib/instant.mjs';

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
await page.clock.setFixedTime(INSTANT);
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
 * LE RAIL COMPACTE — MAIS PLUS LUI-MÊME (#6103, décision #6070 § point 7).
 * L'invariant de MISE EN PAGE ci-dessus (`moves.length === 0`) serait
 * trivialement vert sur un rail qui ne compacte PLUS DU TOUT — la régression
 * inverse d'un rail figé. Depuis la reprise de la géographie iOS, ce n'est
 * plus le GRAND rail (`[data-rail="grande"]`) qui rétrécit — il reste à la
 * cote GRANDE tout le défilement, exactement comme n'importe quel autre
 * contenu du flux — c'est une BANDE distincte (`[data-rail="pinned"]`), DANS
 * l'en-tête, qui prend le relais en miniature une fois le grand rail sorti.
 *
 * **LA COTE 48 ÉTAIT CELLE D'UN AUTRE RAIL** (fusion #6080 ↔ #6103,
 * 2026-09-12). Ce bloc a porté, le temps d'une branche, une borne à 48 px
 * justifiée par `LentilleMetrics.Rail.size`. La constante est réelle et la
 * citation était de bonne foi — mais elle décrit `list.rail`, le rail des
 * LIVES : « pastille 48, anneau 3.5 (pulsé si live), ≤ 6 entrées », et son
 * propre commentaire renvoie à `LivesRail.tsx`. Le plateau des STORIES est un
 * objet distinct, et ses deux cotes sont écrites ailleurs :
 * `MeeshyAvatar.storyTray` = **88** (« doubled 2026-05-27 — story trail =
 * primary CTA ») et `.storyTrayCompact` = **36** (`StoryTrayView.swift:226`,
 * « `context` drives the size »).
 *
 * Et le grief qui motivait la réduction — « 88 px de tuile, un huitième de
 * l'écran, la liste commence sous la ligne de flottaison » — est JUSTE, et
 * c'est exactement ce que la bande épinglée résout chez iOS : le plateau est
 * grand parce qu'il est l'appel à l'action principal, et il sort du champ au
 * défilement au lieu de rétrécir. Les deux moitiés ne se contredisaient pas ;
 * elles répondaient à la même question, l'une par la cote, l'autre par la
 * géographie. La géographie gagne parce qu'elle est celle de la cible.
 */
const grandRailWidthBefore = await page.evaluate(
  () => document.querySelector('[data-rail="grande"] [data-rail-tile]')?.getBoundingClientRect().width ?? null,
);
constate(grandRailWidthBefore !== null, 'aucune tuile trouvée dans [data-rail="grande"] avant défilement');
constate(
  grandRailWidthBefore !== null && grandRailWidthBefore >= 80,
  `le grand rail ne part pas de la cote GRANDE (~88 px) : ${grandRailWidthBefore}`,
);
constate(
  await page.evaluate(() => document.querySelector('[data-rail="pinned"]') === null),
  'la bande épinglée existe déjà AVANT tout défilement — elle ne devrait se matérialiser qu’une fois le grand rail sorti',
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

/**
 * Après défilement (600 px, le grand rail et les filtres largement sortis) :
 * la bande épinglée a pris le relais, EN MINIATURE, et le grand rail — lui —
 * n'a ni compacté ni disparu : il est simplement sorti du champ, comme tout
 * contenu ordinaire du flux.
 */
// La bande épinglée se matérialise via un `IntersectionObserver` (sortie du
// grand rail), jamais un délai fixe — attendre la CONDITION cible plutôt
// qu'un nombre de ms rendait ce gate instable sous charge CI (revue-
// correction : « la bande épinglée ne compacte pas… : null » alors que la
// tuile finissait par apparaître un instant plus tard).
await page
  .waitForFunction(() => document.querySelector('[data-rail="pinned"] [data-rail-tile]') !== null, undefined, { timeout: 3_000 })
  .catch(() => {});
const afterScroll = await page.evaluate(() => {
  const contenuTop = document.getElementById('contenu')?.getBoundingClientRect().top ?? null;
  const grande = document.querySelector('[data-rail="grande"]');
  const grandeTile = document.querySelector('[data-rail="grande"] [data-rail-tile]');
  const pinnedTile = document.querySelector('[data-rail="pinned"] [data-rail-tile]');
  return {
    contenuTop,
    grandeBottom: grande?.getBoundingClientRect().bottom ?? null,
    grandeTileWidth: grandeTile?.getBoundingClientRect().width ?? null,
    pinnedTileWidth: pinnedTile?.getBoundingClientRect().width ?? null,
  };
});
constate(
  afterScroll.pinnedTileWidth !== null && afterScroll.pinnedTileWidth < 45,
  `la bande épinglée ne compacte pas à la cote COMPACTE (~37 px) après défilement : ${afterScroll.pinnedTileWidth}`,
);
constate(
  afterScroll.grandeTileWidth !== null && afterScroll.grandeTileWidth >= 80,
  `le GRAND rail a changé de cote après défilement — il ne devrait plus jamais compacter lui-même : ${afterScroll.grandeTileWidth}`,
);
constate(
  afterScroll.grandeBottom !== null && afterScroll.contenuTop !== null && afterScroll.grandeBottom <= afterScroll.contenuTop + 1,
  `le grand rail n'est pas sorti du scrollport (bas ${afterScroll.grandeBottom}, haut du scrollport ${afterScroll.contenuTop}) — ` +
    'il devrait avoir défilé hors champ comme tout contenu ordinaire',
);
/**
 * CE QUE LA BRANCHE #6080 MESURAIT ICI EST SUBSUMÉ, pas perdu (fusion
 * 2026-09-12). Elle tenait « la cote du rail n'a pas varié pendant le
 * défilement », par `railWidthAfter === railWidthBefore`. C'est exactement ce
 * que dit `grandeTileWidth >= 80` ci-dessus, au même instant du même
 * défilement : un grand rail qui aurait compacté n'y serait plus. La borne de
 * dev est de plus STRICTEMENT plus forte — elle nomme la cote attendue au lieu
 * de comparer deux mesures entre elles, donc elle tombe aussi si les DEUX
 * bougent ensemble.
 */

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
await stickyPage.clock.setFixedTime(INSTANT);
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
 * LA BARRE DE RECHERCHE EST FLOTTANTE, PAS UNE FRONTIÈRE DE DÉFILEMENT
 * (#6220, révise l'invariant posé par #5694). Elle vivait comme un FRÈRE
 * `shrink-0` de `<div id="contenu">` dans la colonne flex : le scrollport ne
 * pouvait alors ni la recouvrir ni être recouvert par elle — structurellement
 * vrai, et c'est ce que ce témoin mesurait. Mais cette même frontière ÉTAIT
 * le bord de clip du scrollport : la rangée qui tombait pile dessus avait son
 * centre — et celui de son bouton d'actions — VOLÉ par la barre elle-même
 * (`elementFromPoint`), sans qu'aucun défilement supplémentaire ne puisse
 * jamais l'en sortir, puisque la frontière DE DÉFILEMENT ÉTAIT la barre.
 *
 * `#6220` inverse la géographie, comme le rail de stories réserve sa
 * gouttière pour ses propres boutons flottants (`story-rail.tsx`,
 * `RAIL_ACTIONS_WIDTH`) : la barre flotte désormais SUR le scrollport
 * (`absolute inset-x-0 bottom-0`, `routes/conversations.tsx`), qui reçoit
 * TOUTE la hauteur disponible et réserve la place de la barre en
 * `padding-block-end` — MESURÉE (`searchBarRef`), jamais supposée. Ce que ce
 * témoin garde n'est donc plus « jamais de recouvrement » (une barre
 * flottante recouvre par nature ce qui n'a pas encore défilé au-dessus
 * d'elle — c'est attendu, et réversible d'un geste) mais l'invariant qui
 * compte réellement : au bord RÉEL du défilement — là où plus aucun geste ne
 * peut rien révéler de plus — aucune rangée ne reste bloquée SOUS elle.
 */
const layoutContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const layoutPage = await layoutContext.newPage();
await layoutPage.clock.setFixedTime(INSTANT);
await layoutPage.goto(`${BASE}/`, { waitUntil: 'load' });
await layoutPage.waitForSelector('[data-row]');
await layoutPage.waitForTimeout(200);

const searchBarMetrics = await layoutPage.evaluate(() => {
  const scrollport = document.getElementById('contenu');
  const searchBar = document.querySelector('[data-search-bar]');
  if (scrollport === null || searchBar === null) return null;
  return {
    searchBarHeight: searchBar.getBoundingClientRect().height,
    padBottom: parseFloat(getComputedStyle(scrollport).paddingBottom) || 0,
  };
});
/* Le bord RÉEL du défilement — un `wheel` RÉEL, jamais un `scrollTop`
   programmé assigné ou passé à `scrollTo` : les deux se sont mesurés
   instables ici (une valeur inférieure au maximum, reprise avant même la
   lecture suivante) — le même geste que #5648 impose déjà pour armer une
   scène, pour la même raison : seul un défilement REÇU COMME UNE INTENTION
   vaut le geste d'un doigt (`check-list-actions.mjs`, section #6220). */
await layoutPage.hover('#contenu');
for (let i = 0; i < 40; i += 1) {
  await layoutPage.mouse.wheel(0, 400);
  await layoutPage.waitForTimeout(30);
}
await layoutPage.waitForTimeout(400);

const layoutSweep = await layoutPage.evaluate((metrics) => {
  const scrollport = document.getElementById('contenu');
  const searchBar = document.querySelector('[data-search-bar]');
  if (scrollport === null || searchBar === null || metrics === null) return null;
  const { searchBarHeight, padBottom } = metrics;
  const searchTop = searchBar.getBoundingClientRect().top;
  const scrollportBottom = scrollport.getBoundingClientRect().bottom;
  const probeY = Math.round((searchTop + scrollportBottom) / 2);
  const overRow = document
    .elementFromPoint(Math.round(scrollport.getBoundingClientRect().left + scrollport.clientWidth / 2), probeY)
    ?.closest('[data-row]');
  return {
    searchBarHeight,
    padBottom,
    searchTop,
    scrollportBottom,
    atMax: scrollport.scrollTop >= scrollport.scrollHeight - scrollport.clientHeight - 1,
    rowUnderSearch: overRow?.getAttribute('data-row') ?? null,
  };
}, searchBarMetrics);
constate(layoutSweep !== null, 'la barre de recherche (`[data-search-bar]`) ou le scrollport sont introuvables');
constate(
  layoutSweep !== null && layoutSweep.atMax,
  `le défilement RÉEL (wheel) atteint bien le bord RÉEL du scrollport — ${JSON.stringify(layoutSweep)}`,
);
constate(
  layoutSweep !== null && layoutSweep.padBottom >= layoutSweep.searchBarHeight - 1,
  `le scrollport réserve AU MOINS la hauteur RENDUE de la barre en padding-block-end — ${JSON.stringify(layoutSweep)}`,
);
constate(
  layoutSweep !== null && layoutSweep.rowUnderSearch === null,
  `au bord RÉEL du défilement, une rangée reste peinte SOUS la barre de recherche (zone entre le bas du scrollport et le haut de la barre) — ${JSON.stringify(layoutSweep)}`,
);

await layoutPage.close();
await layoutContext.close();

// --------------------------------------- l'en-tête ne bouge JAMAIS (#6103)
/**
 * L'EN-TÊTE ET LE SCROLLPORT NE CHANGENT JAMAIS DE GÉOMÉTRIE quand la bande
 * épinglée se révèle (#6103, décision #6070) — elle est `position: absolute`
 * DANS la fente du titre, jamais un flux qui pousserait quoi que ce soit
 * (miroir `accessoryCollapsedHeight < expandedHeight` : « the header only
 * ever shrinks », jamais ne grandit). Et LE TITRE CÈDE PUIS REPREND SA
 * PLACE dans les DEUX sens — la bascule `pinned: true → false` retire la
 * bande ET aucune rangée de la Lentille n'a bougé pendant l'aller-retour
 * (G1 rejoué sur ce palier de RETOUR).
 */
const headerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const headerPage = await headerContext.newPage();
await headerPage.clock.setFixedTime(INSTANT);
await headerPage.goto(`${BASE}/`, { waitUntil: 'load' });
await headerPage.waitForSelector('[data-row]');
await headerPage.waitForTimeout(200);

const headerBefore = await headerPage.evaluate(() => ({
  headerHeight: document.querySelector('header')?.getBoundingClientRect().height ?? null,
  contenuTop: document.getElementById('contenu')?.getBoundingClientRect().top ?? null,
  h1Opacity: Number(getComputedStyle(document.querySelector('h1')).opacity),
  h1AriaHidden: document.querySelector('h1')?.getAttribute('aria-hidden'),
  pinnedPresent: document.querySelector('[data-rail="pinned"]') !== null,
}));
constate(headerBefore.headerHeight !== null, 'aucun <header> trouvé');
constate(headerBefore.h1AriaHidden === null, `le titre est aria-hidden AVANT tout défilement (${headerBefore.h1AriaHidden})`);
constate(headerBefore.h1Opacity === 1, `le titre n'est pas pleinement opaque au repos (${headerBefore.h1Opacity})`);
constate(!headerBefore.pinnedPresent, 'la bande épinglée existe déjà au repos');

const headerGeoDuring = [];
for (const y of [40, 120, 240, 400, 600]) {
  await headerPage.evaluate((v) => document.getElementById('contenu')?.scrollTo({ top: v }), y);
  await headerPage.waitForTimeout(90);
  headerGeoDuring.push(
    await headerPage.evaluate(() => ({
      headerHeight: document.querySelector('header')?.getBoundingClientRect().height ?? null,
      contenuTop: document.getElementById('contenu')?.getBoundingClientRect().top ?? null,
    })),
  );
}
for (const { headerHeight, contenuTop } of headerGeoDuring) {
  constate(
    headerHeight === headerBefore.headerHeight,
    `la hauteur de l'en-tête a changé pendant le défilement (${headerBefore.headerHeight} → ${headerHeight})`,
  );
  constate(
    contenuTop === headerBefore.contenuTop,
    `le haut du scrollport a bougé pendant le défilement (${headerBefore.contenuTop} → ${contenuTop})`,
  );
}

// Attend que le fondu (HIDDEN_CHROME_EASE_OUT_MS = 250 ms) soit VRAIMENT
// terminé — un délai FIXE rendait ce gate instable sous charge CI (revue-
// correction : opacité relevée à 0.198… ou 0.954… selon la lenteur de la
// machine, jamais 0 ni 1) ; on attend la CONDITION cible, avec un plafond
// large en filet de sécurité, jamais un raccourcissement de l'attente.
await headerPage
  .waitForFunction(
    () => {
      const h1 = document.querySelector('h1');
      return h1 !== null && Number(getComputedStyle(h1).opacity) === 0 && document.querySelector('[data-rail="pinned"]') !== null;
    },
    undefined,
    { timeout: 3_000 },
  )
  .catch(() => {});
const headerAfter = await headerPage.evaluate(() => ({
  headerHeight: document.querySelector('header')?.getBoundingClientRect().height ?? null,
  h1Opacity: Number(getComputedStyle(document.querySelector('h1')).opacity),
  h1AriaHidden: document.querySelector('h1')?.getAttribute('aria-hidden'),
  pinnedPresent: document.querySelector('[data-rail="pinned"]') !== null,
}));
constate(headerAfter.headerHeight === headerBefore.headerHeight, "la hauteur de l'en-tête a changé une fois la bande révélée");
constate(headerAfter.h1Opacity === 0, `le titre ne s'est pas effacé derrière la bande (opacité ${headerAfter.h1Opacity})`);
constate(headerAfter.h1AriaHidden === 'true', "le titre effacé n'est pas aria-hidden");
constate(headerAfter.pinnedPresent, "la bande épinglée n'est pas apparue après défilement");

/** LE RETOUR : la bascule fonctionne dans les DEUX sens, et aucune rangée
 * n'a bougé pendant l'aller-retour complet (G1 rejoué sur ce palier). */
const rowGeoBeforeRoundTrip = await geometrie(headerPage);
await headerPage.evaluate(() => document.getElementById('contenu')?.scrollTo({ top: 0 }));
await headerPage
  .waitForFunction(
    () => {
      const h1 = document.querySelector('h1');
      return h1 !== null && Number(getComputedStyle(h1).opacity) === 1 && document.querySelector('[data-rail="pinned"]') === null;
    },
    undefined,
    { timeout: 3_000 },
  )
  .catch(() => {});
const headerReturned = await headerPage.evaluate(() => ({
  h1Opacity: Number(getComputedStyle(document.querySelector('h1')).opacity),
  h1AriaHidden: document.querySelector('h1')?.getAttribute('aria-hidden'),
  pinnedPresent: document.querySelector('[data-rail="pinned"]') !== null,
}));
constate(!headerReturned.pinnedPresent, 'la bande épinglée ne se retire pas quand le grand rail revient');
constate(headerReturned.h1Opacity === 1, `le titre ne reprend pas sa place (opacité ${headerReturned.h1Opacity})`);
constate(headerReturned.h1AriaHidden === null, 'le titre reste aria-hidden après le retour du grand rail');
const rowGeoAfterRoundTrip = await geometrie(headerPage);
const movedByRoundTrip = rowGeoAfterRoundTrip.filter(
  (r, i) => rowGeoBeforeRoundTrip[i] === undefined || r.haut !== rowGeoBeforeRoundTrip[i].haut || r.height !== rowGeoBeforeRoundTrip[i].height,
);
constate(
  movedByRoundTrip.length === 0,
  `l'aller-retour de la bande épinglée a déplacé ${movedByRoundTrip.length} rangée(s) — ${JSON.stringify(movedByRoundTrip.slice(0, 3))}`,
);

await headerPage.close();
await headerContext.close();

// ------------------------- la bande épinglée ne double pas l'accès clavier (#6103, revue)
/**
 * LE GRAND RAIL NE DOUBLE PAS LA BANDE, NI AU CLAVIER NI DANS L'ARBRE
 * D'ACCESSIBILITÉ (#6103, revue-correction). Le grand rail ne quitte jamais
 * le DOM — il défile simplement hors du scrollport — et sans garde, ses
 * liens restaient à la fois dans l'ordre de TABULATION et exposés sous le
 * MÊME `aria-label` que la bande qui le remplace : un lecteur d'écran
 * annonçait les stories deux fois, et un `Tab` depuis la dernière
 * tuile de la bande retombait dans le grand rail hors champ — que le
 * navigateur ramène alors DANS la vue pour honorer le focus, faisant sauter
 * le défilement (749 → 0 mesuré) et perdre la position de lecture pour rien
 * de plus qu'un `Tab`.
 *
 * Le correctif (`inert={pinned}`, `components/story-rail.tsx`) doit
 * tenir TROIS faits, mesurés ici plutôt qu'assumés :
 *  · un SEUL nœud porte l'`aria-label` « Stories » pendant que la bande est
 *    active — jamais deux. LA MESURE COMPTE LES NŒUDS, PAS LES `<ul>` : au
 *    premier passage de #6080 l'enveloppe `<section>` du grand plateau
 *    portait l'étiquette, hors de portée de `inert` posé sur son enfant, et
 *    le doublon se reformait sur le seul nœud que la garde ne couvrait pas ;
 *  · un premier `Tab` depuis la dernière tuile de la bande rejoint
 *    « Progression » SANS bouger le scrollport — elle vit dans l'en-tête,
 *    jamais dans le flux qui défile ;
 *  · un second `Tab` ne retombe PLUS dans le grand rail hors champ — il
 *    poursuit dans l'ordre du DOM jusqu'au prochain contrôle RÉEL (les
 *    filtres), pas jusqu'à un doublon des NEUF mêmes conversations.
 *
 * CE QUE CE TÉMOIN NE PROUVE PAS, ET POURQUOI CE N'EST PAS UN DÉFAUT : le
 * dernier `Tab` de la chaîne fait tout de même sauter le `scrollTop` à 0 —
 * mesuré, la cible finale est le premier bouton de filtre (`aria-pressed`),
 * pas une tuile du grand rail, et ce bouton vit lui aussi dans le flux
 * défilant (décision #6070, filtres EN FLUX, comme sur iOS). Faire défiler
 * la page jusqu'au prochain contrôle atteint par tabulation est le
 * comportement d'accessibilité STANDARD — celui-là même qu'un lecteur
 * d'écran iOS reproduit en balayant jusqu'à l'élément suivant de la liste —
 * jamais celui qu'a corrigé ce lot : le lot corrige la RÉ-ANNONCE d'un
 * contenu déjà lu, pas le fait que le clavier suive l'ordre du document
 * plutôt que la position de défilement. Élargir la garde aux filtres les
 * rendrait inatteignables au clavier tant que la bande est active — une
 * régression, pas une correction. Suivi séparé, HORS PÉRIMÈTRE de #6103 : si
 * ce saut doit un jour disparaître, il porte sur les DEUX (rail ET filtres),
 * pas sur ce correctif de duplication.
 *
 * LA CHAÎNE COMPTE TROIS ARRÊTS, PAS UN (#6117, revue). Le MÊME commit qui a
 * écrit ce témoin (#5652, « les deux boutons d'en-tête ont leur effet ») a
 * posé « Créer un lien de partage » DEVANT « Nouvelle conversation » dans le
 * DOM de l'en-tête — les deux boutons vivent entre le rail et « Progression »
 * (`components/list-header.tsx`). Le témoin, écrit dans la même passe,
 * attendait encore « Progression » au PREMIER `Tab` : il rougissait pour la
 * même raison que la ligne 62 ci-dessus documente déjà pour une autre paire
 * de sélecteurs — deux morceaux d'un même lot qui divergent parce que l'un
 * décrit un DOM que l'autre vient de changer. La chaîne réelle est donc
 * bande → partage → nouvelle conversation → progression, et chacun des TROIS
 * arrêts doit éviter le grand rail hors champ et toute tuile de story — pas
 * seulement le dernier.
 */
const kbdContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const kbdPage = await kbdContext.newPage();
await kbdPage.clock.setFixedTime(INSTANT);
await kbdPage.goto(`${BASE}/`, { waitUntil: 'load' });
await kbdPage.waitForSelector('[data-row]');
await kbdPage.evaluate(() => document.getElementById('contenu')?.scrollTo({ top: 600 }));
await kbdPage.waitForTimeout(400);

const kbdBefore = await kbdPage.evaluate(() => ({
  pinnedPresent: document.querySelector('[data-rail="pinned"]') !== null,
  grandeInert: document.querySelector('[data-rail="grande"]')?.hasAttribute('inert') ?? null,
  regions: document.querySelectorAll('[aria-label="Stories"]').length,
  scrollTop: document.getElementById('contenu')?.scrollTop ?? null,
}));
constate(kbdBefore.pinnedPresent, "la bande épinglée n'est pas apparue — impossible de mesurer le doublon clavier");
constate(kbdBefore.grandeInert === true, `le grand rail n'est pas \`inert\` pendant que la bande est active (${kbdBefore.grandeInert})`);
constate(
  kbdBefore.regions === 1,
  `${kbdBefore.regions} nœud(s) portent l'aria-label « Stories » en même temps — un seul le devrait`,
);

await kbdPage.evaluate(() => {
  const liens = [...document.querySelectorAll('[data-rail="pinned"] a[data-story-author]')];
  (liens[liens.length - 1])?.focus();
});
const scrollTopAvantTab = await kbdPage.evaluate(() => document.getElementById('contenu')?.scrollTop ?? null);

/* Les trois arrêts réels de la chaîne, dans l'ordre du DOM de
   `list-header.tsx` : « Créer un lien de partage », « Nouvelle
   conversation », « Progression ». Chacun doit éviter le grand rail hors
   champ ET toute tuile de story — jamais seulement le dernier arrêt. */
const CHAINE = ['Créer un lien de partage', 'Nouvelle conversation', 'Progression'];
for (const [index, attendu] of CHAINE.entries()) {
  await kbdPage.keyboard.press('Tab');
  const apres = await kbdPage.evaluate(() => ({
    ariaLabel: document.activeElement?.getAttribute('aria-label') ?? null,
    scrollTop: document.getElementById('contenu')?.scrollTop ?? null,
    dansGrandRail: document.activeElement?.closest('[data-rail="grande"]') !== null,
    /* L'ENVELOPPE, PAS SEULEMENT LE `<ul>` : les deux portes flottantes (« Créer
       une story », « Voir toutes les stories ») vivent DANS la `<section>` du
       grand plateau, à CÔTÉ du rail — un `closest('[data-rail="grande"]')` ne les
       voit pas. Elles tabulaient donc hors champ en toute impunité, et ramenaient
       le plateau dans la vue exactement comme les tuiles. */
    dansEnveloppeDuPlateau: document.activeElement?.closest('section:has([data-rail="grande"])') !== null,
    storyAuthor: document.activeElement?.getAttribute('data-story-author') ?? null,
  }));
  const rang = index + 1;
  constate(
    apres.ariaLabel?.startsWith(attendu) === true,
    `le ${rang}e \`Tab\` depuis la dernière tuile de la bande ne rejoint pas « ${attendu} » (${apres.ariaLabel})`,
  );
  constate(
    apres.scrollTop === scrollTopAvantTab,
    `le ${rang}e \`Tab\` a déplacé le scrollport (${scrollTopAvantTab} → ${apres.scrollTop})`,
  );
  constate(
    !apres.dansGrandRail,
    `le ${rang}e \`Tab\` entre dans le grand rail hors champ — il devrait être \`inert\``,
  );
  constate(
    !apres.dansEnveloppeDuPlateau,
    `le ${rang}e \`Tab\` atteint une porte flottante du grand plateau hors champ (« Créer une story » / « Voir toutes ») — ` +
      "l'enveloppe doit être `inert` avec son rail",
  );
  constate(
    apres.storyAuthor === null,
    `le ${rang}e \`Tab\` atterrit sur une tuile de story (${apres.storyAuthor}) — un doublon de la bande, ` +
      'jamais un contrôle nouveau',
  );
}

await kbdPage.close();
await kbdContext.close();

// ---------------------------------------------------- mouvement réduit
const contexteReduit = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
});
const pageReduite = await contexteReduit.newPage();
await pageReduite.clock.setFixedTime(INSTANT);
await pageReduite.goto(`${BASE}/`, { waitUntil: 'load' });
await pageReduite.waitForSelector('[data-row]');
await pageReduite.evaluate(() => document.getElementById('contenu')?.scrollTo({ top: 600 }));
await pageReduite.waitForTimeout(300);

/**
 * LA BASCULE TITRE ↔ BANDE EST INSTANTANÉE SOUS MOUVEMENT RÉDUIT (#6103) —
 * `motion-reduce:transition-none` (ListHeader) coupe le fondu de
 * `HIDDEN_CHROME_EASE_OUT_MS` : l'opacité du titre doit déjà valoir 0 sans
 * attendre la fin d'une transition qui n'existe plus, et la bande doit déjà
 * être présente — on perd l'animation, jamais le résultat.
 */
const reducedHeader = await pageReduite.evaluate(() => ({
  h1Opacity: Number(getComputedStyle(document.querySelector('h1')).opacity),
  pinnedPresent: document.querySelector('[data-rail="pinned"]') !== null,
}));
constate(
  reducedHeader.h1Opacity === 0,
  `mouvement réduit : le titre ne s'efface pas immédiatement (opacité ${reducedHeader.h1Opacity})`,
);
constate(reducedHeader.pinnedPresent, "mouvement réduit : la bande épinglée n'est pas apparue");

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

// ---------------------------------------------------- §9 pagination (#6195)
/**
 * §9 — LE DÉFILEMENT INFINI NE BOUGE AUCUNE RANGÉE DE LA PAGE 1 (#6195).
 * Même critère binaire que le reste du fichier, étendu à la PAGE 2 : les 30
 * premières rangées, une fois la page 2 arrivée (45 au total), gardent
 * EXACTEMENT le même `offsetTop`/`offsetHeight` qu'avant le chargement — le
 * pied de pagination est un `<li>` APRÈS les sections, jamais une insertion
 * qui repousserait ce qui précède. Passé en CLAIR ET EN SOMBRE (motif
 * `capture.mjs`), contrairement au reste de ce fichier (un seul schéma).
 */
const pagination = [];
for (const colorScheme of ['light', 'dark']) {
  const pgContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme });
  const pgPage = await pgContext.newPage();
  await pgPage.clock.setFixedTime(INSTANT);
  await pgPage.goto(`${BASE}/`, { waitUntil: 'load' });
  await pgPage.waitForSelector('[data-row]');
  await pgPage.waitForTimeout(300);

  // `c-kwame` (archivée) est FETCHÉE dans la page 1 (30) mais MASQUÉE par le
  // filtre « all » (`applyFilter`, précédence iOS `:598-601` — une conversation
  // archivée n'apparaît que sous l'onglet « archived ») : 29 rangées RENDUES
  // pour 30 FETCHÉES, 44 pour 45 une fois la page 2 arrivée. C'est un
  // comportement EXISTANT, pas un effet de la pagination.
  const RENDERED_PAGE_1 = 29;
  const RENDERED_TOTAL = 44;

  const page1 = await geometrie(pgPage);
  constate(page1.length === RENDERED_PAGE_1, `§9 (${colorScheme}) : la page 1 ne porte pas ${RENDERED_PAGE_1} rangées rendues (${page1.length})`);

  await pgPage.evaluate(() => {
    const el = document.getElementById('contenu');
    el?.scrollTo({ top: el.scrollHeight });
  });
  await pgPage
    .waitForFunction(
      (n) => document.querySelectorAll('[data-row]').length === n,
      RENDERED_TOTAL,
      { timeout: 5_000 },
    )
    .catch(() => undefined);

  const page2 = await geometrie(pgPage);
  constate(page2.length === RENDERED_TOTAL, `§9 (${colorScheme}) : après défilement, ${RENDERED_TOTAL} rangées attendues (${page2.length})`);
  constate(
    page2.every((r) => r.height === 84),
    `§9 (${colorScheme}) : une case ne mesure plus 84 après la page 2`,
  );
  for (const before of page1) {
    const after = page2.find((r) => r.id === before.id);
    constate(
      after !== undefined && after.haut === before.haut,
      `§9 (${colorScheme}) : la rangée « ${before.id} » a bougé après la page 2 (${before.haut} → ${after?.haut})`,
    );
  }

  const footerAndTail = await pgPage.evaluate(() => {
    const footer = document.querySelector('[data-pagination-footer]');
    const sentinel = document.querySelector('[data-load-more-sentinel]');
    const rows = [...document.querySelectorAll('[data-row]')];
    const lastRow = rows[rows.length - 1] ?? null;
    const tailAfterFooter =
      footer !== null && lastRow !== null
        ? Boolean(lastRow.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING)
        : null;
    return { footerState: footer?.getAttribute('data-pagination-footer') ?? null, sentinelPresent: sentinel !== null, tailAfterFooter };
  });
  constate(
    footerAndTail.footerState === 'exhausted',
    `§9 (${colorScheme}) : le pied n'est pas « exhausted » après 45 rangées (${footerAndTail.footerState})`,
  );
  constate(!footerAndTail.sentinelPresent, `§9 (${colorScheme}) : la sentinelle de défilement infini est encore présente`);
  constate(
    footerAndTail.tailAfterFooter === true,
    `§9 (${colorScheme}) : le pied de pagination ne SUIT pas la dernière rangée dans le document`,
  );
  // Ce que la §9 a mesuré, DIT — sans cette ligne, une section entière du gate
  // ne laissait aucune trace dans sa sortie : impossible de voir qu'elle a
  // tourné, donc impossible de distinguer « verte » de « sautée ».
  pagination.push(`${colorScheme} : ${page1.length} → ${page2.length} rangées, pied « ${footerAndTail.footerState} », aucune rangée déplacée`);

  // Aplatissement (§6 du fichier) — l'invariant tient aussi après immobilité.
  await pgPage.waitForTimeout(5_000);
  const page2AfterRest = await geometrie(pgPage);
  for (const before of page1) {
    const after = page2AfterRest.find((r) => r.id === before.id);
    constate(
      after !== undefined && after.haut === before.haut,
      `§9 (${colorScheme}), après immobilité : la rangée « ${before.id} » a bougé (${before.haut} → ${after?.haut})`,
    );
  }

  await pgPage.close();
  await pgContext.close();
}

await browser.close();
server.close();

console.log(`
  cases mesurées        ${before.length}, toutes à ${before[0]?.height ?? '?'} px
  paliers de défilement ${readings.map((r) => `${r.y}`).join(', ')} px
  opacités distinctes   ${seenOpacities.size}
  transformations       ${seenTransforms.size} distinctes
  mouvement réduit      opacités toutes à 1, élection conservée
  §9 pagination         ${pagination.join('\n                        ')}`);

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
