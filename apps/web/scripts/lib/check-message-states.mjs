import { contrastOf, luminanceOf } from './contrast.mjs';
import { pausedChronology } from './paused-chronology.mjs';

/**
 * 9 — LES ÉTATS DU MESSAGE (#5936) — un message épinglé, transféré, modifié,
 * système, sticker, lieu, emoji seul ou citant une story se reconnaît dans
 * le fil, sur la rangée plate comme en bulle. EXTRAIT dès sa naissance
 * (comme `check-media.mjs` l'a été avant lui) : l'hôte
 * (`check-thread-states.mjs`) était à 182 lignes du plafond dur — ajouter
 * cette suite EN PLACE l'aurait franchi.
 *
 * `expect`, `setScheme` et `AA_THRESHOLD` sont REMIS par l'hôte, jamais
 * redéfinis (même discipline que `check-media.mjs`).
 *
 * QUATRE RUNS (`focal/light`, `focal/dark`, `bulles/light`, `bulles/dark`) —
 * un état de badge se JUGE sur son propre fond, qui change avec le schéma
 * (`--ios-pinned`, le fond de rangée) et avec la peau (fond de la bulle
 * envoyée vs. transparent de la rangée plate).
 *
 * LE FIL EST VIRTUALISÉ ET OUVRE SCROLLÉ EN BAS (`thread.tsx`,
 * `scrollToIndex(…, { align: 'end' })`) — seize témoins ne tiennent PAS dans
 * un viewport de 390×844 + l'overscan (6) : `st-intro`…`st-notice` (les
 * sept premiers) ne sont PAS montés au chargement. Deux PASSES DE
 * DÉFILEMENT, sur `#contenu` (le conteneur du virtualiseur,
 * `routes/thread.tsx:672-692`) : le HAUT du fil (badges, transfert,
 * système), puis le BAS (déjà visible par défaut — emoji, sticker, lieu,
 * story). `scrollTop =` déclenche un `scroll` NATIF, que `useVirtualizer`
 * écoute déjà (`getScrollElement`) — aucune seconde loi de défilement.
 *
 * L'HORLOGE EST EN PAUSE, JAMAIS `install` SEUL (revue-correction #7054,
 * défaut majeur 1) — ce module posait l'horloge truquée (`install({ time:
 * INSTANT })`) SANS la mettre en pause (`pauseAt`), la cause racine EXACTE
 * des deux rouges de #7054 : sous Playwright 1.62.1, une horloge truquée
 * installée sans pause DÉRIVE 1:1 avec le temps mural. `no-fixed-
 * delays.test.ts` ne le voyait pas — sa garde n'itérait que quatre chemins,
 * et ce cinquième module n'y figurait pas. `pausedChronology` (`paused-
 * chronology.mjs`) est désormais le site UNIQUE qui pose l'horloge du gate.
 */

const INSTANT = new Date('2026-09-10T12:00:00.000Z').getTime();

/** Le budget de DÉMARRAGE, en millisecondes SIMULÉES — généreux et
 *  anti-blocage, jamais un délai : `factBefore` s'arrête au fait, et ne
 *  consomme ce budget que si le fil ne monte pas du tout (même discipline
 *  que `check-protection-states.mjs`). */
const MESSAGE_STATES_BOOT_BUDGET_MS = 15_000;

/** La couleur RÉELLEMENT peinte sur un nœud — `null` s'il est absent, comme
 * `contrastOf`. Sert les témoins de PARITÉ (deux nœuds, une seule teinte). */
const colorOf = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el === null ? null : getComputedStyle(el).color;
  }, selector);

const scrollContentTo = (page, position) =>
  page.evaluate((where) => {
    const el = document.getElementById('contenu');
    if (!el) return;
    el.scrollTop = where === 'top' ? 0 : el.scrollHeight;
  }, position);

