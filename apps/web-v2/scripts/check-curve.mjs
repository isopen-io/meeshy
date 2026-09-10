#!/usr/bin/env node
/**
 * VÉRIFIE QUE LA LOI DE LA LENTILLE N'A PAS DÉRIVÉ DE SA SOURCE.
 *
 * `src/lib/lens/law.ts` est une DÉRIVATION de
 * `packages/shared/utils/focus-curve.ts` — pas un import, parce que ce paquet
 * traîne `@prisma/client` et `zod` et qu'on ne les fait pas entrer dans une
 * application de 25 Ko pour quarante lignes d'arithmétique (le raisonnement
 * complet est dans le doc-comment de `law.ts`).
 *
 * Une dérivation sans gate serait exactement la jumelle divergente que le
 * dépôt interdit. Ce script est donc ce qui la rend légitime : il compare les
 * CONSTANTES une à une, puis les VALEURS de la courbe sur un balayage de
 * distances qui couvre les trois régimes — au-dessus de la bande, dans la
 * bande, sous la bande — et les bornes de saturation de chacun.
 *
 * Il compare des valeurs, pas des textes : un même calcul écrit autrement doit
 * passer, une valeur différente doit tomber. C'est la leçon du vérificateur de
 * jetons, dont la première version rendait un faux négatif sur `#fff` contre
 * `rgb(255,255,255)` — deux écritures d'une même couleur.
 *
 * La source amont est lue par EXTRACTION plutôt qu'importée : `focus-curve.ts`
 * est du TypeScript non construit, et exiger `packages/shared` construit pour
 * lancer ce gate le rendrait dépendant de Prisma — ce que la dérivation évite
 * précisément.
 */
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../..', import.meta.url).pathname;
const UPSTREAM = `${ROOT}packages/shared/utils/focus-curve.ts`;
/**
 * Les cotes de RESPIRATION ne vivent pas dans le paquet partagé : la courbe de
 * perspective est commune aux clients, la respiration est une cote de la peau
 * Lentille, donc iOS en est la source. Même dispositif que le générateur de
 * jetons, qui va chercher la palette dans `MeeshyColors.swift`.
 */
const UPSTREAM_SWIFT = `${ROOT}apps/ios/Meeshy/Features/Main/Lentille/Core/LentilleMetrics.swift`;
const DOWNSTREAM = `${ROOT}apps/web-v2/src/lib/lens/law.ts`;

/**
 * PARTIE 2 — la rangée plate du FIL (#5566). Même dispositif, autre écran :
 * `FocalMetrics.swift` (iOS, `Focal/Core/`) est la source des cotes de
 * `src/lib/reading-mode/metrics.ts`, comme `LentilleMetrics.swift` l'est pour
 * `lens/law.ts` ci-dessus. Deux peaux, un seul gate de dérivation.
 */
const UPSTREAM_FOCAL_SWIFT = `${ROOT}apps/ios/Meeshy/Features/Main/Focal/Core/FocalMetrics.swift`;
const DOWNSTREAM_FOCAL = `${ROOT}apps/web-v2/src/lib/reading-mode/metrics.ts`;

/**
 * PARTIE 3 — la PERSPECTIVE du Fil (#5566, correction de revue : « Focal » et
 * « Script » rendaient des pixels identiques). `src/lib/reading-mode/perspective.ts`
 * dérive le variant `thread` de `focus-curve.ts`, exactement comme `lens/law.ts`
 * dérive le variant `list` ci-dessus. `THREAD_FOCUS_BAND_HYSTERESIS` (#5648)
 * y est ajoutée : son aval n'est PAS `perspective.ts` (gelé, sans appelant de
 * production) mais `reading-mode/election.ts` — la source amont reste
 * `focus-curve.ts`, seul l'aval change.
 */
const DOWNSTREAM_THREAD = `${ROOT}apps/web-v2/src/lib/reading-mode/perspective.ts`;
const DOWNSTREAM_ELECTION = `${ROOT}apps/web-v2/src/lib/reading-mode/election.ts`;

/**
 * PARTIE 4 — L'ÉLECTION du Fil (#5648 : « Focal se distingue de Script par
 * l'élection d'une rangée »). `FocalScrollPerspective.swift` porte les cotes
 * de la carte teintée et les seuils d'armement de la magnificence — une
 * SECONDE source Swift, distincte de `FocalMetrics.swift` (PARTIE 2) :
 * `reading-mode/metrics.ts` et `reading-mode/election.ts` en sont l'aval.
 */
const UPSTREAM_PERSPECTIVE_SWIFT = `${ROOT}apps/ios/Meeshy/Features/Main/Focal/Core/FocalScrollPerspective.swift`;

const source = readFileSync(UPSTREAM, 'utf8');
const derived = readFileSync(DOWNSTREAM, 'utf8');
const swift = readFileSync(UPSTREAM_SWIFT, 'utf8');
const focalSwift = readFileSync(UPSTREAM_FOCAL_SWIFT, 'utf8');
const focalDerived = readFileSync(DOWNSTREAM_FOCAL, 'utf8');
const threadDerived = readFileSync(DOWNSTREAM_THREAD, 'utf8');
const electionDerived = readFileSync(DOWNSTREAM_ELECTION, 'utf8');
const perspectiveSwift = readFileSync(UPSTREAM_PERSPECTIVE_SWIFT, 'utf8');

/** Lit `nom: 520` ou `nom = 520` — la source les écrit des deux façons. */
const count = (text, name) => {
  const m = new RegExp(`\\b${name}\\s*[:=]\\s*(-?[0-9.]+)`).exec(text);
  return m === null ? null : Number(m[1]);
};

const MAPPINGS = [
  ['maxDistance', 'LIST_MAX_DISTANCE', 'distance de saturation de la liste'],
  ['alphaDecay', 'LIST_FADE', "amplitude du fondu"],
  ['scaleDecay', 'LIST_SCALE', "amplitude de l'échelle"],
  ['distance', 'BELOW_BAND_DISTANCE', 'portée du fondu sous la bande'],
  ['alphaCap', 'BELOW_BAND_CAP', 'plafond du fondu sous la bande'],
  ['FOCUS_BAND_OFFSET', 'BAND_OFFSET', 'décalage de la bande de focus'],
  ['FOCUS_BAND_HALF_HEIGHT', 'BAND_HALF_HEIGHT', 'demi-hauteur de la bande'],
];

const failures = [];

/**
 * `breathing` vaut `Row.marginVertical` en Swift — une référence, pas un
 * nombre. On résout donc d'abord `marginVertical`, sans quoi le gate lirait
 * une chaîne et conclurait à tort.
 */
/** Swift annote ses types : `public static let breathingRampStart: CGFloat = 36`. */
const swiftNumber = (name) => {
  const m = new RegExp(`\\b${name}\\s*(?::\\s*\\w+\\s*)?=\\s*(-?[0-9.]+)`).exec(swift);
  return m === null ? null : Number(m[1]);
};

