/**
 * La description textuelle d'un média (#11329) — le texte qu'un lecteur
 * d'écran dit à la place d'une photo, d'une vidéo ou d'un vocal.
 *
 * UNE source par texte, jamais une copie :
 * - celle que l'AUTEUR a saisie (`alt`, sa langue `altLanguage`, ses
 *   traductions `altTranslations` quand le pipeline les a posées) ;
 * - sinon, par DÉFAUT, la transcription de Whisper, dont le pipeline audio
 *   produit déjà les traductions (`AttachmentTranslations`). La recopier dans
 *   `alt` créerait une jumelle qui divergerait à la première transcription
 *   corrigée et qu'aucun pipeline ne traduirait : elle est RÉSOLUE, pas écrite.
 *
 * La langue suit le Prisme : `resolvePrismTranslation()`, rang par rang, la
 * langue d'origine concourant à son rang ; `null` sert l'original — jamais la
 * première traduction venue. Une pièce PROTÉGÉE (vue unique, floutée,
 * éphémère, chiffrée) ne transporte aucune description : l'appelant le dit par
 * `isProtected`, qu'il tient de la loi de protection de son côté.
 */
import { transcriptTranslationTexts } from '../types/attachment-audio.js';
import { buildPostTranslationRecord, resolvePrismTranslation } from './conversation-helpers.js';

export const MEDIA_DESCRIPTION_MAX_LENGTH = 1000;

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

/** La description saisie à l'envoi, nettoyée et bornée ; `null` si rien ne reste. */
export function sanitizeMediaDescription(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  if (text === '') return null;
  return text.length > MEDIA_DESCRIPTION_MAX_LENGTH ? text.slice(0, MEDIA_DESCRIPTION_MAX_LENGTH).trimEnd() : text;
}

/** Borne un texte long à un mot entier, suivi d'une ellipse. */
function bounded(text: string): string {
  if (text.length <= MEDIA_DESCRIPTION_MAX_LENGTH) return text;
  const cut = text.slice(0, MEDIA_DESCRIPTION_MAX_LENGTH - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export type MediaDescription = {
  readonly text: string;
  readonly language: string | null;
  readonly source: 'author' | 'transcription';
};

export function resolveMediaDescription(params: {
  readonly alt: string | null | undefined;
  readonly altLanguage: string | null | undefined;
  readonly altTranslations: unknown;
  readonly transcription: unknown;
  readonly translations: unknown;
  readonly preferredLanguages: readonly string[];
  readonly isProtected: boolean;
}): MediaDescription | null {
  if (params.isProtected) return null;

  const alt = sanitizeMediaDescription(params.alt);
  if (alt !== null) {
    const served = resolvePrismTranslation({
      translations: buildPostTranslationRecord(params.altTranslations),
      originalLanguage: params.altLanguage ?? null,
      preferredLanguages: params.preferredLanguages,
    });
    return served
      ? { text: bounded(served.text), language: served.language, source: 'author' }
      : { text: alt, language: params.altLanguage ?? null, source: 'author' };
  }

  const transcription = params.transcription && typeof params.transcription === 'object'
    ? params.transcription as { text?: unknown; language?: unknown }
    : null;
  if (!transcription || typeof transcription.text !== 'string' || transcription.text.trim() === '') return null;
  const language = typeof transcription.language === 'string' ? transcription.language : null;
  const served = resolvePrismTranslation({
    translations: transcriptTranslationTexts(params.translations),
    originalLanguage: language,
    preferredLanguages: params.preferredLanguages,
  });
  return served
    ? { text: bounded(served.text.trim()), language: served.language, source: 'transcription' }
    : { text: bounded(transcription.text.trim()), language, source: 'transcription' };
}
