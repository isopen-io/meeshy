import {
  buildTranslationRecord,
  resolvePrismTranslation,
} from '@meeshy/shared/utils/conversation-helpers';
import {
  transcriptTranslationTexts,
  transcriptTranslationTracks,
} from '@meeshy/shared/types/attachment-audio';

import type { Attachment } from './types';

/**
 * LE PRISME LINGUISTIQUE — servi par `@meeshy/shared`, jamais réécrit ici.
 *
 * Ce fichier portait une COPIE de `resolvePrismTranslation()`, écrite quand le
 * POC ne construisait pas le paquet partagé et documentée comme devant
 * disparaître. Elle a disparu : il ne reste qu'une ADAPTATION DE FORME, et
 * même celle-là est faite par `shared` (`buildTranslationRecord`, qui accepte
 * les deux dialectes de traduction du dépôt — `{language,content}` et
 * `{targetLanguage,translatedContent}`).
 *
 * CE QUE CE FICHIER AJOUTE, et pourquoi il existe encore : `served()` rend la
 * PAIRE — le texte ET la langue dans laquelle il est servi. Un appelant qui
 * peint lit `text` ; un appelant qui doit DIRE la langue (attribut `lang`,
 * pastille, `aria-label`) lit `language`. C'est la distinction que le CLAUDE.md
 * tire du cycle 122 : un résolveur qui élit la bonne traduction n'a corrigé
 * personne tant qu'on ne sait pas QUI l'affiche — et un lecteur d'écran qui
 * prononce un texte français avec une voix anglaise est ce défaut-là, rendu
 * audible.
 */
export type Served = {
  readonly text: string;
  readonly language: string;
  /** Vrai quand le texte servi n'est PAS l'original. */
  readonly translated: boolean;
};

/**
 * @param preferredLanguages le prisme du LECTEUR, ordonné — la sortie de
 *   `resolveUserLanguagesOrdered`, jamais une liste reconstruite à la main.
 * @param translations soit le tableau d'un message, soit la carte
 *   `{ langue: texte }` que la passerelle précalcule pour une ligne de liste.
 */
export function served(params: {
  readonly preferredLanguages: readonly string[];
  readonly originalLanguage: string | null | undefined;
  readonly translations: unknown;
  readonly original: string;
}): Served {
  const { preferredLanguages, originalLanguage, translations, original } = params;
  const record = Array.isArray(translations)
    ? buildTranslationRecord(translations)
    : ((translations ?? {}) as Readonly<Record<string, string>>);

  // `exactOptionalPropertyTypes` : `shared` déclare `originalLanguage?: string
  // | null`, donc passer explicitement `undefined` est refusé — on n'écrit la
  // clé que lorsqu'elle a une valeur.
  const resolved = resolvePrismTranslation({
    translations: record,
    ...(originalLanguage === undefined ? {} : { originalLanguage }),
    preferredLanguages,
  });

  // `null` ⇒ servir l'original : soit aucune traduction vers une langue du
  // lecteur, soit — et c'est le cas qu'un résolveur faux rate — le message est
  // DÉJÀ écrit dans une de ses langues, à son rang.
  if (resolved === null) return { text: original, language: originalLanguage ?? '', translated: false };
  return { text: resolved.text, language: resolved.language, translated: true };
}

/**
 * LE TEXTE D'UNE TRANSCRIPTION, QUEL QUE SOIT SON DISCRIMINANT.
 *
 * `Attachment.transcription` (`packages/shared/types/attachment.ts`) porte le
 * type V1 — l'union `AudioTranscription | VideoTranscription |
 * DocumentTranscription | ImageTranscription` de `attachment-transcription.ts`
 * — PAS le type V2 de `attachment-audio.ts` dont la spécification de ce lot
 * s'inspirait (`transcription?.text` uniforme). Les DEUX types partagent le
 * même nom `AttachmentTranscription` dans deux modules différents ; seul le
 * premier atteint le champ réel. Sur cette union, UNE seule variante
 * (`AudioTranscription`) nomme son texte `transcribedText` — les trois autres
 * (vidéo, document, image) le nomment `text`. Site UNIQUE de ce détour :
 * `servedTranscript` ci-dessous, jamais un `.text` direct sur la valeur du
 * champ.
 */
