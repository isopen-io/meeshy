/**
 * LA PERSPECTIVE DU FIL (Focal) — DÉRIVÉE de
 * `packages/shared/utils/focus-curve.ts` (variant `thread`), même dispositif
 * que `src/lib/lens/law.ts` pour la Lentille : une comparaison texte-à-texte
 * via `scripts/check-curve.mjs`, jamais un import de `@meeshy/shared`
 * (`@prisma/client` + `zod` entreraient dans une application de 25 Ko pour
 * quarante lignes d'arithmétique — le raisonnement complet vit dans
 * `lens/law.ts`).
 *
 * PORTÉE DE CE LOT (#5566, correction de revue, défauts 1 et 5 : « Focal » et
 * « Script » rendaient des pixels STRICTEMENT identiques, PNG contre PNG).
 * Seule la COURBE continue (échelle + fondu selon la distance à la bande de
 * focus) est portée ici — l'ÉLECTION d'une rangée « en focus » avec sa carte
 * et ses chips dédiés (`FocalScrollPerspective.swift`, 330 lignes côté iOS,
 * overlays d'identité et de bande) reste hors périmètre : c'est une seconde
 * issue, compagnon de celle-ci. Ce lot répare le défaut MESURÉ — les deux
 * modes ne rendaient plus le même écran une fois le fil défilé — sans
 * reproduire l'intégralité du chrome iOS dans une passe de correction.
 *
 * `script` reste PLAT (aucun appelant de ce fichier depuis le mode `script`,
 * `scene.ts` n'est activé qu'en `focal`) : c'est la ligne même de
 * `FocalRow.swift` (« même rangée, densité uniforme, zéro perspective ») —
 * la perspective du fil vit HORS de la rangée, dans la passe de défilement,
 * exactement comme côté iOS (`MessageListViewController`, pas `FocalRow`).
 *
 * SANS APPELANT DE PRODUCTION DEPUIS #5648. La correction de revue ci-dessus
 * a elle-même été retirée d'iOS le 2026-08-24 (`apps/ios/decisions.md:328`,
 * « la courbe n'est plus appliquée ») : Focal se distingue désormais de
 * Script par l'ÉLECTION d'une rangée (carte teintée, chip d'identité,
 * tampon de date — `reading-mode/election.ts`, `reading-mode/scene.ts`,
 * `focal-focus-overlays.tsx`), pas par un fondu continu. Ce fichier et son
 * test (`perspective.test.ts`) restent en place, GELÉS, comme point de
 * rebranchement documenté — la loi est correcte, elle décrit un chrome
 * qu'iOS a lui-même retiré ; la retirer À SON TOUR sans qu'une décision
 * porteur ne le demande romprait la traçabilité de #5566.
 */

/** `focusCurve('thread', d).alpha/.scale` — mêmes constantes, même formule. */
export const THREAD_MAX_DISTANCE = 380;
export const THREAD_SCALE_DECAY = 0.4;
export const THREAD_ALPHA_DECAY = 0.82;

/** Bande de focus du fil : `bas − 150` (spec « Focal Grandeur Nature » §5). */
export const THREAD_FOCUS_BAND_OFFSET = 150;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export type ThreadPerspective = { readonly alpha: number; readonly scale: number };

/**
 * `distance` : distance verticale AU-DESSUS de la bande de focus — grande et
 * positive pour une rangée qui a défilé loin au-dessus, nulle pile dans la
 * bande. Une distance négative (rangée sous la bande) rend `{alpha:1,scale:1}`
 * — même convention que `focus-curve.ts` pour le variant `thread` (pas
 * d'amendement « sous la bande » côté fil, contrairement à la liste).
 */
export const threadPerspective = (distance: number): ThreadPerspective => {
  const f = clamp01(distance / THREAD_MAX_DISTANCE);
  return {
    alpha: 1 - THREAD_ALPHA_DECAY * f,
    scale: 1 - THREAD_SCALE_DECAY * f,
  };
};
