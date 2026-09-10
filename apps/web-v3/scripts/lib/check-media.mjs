import { contrastOf } from './contrast.mjs';

/**
 * 8 — LES MÉDIAS DU FIL (#5805) — UNE IMAGE S'AFFICHE, UN VOCAL SE JOUE, DANS
 * LA LANGUE DU LECTEUR. EXTRAIT de `check-thread-states.mjs` (revue #5805).
 *
 * L'hôte portait 1 149 lignes APRÈS le lot #5805 — dans le budget de
 * 1 000-1 200 (`CLAUDE.md` § Code Style), mais à 51 lignes du plafond DUR,
 * c'est-à-dire à un écran de la fin : chaque lot d'écran ajoute sa suite ici.
 * On extrait donc AVANT d'ajouter les trois témoins de la revue, exactement
 * comme `lib/check-summary.mjs` l'a fait pour `check-reading-mode.mjs`.
 * Découpé PAR RESPONSABILITÉ — la section « médias » et rien d'autre.
 *
 * `expect`, `setScheme` et `AA_THRESHOLD` sont REMIS par l'hôte, jamais
 * redéfinis : deux compteurs de défauts rendraient un gate vert avec des
 * échecs dedans (leçon de `lib/check-summary.mjs`).
 *
 * DEUX PEAUX × DEUX SCHÉMAS : la loi vit dans `attachment-blocks.tsx`, un
 * site UNIQUE pour les deux peaux — mais le CONTRASTE, lui, dépend du schéma,
 * et le défaut trouvé en revue (transcription à 3,74:1 en clair) ne se voyait
 * que là. L'hôte appelle donc Focal/clair et Bulles/sombre.
 *
 * Prisme navigateur : Chromium (`launchChromium`, `scripts/lib/browser.mjs`)
 * démarre en `en-US` — `READER_LANGUAGES` (`src/lib/reader.ts`) rend donc
 * `['fr', 'en']` (rang 1 configuré + rang 4 la locale de l'appareil). C'est
 * ce prisme qui décide quelle piste chaque témoin sert ICI (le rang ≠ 1 est
 * prouvé en unitaire, `attachment-blocks.test.tsx`) :
 * - `media-2` (EN, pistes fr+de) ⇒ rang 1 'fr' a une piste ⇒ sert `fr` ;
 * - `media-3` (DE, pistes en+es-sans-url) ⇒ rang 1 'fr' N'A PAS de piste sur
 *   CE témoin ⇒ rang 2 'en' sert le texte ET la piste.
 */
const MEDIA_IMAGE_ATTACHMENT_ID = 'media-1-a1';
const MEDIA_VOICE_EN_ATTACHMENT_ID = 'media-2-a1';
const MEDIA_VOICE_DE_ATTACHMENT_ID = 'media-3-a1';
const MEDIA_BROKEN_IMAGE_ATTACHMENT_ID = 'media-5-a1';
const MEDIA_BROKEN_VOICE_ATTACHMENT_ID = 'media-6-a1';
const PLAY_LABEL = "Lire l'audio";
const PAUSE_LABEL = 'Mettre en pause';

