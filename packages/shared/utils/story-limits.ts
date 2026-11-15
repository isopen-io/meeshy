/**
 * **Les plafonds d'une story / d'une scène — la source TypeScript** (décision
 * porteur 2026-10-28, #13590), lue par le composeur web.
 *
 * Plafonds LARGES : assez hauts pour ne refuser aucun contenu réaliste, assez
 * bas pour qu'une scène reste un document borné. Les mêmes nombres vivent
 * encore dans trois miroirs, et toute évolution les touche tous :
 * - iOS : `StoryComposerLimits` (`packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StoryComposerLimits.swift`) ;
 * - Android : `StoryLimits` (`apps/android/core/model/.../composer/StoryLimits.kt`) ;
 * - passerelle : `services/gateway/src/routes/posts/storyLimits.ts`, qui ne
 *   l'importe pas encore.
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

/**
 * Les caractères AFFICHÉS de `text` (graphèmes) : un emoji composé, un drapeau
 * ou une lettre accentuée valent un — la mesure d'iOS (`String.count`) et de la
 * passerelle. Sans `Intl.Segmenter`, repli sur les points de code (plus strict,
 * donc jamais refusé par la passerelle).
 */
function graphemes(text: string): readonly string[] {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return Array.from(text);
  return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (part) => part.segment);
}

/** Le nombre de caractères affichés de `text`, tel que le plafond le compte. */
export function storyTextLength(text: string): number {
  return graphemes(text).length;
}

/** `text` coupé à `maxTextCharacters` caractères affichés — jamais au milieu d'un emoji ou d'un drapeau. */
export function clampStoryText(text: string): string {
  if (text.length <= STORY_LIMITS.maxTextCharacters) return text;
  const parts = graphemes(text);
  return parts.length > STORY_LIMITS.maxTextCharacters ? parts.slice(0, STORY_LIMITS.maxTextCharacters).join('') : text;
}

/** Ce qu'il reste des deux heures quand les AUTRES scènes totalisent `othersSeconds` — jamais négatif. */
export function remainingStoryDuration(othersSeconds: number): number {
  const others = Number.isFinite(othersSeconds) ? Math.max(0, othersSeconds) : 0;
  return Math.max(0, STORY_LIMITS.maxStoryDurationSeconds - others);
}
