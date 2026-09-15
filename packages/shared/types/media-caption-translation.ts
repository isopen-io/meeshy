import { z } from 'zod';

/**
 * La carte de traductions d'une LÉGENDE de média (`PostMedia.captionTranslations`,
 * `MessageAttachment.captionTranslations` à venir — #6533).
 *
 * DISTINCTE de trois voisines qui partagent le même document ou presque, et qu'il
 * ne faut jamais confondre même à chaînes égales (directive porteur, #6280) :
 * - `Post.translations` / `PostComment.translations` — traduisent `content`, pas
 *   la légende d'un média du carrousel ;
 * - `PostMedia.translations` — DÉJÀ prise par les pistes audio/transcriptions
 *   traduites (`{lang: {type, transcription, path, url, durationMs, …}}`) ;
 *   n'y range JAMAIS une légende ;
 * - `PostMedia.language` — la langue du MÉDIA pour ses variantes TTS/sous-titres,
 *   pas la langue SOURCE de sa légende (`captionLanguage`).
 *
 * Même forme que `Post.translations` (carte langue → objet), pour que
 * `buildPostTranslationRecord()` (`conversation-helpers.ts`) la dépouille sans
 * variante nouvelle, et pour que `resolvePrismTranslation()` s'applique tel quel.
 *
 * Écrit pour être réutilisé SANS modification par `MessageAttachment.captionTranslations`
 * (#6533, sous garde vue unique / flou / chiffrement — non tranchée à ce stade) et,
 * si la décision-produit #6534 est positive, par `PostMedia.altTranslations`.
 * Convergence PAR LE TYPE, jamais par la fusion des collections — voir
 * `packages/shared/decisions.md` § 2026-09-14.
 */
export const mediaCaptionTranslationEntrySchema = z.object({
  text: z.string(),
  translationModel: z.string(),
  confidenceScore: z.number().optional(),
  /** ISO 8601 */
  createdAt: z.string(),
  /** ISO 8601 */
  updatedAt: z.string().optional(),
});

export type MediaCaptionTranslationEntry = z.infer<typeof mediaCaptionTranslationEntrySchema>;

export const mediaCaptionTranslationsSchema = z.record(z.string(), mediaCaptionTranslationEntrySchema);

export type MediaCaptionTranslations = z.infer<typeof mediaCaptionTranslationsSchema>;