const SWIFT_MAPPINGS = [
  ['marginVertical', 'BREATHING', 'amplitude de la respiration (breathing = Row.marginVertical)'],
  ['breathingRampStart', 'RAMP_START', 'début de la rampe de respiration'],
  ['breathingRampLength', 'RAMP_LENGTH', 'longueur de la rampe de respiration'],
  /**
   * `opacity` est UNIQUE dans `LentilleMetrics.swift` (vérifié avant
   * d'ajouter cette entrée) : le seul autre risque de collision serait un
   * second champ nommé `opacity` ailleurs dans le fichier — `swiftNumber`
   * lirait alors le premier trouvé, pas nécessairement celui de `Muted`.
   */
  ['opacity', 'MUTED_OPACITY', 'opacité d’une rangée en sourdine (Muted.opacity, #5559)'],
];

/**
 * Les constantes du variant `list` et du bloc `belowBand` vivent dans un objet
 * littéral : on isole d'abord leur portion de texte, sans quoi `maxDistance`
 * attraperait celle du variant `thread`, déclarée une ligne plus haut.
 */
const listPortion = /list:\s*\{[^}]*\}/.exec(source)?.[0] ?? '';
const belowBandPortion = /belowBand:\s*\{[^}]*\}/.exec(source)?.[0] ?? '';

const upstreamValue = (name) =>
  count(listPortion, name) ?? count(belowBandPortion, name) ?? count(source, name);

const read = [];
for (const [upstreamName, downstreamName, what] of MAPPINGS) {
  const expected = upstreamValue(upstreamName);
  const actual = count(derived, downstreamName);
  if (expected === null) {
    failures.push(`${what} : « ${upstreamName} » est introuvable dans la source amont`);
    continue;
  }
  if (actual === null) {
    failures.push(`${what} : « ${downstreamName} » est introuvable dans la loi dérivée`);
    continue;
  }
  if (expected !== actual) {
    failures.push(`${what} : amont ${expected}, dérivée ${actual}`);
    continue;
  }
  read.push([downstreamName, actual]);
}

/**
 * LES VALEURS, pas seulement les constantes. Une constante juste ne garantit
 * pas une FORMULE juste : la source amont porte une correction — la rampe sous
 * la bande est PROPORTIONNELLE plafonnée, et non `max(d/160, −0,35)`, une forme
 * qui sature à `d = −56` au lieu de `d = −160`. Ce balayage la vérifie
 * explicitement, avec des distances qui tombent des deux côtés du point où les
 * deux formes divergent.
 */
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const expected = (d, C) => {
  const f = clamp01(d / C.LIST_MAX_DISTANCE);
  const below = d < 0 ? -C.BELOW_BAND_CAP * clamp01(-d / C.BELOW_BAND_DISTANCE) : 0;
  return {
    alpha: clamp01(1 - C.LIST_FADE * f + below),
    scale: 1 - C.LIST_SCALE * f,
  };
};

for (const [swiftName, downstreamName, what] of SWIFT_MAPPINGS) {
  const expected = swiftNumber(swiftName);
  const actual = count(derived, downstreamName);
  if (expected === null) failures.push(`${what} : « ${swiftName} » est introuvable dans LentilleMetrics.swift`);
  else if (actual === null) failures.push(`${what} : « ${downstreamName} » est introuvable dans la loi dérivée`);
  else if (expected !== actual) failures.push(`${what} : Swift ${expected}, dérivée ${actual}`);
}

/**
 * PARTIE 2 — `FocalMetrics.swift` → `reading-mode/metrics.ts`. Les cotes sont
 * lues dans les `enum` nichés (`Row`, `Avatar`, `Focus`, `Quote`, `MetaText`)
 * de la même façon : `nom: Type = valeur`.
 */
const focalNumber = (name) => {
  const m = new RegExp(`\\b${name}\\s*(?::\\s*\\w+\\s*)?=\\s*(-?[0-9.]+)`).exec(focalSwift);
  return m === null ? null : Number(m[1]);
};

const FOCAL_MAPPINGS = [
  ['paddingVertical', 'ROW_PADDING_VERTICAL', 'padding vertical de rangée (Row.paddingVertical)'],
  ['paddingHorizontal', 'ROW_PADDING_HORIZONTAL', 'padding horizontal de rangée (Row.paddingHorizontal)'],
  ['groupTopPadding', 'GROUP_TOP_PADDING', 'respiration entre deux groupes (Row.groupTopPadding)'],
  ['size', 'AVATAR_SIZE', 'taille de la pastille (Avatar.size)'],
  ['avatarSize', 'AVATAR_FRAME', 'cadre de pastille réservé (Focus.avatarSize)'],
  ['railWidth', 'QUOTE_RAIL_WIDTH', 'filet de citation (Quote.railWidth)'],
  ['lightOpacity', 'META_TEXT_OPACITY', 'opacité de la méta discrète (MetaText.lightOpacity)'],
  // --- #5648 : la SCÈNE du fil (élection, carte, chips, tampon).
  ['chipHeight', 'FOCUS_CHIP_HEIGHT', 'hauteur des chips de la bande (FocusStrip.chipHeight)'],
  ['chipMinWidth', 'FOCUS_CHIP_MIN_WIDTH', 'largeur minimale des chips (FocusStrip.chipMinWidth)'],
  ['chipInset', 'FOCUS_CHIP_INSET', 'débord horizontal des chips (FocusStrip.chipInset)'],
  ['identityAvatarSize', 'IDENTITY_AVATAR_SIZE', "taille de l'avatar du chip d'identité (FocusStrip.identityAvatarSize)"],
  ['identityChipHeight', 'IDENTITY_CHIP_HEIGHT', "hauteur du chip d'identité (FocusStrip.identityChipHeight)"],
  ['identityNameSize', 'IDENTITY_NAME_SIZE', "taille du nom dans le chip d'identité (FocusStrip.identityNameSize)"],
  ['flagLimitPlain', 'FLAG_LIMIT_PLAIN', 'plafond de drapeaux sur une rangée ordinaire (FocusStrip.flagLimitPlain)'],
  ['flagLimitMagnified', 'FLAG_LIMIT_MAGNIFIED', 'plafond de drapeaux sur la bande de la rangée élue (FocusStrip.flagLimitMagnified)'],
  ['fadeDurationMs', 'REVEAL_FADE_DURATION_MS', 'durée du fondu du révélé (Pill.fadeDurationMs)'],
  // --- #5774 (travail 3/3) : le CHROME du fil (HiddenChrome).
  ['edgeTravel', 'HIDDEN_CHROME_EDGE_TRAVEL', "course de l'escamotage vers le bord (HiddenChrome.edgeTravel)"],
  // --- #5936 : le sticker de la rangée plate (Sticker.side).
  ['side', 'STICKER_SIDE', 'côté du sticker en rangée plate (Sticker.side)'],
];

