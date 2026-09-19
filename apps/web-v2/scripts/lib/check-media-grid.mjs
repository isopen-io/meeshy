/**
 * G1-G4 — LA GRILLE DE MÉDIAS 2/3/4+ ET SA VISIONNEUSE (#6169, § 5 étape c de
 * la spécification « grille de médias »). EXTRAIT de `check-thread-states.mjs`
 * dès la naissance (le même motif que `check-media.mjs`, § 5805) — l'hôte
 * était déjà à 51 lignes du plafond dur de 1 200, chaque écran ajoute sa
 * suite ici, jamais dans l'hôte.
 *
 * `expect`, `setScheme` sont REMIS par l'hôte, jamais redéfinis (leçon de
 * `lib/check-summary.mjs` : deux compteurs de défauts rendraient un gate vert
 * avec des échecs dedans). `waitForRowSettled` vient de `check-media.mjs` —
 * EXPORTÉE là-bas, jamais recopiée ici : la même course (le virtualiseur
 * corrige `scrollTop` pendant qu'il mesure les rangées voisines) menace
 * n'importe quelle rangée du même fil.
 *
 * CORRECTION DE LA SPÉCIFICATION (mesurée, pas devinée) — G3 : « history.length
 * égal au relevé » après Échap ne tient PAS dans un navigateur réel. Sondé
 * (`launchChromium`, trois scénarios) : `history.back()` ne fait JAMAIS
 * décroître `history.length` — il ne fait que REPOSITIONNER le curseur sur
 * une entrée déjà comptée. `pushState` (ouverture) puis `back()` (Échap)
 * laisse donc `history.length` à `relevé + 1`, pour toujours : c'est
 * `use-back-dismiss.ts` qui le dit lui-même (« elle REND son entrée… pour
 * qu'un retour ULTÉRIEUR ne soit pas avalé à la place ») — RENDUE, jamais
 * EFFACÉE. L'invariant qui COMPTE, et qui est ici vérifié à la place du
 * littéral erroné, est celui que cette phrase promet : un retour matériel
 * ULTÉRIEUR ne consomme plus qu'UNE seule couche (jamais deux, jamais zéro).
 */
import { waitForRowSettled } from './check-media.mjs';
import { confinementDe } from './chrome-confinement.mjs';

const QUAD_ID = 'media-13';
const OVERFLOW_ID = 'media-14';
const TRIPLE_VIDEO_ID = 'media-12';
/** `media-11` — LA PAIRE, le troisième agencement, qu'aucun gate ne visitait. */
const PAIR_ID = 'media-11';
/** `media-15` — LA VIDÉO SEULE (#7016) : la branche SOLO de `MediaGrid`, qu'aucun gate ne visitait. */
const SOLO_VIDEO_ID = 'media-15';
/** `media-16` — DEUX IMAGES DE MOI (#7018) : la branche `justify-end`, qu'aucune fixture n'atteignait. */
const MINE_GRID_ID = 'media-16';

/** Le ratio de la vidéo témoin (`gridVideo`, 160 × 90) — `soloVideoSlot` s'y accroche, repli 16/9 identique. */
const SOLO_VIDEO_RATIO = 160 / 90;

async function scrollUntilMounted(page, scroller, id) {
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    const mounted = await page.evaluate((mid) => document.querySelector(`[data-message="${mid}"]`) !== null, id);
    if (mounted) return;
    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(150);
  }
}

/**
 * Le pendant VERS LE BAS de `scrollUntilMounted` — `media-16` est le
 * DERNIER message avant `media-7` : une fois les témoins du haut visités, le
 * virtualiseur l'a démonté, et remonter au sommet (`scrollTop = 0`) ne le
 * remontera jamais. La direction du défilement fait partie du témoin.
 */
async function scrollDownUntilMounted(page, scroller, id) {
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    const mounted = await page.evaluate((mid) => document.querySelector(`[data-message="${mid}"]`) !== null, id);
    if (mounted) return;
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(150);
  }
}

/**
 * Le pixel RÉELLEMENT composité à `(x, y)` du viewport — une capture 1 × 1
 * décodée dans la page (même voie que `mesurerCoeurPeint` de
 * `check-media.mjs`) : la forme d'une grille (un écart qui laisse voir le fond,
 * un coin arrondi) ne se lit dans aucun style calculé, seulement à l'écran.
 */