const transcriptionTextOf = (
  transcription: NonNullable<Attachment['transcription']> | undefined,
): string | undefined => {
  if (transcription === undefined) return undefined;
  return transcription.type === 'audio' ? transcription.transcribedText : transcription.text;
};

/**
 * LA DESCENTE DU TEXTE D'UNE PIÈCE JOINTE (#5805, cycle 128 du CLAUDE.md) —
 * une projection de `served()` sur les jumelles de dépouillement de
 * `attachment-audio.ts` (site UNIQUE : `transcriptTranslationTexts`).
 *
 * `Message.translations` traduit `Message.content` ; une pièce jointe a SA
 * PROPRE transcription et SES PROPRES traductions (colonne `translations` de
 * l'attachment), un décalage documenté au CLAUDE.md comme la raison pour
 * laquelle la bannière d'un vocal est restée hors du Prisme jusqu'au cycle
 * 123. `servedTranscript` DIT la langue — c'est elle qui alimente `lang=`, le
 * texte affiché sous l'onde, et le rang que `resolveAudioTrack` reçoit
 * ci-dessous, jamais qu'il ne redescend.
 *
 * `original` retombe sur `alt` puis `originalName` : une pièce SANS
 * transcription (un fichier, une image sans description) n'a rien à
 * traduire, mais garde un texte de repli non vide pour l'accessibilité — sauf
 * si l'appelant n'a lui-même rien à offrir (ni alt, ni nom), auquel cas le
 * texte est vide plutôt qu'inventé.
 */
export function servedTranscript(params: {
  readonly preferredLanguages: readonly string[];
  readonly attachment: Pick<Attachment, 'transcription' | 'translations' | 'alt' | 'originalName'>;
  readonly fallbackLanguage: string;
}): Served {
  const { preferredLanguages, attachment, fallbackLanguage } = params;
  const original = transcriptionTextOf(attachment.transcription) ?? attachment.alt ?? attachment.originalName ?? '';
  const originalLanguage = attachment.transcription?.language ?? fallbackLanguage;
  return served({
    preferredLanguages,
    originalLanguage,
    translations: transcriptTranslationTexts(attachment.translations),
    original,
  });
}

/** Une piste audio SERVIE — la paire fichier/langue, plus les métadonnées que la piste élue porte. */
export type ServedTrack = {
  readonly url: string;
  readonly language: string;
  /** Vrai quand la piste servie n'est PAS l'originale. */
  readonly translated: boolean;
  readonly mimeType?: string;
  readonly durationMs?: number;
};

/**
 * L'ÉLECTION DE LA PISTE (#5805, cycle 128) — REÇOIT la langue du texte déjà
 * servi (`servedTranscript` ci-dessus, ou `displayLanguage`), ne la
 * redescend JAMAIS : deux descentes indépendantes serviraient une
 * transcription française au-dessus d'une piste espagnole, un défaut PIRE
 * qu'une traduction absente (CLAUDE.md § Prisme, cycle 128 ; `tasks/lessons.md`
 * § 284). Miroir de `AudioTrackLanguageResolver.url(for:)`
 * (`:86-95`) : la langue servie SANS piste retombe sur l'original, exactement
 * comme la langue servie ÉGALE à l'originale.
 */
export function resolveAudioTrack(params: {
  readonly servedLanguage: string;
  readonly originalLanguage: string;
  readonly originalUrl: string;
  readonly translations: unknown;
}): ServedTrack {
  const { servedLanguage, originalLanguage, originalUrl, translations } = params;
  const original: ServedTrack = { url: originalUrl, language: originalLanguage, translated: false };
  if (servedLanguage === originalLanguage) return original;

  const track = transcriptTranslationTracks(translations)[servedLanguage];
  if (track === undefined) return original;

  return {
    url: track.url,
    language: servedLanguage,
    translated: true,
    ...(track.mimeType !== undefined ? { mimeType: track.mimeType } : {}),
    ...(track.durationMs !== undefined ? { durationMs: track.durationMs } : {}),
  };
}
