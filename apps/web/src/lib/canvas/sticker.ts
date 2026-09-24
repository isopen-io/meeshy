/**
 * LE STICKER D'UNE SCÈNE (#6901, D8) — miroir
 * `CanvasV3Migration.stickerObject` (`:1063-1087`, § 1.6/1.9 de la
 * spécification) : `emoji` en priorité, sinon un repli GÉNÉRIQUE dès qu'une
 * source est DÉSIGNÉE (`templateId`, `postMediaId`/`mediaId`) — un sticker qui
 * en désigne une reste VISIBLE, même sans catalogue ; un sticker qui n'en
 * désigne AUCUNE est rejeté, comme `CanvasV3Migration.stickerObject`
 * (§ 9, Q4 : le catalogue de gabarits
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

/**
 * `CanvasGeometry.stickerFontSize` (`:106-112`) — le plancher `max(8, …)` est
 * posé par le CSS de la couche (`max(${STICKER_MIN_PX}px, Ncqw)`,
 * `scene-object-sticker.tsx`) : ce module ne rend que la FRACTION. Les DEUX
 * entrées sont bornées à zéro comme côté iOS (`max(0, baseSize) × max(0,
 * scale)`) — `parseTransform` ne valide aucun signe, et une fraction négative
 * rendait une déclaration `font-size` que le navigateur JETTE, donc un
 * sticker à la taille du document (revue-correction #6901, T-D10b).
 */
export function stickerWidthFraction(baseSize: number | undefined, scale: number): number {
  const size = Math.max(0, baseSize ?? DEFAULT_STICKER_BASE_SIZE);
  return (size * Math.max(0, scale)) / 1080;
}

/** `CanvasGeometry.stickerFontSize` plancher (`CanvasGeometry.swift:111`) —
 * « sous cette taille le glyphe n'est plus qu'un artefact d'anticrénelage ».
 * En PIXELS, pas en fraction : c'est un plancher de LISIBILITÉ, indépendant de
 * l'espace design. Il était ANNONCÉ par le doc-comment ci-dessus et posé par
 * personne (revue-correction #6901, T-D10c). */
export const STICKER_MIN_PX = 8;