for (const [swiftName, downstreamName, what] of FOCAL_MAPPINGS) {
  const expectedFocal = focalNumber(swiftName);
  const actualFocal = count(focalDerived, downstreamName);
  if (expectedFocal === null) failures.push(`${what} : « ${swiftName} » est introuvable dans FocalMetrics.swift`);
  else if (actualFocal === null) failures.push(`${what} : « ${downstreamName} » est introuvable dans reading-mode/metrics.ts`);
  else if (expectedFocal !== actualFocal) failures.push(`${what} : Swift ${expectedFocal}, dérivée ${actualFocal}`);
}

/**
 * `Scene.restDelay` / `.flattenDuration` (#5648) sont en SECONDES côté
 * Swift — `SCENE_REST_DELAY_MS`/`SCENE_FLATTEN_DURATION_MS` les portent en
 * MILLISECONDES (`×1000`), même dispositif que `TEXT_INDENT` ci-dessus :
 * une FORMULE, revérifiée explicitement plutôt que recopiée en dur.
 */
const SCENE_MS_MAPPINGS = [
  ['restDelay', 'SCENE_REST_DELAY_MS', 'délai de repos avant aplatissement (Scene.restDelay)'],
  ['flattenDuration', 'SCENE_FLATTEN_DURATION_MS', "durée de l'aplatissement (Scene.flattenDuration)"],
  /**
   * #5694 (écart 2) — la LENTILLE réutilise cette même cote
   * (`LentilleSceneActivity.noteScroll` anime littéralement
   * `withAnimation(.easeOut(duration: FocalMetrics.Scene.enterDuration))`,
   * `Perspective/LentilleSceneActivity.swift:38-40`) : un SEUL gate, deux
   * consommateurs (`reading-mode/metrics.ts`, `lens/scene.ts` qui l'importe).
   */
  ['enterDuration', 'SCENE_ENTER_DURATION_MS', "durée de l'entrée en scène (Scene.enterDuration)"],
  // --- #5774 (travail 3/3) : `HiddenChrome.easeOut` est en SECONDES.
  ['easeOut', 'HIDDEN_CHROME_EASE_OUT_MS', "durée de l'escamotage/révélation (HiddenChrome.easeOut)"],
];
for (const [swiftName, downstreamName, what] of SCENE_MS_MAPPINGS) {
  const expectedSeconds = focalNumber(swiftName);
  const actualMs = count(focalDerived, downstreamName);
  if (expectedSeconds === null) failures.push(`${what} : « ${swiftName} » introuvable dans FocalMetrics.swift`);
  else if (actualMs === null) failures.push(`${what} : « ${downstreamName} » introuvable dans reading-mode/metrics.ts`);
  else if (Math.round(expectedSeconds * 1000) !== actualMs)
    failures.push(`${what} : Swift ${expectedSeconds}s (×1000 = ${expectedSeconds * 1000}), dérivée ${actualMs}`);
}

/**
 * `TEXT_INDENT` n'est PAS un littéral côté Swift (`avatarSize + 7`, une
 * FORMULE) : on la revérifie explicitement plutôt que de laisser le régex
 * générique manquer silencieusement le `+`.
 */
{
  const avatarFrame = focalNumber('avatarSize');
  const textIndent = count(focalDerived, 'TEXT_INDENT');
  if (avatarFrame === null) {
    failures.push('retrait de texte constant (Focus.textIndent) : « avatarSize » introuvable dans FocalMetrics.swift');
  } else if (textIndent === null) {
    failures.push('retrait de texte constant (Focus.textIndent) : « TEXT_INDENT » introuvable dans reading-mode/metrics.ts');
  } else if (textIndent !== avatarFrame + 7) {
    failures.push(
      `retrait de texte constant (Focus.textIndent = avatarSize + 7) : Swift ${avatarFrame + 7}, dérivée ${textIndent}`,
    );
  }
}

/**
 * LES VALEURS sont vérifiées par `src/lib/lens/law.test.ts`, qui IMPORTE la
 * loi et compare sa sortie à une table — bun lit le TypeScript nativement, donc
 * aucune chirurgie de texte n'est nécessaire.
 *
 * La première version de ce gate réévaluait la formule en découpant le fichier
 * à la regex et en la passant à `new Function`. Elle marchait, et les deux
 * mutations l'ont confirmée — mais elle serait tombée au premier reformatage,
 * pour une raison sans aucun rapport avec une dérive. Un gate qui rougit pour
 * la mauvaise raison finit désarmé.
 *
 * Ce script garde donc ce qu'il sait faire SIMPLEMENT : comparer les
 * CONSTANTES des deux fichiers, texte contre texte.
 */

/**
 * PARTIE 3 — les constantes du variant `thread` vivent dans un objet
 * littéral distinct de `list` : on isole d'abord sa portion de texte, sans
 * quoi `maxDistance` attraperait celle du variant `list`, déclarée juste
 * après dans la source amont.
 */
const threadPortion = /thread:\s*\{[^}]*\}/.exec(source)?.[0] ?? '';
const upstreamThreadValue = (name) => count(threadPortion, name);

const THREAD_MAPPINGS = [
  ['maxDistance', 'THREAD_MAX_DISTANCE', 'distance de saturation du fil'],
  ['scaleDecay', 'THREAD_SCALE_DECAY', "amplitude de l'échelle du fil"],
  ['alphaDecay', 'THREAD_ALPHA_DECAY', 'amplitude du fondu du fil'],
];

for (const [upstreamName, downstreamName, what] of THREAD_MAPPINGS) {
  const expectedThread = upstreamThreadValue(upstreamName);
  const actualThread = count(threadDerived, downstreamName);
  if (expectedThread === null) failures.push(`${what} : « ${upstreamName} » introuvable dans le variant thread de focus-curve.ts`);
  else if (actualThread === null) failures.push(`${what} : « ${downstreamName} » introuvable dans reading-mode/perspective.ts`);
  else if (expectedThread !== actualThread) failures.push(`${what} : amont ${expectedThread}, dérivée ${actualThread}`);
}

/** La bande de focus du fil vit HORS du bloc `thread` (export top-level). */
{
  const expectedOffset = count(source, 'THREAD_FOCUS_BAND_OFFSET');
  const actualOffset = count(threadDerived, 'THREAD_FOCUS_BAND_OFFSET');
  if (expectedOffset === null) failures.push('bande de focus du fil : « THREAD_FOCUS_BAND_OFFSET » introuvable dans focus-curve.ts');
  else if (actualOffset === null) failures.push('bande de focus du fil : « THREAD_FOCUS_BAND_OFFSET » introuvable dans reading-mode/perspective.ts');
  else if (expectedOffset !== actualOffset) failures.push(`bande de focus du fil : amont ${expectedOffset}, dérivée ${actualOffset}`);
}

