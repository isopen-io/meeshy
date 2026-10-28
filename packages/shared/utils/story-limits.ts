/**
 * **Les plafonds d'une story / d'une scène — UNE source pour les clients et la
 * passerelle** (décision porteur 2026-10-28, #13590).
 *
 * Plafonds LARGES : assez hauts pour ne refuser aucun contenu réaliste, assez
 * bas pour qu'une scène reste un document borné. Miroir iOS :
 * `StoryComposerLimits` (`packages/MeeshySDK/Sources/MeeshySDK/Models/Story/
 * StoryComposerLimits.swift`) — toute évolution touche les deux.
 */
export const STORY_LIMITS = {
  /** Caractères d'un texte (et d'une légende) posé sur une scène. */
  maxTextCharacters: 1_000,
  /** Objets posés sur UNE scène, par famille. */
  maxStickersPerScene: 50,
  maxImagesPerScene: 50,
  maxTextsPerScene: 50,
  maxAudiosPerScene: 50,
  maxVideosPerScene: 50,
  /** Durée maximale de la story ENTIÈRE, toutes scènes comprises : 2 h. */
  maxStoryDurationSeconds: 7_200,
} as const;

/** `text` coupé à `maxTextCharacters` — par point de code, jamais au milieu d'un emoji. */
export function clampStoryText(text: string): string {
  const points = Array.from(text);
  return points.length > STORY_LIMITS.maxTextCharacters ? points.slice(0, STORY_LIMITS.maxTextCharacters).join('') : text;
}

/** Ce qu'il reste des deux heures quand les AUTRES scènes totalisent `othersSeconds` — jamais négatif. */
export function remainingStoryDuration(othersSeconds: number): number {
  const others = Number.isFinite(othersSeconds) ? Math.max(0, othersSeconds) : 0;
  return Math.max(0, STORY_LIMITS.maxStoryDurationSeconds - others);
}