/**
 * UN CRAN ISSU D'iOS QUI NE TIENT PAS AA — QUANTIFIÉ, PAS EXIGÉ (revue-
 * correction #5936, défauts majeurs 3/5/9). Trois crans que ce lot sert
 * fidèlement à leur source Swift (`--ios-pinned` = `pinnedBlue`,
 * `--color-ios-ink-2` × `META_TEXT_OPACITY` = `textSecondary.opacity(0.5)`)
 * mesurent sous 4,5:1 MÊME correctement dérivés — c'est un défaut de la
 * CIBLE iOS elle-même (constante theme-invariant, aucune rampe plus
 * sombre), pas un raccourci pris ici : la revue l'a établi en refusant le
 * contournement qui les recolorait en indigo de marque pour forcer le vert
 * (défaut majeur 9). `contrastOf >= AA_THRESHOLD` y serait un gate qui ne
 * peut JAMAIS passer — ce qui n'est pas mesurer, c'est mentir sur ce qu'on
 * mesure. Ce témoin QUANTIFIE (le nombre est dans le message, donc dans
 * tout rapport de gate) sans exiger l'impossible ; la remontée de ces crans
 * est un lot À PART, tracé par l'issue compagnon #6010.
 */
async function expectQuantifiedContrast(page, selector, label, what, expect) {
  const contrast = await contrastOf(page, selector);
  expect(contrast !== null, `${label} ${what} : contraste mesurable (${contrast}) — cran iOS sous AA, connu, hors lot`);
}

/** Mesure la hauteur de chaque témoin, attend, remesure — AUCUN artwork ne
 * doit sauter après son montage (§ critère c de la spécification). */
async function assertStableHeights(page, ids, label, expect) {
  const before = {};
  for (const id of ids) {
    before[id] = await page.locator(`[data-message="${id}"]`).evaluate((el) => el.getBoundingClientRect().height);
  }
  await page.waitForTimeout(600);
  for (const id of ids) {
    const after = await page.locator(`[data-message="${id}"]`).evaluate((el) => el.getBoundingClientRect().height);
    expect(Math.abs(after - before[id]) < 0.5, `${label} ${id} : hauteur stable (${before[id]}px → ${after}px)`);
  }
}

