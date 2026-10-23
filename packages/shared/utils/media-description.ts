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
import { normalizeLanguageForDedup } from './language-normalize.js';
import { maskedAttachment } from './attachment-protection.js';

/** Les drapeaux de protection d'une pièce, ou du message qui la porte. */
export type SideContentProtection = {
  readonly isViewOnce?: boolean | null;
  readonly isBlurred?: boolean | null;
  readonly effectFlags?: number | null;
  readonly isEncrypted?: boolean | null;
  readonly encryptionMode?: string | null;
};

export type SideContentCarrier = SideContentProtection & {
  readonly expiresAt?: Date | string | null;
  readonly deletedAt?: Date | string | null;
};

const encrypted = (p: SideContentProtection): boolean => p.isEncrypted === true || Boolean(p.encryptionMode);

/**
 * LA loi UNIQUE de ce qui voyage À CÔTÉ d'un média (#11329, #12333) — sa
 * transcription en sous-titres, sa description et leurs traductions — pour
 * la passerelle (fil, administration, sous-titres) comme pour les clients.
 *
 * Une pièce protégée — vue unique, floutée, effet masquant, chiffrée, au
 * niveau de la PIÈCE ; vue unique, floutée, effet masquant, éphémère (échéance
 * POSÉE, pas seulement échue), supprimée, chiffrée, au niveau du MESSAGE qui la
 * porte — ne transporte rien de cela : une description dit ce que le flou
 * cache.
 */
export function mediaSideContentMayTravel(attachment: SideContentProtection, carrier: SideContentCarrier | null | undefined): boolean {
  if (maskedAttachment(attachment) || encrypted(attachment)) return false;
  if (!carrier) return true;
  return !maskedAttachment(carrier) && !encrypted(carrier) && !carrier.expiresAt && !carrier.deletedAt;
}

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
  /** Vrai quand le texte servi est une TRADUCTION, faux pour l'original. */
  readonly translated: boolean;
};

type DescriptionSource = {
  readonly source: MediaDescription['source'];
  readonly original: string;
  readonly language: string | null;
  readonly translations: Readonly<Record<string, string>>;
};

function sourcesOf(params: {
  readonly alt: string | null | undefined;
  readonly altLanguage: string | null | undefined;
  readonly altTranslations: unknown;
  readonly transcription: unknown;
  readonly translations: unknown;
}): readonly DescriptionSource[] {
  const alt = sanitizeMediaDescription(params.alt);
  const transcription = params.transcription && typeof params.transcription === 'object'
    ? params.transcription as { text?: unknown; transcribedText?: unknown; language?: unknown }
    : null;
  // `text` ou `transcribedText` : la passerelle et les clients lisent les deux
  // formes qu'écrivent les producteurs (`apps/web/src/lib/api/prism.ts`).
  const rawText = transcription ? (typeof transcription.text === 'string' ? transcription.text : transcription.transcribedText) : null;
  const transcriptText = typeof rawText === 'string' && rawText.trim() !== '' ? rawText.trim() : null;
  return [
    ...(alt !== null ? [{ source: 'author' as const, original: alt, language: params.altLanguage ?? null, translations: buildPostTranslationRecord(params.altTranslations) }] : []),
    ...(transcriptText !== null ? [{
      source: 'transcription' as const,
      original: transcriptText,
      language: typeof transcription?.language === 'string' ? transcription.language : null,
      translations: transcriptTranslationTexts(params.translations),
    }] : []),
  ];
}

/**
 * La description servie : le PREMIER RANG du prisme du lecteur que l'une des
 * deux sources sert — la description de l'auteur d'abord, puis la
 * transcription, À CHAQUE RANG (une langue est servie par une traduction, ou
 * parce que la source est déjà écrite dedans). Aucun rang servi : l'original
 * de l'auteur, sinon celui de la transcription. Jamais la première traduction
 * venue (Prisme, règles 1 et 3).
 */
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
  const sources = sourcesOf(params);
  const [first] = sources;
  if (first === undefined) return null;

  const ranks = params.preferredLanguages.filter((lang) => typeof lang === 'string' && lang.trim() !== '');
  for (const rank of ranks) {
    const wanted = normalizeLanguageForDedup(rank);
    for (const source of sources) {
      if (source.language && normalizeLanguageForDedup(source.language) === wanted) {
        return { text: bounded(source.original), language: source.language, source: source.source, translated: false };
      }
      const served = resolvePrismTranslation({ translations: source.translations, originalLanguage: source.language, preferredLanguages: [rank] });
      if (served) return { text: bounded(served.text.trim()), language: served.language, source: source.source, translated: true };
    }
  }
  return { text: bounded(first.original), language: first.language, source: first.source, translated: false };
}