/**
 * LES VALEURS du variant `thread` sont vérifiées par
 * `src/lib/reading-mode/perspective.test.ts` — même partition des
 * responsabilités que la PARTIE 1 : ce script compare des CONSTANTES, le test
 * bun compare des SORTIES.
 */

/**
 * `THREAD_FOCUS_BAND_HYSTERESIS` (#5648) — l'AMONT reste `focus-curve.ts`
 * (comme `THREAD_FOCUS_BAND_OFFSET` juste au-dessus), mais son AVAL a changé
 * de fichier : `perspective.ts` est GELÉ (sans appelant de production
 * depuis #5648), l'hystérésis vit désormais dans `reading-mode/election.ts`.
 */
{
  const expectedHysteresis = count(source, 'THREAD_FOCUS_BAND_HYSTERESIS');
  const actualHysteresis = count(electionDerived, 'THREAD_FOCUS_BAND_HYSTERESIS');
  if (expectedHysteresis === null) failures.push('hystérésis de la bande de focus du fil : « THREAD_FOCUS_BAND_HYSTERESIS » introuvable dans focus-curve.ts');
  else if (actualHysteresis === null) failures.push('hystérésis de la bande de focus du fil : « THREAD_FOCUS_BAND_HYSTERESIS » introuvable dans reading-mode/election.ts');
  else if (expectedHysteresis !== actualHysteresis) failures.push(`hystérésis de la bande de focus du fil : amont ${expectedHysteresis}, dérivée ${actualHysteresis}`);
}

/**
 * PARTIE 4 — `FocalScrollPerspective.swift` → `reading-mode/metrics.ts` /
 * `reading-mode/election.ts` (#5648). SECONDE source Swift du Fil, distincte
 * de `FocalMetrics.swift` (PARTIE 2) : les seuils d'armement de la
 * magnificence et les teintes de la carte/des chips.
 */
const perspectiveNumber = (name) => {
  const m = new RegExp(`\\b${name}\\s*(?::\\s*\\w+\\s*)?=\\s*(-?[0-9.]+)`).exec(perspectiveSwift);
  return m === null ? null : Number(m[1]);
};

const PERSPECTIVE_MAPPINGS = [
  ['sustainedScrollMs', 'SUSTAINED_SCROLL_MS', 'durée soutenue avant armement (FocalMagnificationLaw.sustainedScrollMs)'],
  ['highVelocityThreshold', 'HIGH_VELOCITY_THRESHOLD', "seuil de vitesse d'armement immédiat (FocalMagnificationLaw.highVelocityThreshold)"],
  ['focusCardCornerRadius', 'FOCUS_CARD_RADIUS', 'rayon de la carte de focus (focusCardCornerRadius)'],
  ['focusCardHorizontalInset', 'FOCUS_CARD_HORIZONTAL_INSET', 'débord horizontal de la carte (focusCardHorizontalInset)'],
  ['focusCardFillOpacityDark', 'FOCUS_CARD_FILL_DARK', 'teinte de la carte, schéma sombre (focusCardFillOpacityDark)'],
  ['focusCardFillOpacityLight', 'FOCUS_CARD_FILL_LIGHT', 'teinte de la carte, schéma clair (focusCardFillOpacityLight)'],
];

for (const [swiftName, downstreamName, what] of PERSPECTIVE_MAPPINGS) {
  const expectedPerspective = perspectiveNumber(swiftName);
  const actualPerspective = count(focalDerived, downstreamName);
  if (expectedPerspective === null) failures.push(`${what} : « ${swiftName} » introuvable dans FocalScrollPerspective.swift`);
  else if (actualPerspective === null) failures.push(`${what} : « ${downstreamName} » introuvable dans reading-mode/metrics.ts`);
  else if (expectedPerspective !== actualPerspective) failures.push(`${what} : Swift ${expectedPerspective}, dérivée ${actualPerspective}`);
}

/**
 * `focusChipFillOpacity(isDark:isActive:)` (:206-213) — QUATRE `return` dans
 * un `switch`, pas des littéraux nommés : une regex dédiée par cas plutôt
 * que le lecteur générique, qui ne sait lire qu'un `nom = valeur`.
 */
const CHIP_FILL_CASES = [
  ['\\(true, false\\)', 'FOCUS_CHIP_FILL_DARK', 'teinte du chip, sombre/inactif (case (true, false))'],
  ['\\(false, false\\)', 'FOCUS_CHIP_FILL_LIGHT', 'teinte du chip, clair/inactif (case (false, false))'],
  ['\\(true, true\\)', 'FOCUS_CHIP_FILL_ACTIVE_DARK', 'teinte du chip, sombre/actif (case (true, true))'],
  ['\\(false, true\\)', 'FOCUS_CHIP_FILL_ACTIVE_LIGHT', 'teinte du chip, clair/actif (case (false, true))'],
];
for (const [casePattern, downstreamName, what] of CHIP_FILL_CASES) {
  const m = new RegExp(`case ${casePattern}:\\s*return\\s*(-?[0-9.]+)`).exec(perspectiveSwift);
  const expectedCase = m === null ? null : Number(m[1]);
  const actualCase = count(focalDerived, downstreamName);
  if (expectedCase === null) failures.push(`${what} : introuvable dans FocalScrollPerspective.swift`);
  else if (actualCase === null) failures.push(`${what} : « ${downstreamName} » introuvable dans reading-mode/metrics.ts`);
  else if (expectedCase !== actualCase) failures.push(`${what} : Swift ${expectedCase}, dérivée ${actualCase}`);
}

/**
 * PARTIE 5 — `BubbleBlurRevealLifecycle.swift` → `reading-mode/protection.ts`
 * (D-23, #5676). Une SEULE constante gardable par ce dispositif :
 * `defaultRevealDuration: TimeInterval = 5` (`name: Type = valeur`, comme
 * `SWIFT_MAPPINGS` ci-dessus). Le rayon de flou (`FocalProtectedContent.swift:33`,
 * un TERNAIRE) et les trois phases du brouillard (des `case` de
 * `Phase.duration`, pas des affectations `nom = valeur`) ne sont PAS
 * gardables par ce lecteur générique — dit ici en commentaire, jamais
 * contourné par une regex plus permissive qui rougirait pour la mauvaise
 * raison (§ note PARTIE 1 sur `new Function`).
 */