export async function checkMessageStates({ browser, BASE, expect, setScheme, AA_THRESHOLD, skin, scheme }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setScheme(context, scheme);
  const page = await context.newPage();
  const chrono = await pausedChronology(page, { time: INSTANT });
  await page.goto(`${BASE}/c/c-states`, { waitUntil: 'load' });
  const booted = await chrono.factBefore(chrono.now() + MESSAGE_STATES_BOOT_BUDGET_MS, () =>
    page.evaluate(() => document.querySelector('[data-message]') !== null),
  );
  expect(booted, `[${skin}/${scheme}] le fil des états est monté sous horloge en pause (${chrono.now()} ms simulées)`);
  await chrono.advanceBy(300);

  if (skin === 'bulles') {
    await page.getByRole('button', { name: /Mode de lecture/ }).click();
    await page.getByRole('menuitemradio', { name: /Bulles/ }).click();
    await chrono.advanceBy(300);
  }

  const label = `[${skin}/${scheme}]`;
  const rowOf = (id) => page.locator(`[data-message="${id}"]`);

  // ===== LE HAUT DU FIL — badges, transfert, système =====
  await scrollContentTo(page, 'top');
  await page.waitForTimeout(300);

  const badgesRow = rowOf('st-badges');
  expect((await badgesRow.locator('[data-badge="pinned"]').count()) > 0, `${label} st-badges porte le badge épinglé`);
  expect((await badgesRow.locator('[data-badge="forwarded"]').count()) > 0, `${label} st-badges porte le badge transféré`);
  expect((await badgesRow.locator('[data-badge="edited"]').count()) > 0, `${label} st-badges porte « modifié »`);

  const hasForwarded = (await badgesRow.locator('[data-badge="forwarded"]').count()) > 0;
  /**
   * L'ATTENDU EST LA COMPOSITION, PAS LA LANGUE (#7337) — même patron que
   * `st-place` ci-dessous (#7328).
   *
   * Cette ligne attendait la CHAÎNE FRANÇAISE « Transféré depuis Salon ». Le
   * Chromium de ce gate est `en-US` (aucune `locale` posée) : elle était verte
   * parce que `forwardLabelOf` écrivait son libellé EN DUR, en français — elle
   * mesurait que le badge n'était pas traduit. Le badge vient désormais du
   * catalogue ; ce qu'il garde vraiment tient en quatre faits, dont aucun ne
   * parle français :
   *   1. le badge a un texte NON VIDE ;
   *   2. il est COMPOSÉ À PARTIR DE LA DONNÉE — le nom de la conversation
   *      d'origine du fixture, « Salon », un nom propre identique dans les
   *      sept catalogues ;
   *   3. il ne se RÉDUIT pas à ce nom — le qualifiant « transféré » est là ;
   *   4. il n'est pas un IDENTIFIANT de catalogue (`message.forwarded…`), ce
   *      qu'une clé absente d'une langue rendrait telle quelle.
   */
  const FORWARD_SOURCE = 'Salon';
  const forwardedText = hasForwarded ? (await badgesRow.locator('[data-badge="forwarded"]').innerText()).trim() : null;
  expect(
    forwardedText !== null &&
      forwardedText !== '' &&
      forwardedText.includes(FORWARD_SOURCE) &&
      forwardedText !== FORWARD_SOURCE &&
      !forwardedText.includes('message.forwarded'),
    `${label} st-badges : badge transféré composé à partir de « ${FORWARD_SOURCE} » (obtenu ${JSON.stringify(forwardedText)})`,
  );

  const badgesHtml = await badgesRow.innerHTML();
  const pinnedIndex = badgesHtml.indexOf('data-badge="pinned"');
  const forwardedIndex = badgesHtml.indexOf('data-badge="forwarded"');
  const anchorIndex = skin === 'focal' ? badgesHtml.indexOf('data-identity') : badgesHtml.indexOf('rounded-bubble');
  expect(
    pinnedIndex > -1 && forwardedIndex > pinnedIndex && (anchorIndex === -1 || anchorIndex > forwardedIndex),
    `${label} ordre DOM : pinned avant forwarded avant ${skin === 'focal' ? '[data-identity]' : '.rounded-bubble'}`,
  );

  if (hasForwarded) {
    /* `pinned` (`--ios-pinned`) ET `edited` (le cran méta) sont QUANTIFIÉS,
       jamais exigés à l'AA_THRESHOLD (revue-correction #5936, défaut majeur
       9) — mesuré 3,68:1 / 2,21:1 en clair, un défaut de la CIBLE iOS, pas
       de web-v2 (`expectQuantifiedContrast`, § doc-comment). Seul
       `forwarded` (le cran `textMuted`) tient l'AA — c'est le cran que la
       revue a laissé passer. */
    await expectQuantifiedContrast(page, `[data-message="st-badges"] [data-badge="pinned"]`, label, 'contraste du badge épinglé', expect);
    const forwardedContrast = await contrastOf(page, `[data-message="st-badges"] [data-badge="forwarded"]`);
    expect(
      forwardedContrast !== null && forwardedContrast >= AA_THRESHOLD,
      `${label} contraste AA du badge transféré (${forwardedContrast}:1 >= ${AA_THRESHOLD})`,
    );
    await expectQuantifiedContrast(page, `[data-message="st-badges"] [data-badge="edited"]`, label, 'contraste de « modifié »', expect);
  }

  /* st-edited — « modifié » sur un message ENVOYÉ (revue-correction #5936).
     LA TEINTE SUIT LA SURFACE, JAMAIS L'EXPÉDITEUR : `--color-meta-mine`
     vaut `white 70%` et n'a de sens que POSÉE SUR l'indigo de marque. Les
     trois contrastes ci-dessus se mesurent tous sur `st-badges`, REÇU — la
     branche « envoyé » n'était mesurée par aucun des quatre runs, et la
     rangée PLATE, qui n'a JAMAIS de bulle, servait quand même ce blanc.
     En Focal les deux rangées doivent donc porter la MÊME teinte — QUANTIFIÉE,
     pas exigée à l'AA (défaut majeur 9, § `expectQuantifiedContrast`) ; en
     Bulles, `st-edited` est une bulle BOÎTÉE — sa méta porte légitimement la
     teinte de la bulle (mesurée hors-lot, § restants). */
  /* AU REPOS, ET NON SEULEMENT AU DOM (revue-correction #5936).
     `contrastOf` lit l'opacité de l'ÉLÉMENT, jamais celle de ses ancêtres :
     enfermé dans `.focal-meta` (`opacity: 0` hors révélé), « modifié »
     mesurait 7,9:1 tout en étant INVISIBLE. `checkVisibility` interroge la
     chaîne entière — c'est le seul témoin qui distingue « présent » de
     « vu ». Les trois badges de tête passent au même crible : ils sont des
     PROPRIÉTÉS du message, jamais du geste de défilement. */
  for (const [id, badge] of [
    ['st-badges', 'pinned'],
    ['st-badges', 'forwarded'],
    ['st-badges', 'edited'],
    ['st-edited', 'edited'],
  ]) {
    const seen = await page
      .locator(`[data-message="${id}"] [data-badge="${badge}"]`)
      .evaluate((el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }));
    expect(seen, `${label} ${id} : le badge « ${badge} » est VU au repos, pas seulement présent au DOM`);
  }

  if (skin === 'focal') {
    const editedMineColor = await colorOf(page, `[data-message="st-edited"] [data-badge="edited"]`);
    const editedTheirsColor = await colorOf(page, `[data-message="st-badges"] [data-badge="edited"]`);
    expect(
      editedMineColor !== null && editedMineColor === editedTheirsColor,
      `${label} « modifié » : même teinte envoyé/reçu sur la rangée plate (${editedMineColor} vs ${editedTheirsColor})`,
    );
    /* QUANTIFIÉ, pas exigé (même raison que ci-dessus) — la PARITÉ
       envoyé/reçu, elle, EST exigée et vient d'être vérifiée. */
    await expectQuantifiedContrast(
      page,
      `[data-message="st-edited"] [data-badge="edited"]`,
      label,
      'contraste de « modifié » sur un message ENVOYÉ',
      expect,
    );
  }

  /* st-fwd-group — un groupe SOUS le seuil : le badge SANS nom (#7337).
     L'ancienne ligne cherchait « Transféré< » dans le HTML : le mot français
     suivi d'une balise. Le fait qu'elle gardait — le badge est là et ne nomme
     PERSONNE — se dit sans langue : le badge existe, son texte n'est ni vide ni
     une clé de catalogue, il ne porte pas le nom retenu (« Privé », la donnée
     du fixture) et il n'est pas le libellé NOMMÉ de `st-badges` — un badge qui
     rendrait « … depuis Privé » ou recopierait l'autre rangée tomberait. */
  const fwdGroupBadge = rowOf('st-fwd-group').locator('[data-badge="forwarded"]');
  const fwdGroupText = (await fwdGroupBadge.count()) > 0 ? (await fwdGroupBadge.innerText()).trim() : null;
  expect(
    fwdGroupText !== null &&
      fwdGroupText !== '' &&
      !fwdGroupText.includes('message.forwarded') &&
      !fwdGroupText.includes('Privé') &&
      fwdGroupText !== forwardedText,
    `${label} st-fwd-group : badge transféré SANS nom (obtenu ${JSON.stringify(fwdGroupText)}, nommé ${JSON.stringify(forwardedText)})`,
  );
  const fwdGroupHtml = await rowOf('st-fwd-group').innerHTML();
  expect(!fwdGroupHtml.includes('Privé'), `${label} st-fwd-group : « Privé » absent du HTML (attributs compris)`);

  // st-call, st-join, st-notice — rangée système : plate en Focal, capsule en Bulles.
  for (const id of ['st-call', 'st-join', 'st-notice']) {
    const row = rowOf(id);
    expect((await row.locator('[data-system]').count()) > 0, `${label} ${id} porte [data-system]`);
    const html = await row.innerHTML();
    if (skin === 'focal') {
      expect(
        !html.includes('rounded-bubble') && !html.includes('system-notice'),
        `${label} ${id} : aucune .rounded-bubble ni .system-notice en Focal`,
      );
    } else {
      expect(html.includes('system-notice'), `${label} ${id} : capsule .system-notice en Bulles`);
    }
    expect(!html.includes('avatar-root'), `${label} ${id} : aucun avatar`);
    const text = (await row.innerText()).trim();
    expect(/^\d{2}:\d{2}/.test(text), `${label} ${id} : l'heure précède le texte (« ${text.slice(0, 20)}… »)`);

    /* LE CONTRASTE DE LA RANGÉE SYSTÈME, QUANTIFIÉ (revue-correction #5936,
       défaut majeur 5) — NI l'heure NI le texte n'étaient mesurés avant ce
       lot. Les DEUX lisent maintenant le cran méta déjà dérivé
       (`--color-ios-ink-2` × `META_TEXT_OPACITY`, remplaçant le littéral
       `--color-meta` de la régression F-083) — le MÊME cran que « modifié »
       ci-dessus, donc `expectQuantifiedContrast` : QUANTIFIÉ, pas exigé à
       l'AA (défaut majeur 9, un gap de la CIBLE iOS, pas de web-v2). */
    await expectQuantifiedContrast(page, `[data-message="${id}"] [data-system] time`, label, `${id} : contraste de l'heure système`, expect);
    await expectQuantifiedContrast(page, `[data-message="${id}"] [data-system] > span`, label, `${id} : contraste du texte système`, expect);
  }

  /* LOI 4 SUR LES RANGÉES SYSTÈME (revue-correction #5936, défaut BLOQUANT
     4) — `data-row` n'est plus posé sur une rangée système
     (`routes/thread-modes.tsx`, `isSystemMessage`) : `useLongPress` n'y est
     câblé sur AUCUN geste, donc un clic droit ne doit ouvrir AUCUN
     `[role=menu]`. Avant ce correctif, le MÊME menu qu'un message ordinaire
     s'ouvrait sur « Appel vidéo · 04:32 » ou « Bruno Bêta a rejoint la
     conversation », et ses six réactions étaient INERTES (loi 4 prise en
     défaut). */
  await rowOf('st-notice').click({ button: 'right' });
  await page.waitForTimeout(300);
  expect(
    (await page.locator('[role="menu"]').count()) === 0,
    `${label} st-notice : un clic droit n'ouvre AUCUN menu de message (rangée système)`,
  );

  await assertStableHeights(page, ['st-badges', 'st-call', 'st-join', 'st-notice'], label, expect);

  // ===== LE BAS DU FIL — emoji, sticker, lieu, story (déjà visible par défaut) =====
  await scrollContentTo(page, 'bottom');
  await page.waitForTimeout(300);

  // st-emoji-1 — 90px ; st-emoji-3 — l'ORIGINAL, jamais la traduction.
  const emojiOnlyFontSize = await rowOf('st-emoji-1').locator('[data-emoji-only]').evaluate((el) => getComputedStyle(el).fontSize);
  expect(emojiOnlyFontSize === '90px', `${label} st-emoji-1 : 90px (obtenu ${emojiOnlyFontSize})`);
  const emoji3Text = await rowOf('st-emoji-3').innerText();
  expect(emoji3Text.includes('🔥🔥🔥'), `${label} st-emoji-3 : le texte ORIGINAL`);
  expect(!emoji3Text.includes('feu feu feu'), `${label} st-emoji-3 : jamais la traduction (témoin de rang)`);

  /* st-sticker — SANS gabarit, AVEC emoji ET pièce jointe : le GLYPHE natif
     l'emporte sur le PNG (revue-correction #5936, défaut majeur 6a,
     `RenderSource.resolve`, `BubbleSticker.swift:60-70`). Le témoin
     précédent exigeait une `<img>` ici — il ENTÉRINAIT la priorité
     inversée ; c'est désormais l'ABSENCE d'`<img>` qui prouve le correctif. */
  const stickerGlyph = rowOf('st-sticker').locator('[data-sticker-emoji]');
  expect((await stickerGlyph.count()) > 0, `${label} st-sticker : le GLYPHE natif (pas le PNG), emoji ET pièce jointe présents`);
  expect(
    (await rowOf('st-sticker').locator('img[alt^="Sticker"]').count()) === 0,
    `${label} st-sticker : AUCUNE <img> — le PNG n'est que le repli des clients qui ne dessinent pas`,
  );
  /* LA POLICE (90, `EmojiOnlyResult.single.fontSize`) — et AUCUN débord
     (#7881). La boîte 60×60 (`BubbleSticker.emojiBox`) servie en CSS laissait
     un glyphe de ~100 px déborder de sa rangée sur le nom, l'heure et le
     sticker voisins ; le témoin précédent exigeait EXACTEMENT ce 60 et
     gardait donc le défaut. Ce qu'il mesure désormais est la propriété :
     la rangée CONTIENT ce que le glyphe peint. */
  const stickerGlyphBox = await stickerGlyph.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const row = el.closest('[data-message]')?.getBoundingClientRect();
    return {
      height: Math.round(box.height),
      fontSize: getComputedStyle(el).fontSize,
      contained: row !== undefined && box.top >= row.top - 0.5 && box.bottom <= row.bottom + 0.5,
    };
  });
  expect(stickerGlyphBox.fontSize === '90px', `${label} st-sticker : police du glyphe 90px (obtenu ${stickerGlyphBox.fontSize})`);
  expect(stickerGlyphBox.height >= 90, `${label} st-sticker : la boîte du glyphe réserve sa hauteur peinte (obtenu ${stickerGlyphBox.height})`);
  expect(stickerGlyphBox.contained, `${label} st-sticker : le glyphe tient DANS sa rangée — aucun débord sur les voisins`);

  // st-sticker-bare — aucun gabarit, aucune pièce jointe : repli emoji (glyphe).
  const stickerBareHtml = await rowOf('st-sticker-bare').innerHTML();
  expect(stickerBareHtml.includes('data-sticker-emoji'), `${label} st-sticker-bare : repli emoji (aucune pièce jointe)`);
  /* Le chemin « PNG seul » (gabarit inconnu, aucun emoji) est couvert par un
     test de COMPOSANT pur — `message-body-blocks.test.ts` — jamais ici :
     un fixture de plus dans ce corpus VIRTUALISÉ pousse `st-emoji-1` hors de
     la fenêtre de rendu par défaut (mesuré, revue-correction #5936). */

  // st-place — lien Plans nommé, aria-label composé.
  const placeLink = rowOf('st-place').locator('a[href^="https://maps.apple.com/"]');
  expect((await placeLink.count()) > 0, `${label} st-place : un lien vers maps.apple.com`);
  expect((await placeLink.getAttribute('target')) === '_blank', `${label} st-place : target="_blank"`);
  /**
   * L'ATTENDU EST LA COMPOSITION, PAS LA LANGUE (#7328).
   *
   * Cette ligne attendait la CHAÎNE FRANÇAISE `'Position : Tour Eiffel'`.
   * `launchChromium`/`newContext` ne posent aucune `locale` : le Chromium de
   * Playwright est `en-US` par DÉFAUT, ici comme en CI (mesuré :
   * `navigator.language === 'en-US'`, `document.documentElement.lang === 'en'`).
   * Ce gate a donc TOUJOURS tourné en anglais — et il était vert parce que le
   * libellé de la carte était EN DUR en français. Il ne mesurait pas la
   * composition : il mesurait que le produit n'était pas traduit. Les deux
   * étaient indiscernables tant que le défaut existait.
   *
   * Ce qu'il garde vraiment tient en trois faits, et aucun ne parle français :
   *   1. le lien a un nom accessible NON VIDE (un lien anonyme n'est pas
   *      atteignable au lecteur d'écran) ;
   *   2. ce nom est COMPOSÉ À PARTIR DE LA DONNÉE — il contient le nom du lieu
   *      du fixture, « Tour Eiffel », qui est un nom propre : la donnée, pas
   *      un libellé, donc identique dans les sept catalogues ;
   *   3. il ne se RÉDUIT pas à ce nom — il y a bien un qualifiant autour
   *      (« Position : … », « Location: … »), ce que le mot « composé » dit.
   *
   * Et un quatrième, que l'ancienne écriture ne pouvait pas porter : le nom
   * ne doit pas être un IDENTIFIANT de catalogue. Une clé absente d'une langue
   * rend sa clé telle quelle — un `aria-label` valant « message.location.a11y »
   * aurait satisfait 1 à 3 sans rien annoncer à personne.
   *
   * LA VALEUR OBTENUE EST IMPRIMÉE. L'ancienne ligne n'en disait rien : son
   * échec ne permettait pas de distinguer « mauvaise composition » de « autre
   * langue », et il a fallu sonder le navigateur pour le savoir.
   */
  const placeLabel = await placeLink.getAttribute('aria-label');
  const placeName = 'Tour Eiffel';
  expect(
    typeof placeLabel === 'string' &&
      placeLabel.trim() !== '' &&
      placeLabel.includes(placeName) &&
      placeLabel.trim() !== placeName &&
      !placeLabel.includes('message.location'),
    `${label} st-place : aria-label composé (obtenu ${JSON.stringify(placeLabel)})`,
  );
  /* « OUVRIR DANS PLANS » TIENT L'AA (revue-correction #5936, défaut majeur
     5) — c'est la SEULE affordance qui dit que la carte s'ouvre, servie en
     `--color-ios-ink` (l'encre PLEINE, jamais l'accent de conversation, qui
     n'est pas un jeton de texte) : à la différence des crans méta ci-dessus,
     CELLE-CI doit et peut tenir 4,5:1. */
  const placeActionContrast = await contrastOf(
    page,
    `[data-message="st-place"] a[href^="https://maps.apple.com/"] span:last-child`,
  );
  expect(
    placeActionContrast !== null && placeActionContrast >= AA_THRESHOLD,
    `${label} st-place : « Ouvrir dans Plans » tient l'AA (${placeActionContrast}:1 >= ${AA_THRESHOLD})`,
  );

  // st-story / st-story-gone — la carte subsiste, INERTE (aucune route story câblée en production).
  for (const id of ['st-story', 'st-story-gone']) {
    const row = rowOf(id);
    expect((await row.locator('[data-story-citation]').count()) > 0, `${label} ${id} : la carte de citation se rend`);
    /* `button[data-story-citation]`, JAMAIS `[data-story-citation] button` :
       le marqueur est posé SUR le bouton quand le geste s'arme
       (`StoryCitationCard`, `message-body-blocks.tsx`), jamais sur un
       descendant — le sélecteur descendant rendait 0 dans les DEUX cas,
       donc un témoin qui ne pouvait pas rougir (revue-correction #5936). */
    const citationTag = await row.locator('[data-story-citation]').evaluate((el) => el.tagName);
    expect(citationTag === 'DIV', `${label} ${id} : la carte est un DIV inerte (obtenu ${citationTag})`);
    expect(
      (await row.locator('button[data-story-citation]').count()) === 0,
      `${label} ${id} : aucun bouton (aucune route story câblée)`,
    );
  }
  /* st-story-gone — AUCUN instantané servi (#7881) : pas de 9:16 vide, un
     bandeau qui DIT l'état. */
  expect(
    (await rowOf('st-story-gone').locator('[data-story-scene]').count()) === 0,
    `${label} st-story-gone : aucune scène vide — la carte se compacte`,
  );
  expect(
    (await rowOf('st-story-gone').locator('[data-story-unavailable]').count()) > 0,
    `${label} st-story-gone : le bandeau dit que la story est indisponible`,
  );
  const sceneHeight = await rowOf('st-story').locator('[data-story-scene]').evaluate((el) => el.getBoundingClientRect().height);
  expect(Math.abs(sceneHeight - (132 * 16) / 9) <= 1, `${label} st-story : hauteur de scène = 132 × 16/9 ± 1 (obtenu ${sceneHeight})`);

  /* LA LUMINANCE DU FOND DE SECOURS DE LA SCÈNE (revue-correction #5936,
     défaut majeur 7) — `color-mix(accent, black)` rendait la MÊME dalle
     quasi noire dans les QUATRE runs (aucune variation de schéma). Mélangée
     à `--ios-surface` (`.story-scene-fallback`, `thread-system.css`), la
     luminance doit être PLUS HAUTE en clair qu'en sombre — le témoin qui
     distingue « le schéma a un effet » de « il n'en a aucun ». */
  const sceneLuminance = await luminanceOf(page, `[data-message="st-story"] [data-story-scene]`);
  expect(sceneLuminance !== null, `${label} st-story : luminance du fond de scène mesurable (${sceneLuminance})`);
  if (scheme === 'light') {
    expect(
      sceneLuminance !== null && sceneLuminance > 0.3,
      `${label} st-story : le fond de secours est PÂLE en schéma clair (luminance ${sceneLuminance} > 0.3)`,
    );
  } else {
    expect(
      sceneLuminance !== null && sceneLuminance < 0.3,
      `${label} st-story : le fond de secours reste SOMBRE en schéma sombre (luminance ${sceneLuminance} < 0.3)`,
    );
  }

  // LE BANDEAU « réponse à sa story » — QUANTIFIÉ (même cran méta que ci-dessus).
  await expectQuantifiedContrast(page, `[data-message="st-story"] [data-story-scene] + span`, label, 'st-story : contraste du bandeau', expect);

  /* st-emoji-mine — LE CORPS NU DU CÔTÉ « ENVOYÉ » (revue-correction #5936).
     Un emoji seul et un sticker se rendent HORS de la boîte colorée : l'heure
     qui les accompagne n'a plus d'indigo derrière elle, et la teinte
     « meta-mine » (`white 70%`) y devenait illisible en schéma clair — mesuré
     1,3:1. iOS le dit à cet endroit précis — `BubbleFooter.compactMetaColor`
     (`:62-66`), « la couleur meta neutre quel que soit isMe ». Le témoin est
     une PARITÉ, pas un seuil : la méta du fil est dérivée de
     `FocalMetrics.MetaText.lightOpacity` / `BubbleFooter.swift:283` et tient
     sa propre cote (sous AA, hors-lot — § restants) ; ce que CE lot doit
     garantir, c'est qu'un corps nu ENVOYÉ ne diverge pas d'un corps nu REÇU. */
  const mineTimeColor = await colorOf(page, `[data-message="st-emoji-mine"] time`);
  const theirsTimeColor = await colorOf(page, `[data-message="st-emoji-1"] time`);
  expect(
    mineTimeColor !== null && mineTimeColor === theirsTimeColor,
    `${label} corps nu : l'heure a la MÊME teinte envoyé/reçu (${mineTimeColor} vs ${theirsTimeColor})`,
  );

  await assertStableHeights(page, ['st-emoji-1', 'st-sticker', 'st-place', 'st-story', 'st-story-gone'], label, expect);

  await page.close();
  await context.close();
}
