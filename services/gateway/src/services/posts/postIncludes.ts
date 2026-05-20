/**
 * Canonical Prisma `select` / `include` shapes for Post-related queries.
 *
 * Single source of truth — every service that fetches Posts or PostMedia MUST
 * import these constants instead of redeclaring them. Drift between local
 * copies has caused production bugs (Prisme Linguistique fields silently
 * dropped from feed endpoints, etc.). See commit 42cae57 for the R1 fix that
 * motivated this consolidation.
 */

export const authorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
} as const;

/**
 * Canonical media select.
 *
 * Includes the Prisme Linguistique foundation fields:
 *   - language       : base language of this media
 *   - variantOf      : link to the source media when this is an auto-generated variant
 *   - transcription  : Whisper output for the base language
 *   - translations   : per-language TTS variants + sub-titles
 *
 * Adding a new field to PostMedia? Add it here ONCE.
 */
export const mediaSelect = {
  id: true,
  fileName: true,
  originalName: true,
  mimeType: true,
  fileSize: true,
  fileUrl: true,
  width: true,
  height: true,
  thumbnailUrl: true,
  thumbHash: true,
  duration: true,
  order: true,
  caption: true,
  alt: true,
  language: true,
  variantOf: true,
  transcription: true,
  translations: true,
} as const;

/**
 * Ordered media include block — the de facto way to attach media to any
 * Post query. Use as: `media: mediaInclude`.
 */
export const mediaInclude = {
  select: mediaSelect,
  orderBy: { order: 'asc' as const },
} as const;