const UPSTREAM_REVEAL_SWIFT = `${ROOT}apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleBlurRevealLifecycle.swift`;
const DOWNSTREAM_PROTECTION = `${ROOT}apps/web-v2/src/lib/reading-mode/protection.ts`;
const revealSwift = readFileSync(UPSTREAM_REVEAL_SWIFT, 'utf8');
const protectionDerived = readFileSync(DOWNSTREAM_PROTECTION, 'utf8');
const revealNumber = (name) => {
  const m = new RegExp(`\\b${name}\\s*(?::\\s*\\w+\\s*)?=\\s*(-?[0-9.]+)`).exec(revealSwift);
  return m === null ? null : Number(m[1]);
};
const REVEAL_MAPPINGS = [
  ['defaultRevealDuration', 'REVEAL_DURATION_SECONDS', 'durée de révélation d’un message voilé (BubbleBlurRevealLifecycle.defaultRevealDuration)'],
];
for (const [swiftName, downstreamName, what] of REVEAL_MAPPINGS) {
  const expectedReveal = revealNumber(swiftName);
  const actualReveal = count(protectionDerived, downstreamName);
  if (expectedReveal === null) failures.push(`${what} : « ${swiftName} » introuvable dans BubbleBlurRevealLifecycle.swift`);
  else if (actualReveal === null) failures.push(`${what} : « ${downstreamName} » introuvable dans reading-mode/protection.ts`);
  else if (expectedReveal !== actualReveal) failures.push(`${what} : Swift ${expectedReveal}, dérivée ${actualReveal}`);
}

/**
 * PARTIE 6 — LA TYPOGRAPHIE DE LA RANGÉE DE LA LENTILLE (#5694, écart 1).
 * `LentilleMetrics.Name.size`/`.Line2.size` ne sont PAS des littéraux Swift
 * (`MeeshyFont.bodySize`/`.subheadSize`) — leur aval n'est donc pas une
 * constante TS gardée par extraction textuelle, comme les parties
 * précédentes, mais les jetons `--ios-font-body`/`--ios-font-subhead`/
 * `--ios-text-time` déjà DÉRIVÉS de Swift par `generate-from-ios.mjs` (gate
 * `check:tokens`) — ce gate-ci ferme la boucle : il compare CES jetons à
 * `packages/shared/design/lentille-tokens.json` (`list.name/.line2/.time`,
 * la source normative de la cote, `LentilleMetrics.swift:73-90`) et vérifie
 * que `lens-row.tsx` utilise bien les classes Tailwind qui les portent.
 * Une valeur FALSIFIÉE dans l'un ou l'autre fichier fait rougir ce gate.
 */
const UPSTREAM_LENTILLE_TOKENS = `${ROOT}packages/shared/design/lentille-tokens.json`;
const IOS_CSS = `${ROOT}packages/design-tokens/ios.css`;
const THEME_CSS = `${ROOT}apps/web-v2/src/styles/ios.css`;
const LENS_ROW = `${ROOT}apps/web-v2/src/components/lens-row.tsx`;
const LENS_TIME = `${ROOT}apps/web-v2/src/components/lens-time.tsx`;

const lentilleTokens = JSON.parse(readFileSync(UPSTREAM_LENTILLE_TOKENS, 'utf8'));
const iosCss = readFileSync(IOS_CSS, 'utf8');
const themeCss = readFileSync(THEME_CSS, 'utf8');

/**
 * LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE RECHERCHE DE CLASSE — sans quoi
 * ce gate NE PEUT PAS ÉCHOUER (revue #5694). Chaque classe gardée ici est
 * NOMMÉE dans le doc-comment qui la justifie, juste au-dessus de l'élément :
 * un simple `grep` de la classe reste donc vert même quand l'élément ne la
 * porte plus. Mesuré : `text-bubble` remplacé par `text-check` sur le nom de
 * la rangée (15 px → 10 px, une régression VISIBLE à l'œil) laissait ce gate
 * VERT. C'est la leçon « un test qui ne peut pas échouer ne valide rien ».
 */
const withoutComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ');

const lensRowSource = withoutComments(readFileSync(LENS_ROW, 'utf8'));
const lensTimeSource = withoutComments(readFileSync(LENS_TIME, 'utf8'));

const cssPxVar = (name) => {
  const m = new RegExp(`--${name}:\\s*([0-9.]+)px`).exec(iosCss);
  return m === null ? null : Number(m[1]);
};

/** L'alias Tailwind : `--text-<utilitaire>: var(--<jeton iOS>)` dans `src/styles/ios.css`. */
const themeAlias = (utility) => {
  const m = new RegExp(`--text-${utility}:\\s*var\\(--([a-zA-Z0-9-]+)\\)`).exec(themeCss);
  return m === null ? null : m[1];
};

/** Le poids Tailwind qui vaut le poids déclaré par le jeton. */
const WEIGHT_CLASS = { 400: 'font-normal', 500: 'font-medium', 600: 'font-semibold', 700: 'font-bold', 800: 'font-extrabold', 900: 'font-black' };

/**
 * LA CHAÎNE COMPLÈTE, maillon par maillon : `lentille-tokens.json` (la cote
 * normative) → `--ios-*` (`packages/design-tokens/ios.css`, DÉRIVÉ de Swift)
 * → `--text-*` (l'alias Tailwind de `src/styles/ios.css`) → la classe
 * RÉELLEMENT posée sur l'élément. Rompre n'importe lequel des quatre maillons
 * fait rougir ce gate. Le POIDS suit la même chaîne, sans alias : Tailwind le
 * porte en standard.
 */
const TYPOGRAPHY_MAPPINGS = [
  { cssVarName: 'ios-font-body', utility: 'bubble', tokenKey: 'name', source: lensRowSource, what: 'nom de la rangée (list.name, lens-row.tsx)' },
  { cssVarName: 'ios-font-subhead', utility: 'title', tokenKey: 'line2', source: lensRowSource, what: "aperçu de la rangée — ligne 2 (list.line2, lens-row.tsx)" },
  { cssVarName: 'ios-text-time', utility: 'time', tokenKey: 'time', source: lensTimeSource, what: "heure de la rangée (list.time, lens-time.tsx)" },
];

for (const { cssVarName, utility, tokenKey, source, what } of TYPOGRAPHY_MAPPINGS) {
  const token = lentilleTokens.list?.[tokenKey];
  const expectedToken = token?.size;
  const actualCss = cssPxVar(cssVarName);
  if (typeof expectedToken !== 'number') {
    failures.push(`${what} : « list.${tokenKey}.size » introuvable dans lentille-tokens.json`);
    continue;
  }
  if (actualCss === null) {
    failures.push(`${what} : « --${cssVarName} » introuvable dans ios.css`);
    continue;
  }
  if (actualCss !== expectedToken) {
    failures.push(`${what} : lentille-tokens.json ${expectedToken}, ios.css ${actualCss}`);
  }
  const alias = themeAlias(utility);
  if (alias === null) {
    failures.push(`${what} : l'alias « --text-${utility} » est absent de src/styles/ios.css`);
  } else if (alias !== cssVarName) {
    failures.push(`${what} : « --text-${utility} » pointe sur --${alias}, attendu --${cssVarName}`);
  }
  if (!new RegExp(`\\btext-${utility}\\b`).test(source)) {
    failures.push(`${what} : la classe « text-${utility} » n'est posée sur aucun élément`);
  }
  if (typeof token.weight === 'number') {
    const weightClass = WEIGHT_CLASS[token.weight];
    if (weightClass === undefined) failures.push(`${what} : poids ${token.weight} sans utilitaire Tailwind connu`);
    else if (!new RegExp(`\\b${weightClass}\\b`).test(source)) {
      failures.push(`${what} : le poids ${token.weight} (« ${weightClass} ») n'est posé sur aucun élément`);
    }
  }
}

