import { readFileSync } from 'node:fs';

/**
 * PARTIE 11 — LA GRILLE DE MÉDIAS DU FIL (#6169, § 5 étape d de la
 * spécification « grille de médias »). CINQ sources Swift, jamais importées
 * (même raison que le reste du fichier — Prisma/zod hors d'une application
 * de 40 Ko) : la géométrie 2/3/4+ (`FocalAttachmentBlock.swift`, parité
 * DÉCLARÉE avec `BubbleStandardLayout+Media.swift`), la pellicule
 * (`ConversationMediaFilmstrip.swift`), le chrome de la visionneuse
 * (`ConversationMediaGalleryView+Geometry.swift`) et le zoom/seuil de
 * fermeture (`ConversationMediaGalleryView+Pages.swift`).
 *
 * `swiftNumber` lit `nom: CGFloat = valeur` OU `nom = valeur` (motif
 * PARTIE 9 `bubbleStickerNumber`, généralisé) — les cinq fichiers écrivent
 * les deux formes. Les cotes SANS nom côté Swift (les hauteurs 240/180 du
 * `switch` de `slots(for:)`, la part `* 0.6` de la colonne gauche, le voile
 * `Color.black.opacity(0.5)` + `relative(24`, `solo ? 64 : 44`) sont lues par
 * une regex DÉDIÉE, ancrée sur le contexte qui les rend uniques dans le
 * fichier (le motif déjà employé par `emojiBoxSwift` dans `check-curve.mjs` pour une
 * formule sans nom).
 *
 * EXTRAITE de `check-curve.mjs` (revue #6169) : l'hôte franchissait le seuil
 * de 1 000 lignes en l'accueillant. Elle REND ses défauts plutôt que de
 * pousser dans un tableau de l'hôte — l'hôte reste le SEUL à les imprimer.
 */
