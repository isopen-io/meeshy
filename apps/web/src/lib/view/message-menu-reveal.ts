/**
 * **GLISSER VERS LE HAUT RÉDUIT L'APERÇU POUR DÉGAGER LE MENU COUPÉ**
 * (directive porteur 2026-10-01, #9043) — miroir de
 * `MessageOverlayRevealLaw.swift`.
 *
 * Un long message élevé par l'appui long pousse la liste d'actions sous le bas
 * de l'écran. Le glissement vertical PILOTE un facteur de réduction de
 * l'aperçu (ancré en haut) : la liste remonte EXACTEMENT de ce que le doigt
 * parcourt — suivie image par image, annulable en redescendant. Un message
 * dont le menu tient déjà à l'écran n'a rien à réduire (`floor === 1`).
 *
 * Au relâchement, l'état atteint est GARDÉ, sans aimant : l'utilisateur a
 * choisi une taille pour lire le menu ; un aimant la lui reprendrait.
 */

/** L'aperçu ne descend jamais sous 40 % de sa taille de repos. */
export const REVEAL_MINIMUM_FACTOR = 0.4;

export type RevealSplit = {
  /** Le facteur de réduction rendu (1 = taille de repos). */
  readonly factor: number;
  /** Le parcours que la réduction n'a pas consommé. */
  readonly residual: number;
};

/** Le plancher : juste ce qu'il faut pour que le menu caché de `hiddenHeight`
 * remonte entièrement, jamais sous `REVEAL_MINIMUM_FACTOR`. */
export function revealFloor({ hiddenHeight, shrinkableHeight }: { readonly hiddenHeight: number; readonly shrinkableHeight: number }): number {
  if (hiddenHeight <= 0 || shrinkableHeight <= 0) return 1;
  return Math.max(REVEAL_MINIMUM_FACTOR, 1 - hiddenHeight / shrinkableHeight);
}

/** Partage un parcours vertical (négatif = vers le haut) entre la réduction,
 * partie de `committed`, et le reste. */
export function revealSplit({
  translation,
  committed,
  floor,
  shrinkableHeight,
}: {
  readonly translation: number;
  readonly committed: number;
  readonly floor: number;
  readonly shrinkableHeight: number;
}): RevealSplit {
  if (shrinkableHeight <= 0) return { factor: 1, residual: translation };
  const factor = Math.min(1, Math.max(floor, committed + translation / shrinkableHeight));
  const consumed = (factor - committed) * shrinkableHeight;
  return { factor, residual: translation - consumed };
}

/** De combien la liste remonte pour un facteur donné. */
export function revealRise({ factor, shrinkableHeight }: { readonly factor: number; readonly shrinkableHeight: number }): number {
  return (1 - factor) * shrinkableHeight;
}

/** Le facteur à l'ouverture : sans le geste (lecteur d'écran, clavier), le
 * menu doit rester atteignable — l'aperçu s'ouvre déjà réduit. */
export function revealRestingFactor({ floor, assistiveReveal }: { readonly floor: number; readonly assistiveReveal: boolean }): number {
  return assistiveReveal ? floor : 1;
}