/**
 * PARTIE 7 — LE MENU DU MESSAGE (#5814, G3). `MessageOverlayMenu.swift` et
 * `MessageActionsMenu.swift` → `src/lib/view/message-menu-metrics.ts`. Même
 * dispositif que les PARTIES 2 et 5 : `nom: Type = valeur`, lu par regex, et
 * comparé au littéral aval.
 *
 * CE QUI N'EST PAS GARDABLE ICI, dit plutôt que contourné (§ note PARTIE 5) :
 * le plancher de réduction de l'aperçu vit DANS un appel (`max(0.4, …)`,
 * `MessageOverlayMenu.swift:274`) et la largeur du rail (`nlEmojiWidth = 300`)
 * borne VINGT tuiles là où la v3.1 en dessine SEPT — deux cotes dont l'aval
 * diverge par décision, pas par dérive. Une regex plus permissive les ferait
 * rougir pour la mauvaise raison.
 */
const UPSTREAM_OVERLAY_SWIFT = `${ROOT}apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift`;
const UPSTREAM_ACTIONS_SWIFT = `${ROOT}apps/ios/Meeshy/Features/Main/Components/MessageActionsMenu.swift`;
const DOWNSTREAM_MENU_METRICS = `${ROOT}apps/web-v2/src/lib/view/message-menu-metrics.ts`;
const overlaySwift = readFileSync(UPSTREAM_OVERLAY_SWIFT, 'utf8');
const actionsSwift = readFileSync(UPSTREAM_ACTIONS_SWIFT, 'utf8');
const menuMetrics = readFileSync(DOWNSTREAM_MENU_METRICS, 'utf8');
const swiftAssignment = (source, name) => {
  const m = new RegExp(`\\b${name}\\s*(?::\\s*\\w+\\s*)?=\\s*(-?[0-9.]+)`).exec(source);
  return m === null ? null : Number(m[1]);
};
const MENU_MAPPINGS = [
  [overlaySwift, 'nlEmojiBarHeight', 'RAIL_HEIGHT', 'hauteur du rail de réactions (nlEmojiBarHeight)'],
  [overlaySwift, 'nlGap', 'RAIL_GAP', 'écart rail → aperçu (nlGap)'],
  [overlaySwift, 'nlMenuGap', 'MENU_GAP', 'écart aperçu → liste (nlMenuGap)'],
  [overlaySwift, 'nlSidePadding', 'SIDE_PADDING', 'marge latérale du cluster (nlSidePadding)'],
  [actionsSwift, 'menuWidth', 'MENU_WIDTH', 'largeur de la liste d’actions (MessageActionsMenu.menuWidth)'],
  [actionsSwift, 'rowMinHeight', 'MENU_ROW_HEIGHT', 'hauteur d’une entrée (MessageActionsMenu.rowMinHeight)'],
];
for (const [swiftSource, swiftName, downstreamName, what] of MENU_MAPPINGS) {
  const expectedMenu = swiftAssignment(swiftSource, swiftName);
  const actualMenu = count(menuMetrics, downstreamName);
  if (expectedMenu === null) failures.push(`${what} : « ${swiftName} » introuvable dans la source Swift`);
  else if (actualMenu === null) failures.push(`${what} : « ${downstreamName} » introuvable dans message-menu-metrics.ts`);
  else if (expectedMenu !== actualMenu) failures.push(`${what} : Swift ${expectedMenu}, dérivée ${actualMenu}`);
}
// `estimatedSize(actionCount:)` rend `count * scaledRow + 20` — le CHROME de
// la liste, une addition dans un `return`, pas une affectation nommée : on lit
// donc le littéral à SA place, en citant l'expression qui l'entoure.
{
  const m = /CGFloat\(count\)\s*\*\s*scaledRow\s*\+\s*([0-9.]+)/.exec(actionsSwift);
  const expectedChrome = m === null ? null : Number(m[1]);
  const actualChrome = count(menuMetrics, 'MENU_CHROME');
  if (expectedChrome === null) failures.push('chrome de la liste : « count * scaledRow + N » introuvable dans MessageActionsMenu.estimatedSize');
  else if (actualChrome === null) failures.push('chrome de la liste : « MENU_CHROME » introuvable dans message-menu-metrics.ts');
  else if (expectedChrome !== actualChrome) failures.push(`chrome de la liste : Swift ${expectedChrome}, dérivée ${actualChrome}`);
}
// LE RAIL, ses SIX emojis rapides et ses VINGT étendus viennent du MÊME
// tableau Swift (`defaultEmojis`) — la v3.1 en projette les 6 premiers sur le
// rail et les 20 sur la feuille « Ajouter ». Recopiés à la main une fois, ils
// dériveraient en silence : on les compare.
{
  const block = /private let defaultEmojis = \[([\s\S]*?)\]/.exec(overlaySwift);
  const DOWNSTREAM_ACTIONS = `${ROOT}apps/web-v2/src/lib/view/message-actions.ts`;
  const actionsSource = readFileSync(DOWNSTREAM_ACTIONS, 'utf8');
  const emojisOf = (text) => (text.match(/'([^']+)'|"([^"]+)"/g) ?? []).map((t) => t.slice(1, -1));
  const quickBlock = /export const QUICK_REACTIONS = \[([\s\S]*?)\]/.exec(actionsSource);
  const extendedBlock = /export const EXTENDED_REACTIONS = \[([\s\S]*?)\]/.exec(actionsSource);
  if (block === null) failures.push('le rail : « defaultEmojis » introuvable dans MessageOverlayMenu.swift');
  else if (quickBlock === null || extendedBlock === null) {
    failures.push('le rail : QUICK_REACTIONS/EXTENDED_REACTIONS introuvables dans message-actions.ts');
  } else {
    const swiftEmojis = emojisOf(block[1]);
    const quick = emojisOf(quickBlock[1]);
    const extended = emojisOf(extendedBlock[1]);
    if (extended.join(' ') !== swiftEmojis.join(' ')) {
      failures.push(`les 20 emojis étendus ont dérivé de defaultEmojis (Swift « ${swiftEmojis.join('')} », dérivée « ${extended.join('')} »)`);
    }
    if (quick.join(' ') !== swiftEmojis.slice(0, 6).join(' ')) {
      failures.push(`les 6 emojis du rail ne sont pas les 6 premiers de defaultEmojis (Swift « ${swiftEmojis.slice(0, 6).join('')} », dérivée « ${quick.join('')} »)`);
    }
  }
}

