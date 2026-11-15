/**
 * L'ONDE DE LA BARRE D'ENREGISTREMENT (défaut 8, revue #5668) — miroir EXACT
 * de `UniversalComposerBar+Recording.swift:305-340` : `barCount` dépend de la
 * LARGEUR disponible du conteneur, jamais du nombre d'échantillons
 * (`MAX_LEVELS = 15`, `use-recorder.ts` — c'est l'ÉCHANTILLONNAGE, jamais
 * l'AFFICHAGE qui grossit), et `interpolatedLevel` interpole LINÉAIREMENT
 * les niveaux échantillonnés sur la totalité des barres — l'onde se lit
 * comme une courbe continue, jamais un motif répété ni un tas de barres
 * collées à gauche. Gauche = plus ancien, droite = plus récent.
 *
 * Mesuré avant ce fichier (revue #5668, script scratchpad/mesure-onde.mjs) :
 * sur 178 px disponibles, les 15 échantillons bruts, alignés `flex-start`
 * sans interpolation, n'occupaient que 73 px (41 %) — 105 px de vide entre
 * l'onde et le minuteur, visible sur les trois plateformes.
 */
export const WAVEFORM_BAR_WIDTH_PX = 2.5;
export const WAVEFORM_BAR_SPACING_PX = 2.5;

/** `barCount = Int(availableWidth / (barWidth + barSpacing))`, `+Recording.swift:307`. */
export function waveformBarCount(availableWidthPx: number): number {
  return Math.max(1, Math.floor(availableWidthPx / (WAVEFORM_BAR_WIDTH_PX + WAVEFORM_BAR_SPACING_PX)));
}

/**
 * Miroir EXACT de `interpolatedLevel` (`+Recording.swift:333-340`) :
 * `guard levels.count > 1, barCount > 1 else { return levels.first ?? 0 }`,
 * puis une interpolation linéaire entre les deux échantillons encadrants.
 * `levels` VIDE ⇒ 0 (le repli du web, qu'iOS ne rencontre jamais — le
 * `RecorderState` initial y porte toujours au moins un niveau).
 */
export function interpolatedLevel(index: number, barCount: number, levels: readonly number[]): number {
  if (levels.length === 0) return 0;
  if (levels.length <= 1 || barCount <= 1) return levels[0] ?? 0;
  const position = (index * (levels.length - 1)) / (barCount - 1);
  const lowIndex = Math.floor(position);
  const highIndex = Math.min(lowIndex + 1, levels.length - 1);
  const t = position - lowIndex;
  const low = levels[lowIndex] ?? 0;
  const high = levels[highIndex] ?? 0;
  return low * (1 - t) + high * t;
}
