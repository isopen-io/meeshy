/**
 * LE BLOC DE VERRE DU FOCAL — cotes et tempos PARTAGÉS par le web (et donc la
 * coque Android Capacitor) et iOS (directive porteur 2026-09-26, #8147 : « le
 * rendu doit être identique pour iOS, web et Android »).
 *
 * Valeurs reprises d'iOS, qui les tenait seul jusqu'ici :
 * `FocalScrollPerspective.focusCardCornerRadius` / `.focusCardHorizontalInset`
 * / `.focusCardInnerMargin`, `FocalMetrics.FocusCard.marginVertical`,
 * `FocalMetrics.Focus.loupeGain`, `FocalMetrics.Scene.enterDuration` /
 * `.flattenDuration` et `FocalScrollPerspective.alphaFloor`.
 *
 * Le miroir lisible par iOS est `fixtures/long-message/focal-metrics.json`
 * (même clés, mêmes valeurs — `__tests__/focal-metrics.test.ts` les compare) ;
 * le Swift les recopie à l'identique et les rejoue contre ce JSON.
 *
 * Géométrie en points CSS (= points iOS), tempos en millisecondes.
 */
export const FOCAL_METRICS = {
  /** Rayon du bloc de verre qui porte le message élu ou déplié. */
  glassRadius: 18,
  /** Débord horizontal du verre au-delà du bloc de contenu, de chaque côté. */
  glassHorizontalInset: 6,
  /** Débord vertical du verre au-delà du bloc de contenu (= rembourrage vertical de la rangée). */
  glassVerticalInset: 3,
  /** Marge verticale qui écrête la loupe d'un message haut. */
  loupeMarginVertical: 8,
  /** Gouttière horizontale de la rangée — écrête la loupe d'un message large. */
  loupeMarginHorizontal: 16,
  /** Gain de la loupe : le message élu grossit de 5 % sur son verre. */
  loupeGain: 0.05,
  /** Opacité des voisins pendant qu'un message est déplié en Focal. */
  neighborOpacity: 0.62,
  /** Entrée en scène (apparition du verre, pose de la loupe). */
  enterDurationMs: 250,
  /** Sortie de scène (le verre s'efface, la loupe retombe). */
  flattenDurationMs: 450,
  /** Dépliage / repliage d'un message long (animation de hauteur). */
  expandDurationMs: 300,
} as const;

export type FocalMetrics = typeof FOCAL_METRICS;

/**
 * L'échelle de loupe d'un message élu — écrêtée pour qu'un message haut ne
 * déborde jamais de la marge verticale de son verre, ni un message large de
 * la gouttière de la rangée. Réduire le mouvement ⇒ aucune échelle.
 * Miroir de `FocalScrollPerspective.loupeScale(isFocused:reduceMotion:size:)`.
 */
export function focalLoupeScale(input: {
  readonly isFocused: boolean;
  readonly reducedMotion: boolean;
  readonly width: number;
  readonly height: number;
}): number {
  if (!input.isFocused || input.reducedMotion || input.width <= 0 || input.height <= 0) return 1;
  const gain = Math.min(
    FOCAL_METRICS.loupeGain,
    (2 * FOCAL_METRICS.loupeMarginVertical) / input.height,
    (2 * FOCAL_METRICS.loupeMarginHorizontal) / input.width,
  );
  return 1 + gain;
}