/**
 * PARTIE 8 — LA PILULE DE JOUR COLLANTE ET LE FOND DU FIL (#5774, travail
 * 3/3). Deux sources Swift DISTINCTES de `FocalMetrics.swift` :
 * `MessageDayStickyOverlay.swift` (position, fondu) et
 * `ConversationAnimatedBackground.swift` (dégradé, `lib/view/thread-backdrop.ts`).
 *
 * `topOffset` est une DÉCLARATION (`nom: Type = valeur`, le dispositif
 * générique) ; la durée du fondu (`0.18`) et les hexadécimaux/pourcentages
 * du fond sont des ARGUMENTS D'APPEL (`duration: 0.18`, `Color(hex:
 * "0F0C29")`, `amount: 0.12`) — hors de portée de `focalNumber`, donc lus
 * par des regex DÉDIÉES, documentées ici plutôt que contournées (§ note
 * PARTIE 5).
 */
{
  const stickyOverlaySwift = readFileSync(
    `${ROOT}apps/ios/Meeshy/Features/Main/Views/Bubble/MessageDayStickyOverlay.swift`,
    'utf8',
  );
  const backgroundSwift = readFileSync(`${ROOT}apps/ios/Meeshy/Features/Main/Views/ConversationAnimatedBackground.swift`, 'utf8');
  const metricsDerived = readFileSync(`${ROOT}apps/web-v2/src/lib/reading-mode/metrics.ts`, 'utf8');
  const backdropDerived = readFileSync(`${ROOT}apps/web-v2/src/lib/view/thread-backdrop.ts`, 'utf8');

  const topOffsetSwift = (() => {
    const m = /\btopOffset\s*(?::\s*\w+\s*)?=\s*(-?[0-9.]+)/.exec(stickyOverlaySwift);
    return m === null ? null : Number(m[1]);
  })();
  const topOffsetDerived = count(metricsDerived, 'DAY_PILL_TOP');
  if (topOffsetSwift === null) failures.push('pilule de jour : « topOffset » introuvable dans MessageDayStickyOverlay.swift');
  else if (topOffsetDerived === null) failures.push('pilule de jour : « DAY_PILL_TOP » introuvable dans reading-mode/metrics.ts');
  else if (topOffsetSwift !== topOffsetDerived)
    failures.push(`pilule de jour, décalage du haut : Swift ${topOffsetSwift}, dérivée ${topOffsetDerived}`);

  const fadeSwift = (() => {
    const m = /easeInOut\(duration:\s*(-?[0-9.]+)\)/.exec(stickyOverlaySwift);
    return m === null ? null : Number(m[1]);
  })();
  const fadeDerivedMs = count(metricsDerived, 'DAY_PILL_FADE_MS');
  if (fadeSwift === null) failures.push('pilule de jour : aucun « .easeInOut(duration: …) » trouvé dans MessageDayStickyOverlay.swift');
  else if (fadeDerivedMs === null) failures.push('pilule de jour : « DAY_PILL_FADE_MS » introuvable dans reading-mode/metrics.ts');
  else if (Math.round(fadeSwift * 1000) !== fadeDerivedMs)
    failures.push(`pilule de jour, fondu : Swift ${fadeSwift}s (×1000 = ${fadeSwift * 1000}), dérivée ${fadeDerivedMs}`);

  const tintedAmount = (base) => {
    const m = new RegExp(`tinted\\("${base}", with: accent, amount: ([0-9.]+)\\)`).exec(backgroundSwift);
    return m === null ? null : Number(m[1]);
  };
  const HEX_MAPPINGS = [
    [() => /Color\(hex:\s*"0F0C29"\)/.test(backgroundSwift), 'BACKDROP_DARK_START', '0F0C29', 'fond sombre, premier arrêt'],
    [() => /Color\(hex:\s*"24243E"\)/.test(backgroundSwift), 'BACKDROP_DARK_END', '24243E', 'fond sombre, dernier arrêt'],
    [() => /Color\(hex:\s*"FFFFFF"\)/.test(backgroundSwift), 'BACKDROP_LIGHT_BASE', 'FFFFFF', 'fond clair, base'],
  ];
  for (const [presentInSwift, downstreamName, expectedHex, what] of HEX_MAPPINGS) {
    const actualHex = (() => {
      const m = new RegExp(`${downstreamName}\\s*=\\s*'([0-9A-Fa-f]{6})'`).exec(backdropDerived);
      return m === null ? null : m[1].toUpperCase();
    })();
    if (!presentInSwift()) failures.push(`${what} : « ${expectedHex} » introuvable dans ConversationAnimatedBackground.swift`);
    else if (actualHex === null) failures.push(`${what} : « ${downstreamName} » introuvable dans lib/view/thread-backdrop.ts`);
    else if (actualHex !== expectedHex) failures.push(`${what} : Swift ${expectedHex}, dérivée ${actualHex}`);
  }

  const TINT_MAPPINGS = [
    ['0F0C29', 'BACKDROP_DARK_TINT', 'fond sombre, mélange accent'],
    ['FFFFFF', 'BACKDROP_LIGHT_TINT_START', 'fond clair, premier mélange accent'],
  ];
  for (const [base, downstreamName, what] of TINT_MAPPINGS) {
    const expectedTint = tintedAmount(base);
    const actualTint = count(backdropDerived, downstreamName);
    if (expectedTint === null) failures.push(`${what} : « tinted("${base}", …, amount:) » introuvable dans ConversationAnimatedBackground.swift`);
    else if (actualTint === null) failures.push(`${what} : « ${downstreamName} » introuvable dans lib/view/thread-backdrop.ts`);
    else if (expectedTint !== actualTint) failures.push(`${what} : Swift ${expectedTint}, dérivée ${actualTint}`);
  }
  // Le second mélange clair (`amount: 0.05`) est le SECOND appel à `tinted("FFFFFF", …)`
  // dans le fichier : la regex générique ne capture que le premier — vérifié
  // à la main ici plutôt que d'écrire une troisième regex à motif variable.
  const secondLightTint = (() => {
    const all = [...backgroundSwift.matchAll(/tinted\("FFFFFF", with: accent, amount: ([0-9.]+)\)/g)];
    return all.length < 2 ? null : Number(all[1][1]);
  })();
  const actualLightTintEnd = count(backdropDerived, 'BACKDROP_LIGHT_TINT_END');
  if (secondLightTint === null) failures.push('fond clair, second mélange accent : second appel « tinted("FFFFFF", …) » introuvable');
  else if (actualLightTintEnd === null) failures.push('fond clair, second mélange accent : « BACKDROP_LIGHT_TINT_END » introuvable dans lib/view/thread-backdrop.ts');
  else if (secondLightTint !== actualLightTintEnd)
    failures.push(`fond clair, second mélange accent : Swift ${secondLightTint}, dérivée ${actualLightTintEnd}`);
}