export async function checkThreadMedia({ browser, BASE, expect, setScheme, AA_THRESHOLD, skin, scheme }) {
  const mediaContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setScheme(mediaContext, scheme);
  const mediaPage = await mediaContext.newPage();
  await mediaPage.goto(`${BASE}/c/c-medias`, { waitUntil: 'load' });
  await mediaPage.waitForSelector('[data-message]');

  if (skin === 'bulles') {
    await mediaPage.getByRole('button', { name: /Mode de lecture/ }).click();
    await mediaPage.getByRole('menuitemradio', { name: /Bulles/ }).click();
    await mediaPage.waitForTimeout(300);
  }

  const attachmentOf = (id) => mediaPage.locator(`[data-attachment="${id}"]`);

  // (a) l'image est RÉELLEMENT décodée.
  const img = attachmentOf(MEDIA_IMAGE_ATTACHMENT_ID).locator('img');
  await img.waitFor({ state: 'attached' });
  const naturalWidth = await img.evaluate((el) => el.naturalWidth);
  expect(naturalWidth > 0, `[${skin}/${scheme}] l'image du fil est réellement décodée (naturalWidth=${naturalWidth})`);

  // (b) aucun saut de mise en page : la boîte réserve son ratio AVANT et
  // APRÈS l'arrivée de l'image — `aspect-ratio` calculé ≠ `auto`.
  const figure = attachmentOf(MEDIA_IMAGE_ATTACHMENT_ID);
  const heightBefore = await figure.evaluate((el) => el.getBoundingClientRect().height);
  await mediaPage.waitForTimeout(150);
  const heightAfter = await figure.evaluate((el) => el.getBoundingClientRect().height);
  const computedRatio = await figure.evaluate((el) => getComputedStyle(el).aspectRatio);
  expect(
    Math.abs(heightAfter - heightBefore) < 0.5,
    `[${skin}/${scheme}] la boîte de l'image ne saute pas au chargement (avant ${heightBefore}px, après ${heightAfter}px)`,
  );
  expect(computedRatio !== 'auto', `[${skin}/${scheme}] la boîte réserve un aspect-ratio calculé (${computedRatio})`);

  // (c) largeur : jamais un débordement de la colonne de texte / de la bulle.
  const overflow = await mediaPage.evaluate((id) => {
    const fig = document.querySelector(`[data-attachment="${id}"]`);
    if (fig === null) return null;
    const image = fig.querySelector('img');
    const row = fig.closest('li, [data-row], [data-message]');
    if (image === null || row === null) return null;
    const imageBox = image.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    return { imageRight: imageBox.right, rowRight: rowBox.right, imageWidth: imageBox.width, rowWidth: rowBox.width };
  }, MEDIA_IMAGE_ATTACHMENT_ID);
  expect(
    overflow !== null && overflow.imageRight <= overflow.rowRight + 0.5,
    `[${skin}/${scheme}] l'image ne déborde jamais de la rangée (${JSON.stringify(overflow)})`,
  );

  // (d) l'effet : cliquer « Lire l'audio » bascule RÉELLEMENT `audio.paused`.
  const enAudio = attachmentOf(MEDIA_VOICE_EN_ATTACHMENT_ID).locator('audio');
  const enButton = attachmentOf(MEDIA_VOICE_EN_ATTACHMENT_ID).locator('button').first();
  expect(await enAudio.evaluate((el) => el.paused), `[${skin}/${scheme}] le vocal EN est en pause avant tout clic`);
  await enButton.click();
  await mediaPage.waitForFunction(
    (id) => document.querySelector(`[data-attachment="${id}"] audio`)?.paused === false,
    MEDIA_VOICE_EN_ATTACHMENT_ID,
  );
  expect(true, `[${skin}/${scheme}] cliquer « Lire l'audio » bascule audio.paused à false (effet réel, loi 4)`);
  // Le rendu du libellé peut suivre l'événement natif d'un tour de
  // planificateur (Preact, runtime de production) — `waitForFunction`, pas
  // une lecture synchrone, pour ne pas confondre un DÉCALAGE avec une
  // ABSENCE d'effet (défaut mesuré en peau Bulles, flake de timing).
  await mediaPage.waitForFunction(
    (id) => document.querySelector(`[data-attachment="${id}"] button`)?.getAttribute('aria-label') === 'Mettre en pause',
    MEDIA_VOICE_EN_ATTACHMENT_ID,
  );
  expect(true, `[${skin}/${scheme}] le libellé devient « ${PAUSE_LABEL} »`);

  // (e) la piste suit le texte servi — rang 2 pour le témoin DE.
  const deTrackLanguage = await attachmentOf(MEDIA_VOICE_DE_ATTACHMENT_ID).locator('audio').getAttribute('data-track-language');
  expect(deTrackLanguage === 'en', `[${skin}/${scheme}] le témoin DE sert la piste "en" au rang 2 (obtenu : ${deTrackLanguage})`);
  const enTrackLanguage = await enAudio.getAttribute('data-track-language');
  expect(enTrackLanguage === 'fr', `[${skin}/${scheme}] le témoin EN sert la piste "fr" au rang 1 (obtenu : ${enTrackLanguage})`);

  // (f) un seul à la fois : lire le témoin DE remet le témoin EN en pause.
  const deButton = attachmentOf(MEDIA_VOICE_DE_ATTACHMENT_ID).locator('button').first();
  await deButton.click();
  await mediaPage.waitForFunction(
    (id) => document.querySelector(`[data-attachment="${id}"] audio`)?.paused === false,
    MEDIA_VOICE_DE_ATTACHMENT_ID,
  );
  await mediaPage.waitForFunction(
    (id) => document.querySelector(`[data-attachment="${id}"] audio`)?.paused === true,
    MEDIA_VOICE_EN_ATTACHMENT_ID,
  );
  expect(true, `[${skin}/${scheme}] jouer le témoin DE met le témoin EN en pause — un seul vocal à la fois`);

  // (g) la barre de consommation : présente sur DE (33,3 % servis), absente sur EN.
  expect(
    (await attachmentOf(MEDIA_VOICE_DE_ATTACHMENT_ID).locator('[data-consumption]').count()) > 0,
    `[${skin}/${scheme}] la barre de consommation existe sur le témoin DE (currentUserConsumption servi)`,
  );
  expect(
    (await attachmentOf(MEDIA_VOICE_EN_ATTACHMENT_ID).locator('[data-consumption]').count()) === 0,
    `[${skin}/${scheme}] aucune barre de consommation sur le témoin EN (currentUserConsumption null)`,
  );

  // (h) aucune annonce parasite : la lecture ne touche pas `[aria-live]`.
  const liveBefore = await mediaPage.locator('[aria-live="polite"]').innerText().catch(() => '');
  await mediaPage.waitForTimeout(200);
  const liveAfter = await mediaPage.locator('[aria-live="polite"]').innerText().catch(() => '');
  expect(liveBefore === liveAfter, `[${skin}/${scheme}] [aria-live="polite"] est INCHANGÉ par la lecture`);

  // (i) échec : une image et un vocal cassés dessinent leur état d'erreur SANS jamais bloquer la rangée.
  const brokenImg = attachmentOf(MEDIA_BROKEN_IMAGE_ATTACHMENT_ID).locator('img');
  await mediaPage.waitForFunction(
    (id) => document.querySelector(`[data-attachment="${id}"] img`)?.hidden === true,
    MEDIA_BROKEN_IMAGE_ATTACHMENT_ID,
    { timeout: 4000 },
  ).catch(() => {});
  expect(await brokenImg.evaluate((el) => el.hidden), `[${skin}/${scheme}] l'image cassée est masquée après échec de décodage (onError)`);
  expect(
    (await attachmentOf(MEDIA_BROKEN_IMAGE_ATTACHMENT_ID).getAttribute('aria-label')) !== null,
    `[${skin}/${scheme}] la boîte de l'image cassée garde un aria-label servi par le Prisme`,
  );

  const brokenVoiceButton = attachmentOf(MEDIA_BROKEN_VOICE_ATTACHMENT_ID).locator('button').first();
  await brokenVoiceButton.click();
  await mediaPage.waitForSelector(`[data-attachment="${MEDIA_BROKEN_VOICE_ATTACHMENT_ID}"] [data-audio-status="error"]`);
  expect(true, `[${skin}/${scheme}] le vocal cassé passe en [data-audio-status="error"] après un clic`);
  expect(
    (await attachmentOf(MEDIA_BROKEN_VOICE_ATTACHMENT_ID).getByText('Lecture impossible', { exact: false }).count()) > 0,
    `[${skin}/${scheme}] « Lecture impossible — Réessayer » est écrit DANS le widget, jamais un bandeau global`,
  );

  // (j) LE DRAPEAU DU PIED A UN EFFET sur un message MÉDIA-SEUL (revue #5805).
  //     `media-2` n'a AUCUN texte : sa ligne basse n'existe que parce que sa
  //     piste est traduite. Avant la revue, `languageBand` retirait la langue
  //     du TEXTE (l'originale) au lieu de celle du CONTENU SERVI, si bien que
  //     le drapeau offert était celui de la traduction DÉJÀ à l'écran —
  //     cliquer ne changeait RIEN (mesuré : ni le texte, ni la piste, ni
  //     `aria-pressed`). Le témoin lit l'EFFET, jamais l'étiquette.
  const rowOf = (id) => mediaPage.locator(`[data-message="${id}"]`);
  const flagOf = (id) => rowOf(id).locator('button[aria-pressed][title]').first();
  const transcriptOf = (id) => rowOf(id).locator('[data-transcript]').first().innerText();
  const trackOf = (id) => rowOf(id).locator('audio').first().getAttribute('data-track-language');

  const beforePick = { text: await transcriptOf('media-2'), track: await trackOf('media-2') };
  expect(
    (await flagOf('media-2').count()) > 0,
    `[${skin}/${scheme}] le pied d'un message MÉDIA-SEUL offre un drapeau (sa piste est traduite)`,
  );
  const pickedLabel = await flagOf('media-2').getAttribute('title');
  await flagOf('media-2').click();
  await mediaPage.waitForTimeout(250);
  const afterPick = { text: await transcriptOf('media-2'), track: await trackOf('media-2') };
  expect(
    afterPick.text !== beforePick.text && afterPick.track !== beforePick.track,
    `[${skin}/${scheme}] cliquer « ${pickedLabel} » CHANGE la transcription ET la piste (${beforePick.track} → ${afterPick.track}) — loi 4`,
  );

  // (k) LE BOUTON RESTE OPÉRANT APRÈS UN CHANGEMENT DE PISTE EN COURS DE
  //     LECTURE (revue #5805). Changer le `src` d'un `<audio>` qui joue
  //     l'arrête SANS émettre `pause` : l'état restait `playing`, le libellé
  //     mentait, et `toggle()` appelait `pause()` sur un élément déjà en
  //     pause — sans effet, sans événement. Le bouton était INERTE jusqu'au
  //     démontage de la rangée.
  const deWidget = mediaPage.locator(`[data-attachment="${MEDIA_VOICE_DE_ATTACHMENT_ID}"]`);
  await deWidget.locator('button').first().click();
  await mediaPage.waitForFunction(
    (id) => document.querySelector(`[data-attachment="${id}"] audio`)?.paused === false,
    MEDIA_VOICE_DE_ATTACHMENT_ID,
  );
  await flagOf('media-3').click();
  await mediaPage.waitForFunction(
    (id) => document.querySelector(`[data-attachment="${id}"] button`)?.getAttribute('aria-label') === "Lire l'audio",
    MEDIA_VOICE_DE_ATTACHMENT_ID,
    { timeout: 3000 },
  ).catch(() => {});
  expect(
    (await deWidget.locator('button').first().getAttribute('aria-label')) === PLAY_LABEL,
    `[${skin}/${scheme}] changer de piste EN LECTURE remet le bouton sur « ${PLAY_LABEL} » — jamais un libellé qui ment`,
  );
  await deWidget.locator('button').first().click();
  const replayed = await mediaPage
    .waitForFunction(
      (id) => document.querySelector(`[data-attachment="${id}"] audio`)?.paused === false,
      MEDIA_VOICE_DE_ATTACHMENT_ID,
      { timeout: 3000 },
    )
    .then(() => true)
    .catch(() => false);
  expect(replayed, `[${skin}/${scheme}] et la piste NEUVE se joue au clic suivant — le bouton n'est jamais inerte`);

  // (l) LA TRANSCRIPTION EST LISIBLE — c'est du CONTENU servi par le Prisme,
  //     pas de la méta. Mesurée à 3,74:1 en schéma CLAIR avant la revue
  //     (`META_TEXT_OPACITY` = 0,55 sur `--color-ios-ink`), sous l'AA.
  const transcriptContrast = await contrastOf(mediaPage, '[data-transcript]');
  expect(
    transcriptContrast !== null && transcriptContrast >= AA_THRESHOLD,
    `[${skin}/${scheme}] la transcription du vocal atteint l'AA (${transcriptContrast}:1 >= ${AA_THRESHOLD})`,
  );

  await mediaPage.close();
  await mediaContext.close();
}


