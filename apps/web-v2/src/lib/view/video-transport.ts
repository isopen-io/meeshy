/**
 * LA LOI DU TRANSPORT VIDÉO — parité iOS (#6359).
 *
 * Squelette poussé avant toute logique : la règle du dépôt veut qu'une branche
 * réserve ses chemins par un commit visible en `fetch`, pas par une annonce.
 *
 * Ce que cette loi portera, et pourquoi elle est PURE : côté iOS les mêmes
 * décisions vivent dans `MeeshySDK/Media` (`MediaStageSeek`, `StagePresentation`)
 * et sont testées sans simulateur. Les porter ici comme fonctions sans vue rend
 * la parité vérifiable des deux côtés par les mêmes cas.
 *
 * Non implémenté à ce commit.
 */

/** Le pas d'un saut latéral, en secondes. Aligné sur `MediaStageSeek.step` (iOS). */
export const SEEK_STEP_SECONDS = 10;

/** Vitesses offertes, dans l'ordre du cycle. Miroir de `PlaybackSpeed` (iOS). */
export const PLAYBACK_SPEEDS = [1, 1.5, 2, 0.5] as const;

export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];