/**
 * PARTIE 9 — LES ÉTATS DU MESSAGE (#5936). Le brief de la spécification
 * nomme cette section « PARTIE 6 », déjà prise par la typographie de la
 * Lentille (ci-dessus) : renumérotée ici, dans l'ordre réel du fichier.
 *
 * DEUX SOURCES SWIFT DISTINCTES, ni l'une ni l'autre `FocalMetrics.swift` :
 * `EmojiDetector.swift` (les trois tailles d'emoji seul, un ENUM dont
 * `focalNumber` ne sait pas lire les `case` — lu par une regex DÉDIÉE, même
 * dispositif que PARTIE 8) et `BubbleSticker.swift` (le côté du sticker EN
 * BULLE et la boîte de son repli emoji — hors `FocalMetrics`, comme
 * `FocalScrollPerspective.swift` l'était déjà pour PARTIE 4).
 */
{
  const emojiDetectorSwift = readFileSync(
    `${ROOT}packages/MeeshySDK/Sources/MeeshyUI/Utilities/EmojiDetector.swift`,
    'utf8',
  );
  const bubbleStickerSwift = readFileSync(`${ROOT}apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleSticker.swift`, 'utf8');
  const messageBodyDerived = readFileSync(`${ROOT}apps/web-v2/src/lib/view/message-body.ts`, 'utf8');
  const metricsDerived2 = readFileSync(`${ROOT}apps/web-v2/src/lib/reading-mode/metrics.ts`, 'utf8');

  const EMOJI_CASE_MAPPINGS = [
    ['single', 'single'],
    ['double', 'double'],
    ['triple', 'triple'],
  ];
  for (const [swiftCase, tsKey] of EMOJI_CASE_MAPPINGS) {
    const swiftValue = (() => {
      const m = new RegExp(`case \\.${swiftCase}: return (-?[0-9.]+)`).exec(emojiDetectorSwift);
      return m === null ? null : Number(m[1]);
    })();
    const derivedValue = (() => {
      const m = new RegExp(`${tsKey}:\\s*(-?[0-9.]+)`).exec(messageBodyDerived);
      return m === null ? null : Number(m[1]);
    })();
    if (swiftValue === null) failures.push(`taille d'emoji seul (${swiftCase}) : introuvable dans EmojiDetector.swift`);
    else if (derivedValue === null) failures.push(`taille d'emoji seul (${swiftCase}) : « ${tsKey} » introuvable dans EMOJI_ONLY_FONT_SIZES`);
    else if (swiftValue !== derivedValue)
      failures.push(`taille d'emoji seul (${swiftCase}) : Swift ${swiftValue}, dérivée ${derivedValue}`);
  }

  const bubbleStickerNumber = (name) => {
    const m = new RegExp(`\\b${name}\\s*(?::\\s*\\w+\\s*)?=\\s*(-?[0-9.]+)`).exec(bubbleStickerSwift);
    return m === null ? null : Number(m[1]);
  };
  const STICKER_MAPPINGS = [
    ['side', 'BUBBLE_STICKER_SIDE', 'côté du sticker en bulle (BubbleSticker.side)'],
  ];
  for (const [swiftName, downstreamName, what] of STICKER_MAPPINGS) {
    const expectedSticker = bubbleStickerNumber(swiftName);
    const actualSticker = count(metricsDerived2, downstreamName);
    if (expectedSticker === null) failures.push(`${what} : « ${swiftName} » introuvable dans BubbleSticker.swift`);
    else if (actualSticker === null) failures.push(`${what} : « ${downstreamName} » introuvable dans reading-mode/metrics.ts`);
    else if (expectedSticker !== actualSticker) failures.push(`${what} : Swift ${expectedSticker}, dérivée ${actualSticker}`);
  }

  // `emojiBox` est une FORMULE (`CGSize(width: 60, height: 60)`), pas un
  // littéral `nom = valeur` — lue par une regex dédiée plutôt qu'un
  // `bubbleStickerNumber` générique qui la manquerait.
  const emojiBoxSwift = (() => {
    const m = /emojiBox\s*=\s*CGSize\(width:\s*(-?[0-9.]+),\s*height:\s*(-?[0-9.]+)\)/.exec(bubbleStickerSwift);
    return m === null ? null : Number(m[1]);
  })();
  const emojiBoxDerived = count(metricsDerived2, 'STICKER_EMOJI_BOX');
  if (emojiBoxSwift === null) failures.push('boîte emoji du sticker : « emojiBox = CGSize(width:…) » introuvable dans BubbleSticker.swift');
  else if (emojiBoxDerived === null) failures.push('boîte emoji du sticker : « STICKER_EMOJI_BOX » introuvable dans reading-mode/metrics.ts');
  else if (emojiBoxSwift !== emojiBoxDerived)
    failures.push(`boîte emoji du sticker : Swift ${emojiBoxSwift}, dérivée ${emojiBoxDerived}`);
}

if (failures.length > 0) {
  console.error('\n  La loi de la Lentille a DÉRIVÉ de packages/shared/utils/focus-curve.ts :\n');
  for (const e of failures) console.error(`    · ${e}`);
  console.error(
    "\n  La source de vérité est AMONT. Accorder `src/lib/lens/law.ts` sur elle," +
      "\n  jamais l'inverse.\n",
  );
  process.exit(1);
}

console.log(
  `  La loi de la Lentille est conforme à focus-curve.ts` +
    ` (${MAPPINGS.length} constantes partagées, ${SWIFT_MAPPINGS.length} cotes iOS ;` +
    ' les valeurs sont gardées par law.test.ts).' +
    `\n  La rangée plate du Fil est conforme à FocalMetrics.swift` +
    ` (${FOCAL_MAPPINGS.length + 1 + SCENE_MS_MAPPINGS.length} cotes).` +
    `\n  La perspective du Fil est conforme au variant thread de focus-curve.ts` +
    ` (${THREAD_MAPPINGS.length + 2} constantes ; les valeurs sont gardées par perspective.test.ts).` +
    `\n  L'élection du Fil est conforme à FocalScrollPerspective.swift` +
    ` (${PERSPECTIVE_MAPPINGS.length + CHIP_FILL_CASES.length} cotes ; les valeurs sont gardées par election.test.ts).` +
    `\n  La protection du Fil est conforme à BubbleBlurRevealLifecycle.swift` +
    ` (${REVEAL_MAPPINGS.length} cote ; les valeurs sont gardées par protection.test.ts).` +
    `\n  La typographie de la rangée de la Lentille est conforme à lentille-tokens.json` +
    ` (${TYPOGRAPHY_MAPPINGS.length} chaînes complètes : jeton → ios.css → alias Tailwind → classe posée).` +
    `\n  Le menu du message est conforme à MessageOverlayMenu.swift/MessageActionsMenu.swift` +
    ` (${MENU_MAPPINGS.length} cotes + le chrome de la liste + les 6/20 emojis du rail).` +
    `\n  Les états du message sont conformes à EmojiDetector.swift/BubbleSticker.swift` +
    ` (3 tailles d'emoji seul + 2 cotes de sticker en bulle).`,
);
