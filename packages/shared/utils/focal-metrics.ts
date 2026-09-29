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
  /**
   * Marge verticale qui écrête la loupe d'un message DÉPLIÉ, dont le verre
   * reste à sa taille (`fixedGlass`). Le cadre de l'élu, lui, grandit avec
   * son contenu (#8506) : cette marge ne l'écrête plus.
   */
  loupeMarginVertical: 8,
  /** Gouttière horizontale de la rangée — écrête la loupe d'un message large. */
  loupeMarginHorizontal: 16,
  /**
   * Gain de la loupe : le message élu grossit de 26 % sur son verre —
   * l'ancien 5 % agrandi de ×1,2 encore (1,05 × 1,2 ≈ 1,26, directive porteur
   * 2026-09-28, #8506).
   */
  loupeGain: 0.26,
  /** Opacité des voisins pendant qu'un message est déplié en Focal. */
  neighborOpacity: 0.62,
  /** Entrée en scène (apparition du verre, pose de la loupe). */
  enterDurationMs: 250,
  /** Sortie de scène (le verre s'efface, la loupe retombe). */
  flattenDurationMs: 450,
  /** Dépliage / repliage d'un message long (animation de hauteur). */
  expandDurationMs: 300,
  /**
   * La courbe du dépliage et du repliage (#8232) : les deux points de
   * contrôle d'une Bézier cubique `[x1, y1, x2, y2]` — départ vif, arrivée
   * douce. Le web la joue en `cubic-bezier(…)` (`focalExpandEasingCss`), iOS
   * en `CAMediaTimingFunction(controlPoints:)` : une seule courbe, deux moteurs.
   */
  expandCurve: [0.2, 0, 0, 1],
} as const;

export type FocalMetrics = typeof FOCAL_METRICS;

/** La courbe du dépliage, en fonction de temporisation CSS. */
export function focalExpandEasingCss(): string {
  return `cubic-bezier(${FOCAL_METRICS.expandCurve.join(', ')})`;
}

/**
 * L'échelle de loupe d'un message élu — ou d'un message déplié.
 *
 * - `room` : la largeur que le contenu peut occuper UNE FOIS grossi. Le cadre
 *   de l'élu (#8506) garde sa largeur — il ne dépasse jamais la colonne moins
 *   sa marge — : au-delà de sa place, la loupe se réduit, et un contenu qui
 *   remplit déjà toute la largeur ne grossit plus. Absente, la place est la
 *   gouttière de la rangée de part et d'autre (grossi par son centre).
 * - `fixedGlass` : le verre reste à sa taille (message déplié) — la loupe
 *   s'écrête alors à sa marge verticale. Sans lui, le cadre grandit avec le
 *   contenu et les voisines s'écartent : un message haut grossit du gain plein.
 *
 * Jamais d'échelle sous 1, jamais d'échelle sous Réduire le mouvement.
 * Miroir de `FocalScrollPerspective.loupeScale(isFocused:reduceMotion:size:)`.
 */
export function focalLoupeScale(input: {
  readonly isFocused: boolean;
  readonly reducedMotion: boolean;
  readonly width: number;
  readonly height: number;
  readonly room?: number;
  readonly fixedGlass?: boolean;
}): number {
  if (!input.isFocused || input.reducedMotion || input.width <= 0 || input.height <= 0) return 1;
  const room = input.room ?? input.width + 2 * FOCAL_METRICS.loupeMarginHorizontal;
  const vertical = input.fixedGlass === true ? (2 * FOCAL_METRICS.loupeMarginVertical) / input.height : Infinity;
  const gain = Math.min(FOCAL_METRICS.loupeGain, room / input.width - 1, vertical);
  return 1 + Math.max(0, gain);
}
