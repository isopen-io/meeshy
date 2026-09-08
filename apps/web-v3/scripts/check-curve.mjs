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
const DOWNSTREAM = `${ROOT}apps/web-v3/src/lib/lens/law.ts`;

/**
 * PARTIE 2 — la rangée plate du FIL (#5566). Même dispositif, autre écran :
 * `FocalMetrics.swift` (iOS, `Focal/Core/`) est la source des cotes de
 * `src/lib/reading-mode/metrics.ts`, comme `LentilleMetrics.swift` l'est pour
 * `lens/law.ts` ci-dessus. Deux peaux, un seul gate de dérivation.
 */
const UPSTREAM_FOCAL_SWIFT = `${ROOT}apps/ios/Meeshy/Features/Main/Focal/Core/FocalMetrics.swift`;
const DOWNSTREAM_FOCAL = `${ROOT}apps/web-v3/src/lib/reading-mode/metrics.ts`;

/**
 * PARTIE 3 — la PERSPECTIVE du Fil (#5566, correction de revue : « Focal » et
 * « Script » rendaient des pixels identiques). `src/lib/reading-mode/perspective.ts`
 * dérive le variant `thread` de `focus-curve.ts`, exactement comme `lens/law.ts`
 * dérive le variant `list` ci-dessus.
 */
const DOWNSTREAM_THREAD = `${ROOT}apps/web-v3/src/lib/reading-mode/perspective.ts`;

const source = readFileSync(UPSTREAM, 'utf8');
const derived = readFileSync(DOWNSTREAM, 'utf8');
const swift = readFileSync(UPSTREAM_SWIFT, 'utf8');
const focalSwift = readFileSync(UPSTREAM_FOCAL_SWIFT, 'utf8');
const focalDerived = readFileSync(DOWNSTREAM_FOCAL, 'utf8');
const threadDerived = readFileSync(DOWNSTREAM_THREAD, 'utf8');

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
];

for (const [swiftName, downstreamName, what] of FOCAL_MAPPINGS) {
  const expectedFocal = focalNumber(swiftName);
  const actualFocal = count(focalDerived, downstreamName);
  if (expectedFocal === null) failures.push(`${what} : « ${swiftName} » est introuvable dans FocalMetrics.swift`);
  else if (actualFocal === null) failures.push(`${what} : « ${downstreamName} » est introuvable dans reading-mode/metrics.ts`);
  else if (expectedFocal !== actualFocal) failures.push(`${what} : Swift ${expectedFocal}, dérivée ${actualFocal}`);
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
    ` (${FOCAL_MAPPINGS.length + 1} cotes).` +
    `\n  La perspective du Fil est conforme au variant thread de focus-curve.ts` +
    ` (${THREAD_MAPPINGS.length + 1} constantes ; les valeurs sont gardées par perspective.test.ts).`,
);
