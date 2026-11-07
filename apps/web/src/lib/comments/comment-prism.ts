import { transcriptTranslationTexts } from '@meeshy/shared/types/attachment-audio';
import { buildPostTranslationRecord } from '@meeshy/shared/utils/conversation-helpers';

import type { FeedMedia } from '@/lib/api/feed-pages';
import { electServedAudio, prismFor, type Served, type ServedTrack } from '@/lib/api/prism';
import type { PostComment } from '@/lib/api/publication-comments';
import { resolveFeedText } from '@/lib/feed/text';
import { languageBand } from '@/lib/reading-mode/meta';

/**
 * **LE PRISME D'UN COMMENTAIRE, TEXTE ET VOCAL** (#16541) — la jumelle, pour
 * une rangée de commentaire, de ce que la bulle d'un message résout
 * (`servedRowLanguage`, `languageBand`, `electServedAudio`) : UNE descente,
 * rangée par la langue que le lecteur explore au geste (`prismFor`), d'où
 * sortent le texte servi, la langue que la rangée sert VRAIMENT (le texte, ou
 * la transcription d'un vocal sans texte), et la bande de drapeaux des autres
 * langues disponibles — l'original en tête.
 *
 * La piste d'un vocal est élue par la langue de SA transcription servie,
 * jamais par une descente parallèle (cycle 128 du `CLAUDE.md` racine).
 */
const isAudio = (media: FeedMedia): boolean => media.mimeType?.startsWith('audio/') === true && media.fileUrl !== '';

const audioPieceOf = (media: FeedMedia) => ({
  fileUrl: media.fileUrl,
  originalName: '',
  ...(media.transcription === undefined || media.transcription === null ? {} : { transcription: media.transcription }),
  ...(media.translations === undefined || media.translations === null ? {} : { translations: media.translations }),
  ...(typeof media.alt === 'string' ? { alt: media.alt } : {}),
});

/** La piste d'un vocal de commentaire, dans la langue de sa transcription servie. */
export function servedCommentAudio(params: { readonly media: FeedMedia; readonly prism: readonly string[]; readonly fallbackLanguage: string }): ServedTrack {
  return electServedAudio({ preferredLanguages: params.prism, attachment: audioPieceOf(params.media), fallbackLanguage: params.fallbackLanguage }).track;
}

/** Les langues dans lesquelles ce commentaire EXISTE traduit — son texte et ses vocaux. */
export function commentTranslatedLanguages(comment: Pick<PostComment, 'translations' | 'media'>): readonly string[] {
  const audio = (comment.media ?? []).filter(isAudio).flatMap((media) => Object.keys(transcriptTranslationTexts(media.translations ?? undefined)));
  return [...new Set([...Object.keys(buildPostTranslationRecord(comment.translations)), ...audio])];
}

export type CommentPrism = {
  /** Le prisme du lecteur, la langue explorée en tête — remis aux vocaux de la rangée. */
  readonly prism: readonly string[];
  /** Le TEXTE servi. */
  readonly text: Served;
  /** La langue d'origine de ce que la rangée montre (le texte, sinon le vocal). */
  readonly originalLanguage: string;
  /** La langue que la rangée sert VRAIMENT. */
  readonly servedLanguage: string;
  /** Les drapeaux à offrir — jamais la langue déjà servie. */
  readonly band: readonly string[];
};

export function commentPrism(params: {
  readonly comment: Pick<PostComment, 'content' | 'originalLanguage' | 'translations' | 'media'>;
  readonly readerLanguages: readonly string[];
  readonly displayLanguage: string | null;
}): CommentPrism {
  const { comment, readerLanguages, displayLanguage } = params;
  const prism = prismFor({ readerLanguages, displayLanguage: displayLanguage ?? undefined });
  const text = resolveFeedText({ preferredLanguages: prism, originalLanguage: comment.originalLanguage, translations: comment.translations, content: comment.content });
  const commentLanguage = comment.originalLanguage ?? '';
  const voice = text.text.trim() === '' ? (comment.media ?? []).find(isAudio) : undefined;
  const described =
    voice === undefined ? null : electServedAudio({ preferredLanguages: prism, attachment: audioPieceOf(voice), fallbackLanguage: commentLanguage }).described;
  const originalLanguage = voice?.transcription?.language ?? commentLanguage;
  const servedLanguage = described !== null && described.text !== '' ? described.language : text.language;
  const band = languageBand({
    originalLanguage,
    preferredLanguages: readerLanguages,
    translations: commentTranslatedLanguages(comment),
    servedLanguage,
  }).filter((code) => code !== '');
  return { prism, text, originalLanguage, servedLanguage, band };
}
