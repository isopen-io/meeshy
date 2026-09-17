/**
 * LE STICKER D'UNE SCÈNE (#6901, D8) — miroir
 * `CanvasV3Migration.stickerObject` (`:1063-1087`, § 1.6/1.9 de la
 * spécification) : `emoji` en priorité, sinon un repli GÉNÉRIQUE — jamais un
 * rejet, un sticker reste VISIBLE (§ 9, Q4 : le catalogue de gabarits
 * `StickerTemplateCatalog` est un lot à part, #4741/#4819 côté iOS ; le
 * mouvement `payload.animation` n'est pas rendu, décision « propriété, pas
 * kind », `meeshy-composer-modele.md:82-124`, #4911).
 */

/** `imageFallbackEmoji` (`StorySticker.swift:97`) — le repli d'un sticker
 * `templateId`/`postMediaId` sans emoji propre. */
export const STICKER_IMAGE_FALLBACK_EMOJI = '🖼️';
/** `baseSize` par défaut (`CanvasV3Migration.swift:1085`). */
export const DEFAULT_STICKER_BASE_SIZE = 140;

const nonEmptyString = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/**
 * Le glyphe à peindre — `null` REJETTE l'objet (aucun sticker sans
 * représentation). `emoji` gagne toujours ; `templateId` ou `postMediaId`
 * (image) retombent sur le repli générique, jamais le catalogue de gabarits.
 */
export function stickerGlyph(payload: Record<string, unknown>): string | null {
  const emoji = nonEmptyString(payload.emoji);
  if (emoji !== null) return emoji;
  if (nonEmptyString(payload.templateId) !== null) return STICKER_IMAGE_FALLBACK_EMOJI;
  if (nonEmptyString(payload.postMediaId) !== null || nonEmptyString(payload.mediaId) !== null) return STICKER_IMAGE_FALLBACK_EMOJI;
  return null;
}

/** `CanvasGeometry.stickerFontSize` (`:106-112`) sans son plancher `max(8,
 * …)` — le CSS le pose (`max(8px, Ncqw)`), ce module ne rend que la
 * FRACTION. */
export function stickerWidthFraction(baseSize: number | undefined, scale: number): number {
  return ((baseSize ?? DEFAULT_STICKER_BASE_SIZE) * scale) / 1080;
}
