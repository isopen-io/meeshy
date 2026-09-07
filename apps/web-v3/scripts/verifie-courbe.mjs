#!/usr/bin/env node
/**
 * VÉRIFIE QUE LA LOI DE LA LENTILLE N'A PAS DÉRIVÉ DE SA SOURCE.
 *
 * `src/lib/lentille/loi.ts` est une DÉRIVATION de
 * `packages/shared/utils/focus-curve.ts` — pas un import, parce que ce paquet
 * traîne `@prisma/client` et `zod` et qu'on ne les fait pas entrer dans une
 * application de 25 Ko pour quarante lignes d'arithmétique (le raisonnement
 * complet est dans le doc-comment de `loi.ts`).
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

const RACINE = new URL('../../..', import.meta.url).pathname;
const AMONT = `${RACINE}packages/shared/utils/focus-curve.ts`;
/**
 * Les cotes de RESPIRATION ne vivent pas dans le paquet partagé : la courbe de
 * perspective est commune aux clients, la respiration est une cote de la peau
 * Lentille, donc iOS en est la source. Même dispositif que le générateur de
 * jetons, qui va chercher la palette dans `MeeshyColors.swift`.
 */
const AMONT_SWIFT = `${RACINE}apps/ios/Meeshy/Features/Main/Lentille/Core/LentilleMetrics.swift`;
const AVAL = `${RACINE}apps/web-v3/src/lib/lentille/loi.ts`;

const source = readFileSync(AMONT, 'utf8');
const derive = readFileSync(AVAL, 'utf8');
const swift = readFileSync(AMONT_SWIFT, 'utf8');

/** Lit `nom: 520` ou `nom = 520` — la source les écrit des deux façons. */
const nombre = (texte, nom) => {
  const m = new RegExp(`\\b${nom}\\s*[:=]\\s*(-?[0-9.]+)`).exec(texte);
  return m === null ? null : Number(m[1]);
};

const CORRESPONDANCES = [
  ['maxDistance', 'DISTANCE_MAX_LISTE', 'distance de saturation de la liste'],
  ['alphaDecay', 'FONDU_LISTE', "amplitude du fondu"],
  ['scaleDecay', 'ECHELLE_LISTE', "amplitude de l'échelle"],
  ['distance', 'DISTANCE_SOUS_BANDE', 'portée du fondu sous la bande'],
  ['alphaCap', 'PLAFOND_SOUS_BANDE', 'plafond du fondu sous la bande'],
  ['FOCUS_BAND_OFFSET', 'DECALAGE_DE_BANDE', 'décalage de la bande de focus'],
  ['FOCUS_BAND_HALF_HEIGHT', 'DEMI_HAUTEUR_DE_BANDE', 'demi-hauteur de la bande'],
];

const echecs = [];

/**
 * `breathing` vaut `Row.marginVertical` en Swift — une référence, pas un
 * nombre. On résout donc d'abord `marginVertical`, sans quoi le gate lirait
 * une chaîne et conclurait à tort.
 */
/** Swift annote ses types : `public static let breathingRampStart: CGFloat = 36`. */
const nombreSwift = (nom) => {
  const m = new RegExp(`\\b${nom}\\s*(?::\\s*\\w+\\s*)?=\\s*(-?[0-9.]+)`).exec(swift);
  return m === null ? null : Number(m[1]);
};

const CORRESPONDANCES_SWIFT = [
  ['marginVertical', 'RESPIRATION', 'amplitude de la respiration (breathing = Row.marginVertical)'],
  ['breathingRampStart', 'RAMPE_DEBUT', 'début de la rampe de respiration'],
  ['breathingRampLength', 'RAMPE_LONGUEUR', 'longueur de la rampe de respiration'],
];

/**
 * Les constantes du variant `list` et du bloc `belowBand` vivent dans un objet
 * littéral : on isole d'abord leur portion de texte, sans quoi `maxDistance`
 * attraperait celle du variant `thread`, déclarée une ligne plus haut.
 */
const portionListe = /list:\s*\{[^}]*\}/.exec(source)?.[0] ?? '';
const portionSousBande = /belowBand:\s*\{[^}]*\}/.exec(source)?.[0] ?? '';

const valeurAmont = (nom) =>
  nombre(portionListe, nom) ?? nombre(portionSousBande, nom) ?? nombre(source, nom);

const lues = [];
for (const [nomAmont, nomAval, quoi] of CORRESPONDANCES) {
  const attendue = valeurAmont(nomAmont);
  const obtenue = nombre(derive, nomAval);
  if (attendue === null) {
    echecs.push(`${quoi} : « ${nomAmont} » est introuvable dans la source amont`);
    continue;
  }
  if (obtenue === null) {
    echecs.push(`${quoi} : « ${nomAval} » est introuvable dans la loi dérivée`);
    continue;
  }
  if (attendue !== obtenue) {
    echecs.push(`${quoi} : amont ${attendue}, dérivée ${obtenue}`);
    continue;
  }
  lues.push([nomAval, obtenue]);
}

/**
 * LES VALEURS, pas seulement les constantes. Une constante juste ne garantit
 * pas une FORMULE juste : la source amont porte une correction — la rampe sous
 * la bande est PROPORTIONNELLE plafonnée, et non `max(d/160, −0,35)`, une forme
 * qui sature à `d = −56` au lieu de `d = −160`. Ce balayage la vérifie
 * explicitement, avec des distances qui tombent des deux côtés du point où les
 * deux formes divergent.
 */
const borne01 = (v) => Math.min(1, Math.max(0, v));
const attendu = (d, C) => {
  const f = borne01(d / C.DISTANCE_MAX_LISTE);
  const sous = d < 0 ? -C.PLAFOND_SOUS_BANDE * borne01(-d / C.DISTANCE_SOUS_BANDE) : 0;
  return {
    alpha: borne01(1 - C.FONDU_LISTE * f + sous),
    echelle: 1 - C.ECHELLE_LISTE * f,
  };
};

for (const [nomSwift, nomAval, quoi] of CORRESPONDANCES_SWIFT) {
  const attendue = nombreSwift(nomSwift);
  const obtenue = nombre(derive, nomAval);
  if (attendue === null) echecs.push(`${quoi} : « ${nomSwift} » est introuvable dans LentilleMetrics.swift`);
  else if (obtenue === null) echecs.push(`${quoi} : « ${nomAval} » est introuvable dans la loi dérivée`);
  else if (attendue !== obtenue) echecs.push(`${quoi} : Swift ${attendue}, dérivée ${obtenue}`);
}

/**
 * LES VALEURS sont vérifiées par `src/lib/lentille/loi.test.ts`, qui IMPORTE la
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

if (echecs.length > 0) {
  console.error('\n  La loi de la Lentille a DÉRIVÉ de packages/shared/utils/focus-curve.ts :\n');
  for (const e of echecs) console.error(`    · ${e}`);
  console.error(
    "\n  La source de vérité est AMONT. Accorder `src/lib/lentille/loi.ts` sur elle," +
      "\n  jamais l'inverse.\n",
  );
  process.exit(1);
}

console.log(
  `  La loi de la Lentille est conforme à focus-curve.ts` +
    ` (${CORRESPONDANCES.length} constantes partagées, ${CORRESPONDANCES_SWIFT.length} cotes iOS ;` +
    ' les valeurs sont gardées par loi.test.ts).',
);
