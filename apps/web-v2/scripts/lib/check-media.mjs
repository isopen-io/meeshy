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
  const rowOf = (id) => mediaPage.locator(`[data-message="${id}"]`);
  const flagOf = (id) => rowOf(id).locator('button[aria-pressed][title]').first();
  const transcriptOf = (id) => rowOf(id).locator('[data-transcript]').first().innerText();
  const trackOf = (id) => rowOf(id).locator('audio').first().getAttribute('data-track-language');
  const srcOf = (id) => rowOf(id).locator('audio').first().getAttribute('src');
  const transcriptLangOf = (id) => rowOf(id).locator('[data-transcript]').first().getAttribute('lang');

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

  // (n) LE GLYPHE DE REPLI NE PEINT JAMAIS PAR-DESSUS L'IMAGE DÉCODÉE
  //     (revue #5805). Le lot a corrigé exactement ce défaut — la grille
  //     peignait le glyphe au-dessus de l'image — mais SANS témoin : toutes
  //     les propriétés DOM étaient justes (`hidden: false`, `opacity: 1`,
  //     `naturalWidth: 1`), et (a) comme (c) restaient vertes dessus. Un
  //     défaut de PEINTURE ne se lit qu'en PIXELS, sinon il revient en silence.
  //
  //     La fixture est un pixel indigo UNIFORME (`MEDIA_IMAGE_DATA_URI`) : le
  //     CŒUR de sa boîte — la moitié centrale, là où le glyphe de 40 px se
  //     pose — doit donc être d'UNE seule couleur. On échantillonne ce cœur et
  //     non la boîte entière, pour deux raisons mesurées : les coins arrondis
  //     y mêlent leurs antialiasings, et la pastille de jour FLOTTE au-dessus
  //     du fil (`thread-day-pill`, `position:absolute; z-index:10`) — deux
  //     bruits qui n'ont rien à voir avec le repli. Mesuré des deux côtés du
  //     correctif, MÊME cœur : forme corrigée 100,00 % / 1 couleur — forme
  //     fautive 96,27 % / 36 couleurs, la seconde étant `71,71,174`, soit
  //     exactement le glyphe (encre `30,27,75`) à 0,4 fondu sur l'indigo.
  //     Si la fixture cesse d'être un aplat, c'est CE seuil qu'il faut revoir.
  /**
   * LA PIÈCE ENTRE DANS LE CHAMP, ET L'ON ATTEND SA PEINTURE — PAS SON
   * CHARGEMENT (#6135). Ce témoin était ROUGE en CI et VERT en local depuis sa
   * naissance, onze heures durant, en faisant sauter les neuf gates suivants.
   *
   * `media-1-a1` est le PREMIER message du fil : au repos sa boîte est à
   * `top = -462`, très au-dessus du champ. Son `<img>` porte `loading="lazy"`
   * et `decoding="async"` (`attachment-blocks.tsx:103-104`), donc hors champ
   * elle n'est ni chargée ni décodée. `locator.screenshot()` fait défiler
   * l'élément dans le champ PUIS capture — la capture tombe dans la même
   * séquence que le chargement que son propre défilement vient de déclencher.
   * Sur macOS la peinture arrive avant la capture ; sur le runner Linux, non.
   *
   * Mesuré en CI (run 34686050796) — et c'est un état que le message ne savait
   * pas décrire : le cœur portait `229,246,248` à 21,20 % en 106 teintes,
   * c'est-à-dire le FOND de la figure elle-même
   * (`color(srgb 0.27451 0.741176 0.792157 / 0.12)`, l'accent à 12 %),
   * pendant que l'`<img>` relevée juste après la capture rendait
   * `complete: true, naturalWidth: 1, hidden: false, couvre: true,
   * opacity: 1, objectFit: cover, visible`. Décodée, opaque, couvrant
   * exactement sa boîte — et absente de la frame capturée. Une seule chose
   * réconcilie ces deux relevés : la capture a précédé la PEINTURE.
   *
   * `complete` ne suffit donc pas comme condition d'attente : il dit que les
   * octets sont là, jamais qu'un pixel a été posé. On attend `decode()` puis
   * DEUX `requestAnimationFrame` — le premier rend la main au compositeur, le
   * second garantit qu'une frame a été produite APRÈS le décodage.
   */
  await attachmentOf(MEDIA_IMAGE_ATTACHMENT_ID).scrollIntoViewIfNeeded();
  await mediaPage.locator(`img[data-attachment-image="${MEDIA_IMAGE_ATTACHMENT_ID}"]`).evaluate(async (el) => {
    if (typeof el.decode === 'function') await el.decode().catch(() => {});
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
  });

  /**
   * LA COULEUR ATTENDUE SE LIT DANS L'IMAGE SERVIE, ELLE NE S'ÉCRIT PAS ICI
   * (#6155). Le témoin ne vérifiait QUE l'uniformité du cœur (`shareProche >=
   * 0,999`) — jamais QUELLE couleur. Or le fond de la figure est lui aussi un
   * aplat : un cœur parfaitement uniforme montrant `229,246,248` (l'accent à
   * 12 %, l'image ABSENTE) passait le seuil et rendait le gate VERT, sous un
   * message qui appelait ce fond « la couleur servie ». Le témoin pouvait donc
   * confirmer l'exact défaut qu'il garde.
   *
   * On dessine l'`<img>` de la page dans un canvas et on compte sa dominante :
   * l'attente vient ainsi de l'image RÉELLEMENT servie, pas d'une constante à
   * tenir à jour — et le témoin attrape en prime « une AUTRE image a été
   * servie », qu'aucune constante écrite ici n'aurait vu.
   */
  const couleurServie = await mediaPage.evaluate((id) => {
    const el = document.querySelector(`img[data-attachment-image="${id}"]`);
    if (el === null || el.naturalWidth === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = el.naturalWidth;
    canvas.height = el.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(el, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const counts = new Map();
    for (let i = 0; i < pixels.length; i += 4) {
      const key = `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }, MEDIA_IMAGE_ATTACHMENT_ID);

  /* ±6 pour l'IDENTITÉ (composition, gestion de couleur du runner), ±2 pour
     l'UNIFORMITÉ. Mesuré : le pixel de `MEDIA_IMAGE_DATA_URI` est exactement
     99,102,241 (PNG 1×1, type 2, octets [0, 99, 102, 241]) ; le fond de figure
     observé en CI est 229,246,248, à une distance de 144 ; le glyphe de repli
     fondu sur l'indigo donne 71,71,174, distance 67. Le seuil est donc onze
     fois sous le plus proche des deux défauts gardés. */
  const DISTANCE_SERVIE = 6;
  const estCouleurServie = (mesuree) => {
    if (couleurServie === null || mesuree === null) return false;
    const attendue = couleurServie.split(',').map(Number);
    const trouvee = mesuree.split(',').map(Number);
    return attendue.every((canal, i) => Math.abs(canal - trouvee[i]) <= DISTANCE_SERVIE);
  };

  const mesurerCoeurPeint = async () => {
    const shot = await attachmentOf(MEDIA_IMAGE_ATTACHMENT_ID).screenshot();
    return mediaPage.evaluate(async (data) => {
      const bitmap = new Image();
      await new Promise((ok, ko) => {
        bitmap.onload = ok;
        bitmap.onerror = ko;
        bitmap.src = `data:image/png;base64,${data}`;
      });
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      const side = Math.round(Math.min(bitmap.width, bitmap.height) * 0.5);
      const pixels = context.getImageData(
        Math.round((bitmap.width - side) / 2),
        Math.round((bitmap.height - side) / 2),
        side,
        side,
      ).data;
      const counts = new Map();
      for (let i = 0; i < pixels.length; i += 4) {
        const key = `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const total = pixels.length / 4;
      const classees = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const [colour, count] = classees[0];

      /* LA PART SE MESURE À UNE DISTANCE, JAMAIS À L'ÉGALITÉ STRICTE (#6135).
         Un aplat composité peut être TRAMÉ de ±1 par canal : chaque pixel
         devient alors une clé distincte, et un champ parfaitement uniforme à
         l'œil rend « dominante 21 %, 106 teintes ». Mesuré en CI sur le fond
         de la figure — les cinq premières couleurs y étaient 229,246,248 /
         228,245,247 / 228,245,248 / 230,246,248 / 229,245,248, soit la même
         couleur à ±2, et l'égalité stricte les comptait pour cinq.
         La tolérance reste MINUSCULE devant ce que le témoin doit attraper :
         le glyphe de repli fondu à 0,4 sur l'indigo donne `71,71,174` contre
         `99,102,241`, une distance de 67 — vingt-deux fois le seuil. On gagne
         en robustesse sans rien céder sur le défaut visé. */
      const [dr, dg, db] = colour.split(',').map(Number);
      let proches = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (
          Math.abs(pixels[i] - dr) <= 2 &&
          Math.abs(pixels[i + 1] - dg) <= 2 &&
          Math.abs(pixels[i + 2] - db) <= 2
        ) {
          proches += 1;
        }
      }

      return {
        colour,
        share: count / total,
        shareProche: proches / total,
        tones: counts.size,
        cinqPremieres: classees.slice(0, 5).map(([c, n]) => `${c} ${((n / total) * 100).toFixed(1)}%`),
        taille: `${bitmap.width}×${bitmap.height}`,
        coeur: side,
      };
    }, shot.toString('base64'));
  };

  /**
   * ON ATTEND QUE LA PEINTURE ARRIVE, ON NE PARIE PLUS SUR DEUX `rAF` (#6155).
   *
   * `decode()` + deux `requestAnimationFrame` garantissent qu'une frame a été
   * PRODUITE par le fil principal après le décodage — jamais que le compositeur
   * a rasterisé la tuile que `locator.screenshot()` va lire. Mesuré : vert sur
   * `dev` et ROUGE sur une branche qui ne touche que `apps/web`, dans le même
   * quart d'heure (run 34688594256) — donc ni une fenêtre d'horloge, ni le
   * diff : une COURSE, que la machine gagne ou perd.
   *
   * Reboucler est sûr ICI, et la raison se dit en une phrase : **le défaut
   * gardé est PERSISTANT.** Un glyphe de repli peint par-dessus l'image y
   * reste ; une image pas encore peinte, non. Une attente généreuse ne peut
   * donc verdir que le second — c'est le même renversement que la 583 (un état
   * qui ARRIVE se laisse attendre, un état qui PART doit s'enregistrer).
   *
   * Et la boucle ne remplace pas l'assertion : elle sort dès que le cœur est
   * uniforme ET porte la couleur servie. Sur épuisement, le message rend la
   * suite des essais — un relevé qui dit si la couleur a bougé (course perdue)
   * ou jamais changé (défaut réel).
   */
  const ESSAIS_MAX = 12;
  const ATTENTE_ENTRE_ESSAIS = 250;
  const essais = [];
  let paintedCore = null;
  for (let essai = 1; essai <= ESSAIS_MAX; essai += 1) {
    paintedCore = await mesurerCoeurPeint();
    essais.push(`#${essai} ${paintedCore.colour} ${(paintedCore.shareProche * 100).toFixed(1)}%`);
    if (paintedCore.shareProche >= 0.999 && estCouleurServie(paintedCore.colour)) break;
    if (essai < ESSAIS_MAX) await mediaPage.waitForTimeout(ATTENTE_ENTRE_ESSAIS);
  }

  /**
   * CE QUE LE TÉMOIN DIT QUAND IL TOMBE (#6135) — relevé pris APRÈS la capture,
   * parce que la capture fait défiler l'élément dans le champ : l'état d'AVANT
   * ne serait pas celui que la capture a vu.
   *
   * Le témoin rougissait en CI et pas en local, en ne donnant qu'UNE couleur
   * dominante et un NOMBRE de teintes. Ces deux chiffres suffisent à savoir
   * qu'il y a un défaut, jamais à savoir lequel : « 21,20 % en 106 teintes »
   * décrit aussi bien un glyphe posé par-dessus qu'une image absente, qu'une
   * image qui ne couvre pas sa boîte, ou qu'un voile translucide. Trois
   * hypothèses ont dû être falsifiées à la main faute de ce relevé — le
   * composeur qui recouvrirait la pièce, `loading="lazy"` qui différerait le
   * chargement, la rastérisation logicielle du runner.
   *
   * Il rend donc l'ÉTAT de l'image et les CINQ premières couleurs : une
   * dominante ne dit pas ce qu'il y a d'autre. Tout cela ne part que dans le
   * message d'ÉCHEC — rien n'est imprimé quand le témoin passe.
   */
  const imageState = await mediaPage.evaluate((id) => {
    const img = document.querySelector(`img[data-attachment-image="${id}"]`);
    const fig = document.querySelector(`[data-attachment="${id}"]`);
    if (img === null || fig === null) return { absent: true };
    const ri = img.getBoundingClientRect();
    const rf = fig.getBoundingClientRect();
    const s = getComputedStyle(img);
    return {
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      hidden: img.hidden,
      src: (img.currentSrc || img.src).slice(0, 44),
      couvre: Math.round(ri.width) >= Math.round(rf.width) && Math.round(ri.height) >= Math.round(rf.height),
      img: `${Math.round(ri.width)}×${Math.round(ri.height)}`,
      figure: `${Math.round(rf.width)}×${Math.round(rf.height)}`,
      opacity: s.opacity,
      objectFit: s.objectFit,
      visibility: s.visibility,
      display: s.display,
      fondFigure: getComputedStyle(fig).backgroundColor,
    };
  }, MEDIA_IMAGE_ATTACHMENT_ID);

  expect(
    paintedCore.shareProche >= 0.999 && estCouleurServie(paintedCore.colour),
    `[${skin}/${scheme}] aucun repli ne peint par-dessus l'image décodée — le cœur de la boîte porte ${paintedCore.colour} (servie attendue : ${couleurServie ?? 'illisible'} à ±${DISTANCE_SERVIE}) à ${(paintedCore.shareProche * 100).toFixed(2)} % à ±2 (${(paintedCore.share * 100).toFixed(2)} % à l'exact), en ${paintedCore.tones} teinte(s)` +
      ` · cinq premières : ${paintedCore.cinqPremieres.join(' | ')}` +
      ` · capture ${paintedCore.taille}, cœur ${paintedCore.coeur}` +
      ` · ${essais.length} essai(s) : ${essais.join(' · ')}` +
      ` · image : ${JSON.stringify(imageState)}`,
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

  // (e bis) LE `src` SUIT LA PISTE ÉLUE — pas seulement l'attribut de service
  //         `data-track-language` : c'est ce que le navigateur télécharge et
  //         joue réellement. Mesuré AVANT tout clic sur le drapeau du pied
  //         (témoin j, plus bas), pendant que le rang initial tient encore.
  //
  //         `startsWith('data:audio/wav')` NE SUFFIT PAS (revue #5805) : les
  //         trois pistes du témoin sont des WAV `data:` (tons 440 / 523 / 659,
  //         `fixtures-media.ts`), donc ce préfixe est VRAI de l'original comme
  //         de la traduction — l'assertion passait sur le défaut même qu'elle
  //         devait attraper. Ce qui distingue vraiment « la piste élue » de
  //         « un fichier quelconque » est que le navigateur la DÉCODE : une
  //         `duration` finie et non nulle prouve que l'octet servi est un
  //         média réel, et non une URL qui échouerait en silence. Le lien
  //         `src` ↔ langue élue, lui, est prouvé par (j) : changer la langue
  //         change le `src`.
  const enSrc = await enAudio.getAttribute('src');
  expect(
    enSrc !== null && enSrc.startsWith('data:audio/wav'),
    `[${skin}/${scheme}] le témoin EN sert un src non vide pour sa piste "fr" (${enSrc?.slice(0, 24)}…)`,
  );
  const enDuration = await enAudio.evaluate((el) => el.duration);
  expect(
    Number.isFinite(enDuration) && enDuration > 0,
    `[${skin}/${scheme}] et le navigateur DÉCODE ce src — durée ${enDuration}s, jamais une URL qui échoue en silence`,
  );

  // (e ter) `lang` EST POSÉ SUR LA TRANSCRIPTION SERVIE DANS UNE LANGUE ≠
  //         DOCUMENT (`READER_LOCALE` = 'fr' sous ce prisme navigateur),
  //         ABSENT quand elle est SERVIE dans la langue du document — jamais
  //         un attribut redondant sur du contenu déjà en langue de page.
  //         Mesuré au MÊME instant que (e) : media-2 sert "fr" (= document,
  //         `lang` absent), media-3 sert "en" (≠ document, `lang="en"`).
  const enTranscriptLang = await transcriptLangOf('media-2');
  expect(
    enTranscriptLang === null,
    `[${skin}/${scheme}] la transcription de media-2, servie en "fr" (langue du document), ne porte AUCUN lang (obtenu : ${enTranscriptLang})`,
  );
  const deTranscriptLang = await transcriptLangOf('media-3');
  expect(
    deTranscriptLang === 'en',
    `[${skin}/${scheme}] la transcription de media-3 porte lang="en" (rang 2, obtenu : ${deTranscriptLang})`,
  );

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
  const beforePick = { text: await transcriptOf('media-2'), track: await trackOf('media-2'), src: await srcOf('media-2') };
  expect(
    (await flagOf('media-2').count()) > 0,
    `[${skin}/${scheme}] le pied d'un message MÉDIA-SEUL offre un drapeau (sa piste est traduite)`,
  );
  const pickedLabel = await flagOf('media-2').getAttribute('title');
  await flagOf('media-2').click();
  await mediaPage.waitForTimeout(250);
  const afterPick = { text: await transcriptOf('media-2'), track: await trackOf('media-2'), src: await srcOf('media-2') };
  expect(
    afterPick.text !== beforePick.text && afterPick.track !== beforePick.track,
    `[${skin}/${scheme}] cliquer « ${pickedLabel} » CHANGE la transcription ET la piste (${beforePick.track} → ${afterPick.track}) — loi 4`,
  );
  expect(
    afterPick.src !== beforePick.src,
    `[${skin}/${scheme}] cliquer « ${pickedLabel} » CHANGE le src de l'élément <audio>, pas seulement data-track-language`,
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

  // (m) LA PLACE EST RÉSERVÉE PAR LA FIGURE, JAMAIS PAR L'IMAGE (revue #5805).
  //
  //     OÙ SE MESURE « la rangée suivante ne saute pas », et pourquoi les deux
  //     mesures évidentes sont AVEUGLES ici — mesuré, pas supposé :
  //     - `offsetTop` d'une rangée vaut 0 : son `offsetParent` est le `<li>`
  //       que le virtualiseur pose autour d'elle au pixel près ;
  //     - `getBoundingClientRect().top` ne bouge PAS NON PLUS, même quand la
  //       boîte média s'effondre entièrement : le fil est un scroller
  //       virtualisé ANCRÉ (mesuré : en retirant la réservation, la figure
  //       passe de 164 px à 0 px et le `top` de la rangée suivante reste à
  //       -45 px — le virtualiseur corrige le `scrollTop`, donc la perte de
  //       hauteur déplace ce qui est AU-DESSUS, pas ce qui est en dessous).
  //     La position à lire est donc celle que le VIRTUALISEUR calcule depuis
  //     les hauteurs MESURÉES : le `translateY` du `<li>` de la rangée
  //     suivante. Elle bouge de 249 px à 105 px quand la réservation tombe.
  //
  //     Ce témoin porte DEUX assertions et son propre CONTRÔLE :
  //     1. l'`<img>` ne participe PAS au flux (`position: absolute`) — c'est
  //        la raison STRUCTURELLE pour laquelle son chargement ne peut rien
  //        déplacer, et ce qui rend le « zéro saut » vrai par construction ;
  //     2. le `translateY` de la rangée suivante est IDENTIQUE image peinte /
  //        image retirée du rendu (`display:none`, plus fort que `hidden`) ;
  //     3. CONTRÔLE, destructif : en retirant la réservation, ce même
  //        `translateY` DOIT bouger. Sans lui, (2) serait une tautologie —
  //        c'était le défaut de la première version de ce témoin, qui restait
  //        VERTE sur une page dont la boîte média était effondrée à 0 px.
  //        Destructif parce que le virtualiseur ne re-mesure pas au retour :
  //        (m) est donc la DERNIÈRE section, juste avant la fermeture.
  const nextRowOffset = () =>
    mediaPage.evaluate(() => {
      const li = document.querySelector('[data-message="media-2"]')?.closest('li');
      return li === null || li === undefined ? null : new DOMMatrixReadOnly(getComputedStyle(li).transform).m42;
    });
  const imagePosition = await mediaPage.evaluate((id) => {
    const el = document.querySelector(`[data-attachment="${id}"] img`);
    return el === null ? null : getComputedStyle(el).position;
  }, MEDIA_IMAGE_ATTACHMENT_ID);
  expect(
    imagePosition === 'absolute',
    `[${skin}/${scheme}] l'image ne participe pas au flux (position ${imagePosition}) — son chargement ne peut déplacer aucune rangée`,
  );

  const offsetPainted = await nextRowOffset();
  await mediaPage.evaluate((id) => {
    const el = document.querySelector(`[data-attachment="${id}"] img`);
    if (el !== null) el.style.display = 'none';
  }, MEDIA_IMAGE_ATTACHMENT_ID);
  await mediaPage.waitForTimeout(250);
  const offsetWithoutImage = await nextRowOffset();
  await mediaPage.evaluate((id) => {
    const el = document.querySelector(`[data-attachment="${id}"] img`);
    if (el !== null) el.style.display = '';
  }, MEDIA_IMAGE_ATTACHMENT_ID);
  expect(
    offsetPainted !== null && Math.abs(offsetPainted - offsetWithoutImage) < 0.5,
    `[${skin}/${scheme}] la rangée suivante ne bouge pas quand l'image quitte le rendu (${offsetPainted}px → ${offsetWithoutImage}px)`,
  );

  await mediaPage.evaluate((id) => {
    const fig = document.querySelector(`[data-attachment="${id}"]`);
    if (fig !== null) fig.style.aspectRatio = 'auto';
  }, MEDIA_IMAGE_ATTACHMENT_ID);
  await mediaPage.waitForTimeout(400);
  const offsetWithoutReservation = await nextRowOffset();
  expect(
    offsetWithoutReservation !== null && Math.abs(offsetPainted - offsetWithoutReservation) > 1,
    `[${skin}/${scheme}] CONTRÔLE : retirer la réservation DÉPLACE la rangée suivante (${offsetPainted}px → ${offsetWithoutReservation}px) — sans quoi le témoin ci-dessus ne prouverait rien`,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // (n) LA PIÈCE JOINTE D'UN MESSAGE PROTÉGÉ N'ATTEINT PAS LE DOM (#6184)
  //
  //     Le cycle 125 de `CLAUDE.md` a coûté « une photo à VUE UNIQUE affichée
  //     ENTIÈRE sur l'écran verrouillé sous une bannière disant 👁️ 🖼️ » : les
  //     quatre gardes retenaient du TEXTE, et le fichier partait à côté, dans
  //     l'objet voisin. Côté web-v2 la propriété TIENT — `<Attachments>` vit
  //     dans `contentBlock`, que `bubble.tsx:315` enveloppe dans
  //     `ProtectedContent`, qui ne rend `children` ni en `veiled`, ni en
  //     `burned`, ni en `deleted`. Mais RIEN ne l'attestait : aucun message du
  //     corpus n'était protégé.
  //
  //     Ce que le témoin garde n'est donc pas une garde À ÉCRIRE, c'est une
  //     garde à ne pas PERDRE : un lot qui sortirait `<Attachments>` de
  //     `contentBlock` — ce qu'une extraction de fichier hors budget rend
  //     tentant — la retirerait sans qu'aucun gate ne tombe.
  //
  //     L'assertion porte sur le DOM (`img`, `audio`, `source`), jamais sur une
  //     classe CSS : un `filter: blur()` n'est pas une rétention — les octets
  //     sont dans la page, une capture ou un `devtools` les rend, et c'est
  //     exactement ce que le cycle 125 dénonce.
  //
  //     CE QUE CE TÉMOIN NE COUVRE PAS, et c'est mesuré : la protection
  //     déclarée sur la PIÈCE elle-même (`Attachment.isViewOnce` /
  //     `isBlurred`, la jumelle du cycle 125) n'est lue par AUCUNE peau web —
  //     sonde : `url_en_clair=true img=true voile=false`. iOS la lit
  //     (`FocalAttachmentBlock.swift:130`). Suivi : #6189.
  const protegesAttendus = [
    ['media-8', 'floutée (isBlurred)'],
    ['media-9', 'à vue unique NON consommée (isViewOnce, viewOnceCount 0)'],
  ];

  //     LE FIL EST VIRTUALISÉ et s'ouvre EN BAS (`pin-to-bottom.ts`,
  //     `thread.tsx:385`) : les deux rangées protégées vivent en TÊTE du corpus
  //     (8:50 et 8:55, avant `media-1`) et ne sont donc PAS montées à
  //     l'ouverture. Un `waitFor({ state: 'attached' })` posé sans remonter
  //     rougirait par EXPIRATION, et le rouge dirait « la pièce jointe est
  //     retenue » alors qu'il ne dirait que « la rangée n'est pas rendue ».
  //     On remonte donc explicitement, puis on attend que le virtualiseur ait
  //     monté la rangée — attendre la CONDITION, jamais un budget (leçon 590).
  //     La remontée est RÉPÉTÉE tant que les rangées ne sont pas là : le
  //     virtualiseur CORRIGE `scrollTop` quand les mesures des rangées voisines
  //     arrivent (`check-thread-virtualization.mjs:29`), donc un seul
  //     `scrollTop = 0` peut être défait sous les pieds du gate.
  const scroller = mediaPage.locator('main#contenu');
  const idsAttendus = [...protegesAttendus.map(([id]) => id), 'media-10', 'media-1'];
  const montees = () =>
    mediaPage.evaluate(
      (ids) => ids.filter((id) => document.querySelector(`[data-message="${id}"]`) !== null).length,
      idsAttendus,
    );
  const ESSAIS_REMONTEE = 40;
  let presentes = 0;
  for (let essai = 1; essai <= ESSAIS_REMONTEE; essai += 1) {
    presentes = await montees();
    if (presentes === idsAttendus.length) break;
    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    await mediaPage.waitForTimeout(150);
  }
  expect(
    presentes === idsAttendus.length,
    `[${skin}/${scheme}] les ${idsAttendus.length} rangées de tête sont montées après remontée ` +
      `(${presentes}/${idsAttendus.length}) — sans elles, un « aucune <img> » ne mesurerait qu'une virtualisation`,
  );

  for (const [id, forme] of protegesAttendus) {
    const rangee = rowOf(id);
    await rangee.waitFor({ state: 'attached' });
    const medias = await rangee.evaluate((el) => ({
      img: el.querySelectorAll('img').length,
      audio: el.querySelectorAll('audio').length,
      source: el.querySelectorAll('source').length,
      video: el.querySelectorAll('video').length,
    }));
    const total = medias.img + medias.audio + medias.source + medias.video;
    expect(
      total === 0,
      `[${skin}/${scheme}] la pièce jointe du message ${id}, ${forme}, n'atteint PAS le DOM ` +
        `(img=${medias.img} audio=${medias.audio} source=${medias.source} video=${medias.video})`,
    );
  }

  //     LA CONTRE-ÉPREUVE, sans laquelle le témoin serait vert par immobilité :
  //     le MÊME média, sur un message NON protégé, est bien rendu. Sans elle, un
  //     fil qui ne rendrait plus AUCUNE image ferait passer les deux assertions
  //     ci-dessus (leçon 261 — un témoin ne s'écrit pas sur le rang qui rendrait
  //     le même verdict par accident).
  const imagesDuNonProtege = await rowOf('media-1').evaluate((el) => el.querySelectorAll('img').length);
  expect(
    imagesDuNonProtege > 0,
    `[${skin}/${scheme}] CONTRÔLE : le MÊME média sur un message NON protégé rend bien son <img> ` +
      `(${imagesDuNonProtege}) — sans quoi les deux témoins ci-dessus seraient verts par absence de sujet`,
  );

  //     (o) LA PIÈCE DÉCLARÉE PROTÉGÉE SUR UN MESSAGE ORDINAIRE (#6189).
  //
  //         `media-10` n'est PAS un message protégé — `protectionOf` rend
  //         `standard`, donc `ProtectedContent` n'est même pas monté. C'est sa
  //         PIÈCE qui porte `isViewOnce`, et c'est la forme que le web servait
  //         en clair avant #6189 : la JUMELLE du cycle 125, mesurée par sonde
  //         (`url_en_clair=true img=true voile=false`) pendant qu'iOS la
  //         retenait (`FocalAttachmentBlock.swift:130`).
  //
  //         Ce témoin ne doublonne pas les deux précédents : il distingue
  //         « le web retient la PIÈCE déclarée » de « le web retient tout
  //         MESSAGE protégé », qui était déjà vrai (#6184). Sans lui, poser la
  //         protection sur le message dans la fixture laisserait le gate vert
  //         en ne mesurant plus que l'autre loi.
  const pieceMasquee = await rowOf('media-10').evaluate((el) => ({
    img: el.querySelectorAll('img').length,
    audio: el.querySelectorAll('audio').length,
    substitut: el.querySelector('[data-protected-attachment="hidden"]') !== null,
    // La rangée n'est PAS voilée au niveau message : la marque de #6184 doit
    // être absente, sinon le témoin mesurerait la mauvaise loi.
    voileDuMessage: el.querySelector('[data-protected]') !== null,
  }));
  expect(
    pieceMasquee.img === 0 && pieceMasquee.audio === 0 && pieceMasquee.substitut && !pieceMasquee.voileDuMessage,
    `[${skin}/${scheme}] media-10 : la PIÈCE déclarée protégée ne rend aucun média et porte son substitut, ` +
      `sur un message qui n'est PAS voilé (img=${pieceMasquee.img} audio=${pieceMasquee.audio} ` +
      `substitut=${pieceMasquee.substitut} voileDuMessage=${pieceMasquee.voileDuMessage})`,
  );

  //     ET LE SECOND CONTRÔLE, celui qui distingue « RETENU » de « PAS ENCORE
  //     ARRIVÉ » : une rangée absente, ou montée mais vide, rendrait zéro `img`
  //     elle aussi, et les deux témoins ci-dessus passeraient sur une page
  //     blanche. La rangée doit donc porter la marque du voile —
  //     `data-protected="hidden"`, posée par `protected-content.tsx:164`, dont
  //     ce fichier est l'unique producteur pour la phase voilée.
  //
  //     La marque, jamais le TEXTE : le substitut est dérivé de la seule
  //     LONGUEUR du contenu (`surrogateOf`), et ces deux messages ont un contenu
  //     VIDE (ce sont des images) — un contrôle écrit sur le texte serait vert
  //     ici pour une raison qui n'a rien à voir avec la protection.
  for (const [id, forme] of protegesAttendus) {
    const marque = await rowOf(id).evaluate((el) => {
      const porteur = el.matches('[data-protected]') ? el : el.querySelector('[data-protected]');
      return porteur === null ? null : porteur.getAttribute('data-protected');
    });
    expect(
      marque === 'hidden',
      `[${skin}/${scheme}] CONTRÔLE : la rangée ${id} (${forme}) est MONTÉE et se déclare voilée ` +
        `(data-protected=${marque ?? 'absent'}) — sinon l'absence d'<img> ne mesurerait qu'une rangée manquante`,
    );
  }

  await mediaPage.close();
  await mediaContext.close();
}