export async function paintedAt(page, x, y, quoi = 'une sonde') {
  // UNE SONDE HORS ÉCRAN FAIT ROUGIR SON TÉMOIN, elle ne tue pas le gate
  // (#7048). Sans ce contrôle, `page.screenshot` lève « Clipped area is either
  // empty or outside the resulting image » — un message qui ne nomme ni la
  // coordonnée, ni la rangée, ni le bloc. Il remonte en `uncaughtException`,
  // jette les 588 témoins DÉJÀ VERTS, et déclenche `pageDiagnostics()`, dont
  // les dizaines de lignes « console (erreur) · A bad HTTP response code
  // (404) » — le service worker que ce gate refuse de servir À DESSEIN,
  // présent dans les exécutions VERTES — désignent alors la mauvaise chose.
  // Le premier diagnostic de ce défaut y a perdu son temps.
  //
  // Le motif voyage donc dans la VALEUR RENDUE, en CHAÎNE là où un triplet est
  // attendu : les `expect` qui la consomment l'interpolent déjà dans leur
  // message, et nomment ainsi le point exact sans qu'aucun d'eux soit réécrit.
  const vue = page.viewportSize();
  const [cx, cy] = [Math.floor(x), Math.floor(y)];
  if (vue && (cx < 0 || cy < 0 || cx >= vue.width || cy >= vue.height)) {
    return (
      `${quoi} tombe HORS du viewport : (${cx}, ${cy}) pour ${vue.width}×${vue.height} — ` +
      `la rangée visée a quitté l'écran avant la mesure, il faut défiler vers elle AVANT de la sonder`
    );
  }
  const shot = await page.screenshot({ clip: { x: cx, y: cy, width: 1, height: 1 } });
  return page.evaluate(async (data) => {
    const bitmap = new Image();
    await new Promise((ok, ko) => {
      bitmap.onload = ok;
      bitmap.onerror = ko;
      bitmap.src = `data:image/png;base64,${data}`;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
  }, shot.toString('base64'));
}

const INDIGO = [99, 102, 241];
const BLACK = [0, 0, 0];
/**
 * `rgb` peut ne PAS être un triplet : `paintedAt` rend le MOTIF de son refus
 * (une chaîne) quand la sonde tombe hors du viewport (#7048). Sans le
 * `Array.isArray`, `.every` lève un `TypeError` — et le gate meurt exactement
 * comme il mourait avant, à un message près. Rendre `false` ici fait tomber le
 * témoin qui l'appelle, AVEC son message : l'`expect` interpole déjà la valeur,
 * donc le motif s'imprime là où l'on attendait un triplet, les 588 témoins
 * déjà verts sont conservés, et les suivants sont joués.
 */
export const near = (rgb, target) => Array.isArray(rgb) && rgb.every((c, i) => Math.abs(c - target[i]) <= 6);

/**
 * LA NÉGATION DE `near`, ET ELLE N'EST PAS `!near` (#7048).
 *
 * `near` rendu fail-closed suffit à une règle POSITIVE (« ce pixel EST
 * l'indigo ») : une sonde perdue la fait tomber. Elle ne suffit pas à une règle
 * NÉGATIVE (« ce pixel n'est PAS l'indigo »), parce que `!near(perdue, X)` rend
 * **vrai** — la règle serait déclarée satisfaite alors qu'aucun pixel n'a été
 * lu. G5 porte exactement cette forme (« la rangée plate arrondit CHAQUE case :
 * coin intérieur hors média »), et elle aurait donc VERDI PAR ABSENCE DE SUJET
 * au moment précis où la mesure venait d'échouer.
 *
 * Un correctif qui s'arrête à `near` troque un gate qui EXPLOSE contre un gate
 * qui MENT — l'explosion, au moins, se voit. `loin` exige donc une VRAIE
 * mesure avant de conclure à l'écart.
 */
export const loin = (rgb, target) => Array.isArray(rgb) && !near(rgb, target);

export async function checkThreadMediaGrid({ browser, BASE, expect, setScheme, skin, scheme }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setScheme(context, scheme);
  const page = await context.newPage();
  await page.goto(`${BASE}/c/c-medias`, { waitUntil: 'load' });
  await page.waitForSelector('[data-message]');

  const scroller = page.locator('main#contenu');
  await scrollUntilMounted(page, scroller, QUAD_ID);
  await waitForRowSettled(page, QUAD_ID);

  if (skin === 'bulles') {
    await page.getByRole('button', { name: /Mode de lecture/ }).click();
    await page.getByRole('menuitemradio', { name: /Bulles/ }).click();
    await page.waitForTimeout(300);
    await waitForRowSettled(page, QUAD_ID);
  }

  const rowOf = (id) => page.locator(`[data-message="${id}"]`);

  // ===== G1 — la grille compte ses tuiles =====
  const quadTileCount = await rowOf(QUAD_ID).locator('[data-media-tile]').count();
  expect(quadTileCount === 4, `[${skin}/${scheme}] media-13 (4 images) rend 4 [data-media-tile] (obtenu ${quadTileCount})`);

  const gridBox = await rowOf(QUAD_ID).locator('[data-media-grid]').first().boundingBox();
  const quadRowBox = await rowOf(QUAD_ID).boundingBox();
  /**
   * `MEDIA_GRID_MAX_WIDTH` EST UN PLAFOND, PAS UNE COTE (#7018).
   *
   * Ce témoin exigeait `width === 300` — et il était VERT parce que la boîte
   * DÉBORDAIT : à 390 px de viewport, le porteur de la grille mesure 246 px en
   * Focal et 223 px en Bulles, jamais 300. Le littéral encodait donc le défaut
   * qu'il aurait dû attraper, et le seul cas où il pouvait rougir était sa
   * CORRECTION. La règle vérifiée est désormais celle que le style POSE —
   * `width: 300` plafonné à `100 %` — soit `min(300, porteur)`, et le débord
   * se juge par les deux témoins en dessous.
   */
  /* La largeur de CONTENU du porteur, jamais sa `boundingBox` : `100 %` se
     résout contre la boîte de CONTENU, et une bulle REÇUE porte une bordure
     de 1 px en plus de ses 14 px de padding (mesuré : 253,4 de bord à bord,
     223,4 de contenu) — deux pixels qui feraient rougir un témoin juste. */
  const gridHostWidth = await rowOf(QUAD_ID)
    .locator('[data-media-grid]')
    .first()
    .evaluate((el) => {
      const host = el.parentElement;
      const style = getComputedStyle(host);
      return host.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    });
  const expectedGridWidth = Math.min(300, gridHostWidth);
  expect(
    gridBox !== null && Math.abs(gridBox.width - expectedGridWidth) <= 0.5,
    `[${skin}/${scheme}] la boîte de la grille mesure min(300, porteur) = ${expectedGridWidth.toFixed(1)}px de large (obtenu ${gridBox?.width})`,
  );
  expect(
    gridBox !== null && gridBox.width <= 300.5,
    `[${skin}/${scheme}] la boîte ne dépasse JAMAIS MEDIA_GRID_MAX_WIDTH (obtenu ${gridBox?.width})`,
  );
  /**
   * `240` N'EST PLUS UNE COTE FIXE NON PLUS (#7030, relecture adversariale).
   *
   * Ce témoin exigeait `height === 240`, littéral — et restait VERT
   * précisément parce que le défaut qu'il aurait dû attraper le rendait vrai
   * PAR CONSTRUCTION : la boîte portait `height: 240` en dur, insensible au
   * plafond de LARGEUR `maxWidth: 100 %` ci-dessus. La largeur RENDUE
   * rétrécit dès que le porteur est plus étroit que 300 px (223,4 px en
   * Bulles, mesuré) ; une hauteur qui ne suit pas DÉFORME chaque case — la
   * régression que G8, plus bas, mesure au niveau de la CASE. La règle
   * vérifiée est désormais celle que le style POSE — `aspectRatio: 300 /
   * 240` — soit `expectedGridWidth * 240 / 300`, jamais un littéral.
   */
  const expectedGridHeight = (expectedGridWidth * 240) / 300;
  expect(
    gridBox !== null && Math.abs(gridBox.height - expectedGridHeight) <= 0.5,
    `[${skin}/${scheme}] la boîte de la grille mesure ${expectedGridHeight.toFixed(1)}px de haut = min(300, porteur) × 240/300 (obtenu ${gridBox?.height})`,
  );
  expect(
    gridBox !== null && quadRowBox !== null && gridBox.x + gridBox.width <= quadRowBox.x + quadRowBox.width + 0.5,
    `[${skin}/${scheme}] la grille ne déborde jamais de la rangée (${JSON.stringify({ gridBox, quadRowBox })})`,
  );
  /**
   * LE COROLLAIRE DU PLAFOND, SUR LES QUATRE AGENCEMENTS.
   *
   * Plafonner la boîte (#7018) crée un risque que le débord n'avait pas : une
   * boîte qui RÉTRÉCIT et des cases qui ne rétrécissent pas seraient COUPÉES.
   * Et ce défaut-là se CACHE — la boîte porte `overflow: hidden` (mesuré),
   * donc rien ne dépasse, rien ne déclenche le témoin de défilement, et
   * l'image manquante ressemble à un cadrage voulu. C'est le pire des deux.
   *
   * Sur les QUATRE, jamais sur le seul quadruple : les trois agencements sont
   * gouvernés par des mécanismes DIFFÉRENTS — `flex-shrink` par défaut sur la
   * paire et le triplet (dont les cases portent une `width` EXPLICITE, ce qui
   * a tout l'air d'une cote qui ne cédera pas), `1fr 1fr` sur le quadruple.
   * Un témoin posé sur un seul d'entre eux ne dit rien des deux autres.
   */
  const expectNoTileClipped = async (id) => {
    const box = await rowOf(id).locator('[data-media-grid]').first().boundingBox();
    const tilesRight = await rowOf(id)
      .locator('[data-media-tile]')
      .evaluateAll((els) => Math.max(...els.map((el) => el.getBoundingClientRect().right)));
    expect(
      box !== null && tilesRight <= box.x + box.width + 0.5,
      `[${skin}/${scheme}] ${id} : aucune case n'est COUPÉE par la boîte (case la plus à droite ${tilesRight.toFixed(1)}, boîte ${box === null ? '?' : (box.x + box.width).toFixed(1)})`,
    );
  };
  await expectNoTileClipped(QUAD_ID);

  await scrollUntilMounted(page, scroller, OVERFLOW_ID);
  await waitForRowSettled(page, OVERFLOW_ID);
  const overflowRow = rowOf(OVERFLOW_ID);
  const overflowBadge = overflowRow.locator('[data-overflow]');
  expect((await overflowBadge.count()) === 1, `[${skin}/${scheme}] media-14 (6 images) porte un badge [data-overflow]`);
  expect(
    (await overflowBadge.textContent()) === '+2',
    `[${skin}/${scheme}] le badge dit « +2 » (6 pièces − 4 visibles) (obtenu ${await overflowBadge.textContent()})`,
  );
  const overflowTileCount = await overflowRow.locator('[data-media-tile]').count();
  expect(overflowTileCount === 4, `[${skin}/${scheme}] media-14 rend 4 tuiles visibles (obtenu ${overflowTileCount})`);
  const maskedTile = overflowRow.locator('[data-protected-attachment="hidden"]');
  expect((await maskedTile.count()) === 1, `[${skin}/${scheme}] la 3ᵉ pièce (isBlurred) rend son substitut masqué`);
  expect(
    (await maskedTile.locator('img').count()) === 0,
    `[${skin}/${scheme}] le substitut masqué ne rend AUCUN <img>`,
  );
  await expectNoTileClipped(OVERFLOW_ID);

  // ===== G2 — chaque tuile est décodée, aucune image perdue =====
  //
  // `naturalWidth` N'EST PAS LE BON TÉMOIN ICI (sondé, pas deviné) : dès
  // qu'un `<img>` porte un `srcset` à descripteur de LARGEUR (`imageVariants`,
  // D4 §1.4.4), le navigateur rapporte `naturalWidth` AJUSTÉ par la densité
  // implicite (`largeur déclarée du candidat / largeur du créneau `sizes``),
  // jamais la dimension réelle décodée. La fixture déclare `640w` pour un
  // pixel-témoin RÉELLEMENT 1×1 ; avec `sizes="149px"` (la case d'une grille
  // 4+), la densité calculée (~4,3) fait tomber `naturalWidth` à
  // `round(1 / 4,3) = 0` — MESURÉ (trois sondes, `1×1 + srcset 640w` ⇒ 0,
  // MÊME 1×1 SANS srcset ⇒ 1) — un vrai décodage réussi rendant un ZÉRO
  // trompeur, jamais un défaut de `MediaGrid`. `drawImage` sur un canvas,
  // lui, dessine les pixels RÉELLEMENT décodés quelle que soit la densité
  // rapportée (sondé : le même élément à `naturalWidth: 0` peint l'indigo
  // exact `99,102,241` une fois dessiné) — c'est ce que ce témoin vérifie :
  // « aucune image perdue » se lit au PIXEL peint, pas à une métrique que la
  // responsivité peut fausser sans qu'aucun octet ne soit perdu.
  await rowOf(QUAD_ID).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await waitForRowSettled(page, QUAD_ID);
  const quadImages = rowOf(QUAD_ID).locator('img[data-attachment-image]');
  const quadImageCount = await quadImages.count();
  const paintedColours = [];
  for (let i = 0; i < quadImageCount; i += 1) {
    const colour = await quadImages.nth(i).evaluate(async (el) => {
      if (typeof el.decode === 'function') await el.decode().catch(() => {});
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      const canvas = document.createElement('canvas');
      canvas.width = 4;
      canvas.height = 4;
      const context = canvas.getContext('2d');
      context.drawImage(el, 0, 0, 4, 4);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      return [r, g, b];
    });
    paintedColours.push(colour);
  }
  expect(
    paintedColours.length === 4 && paintedColours.every((rgb) => near(rgb, INDIGO)),
    `[${skin}/${scheme}] les 4 images de media-13 peignent le pixel servi, aucune perdue (${JSON.stringify(paintedColours)})`,
  );

  /**
   * « AUCUN SAUT AU CHARGEMENT » SE PROUVE SANS LES IMAGES (revue #6169). La
   * première écriture comparait `top` avant/après une attente, sur des images
   * DÉJÀ décodées (des data URI) : elle ne pouvait pas rougir. Une image non
   * encore chargée ne contribue AUCUNE taille intrinsèque — on retire donc les
   * `<img>` du rendu : si la hauteur de la RANGÉE bouge, c'est qu'elle
   * dépendait des octets, et le fil sautera sur un réseau lent.
   */
  const rowHeights = await rowOf(QUAD_ID).evaluate(async (row) => {
    const images = Array.from(row.querySelectorAll('img'));
    const withImages = row.getBoundingClientRect().height;
    images.forEach((img) => {
      img.style.display = 'none';
    });
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    const withoutImages = row.getBoundingClientRect().height;
    images.forEach((img) => {
      img.style.display = '';
    });
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    return { withImages, withoutImages };
  });
  expect(
    Math.abs(rowHeights.withImages - rowHeights.withoutImages) < 0.5,
    `[${skin}/${scheme}] la hauteur de media-13 ne dépend pas de ses octets — aucun saut au chargement (${JSON.stringify(rowHeights)})`,
  );

  /**
   * G5 — LA FORME DE LA GRILLE SUIT LA PEAU iOS (revue #6169). Deux sources
   * Swift, deux formes : la BULLE pose UNE boîte noire arrondie
   * (`BubbleStandardLayout.swift:814-817`, `.background(Color.black)` puis
   * `.clipShape` sur la grille entière) ; la rangée PLATE arrondit CHAQUE case
   * et ne peint rien entre elles (`FocalAttachmentBlock.swift:203-213`, le
   * `clipShape` est sur la cellule, aucun fond de conteneur) — la capture
   * Ref-Native `targets/thread.media-grid.light.png` montre les écarts au
   * fond du fil. Se lit au PIXEL : l'écart entre les deux premières cases, et
   * le coin intérieur bas-droit de la première.
   *
   * LE DÉFILEMENT EST APPARIÉ À L'ATTENTE (#7048) — `waitForRowSettled` attend
   * qu'une rangée cesse de BOUGER, jamais qu'elle soit À L'ÉCRAN. G5 était la
   * seule sonde de pixels de ce fichier à ne pas rapprocher les deux ; les
   * trois autres le font (`:227-228`, plus bas `:425-426` et `:563-564`).
   * Entre le `scrollIntoView` du témoin précédent et ce point-ci il y a le
   * décodage de quatre images et une mutation du DOM : la rangée a le temps de
   * sortir du viewport, et `paintedAt` découpe alors une capture hors image.
   */
  await rowOf(QUAD_ID).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await waitForRowSettled(page, QUAD_ID);
  const leadingBox = await rowOf(QUAD_ID).locator('[data-media-tile]').nth(0).boundingBox();
  const trailingBox = await rowOf(QUAD_ID).locator('[data-media-tile]').nth(1).boundingBox();
  const shapeGrid = await rowOf(QUAD_ID).locator('[data-media-grid]').first().boundingBox();
  const middleY = leadingBox.y + leadingBox.height / 2;
  const gapColour = await paintedAt(
    page,
    (leadingBox.x + leadingBox.width + trailingBox.x) / 2,
    middleY,
    `[${skin}/${scheme}] G5 — l'écart entre les deux premières cases`,
  );
  const innerCornerColour = await paintedAt(
    page,
    leadingBox.x + leadingBox.width - 1,
    leadingBox.y + leadingBox.height - 1,
    `[${skin}/${scheme}] G5 — le coin intérieur de la 1ʳᵉ case`,
  );
  if (skin === 'bulles') {
    expect(
      near(gapColour, BLACK) && near(innerCornerColour, INDIGO),
      `[${skin}/${scheme}] la bulle pose UNE boîte noire : écart noir, coin intérieur plein (écart ${gapColour}, coin ${innerCornerColour})`,
    );
  } else {
    const backgroundColour = await paintedAt(
      page,
      shapeGrid.x - 8,
      middleY,
      `[${skin}/${scheme}] G5 — le fond du fil à gauche de la grille`,
    );
    expect(
      loin(gapColour, BLACK) && near(gapColour, backgroundColour),
      `[${skin}/${scheme}] la rangée plate laisse l'écart au FOND du fil, jamais noir (écart ${gapColour}, fond ${backgroundColour})`,
    );
    expect(
      loin(innerCornerColour, INDIGO),
      `[${skin}/${scheme}] la rangée plate arrondit CHAQUE case : coin intérieur de la 1ʳᵉ hors média (coin ${innerCornerColour})`,
    );
  }

  // ===== G4 — la vidéo en grille est un <video> avec poster =====
  await scrollUntilMounted(page, scroller, TRIPLE_VIDEO_ID);
  await waitForRowSettled(page, TRIPLE_VIDEO_ID);
  const tripleRow = rowOf(TRIPLE_VIDEO_ID);
  expect(
    (await tripleRow.locator('[data-media-tile]').count()) === 3,
    `[${skin}/${scheme}] media-12 (2 images + 1 vidéo) rend 3 [data-media-tile]`,
  );
  expect(
    (await tripleRow.locator('video[poster]').count()) === 1,
    `[${skin}/${scheme}] la vidéo de media-12 porte un poster, jamais un <video> vide`,
  );
  await expectNoTileClipped(TRIPLE_VIDEO_ID);

  /* `media-11` n'était visitée par AUCUN gate — la PAIRE est pourtant le
     troisième agencement, et le seul dont les deux cases se partagent la
     largeur à parts égales sous `flex-shrink`. */
  await scrollUntilMounted(page, scroller, PAIR_ID);
  await waitForRowSettled(page, PAIR_ID);
  expect(
    (await rowOf(PAIR_ID).locator('[data-media-tile]').count()) === 2,
    `[${skin}/${scheme}] media-11 (2 images) rend 2 [data-media-tile]`,
  );
  await expectNoTileClipped(PAIR_ID);

  /**
   * ===== G8 — LA BOÎTE PLAFONNÉE GARDE LA FORME DE mediaGridSlots (#7030,
   * relecture adversariale — la revue de la PR n'avait jamais été JOUÉE) =====
   *
   * `expectNoTileClipped` (G1, ci-dessus) prouve que rien ne DÉBORDE quand la
   * boîte rétrécit (#7018) ; il ne prouve PAS que la FORME de chaque case
   * suit celle que `mediaGridSlots` élit. Or plafonner la LARGEUR
   * (`maxWidth: 100 %`) sans plafonner la HAUTEUR déforme : une `height`
   * littérale ne suit pas le rétrécissement, chaque case shrinkée par
   * `flex-shrink` se retrouve sous une hauteur inchangée. Mesuré AVANT
   * correctif, Bulles 390×844 : media-11 (paire) 223,4×180 au lieu de
   * 223,4×134,0 ; media-12 (triplet) même défaut sur la boîte.
   *
   * Le ratio de la BOÎTE se lit sur `style.aspectRatio` — la valeur RÉELLE
   * que le composant pose (`aspectRatio: \`\${MEDIA_GRID_MAX_WIDTH} /
   * \${boxHeight}\`\`), jamais un littéral recopié ici : si la loi change de
   * hauteur, ce témoin suit sans qu'on le retouche.
   *
   * Le ratio de CHAQUE CASE se lit sur `data-slot-width`/`data-slot-height`,
   * posés par `media-grid.tsx` depuis `mediaGridCellSizes()` — la sortie
   * RÉELLE de la loi à ce montage, jamais un littéral recopié ici.
   *
   * SUR LES TROIS AGENCEMENTS, jamais sur deux cases choisies (seconde
   * relecture #7030). La première écriture n'instrumentait que la paire et la
   * case GAUCHE du triplet — faute d'une hauteur de case, `mediaGridSlots`
   * portant par contrat la hauteur de la BOÎTE sur chacune. Elle laissait donc
   * SANS témoin le QUADRUPLE (`1fr 1fr`), le seul mécanisme dont la hauteur de
   * rangée dépend désormais de la largeur servie, et contredisait la règle que
   * `expectNoTileClipped` énonce plus haut dans ce fichier : « sur les QUATRE,
   * jamais sur le seul quadruple ». `mediaGridCellSizes` rend cette hauteur ;
   * chaque case la porte.
   *
   * Le parcours prend TOUTES les cases instrumentées de la rangée plutôt
   * qu'un index : une case MASQUÉE rend son substitut et n'en porte aucune
   * (`media-14`), et indexer par position y viserait la mauvaise case. Il
   * exige d'en trouver au moins `minimum` — sans quoi le témoin ne mesure
   * RIEN et doit rougir, jamais passer par absence de matière.
   */
  const checkBoxAspectRatio = async (id) => {
    const gridEl = rowOf(id).locator('[data-media-grid]').first();
    const aspectRatioStyle = await gridEl.evaluate((el) => el.style.aspectRatio);
    const parsed = /^([\d.]+)\s*\/\s*([\d.]+)$/.exec(aspectRatioStyle ?? '');
    expect(
      parsed !== null,
      `[${skin}/${scheme}] ${id} : la boîte porte un \`aspectRatio\` posé (obtenu ${JSON.stringify(aspectRatioStyle)})`,
    );
    if (parsed === null) return;
    const [, designWidth, designHeight] = parsed;
    const expectedRatio = Number(designWidth) / Number(designHeight);
    const box = await gridEl.boundingBox();
    const actualRatio = box === null || box.height === 0 ? 0 : box.width / box.height;
    expect(
      box !== null && Math.abs(actualRatio - expectedRatio) / expectedRatio <= 0.02,
      `[${skin}/${scheme}] ${id} : la boîte garde le ratio ${expectedRatio.toFixed(3)} posé par \`aspectRatio\` (obtenu ${actualRatio.toFixed(3)}, boîte ${JSON.stringify(box)})`,
    );
  };
  const checkSlotRatios = async (id, minimum) => {
    /* `evaluateAll` en UNE passe, jamais `getAttribute` sur un `nth()` : une
       case absente y ferait EXPIRER le localisateur (30 s) et remonterait en
       exception NON RATTRAPÉE — le gate rougirait bien, mais il s'ARRÊTERAIT
       là, emportant dans son silence tout ce qui suit dans le fichier ET la
       seconde peau. Une garde doit rougir SUR CE QU'ELLE MESURE, pas éteindre
       le reste du relevé (mesuré : 210 constats au lieu de ~600). */
    const measured = await rowOf(id)
      .locator('[data-slot-width]')
      .evaluateAll((els) =>
        els.map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            designWidth: Number(el.getAttribute('data-slot-width')),
            designHeight: Number(el.getAttribute('data-slot-height')),
            width: rect.width,
            height: rect.height,
          };
        }),
      );
    expect(
      measured.length >= minimum,
      `[${skin}/${scheme}] ${id} : au moins ${minimum} cases portent leur forme (mediaGridCellSizes), obtenu ${measured.length}`,
    );
    measured.forEach((cell, index) => {
      const expectedRatio = cell.designWidth / cell.designHeight;
      const actualRatio = cell.height === 0 ? 0 : cell.width / cell.height;
      expect(
        Number.isFinite(expectedRatio) &&
          expectedRatio > 0 &&
          Math.abs(actualRatio - expectedRatio) / expectedRatio <= 0.02,
        `[${skin}/${scheme}] ${id} case ${index} : ratio ${expectedRatio.toFixed(3)} (mediaGridCellSizes ${cell.designWidth}×${cell.designHeight}), obtenu ${actualRatio.toFixed(3)} (rendue ${cell.width.toFixed(1)}×${cell.height.toFixed(1)})`,
      );
    });
  };
  /* Le virtualiseur a démonté les rangées du haut en descendant : chaque
     agencement se REMONTE avant d'être mesuré (`scrollUntilMounted` rend la
     main tout de suite quand la rangée est déjà là). */
  const checkGridShape = async (id, minimum) => {
    await scrollUntilMounted(page, scroller, id);
    await waitForRowSettled(page, id);
    await checkBoxAspectRatio(id);
    await checkSlotRatios(id, minimum);
  };
  await checkGridShape(PAIR_ID, 2);
  await checkGridShape(TRIPLE_VIDEO_ID, 3);
  await checkGridShape(QUAD_ID, 4);
  /* `media-14` : SIX pièces, dont une MASQUÉE — trois cases instrumentées,
     jamais quatre. Le substitut masqué ne porte aucune cote (il n'a pas de
     forme de grille à garder), et c'est bien la raison pour laquelle ce
     témoin parcourt les cases plutôt que de les indexer. */
  await checkGridShape(OVERFLOW_ID, 3);

  /**
   * ===== G6 — LA VIDÉO SEULE OCCUPE UNE HAUTEUR (#7016) =====
   *
   * La branche SOLO de `MediaGrid` rendait `VideoTile` SANS conteneur
   * dimensionné, or sa racine est `size-full` avec tous ses enfants
   * `absolute inset-0` : un `height: 100%` contre un parent en hauteur `auto`
   * se résout en `auto` → contenu → ZÉRO. Mesuré avant ce lot, au navigateur :
   * `{focal: {w:246, h:0}, bulles: {w:119, h:0}}` — une vidéo INVISIBLE, dans
   * les deux peaux.
   *
   * La loi qui la dimensionne existait, testée et gardée par le gate de cotes
   * (`soloVideoSlot`, `media-grid-layout.ts`), et n'était appelée par PERSONNE
   * — le motif « une loi qui calcule une valeur que personne ne lit ». Ce
   * témoin mesure ce que la loi PRODUIT à l'écran, jamais son retour.
   *
   * Pourquoi le RATIO plutôt que la cote : la boîte est plafonnée à `100 %`
   * de son porteur (#7018 ci-dessous), donc sa largeur RENDUE dépend de la
   * peau (246 en Focal, la bulle en Bulles). Ce qui doit tenir dans les deux,
   * c'est la FORME que `soloVideoSlot` élit — et une hauteur non nulle.
   */
  await scrollUntilMounted(page, scroller, SOLO_VIDEO_ID);
  await waitForRowSettled(page, SOLO_VIDEO_ID);
  const soloRow = rowOf(SOLO_VIDEO_ID);
  const soloTileBox = await soloRow.locator('[data-media-tile]').first().boundingBox();
  const soloVideoBox = await soloRow.locator('video').first().boundingBox();
  expect(
    soloTileBox !== null && soloTileBox.height > 0,
    `[${skin}/${scheme}] media-15 (vidéo SEULE) a une hauteur NON NULLE (obtenu ${JSON.stringify(soloTileBox)})`,
  );
  expect(
    soloVideoBox !== null && soloVideoBox.height > 0 && soloVideoBox.width > 0,
    `[${skin}/${scheme}] le <video> de media-15 est VISIBLE, jamais un rectangle plat (obtenu ${JSON.stringify(soloVideoBox)})`,
  );
  expect(
    (await soloRow.locator('video[poster]').count()) === 1,
    `[${skin}/${scheme}] la vidéo SEULE de media-15 porte son poster, jamais un <video> vide`,
  );
  const soloRatio = soloTileBox === null || soloTileBox.height === 0 ? 0 : soloTileBox.width / soloTileBox.height;
  expect(
    Math.abs(soloRatio - SOLO_VIDEO_RATIO) <= 0.05,
    `[${skin}/${scheme}] media-15 garde la FORME élue par soloVideoSlot (${SOLO_VIDEO_RATIO.toFixed(3)}), obtenu ${soloRatio.toFixed(3)}`,
  );
  expect(
    soloTileBox !== null && soloTileBox.width <= 300.5,
    `[${skin}/${scheme}] media-15 ne dépasse jamais MEDIA_GRID_MAX_WIDTH (obtenu ${soloTileBox?.width})`,
  );

  /**
   * ===== G7 — LE FIL N'EST JAMAIS DÉFILABLE HORIZONTALEMENT (#7018) =====
   *
   * L'INVARIANT, plus fort et plus simple que « la grille ne déborde pas de la
   * rangée » (G1 ci-dessus) : il attrape TOUTE la famille — n'importe quelle
   * boîte de largeur fixe dans n'importe quel porteur contraint, pas seulement
   * la grille de `media-16`.
   *
   * Pourquoi G1 ne pouvait pas le voir : il assertait le débord de la RANGÉE,
   * jamais de la BULLE, et les cinq fixtures de grille venaient TOUTES d'un
   * autre expéditeur. Sur un message REÇU la bulle est collée à GAUCHE et les
   * 46,6 px de débord tombent dans la gouttière de 50 px — invisibles. Sur un
   * message DE MOI (`justify-end`) la même boîte sort de l'ÉCRAN. Le gate
   * était juste ; il lui manquait la donnée. `media-16` est cette donnée.
   */
  await scrollDownUntilMounted(page, scroller, MINE_GRID_ID);
  await waitForRowSettled(page, MINE_GRID_ID);
  const mineRow = rowOf(MINE_GRID_ID);
  if (skin === 'bulles') {
    const mineJustify = await mineRow.evaluate((el) => getComputedStyle(el).justifyContent);
    expect(
      mineJustify === 'flex-end',
      `[${skin}/${scheme}] media-16 est bien la branche « DE MOI » (justify-end), sans quoi ce témoin mesure l'autre cas (obtenu ${mineJustify})`,
    );
  }
  const mineGridBox = await mineRow.locator('[data-media-grid]').first().boundingBox();
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(
    mineGridBox !== null && mineGridBox.x + mineGridBox.width <= viewportWidth + 0.5,
    `[${skin}/${scheme}] la grille de media-16 reste DANS l'écran (bord droit ${mineGridBox === null ? '?' : mineGridBox.x + mineGridBox.width}, écran ${viewportWidth})`,
  );
  const scrollerWidths = await scroller.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(
    scrollerWidths.scrollWidth <= scrollerWidths.clientWidth,
    `[${skin}/${scheme}] le fil n'est JAMAIS défilable horizontalement (${JSON.stringify(scrollerWidths)})`,
  );
  /* G8 SUR `media-16`, ICI et pas dans son bloc : c'est le porteur le plus
     ÉTROIT du corpus (la bulle « DE MOI », collée à droite), donc celui où le
     rétrécissement de la boîte est le plus fort — la forme des cases y est le
     plus exposée. Elle est déjà montée par le témoin ci-dessus ; la remonter
     depuis le HAUT ne marcherait pas (`media-16` est le dernier avant
     `media-7`, voir `scrollDownUntilMounted`). */
  await checkBoxAspectRatio(MINE_GRID_ID);
  await checkSlotRatios(MINE_GRID_ID, 2);

  // ===== G3 — le tap ouvre la visionneuse au bon index, le focus est piégé, le retour la ferme =====
  // G7 a défilé VERS LE BAS : le virtualiseur a démonté `media-13`, il faut le remonter avant de le viser.
  await scrollUntilMounted(page, scroller, QUAD_ID);
  await rowOf(QUAD_ID).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await waitForRowSettled(page, QUAD_ID);
  const historyLengthBefore = await page.evaluate(() => window.history.length);
  const secondTile = rowOf(QUAD_ID).locator('[data-media-tile]').nth(1);
  await secondTile.click();
  await page.waitForSelector('[data-media-viewer]');

  const dialog = page.locator('[data-media-viewer]');
  expect((await dialog.getAttribute('role')) === 'dialog', `[${skin}/${scheme}] la visionneuse porte role="dialog"`);
  expect((await dialog.getAttribute('aria-modal')) === 'true', `[${skin}/${scheme}] la visionneuse porte aria-modal="true"`);
  expect(
    (await dialog.getAttribute('data-viewer-index')) === '1',
    `[${skin}/${scheme}] la visionneuse s'ouvre sur l'index 1 (2ᵉ tuile) (obtenu ${await dialog.getAttribute('data-viewer-index')})`,
  );
  const rootInert = await page.evaluate(() => document.getElementById('root')?.hasAttribute('inert') ?? false);
  expect(rootInert, `[${skin}/${scheme}] #root porte inert le temps de l'ouverture`);
  const focusedIsClose = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Fermer');
  expect(focusedIsClose, `[${skin}/${scheme}] le focus initial est sur le bouton « Fermer »`);

  /**
   * #7040 — ET LA PORTE DE SORTIE TIENT DANS LE CADRE. Le focus l'atteint (le
   * témoin ci-dessus) ; encore faut-il que le DOIGT le puisse. #7037 (iOS) a
   * rendu cette même croix à `x = −326,3` pour un viewport de 402 pt, sur le
   * plein écran d'une pièce jointe à PLUSIEURS pages : le plateau adoptait la
   * largeur du carrousel. La grille QUAD ouverte ici est exactement ce cas —
   * quatre pages, le carrousel le plus large du fil de conversation.
   */
  const porte = await confinementDe(page, '[data-media-viewer] .media-viewer-close', { nom: 'la croix de la visionneuse' });
  expect(porte.ok, `[${skin}/${scheme}] #7040 : ${porte.message}`);

  const filmstripItems = dialog.locator('[data-filmstrip-item]');
  expect((await filmstripItems.count()) === 4, `[${skin}/${scheme}] la pellicule compte 4 vignettes (media-13)`);
  expect(
    (await filmstripItems.nth(1).getAttribute('aria-current')) === 'true',
    `[${skin}/${scheme}] la 2ᵉ vignette porte aria-current="true"`,
  );

  /**
   * #6345 — LA GÉOMÉTRIE RÉELLE, AU NAVIGATEUR. `FILMSTRIP_RESERVED_HEIGHT`
   * (80, border-box) était calculée et testée en pur mais consommée par
   * PERSONNE : le couloir ne réservait que 70px (padding asymétrique). Deux
   * mesures, dans le MÊME navigateur que celui qui composite les pixels —
   * jamais un style calculé lu hors contexte (`getBoundingClientRect`, comme
   * `check-floating-clearance.mjs`) :
   * 1. la bande rend EXACTEMENT 80px (± 1 pour l'arrondi sous-pixel) ;
   * 2. la page MÉDIA active ne descend jamais SOUS le haut de la bande — la
   *    scène et la pellicule ne se recouvrent jamais.
   */
  const filmstripRect = await dialog.locator('[data-filmstrip]').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, height: r.height };
  });
  expect(
    Math.abs(filmstripRect.height - 80) < 1,
    `[${skin}/${scheme}] la pellicule réserve 80px (FILMSTRIP_RESERVED_HEIGHT), obtenu ${filmstripRect.height}`,
  );
  const activePageBottom = await dialog.locator('[data-viewer-page][data-full-pixels="true"]').first().evaluate((el) => {
    const inner = el.querySelector('img, video');
    return (inner ?? el).getBoundingClientRect().bottom;
  });
  expect(
    activePageBottom <= filmstripRect.top + 1,
    `[${skin}/${scheme}] le média actif reste AU-DESSUS de la pellicule (bas média ${activePageBottom}, haut pellicule ${filmstripRect.top})`,
  );

  /**
   * #6345 — DÉFILER LA PELLICULE À LA MAIN CHOISIT LE MÉDIA AFFICHÉ. Avant ce
   * lot, seul le CLIC sur une vignette sélectionnait (témoin G3 ci-dessus) ;
   * le défilement libre de la bande n'avait aucun effet retour sur la scène
   * (`filmstripIndexAtPlayhead` calculée, jamais lue). Miroir
   * `ConversationMediaFilmstrip` iOS 17+ (`scrollPosition(id:anchor:)`).
   */
  await dialog.locator('[data-filmstrip]').evaluate((el) => {
    el.scrollLeft = 179; // filmstripIndexAtPlayhead(179, 4) === 3 (media-stage.test.ts)
    el.dispatchEvent(new Event('scroll', { bubbles: false }));
  });
  await page.waitForFunction(() => document.querySelector('[data-media-viewer]')?.getAttribute('data-viewer-index') === '3');
  expect(
    (await filmstripItems.nth(3).getAttribute('aria-current')) === 'true',
    `[${skin}/${scheme}] défiler la pellicule à la main jusqu'à l'index 3 pose aria-current sur la 4ᵉ vignette`,
  );
  // Restauré à l'index 1 (clic, chemin déjà éprouvé par G3) — le reste du témoin G3 suppose cet état,
  // focus REMIS sur « Fermer » : le clic de restauration l'a déplacé sur la vignette.
  await filmstripItems.nth(1).click();
  await page.waitForFunction(() => document.querySelector('[data-media-viewer]')?.getAttribute('data-viewer-index') === '1');
  await dialog.getByRole('button', { name: 'Fermer' }).focus();

  // Shift+Tab depuis « Fermer » (le premier focalisable) revient au DERNIER
  // (motif QUE le composant lui-même applique — `nextFocusIndex`, prouvé ici
  // dans un vrai navigateur, jamais seulement en unitaire).
  await page.keyboard.press('Shift+Tab');
  const wrappedToLast = await page.evaluate(() => {
    const dlg = document.querySelector('[data-media-viewer]');
    const focusables = Array.from(dlg.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')).filter(
      (el) => !el.hasAttribute('disabled'),
    );
    return focusables.length > 0 && document.activeElement === focusables[focusables.length - 1];
  });
  expect(wrappedToLast, `[${skin}/${scheme}] Shift+Tab depuis « Fermer » boucle sur le DERNIER focalisable (le piège)`);

  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-media-viewer]', { state: 'detached' });
  const rootInertAfter = await page.evaluate(() => document.getElementById('root')?.hasAttribute('inert') ?? false);
  expect(!rootInertAfter, `[${skin}/${scheme}] Échap retire inert de #root`);
  const focusReturnedToTile = await page.evaluate(() => document.activeElement?.hasAttribute('data-media-tile') ?? false);
  expect(focusReturnedToTile, `[${skin}/${scheme}] Échap restitue le focus à la tuile cliquée`);

  const lengthAfterEscape = await page.evaluate(() => window.history.length);
  // Voir la correction de spécification en tête de fichier : l'entrée poussée
  // à l'ouverture est RENDUE (le curseur recule d'un cran), jamais EFFACÉE —
  // `history.length` ne peut donc que rester à `relevé + 1`, pour toujours.
  expect(
    lengthAfterEscape === historyLengthBefore + 1,
    `[${skin}/${scheme}] Échap REND son entrée : history.length reste à relevé+1 (relevé ${historyLengthBefore}, obtenu ${lengthAfterEscape})`,
  );
  const urlAfterEscape = new URL(page.url()).pathname;
  expect(
    urlAfterEscape === '/c/c-medias',
    `[${skin}/${scheme}] Échap ferme la COUCHE, jamais l'écran (URL ${urlAfterEscape})`,
  );

  await context.close();

  /**
   * RETOUR MATÉRIEL/NAVIGATEUR, DANS UN CONTEXTE NEUF (sondé, pas deviné) —
   * enchaîner un second `history.back()` RÉEL dans la MÊME page que celui
   * d'Échap ci-dessus s'est révélé une COURSE : `history.back()` navigue de
   * façon ASYNCHRONE au niveau du navigateur (pas seulement du DOM), et une
   * réouverture (nouveau `pushState`) qui course cette navigation encore EN
   * VOL fait parfois atterrir le `page.goBack()` suivant sur `about:blank`
   * (mesuré : intermittent, un run sur deux). Un DEUXIÈME retour réel dans la
   * MÊME page n'a rien à prouver que le premier ne prouve déjà ; l'isoler
   * dans un contexte neuf (un seul aller-retour d'historique) élimine la
   * course au lieu de la couvrir d'une attente de plus.
   */
  const backContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setScheme(backContext, scheme);
  const backPage = await backContext.newPage();
  await backPage.goto(`${BASE}/c/c-medias`, { waitUntil: 'load' });
  await backPage.waitForSelector('[data-message]');
  const backScroller = backPage.locator('main#contenu');
  await scrollUntilMounted(backPage, backScroller, QUAD_ID);
  await waitForRowSettled(backPage, QUAD_ID);
  if (skin === 'bulles') {
    await backPage.getByRole('button', { name: /Mode de lecture/ }).click();
    await backPage.getByRole('menuitemradio', { name: /Bulles/ }).click();
    await backPage.waitForFunction(() => typeof window.history.state?.backDismiss !== 'string');
    await waitForRowSettled(backPage, QUAD_ID);
  }
  await backPage.locator(`[data-message="${QUAD_ID}"]`).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await waitForRowSettled(backPage, QUAD_ID);
  /**
   * #6319 — l'entrée que le retour consomme est relevée À L'INSERTION de la
   * visionneuse (l'observateur de mutations s'exécute juste après le commit),
   * jamais après une attente : c'est l'historique que trouverait un retour
   * tapé dans la première image. Une entrée posée par un effet passif
   * (après peinture) laissait ce retour quitter le fil — `URL blank`.
   */
  await backPage.evaluate(() => {
    window.__entryBeforeViewer = window.history.state?.backDismiss ?? null;
    window.__entryAtViewerInsert = undefined;
    const observer = new MutationObserver(() => {
      if (document.querySelector('[data-media-viewer]') === null) return;
      observer.disconnect();
      window.__entryAtViewerInsert = window.history.state?.backDismiss ?? null;
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  await backPage.locator(`[data-message="${QUAD_ID}"] [data-media-tile]`).nth(1).click();
  await backPage.waitForSelector('[data-media-viewer]');
  const entries = await backPage.evaluate(() => ({
    before: window.__entryBeforeViewer,
    atInsert: window.__entryAtViewerInsert,
  }));
  expect(
    typeof entries.atInsert === 'string' && entries.atInsert !== entries.before,
    `[${skin}/${scheme}] la visionneuse est insérée AVEC son entrée d'historique — un retour dès la première image lui appartient (avant ${entries.before}, à l'insertion ${entries.atInsert})`,
  );
  await backPage.goBack();
  await backPage.waitForSelector('[data-media-viewer]', { state: 'detached' });
  const urlAfterGoBack = new URL(backPage.url()).pathname;
  expect(
    urlAfterGoBack === '/c/c-medias',
    `[${skin}/${scheme}] un retour navigateur ferme la visionneuse SANS quitter le fil (URL ${urlAfterGoBack})`,
  );
  await backContext.close();
}