export function mediaGridCurveFailures({ root, count }) {
  const failures = [];
  const focalAttachmentSwift = readFileSync(
    `${root}apps/ios/Meeshy/Features/Main/Focal/Row/FocalAttachmentBlock.swift`,
    'utf8',
  );
  const bubbleMediaSwift = readFileSync(
    `${root}apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift`,
    'utf8',
  );
  const filmstripSwift = readFileSync(
    `${root}apps/ios/Meeshy/Features/Main/Views/ConversationMediaFilmstrip.swift`,
    'utf8',
  );
  const galleryGeometrySwift = readFileSync(
    `${root}apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+Geometry.swift`,
    'utf8',
  );
  const galleryPagesSwift = readFileSync(
    `${root}apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+Pages.swift`,
    'utf8',
  );
  const metricsDerived3 = readFileSync(`${root}apps/web/src/lib/reading-mode/metrics.ts`, 'utf8');
  const mediaGridLayoutDerived = readFileSync(`${root}apps/web/src/lib/view/media-grid-layout.ts`, 'utf8');
  const mediaStageDerived = readFileSync(`${root}apps/web/src/lib/view/media-stage.ts`, 'utf8');

  /** `nom: CGFloat = valeur` ou `nom = valeur` — motif PARTIE 9 (`bubbleStickerNumber`), généralisé aux cinq sources d'ici. */
  const swiftNumber = (text, name) => {
    const m = new RegExp(`\\b${name}\\s*(?::\\s*\\w+\\s*)?=\\s*(-?[0-9.]+)`).exec(text);
    return m === null ? null : Number(m[1]);
  };

  const check = (what, swiftValue, derivedValue) => {
    if (swiftValue === null) failures.push(`${what} : introuvable côté Swift`);
    else if (derivedValue === null) failures.push(`${what} : introuvable côté dérivé`);
    else if (swiftValue !== derivedValue) failures.push(`${what} : Swift ${swiftValue}, dérivée ${derivedValue}`);
  };

  // --- FocalMediaGridLayout (parité déclarée avec BubbleStandardLayout+Media.swift) ---
  check(
    'grille de médias : largeur max (FocalMediaGridLayout.gridMaxWidth)',
    swiftNumber(focalAttachmentSwift, 'gridMaxWidth'),
    count(metricsDerived3, 'MEDIA_GRID_MAX_WIDTH'),
  );
  check(
    'grille de médias : écart entre cases (FocalMediaGridLayout.gridSpacing)',
    swiftNumber(focalAttachmentSwift, 'gridSpacing'),
    count(mediaGridLayoutDerived, 'MEDIA_GRID_SPACING'),
  );
  check(
    'grille de médias : plafond de hauteur vidéo solo (soloVideoMaxHeightRatio)',
    swiftNumber(focalAttachmentSwift, 'soloVideoMaxHeightRatio'),
    count(mediaGridLayoutDerived, 'MEDIA_GRID_SOLO_VIDEO_MAX_HEIGHT_RATIO'),
  );

  const soloImageHeightSwift = (() => {
    const m = /FocalMediaSlot\(width:\s*gridMaxWidth,\s*height:\s*(-?[0-9.]+)\)/.exec(focalAttachmentSwift);
    return m === null ? null : Number(m[1]);
  })();
  check(
    'grille de médias : hauteur de la boîte à 1/3/4+ pièces (slots(for:), case 1)',
    soloImageHeightSwift,
    count(mediaGridLayoutDerived, 'MEDIA_GRID_SOLO_IMAGE_HEIGHT'),
  );

  const pairHeightSwift = (() => {
    const m = /case 2:[\s\S]*?height:\s*(-?[0-9.]+)\)/.exec(focalAttachmentSwift);
    return m === null ? null : Number(m[1]);
  })();
  check(
    'grille de médias : hauteur de la boîte à 2 pièces (slots(for:), case 2)',
    pairHeightSwift,
    count(mediaGridLayoutDerived, 'MEDIA_GRID_PAIR_HEIGHT'),
  );

  const tripleLeftRatioSwift = (() => {
    const m = /leftW\s*=\s*\(gridMaxWidth\s*-\s*gridSpacing\)\s*\*\s*(-?[0-9.]+)/.exec(focalAttachmentSwift);
    return m === null ? null : Number(m[1]);
  })();
  check(
    'grille de médias : part de largeur de la colonne gauche (slots(for:), case 3)',
    tripleLeftRatioSwift,
    count(mediaGridLayoutDerived, 'MEDIA_GRID_TRIPLE_LEFT_RATIO'),
  );

  // --- Le voile `+N` (BubbleStandardLayout+Media.swift § overflowOverlay) ---
  const overflowOverlaySwift = (() => {
    const m = /private var overflowOverlay:[\s\S]*?\n\s*\}\n\s*\}/.exec(bubbleMediaSwift);
    return m === null ? '' : m[0];
  })();
  const overflowOpacitySwift = (() => {
    const m = /Color\.black\.opacity\((-?[0-9.]+)\)/.exec(overflowOverlaySwift);
    return m === null ? null : Number(m[1]);
  })();
  const overflowLabelSizeSwift = (() => {
    const m = /relative\((-?[0-9.]+),\s*weight:\s*\.bold\)/.exec(overflowOverlaySwift);
    return m === null ? null : Number(m[1]);
  })();
  check(
    'grille de médias : opacité du voile « +N » (overflowOverlay)',
    overflowOpacitySwift,
    count(mediaGridLayoutDerived, 'OVERFLOW_VEIL_OPACITY'),
  );
  check(
    'grille de médias : taille du libellé « +N » (overflowOverlay)',
    overflowLabelSizeSwift,
    count(mediaGridLayoutDerived, 'OVERFLOW_LABEL_SIZE'),
  );

  // --- Le bouton de lecture inline (`playButtonDiameter: solo ? 64 : 44`) ---
  const playDiameterSwift = /playButtonDiameter:\s*solo\s*\?\s*(-?[0-9.]+)\s*:\s*(-?[0-9.]+)/.exec(bubbleMediaSwift);
  check(
    'grille de médias : diamètre du bouton de lecture, SOLO',
    playDiameterSwift === null ? null : Number(playDiameterSwift[1]),
    count(mediaGridLayoutDerived, 'PLAY_DIAMETER_SOLO'),
  );
  check(
    'grille de médias : diamètre du bouton de lecture, EN GRILLE',
    playDiameterSwift === null ? null : Number(playDiameterSwift[2]),
    count(mediaGridLayoutDerived, 'PLAY_DIAMETER_MULTI'),
  );

  // --- ConversationMediaFilmstrip.FilmstripMetrics ---
  const FILMSTRIP_MAPPINGS = [
    ['itemSide', 'itemSide'],
    ['spacing', 'spacing'],
    ['verticalPadding', 'verticalPadding'],
    ['bottomPadding', 'bottomPadding'],
    ['trailingInset', 'trailingInset'],
  ];
  for (const [swiftName, derivedKey] of FILMSTRIP_MAPPINGS) {
    check(
      `pellicule de la visionneuse : ${swiftName} (FilmstripMetrics)`,
      swiftNumber(filmstripSwift, swiftName),
      count(mediaStageDerived, derivedKey),
    );
  }

  // --- ConversationMediaGalleryView+Geometry.MediaGalleryStage ---
  const STAGE_MAPPINGS = [
    ['topCorridorHeight', 'topCorridorHeight'],
    ['gutter', 'gutter'],
    ['cornerRadius', 'cornerRadius'],
    ['overlayHeight', 'overlayHeight'],
  ];
  for (const [swiftName, derivedKey] of STAGE_MAPPINGS) {
    check(
      `chrome de la visionneuse : ${swiftName} (MediaGalleryStage)`,
      swiftNumber(galleryGeometrySwift, swiftName),
      count(mediaStageDerived, derivedKey),
    );
  }

  // --- ConversationMediaGalleryView+Pages (zoom, seuil de fermeture) ---
  check(
    'page de la visionneuse : zoom maximal (maxScale)',
    swiftNumber(galleryPagesSwift, 'maxScale'),
    count(mediaStageDerived, 'MAX_SCALE'),
  );
  check(
    'page de la visionneuse : seuil de fermeture (dismissThreshold)',
    swiftNumber(galleryPagesSwift, 'dismissThreshold'),
    count(mediaStageDerived, 'DISMISS_THRESHOLD'),
  );
  return failures;
}
