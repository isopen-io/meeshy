import { resolvePrismTranslation } from '@meeshy/shared/utils/conversation-helpers';
import { transcriptTranslationTexts } from '@meeshy/shared/types/attachment-audio';
import {
  MESSAGE_SEARCH_MEDIA_KINDS,
  type MessageSearchMediaKind,
  type MessageSearchTranscript,
} from '@meeshy/shared/types/global-search';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

/**
 * #16958 — LA TRANSCRIPTION QUI RÉPOND À LA RECHERCHE.
 *
 * Une pièce se cherche par le texte de sa transcription ET de ses traductions,
 * jamais quand elle est chiffrée (le serveur ne lit pas ce qu'il ne doit pas
 * lire). Le texte servi descend le Prisme du lecteur, et l'extrait se resserre
 * autour du mot trouvé : une transcription de dix minutes ne voyage pas
 * entière pour une ligne de liste.
 */

export const SEARCH_HIT_ATTACHMENT_SELECT = {
  select: {
    id: true,
    mimeType: true,
    duration: true,
    isEncrypted: true,
    isViewOnce: true,
    isBlurred: true,
    effectFlags: true,
    transcription: true,
    translations: true,
  },
} as const;

export type SearchHitAttachment = {
  readonly id: string;
  readonly mimeType: string | null;
  readonly duration: number | null;
  readonly isEncrypted: boolean | null;
  readonly isViewOnce: boolean | null;
  readonly isBlurred: boolean | null;
  readonly effectFlags: number | null;
  readonly transcription: unknown;
  readonly translations: unknown;
};

const EXCERPT_RADIUS = 120;

type Transcription = { readonly text: string; readonly language: string | null; readonly type: unknown; readonly durationMs: unknown };

const transcriptionOf = (piece: SearchHitAttachment): Transcription | null => {
  if (piece.isEncrypted === true) return null;
  const raw = piece.transcription as { text?: unknown; language?: unknown; type?: unknown; durationMs?: unknown } | null;
  if (!raw || typeof raw !== 'object' || typeof raw.text !== 'string' || raw.text.trim() === '') return null;
  return { text: raw.text, language: typeof raw.language === 'string' ? raw.language : null, type: raw.type, durationMs: raw.durationMs };
};

const textsOf = (piece: SearchHitAttachment, transcription: Transcription): readonly string[] => [
  transcription.text,
  ...Object.values(transcriptTranslationTexts(piece.translations)),
];

export const transcriptAnswers = (piece: SearchHitAttachment, needle: string): boolean => {
  const transcription = transcriptionOf(piece);
  return transcription !== null && textsOf(piece, transcription).some((text) => text.toLowerCase().includes(needle));
};

export const answeringPiece = (pieces: readonly SearchHitAttachment[] | null | undefined, needle: string): SearchHitAttachment | null =>
  (pieces ?? []).find((piece) => transcriptAnswers(piece, needle)) ?? null;

export const pieceIsBlurred = (piece: Pick<SearchHitAttachment, 'isBlurred' | 'effectFlags'>): boolean =>
  piece.isBlurred === true || ((piece.effectFlags ?? 0) & MESSAGE_EFFECT_FLAGS.BLURRED) !== 0;

const mediaKindOf = (piece: SearchHitAttachment, transcription: Transcription): MessageSearchMediaKind => {
  const declared = MESSAGE_SEARCH_MEDIA_KINDS.find((kind) => kind === transcription.type);
  if (declared) return declared;
  const family = (piece.mimeType ?? '').split('/')[0];
  return MESSAGE_SEARCH_MEDIA_KINDS.find((kind) => kind === family) ?? 'document';
};

export const excerptAround = (text: string, needle: string): string => {
  if (text.length <= EXCERPT_RADIUS * 2) return text;
  const at = Math.max(0, text.toLowerCase().indexOf(needle));
  const start = Math.max(0, at - EXCERPT_RADIUS);
  const end = Math.min(text.length, at + needle.length + EXCERPT_RADIUS);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
};

const durationOf = (piece: SearchHitAttachment, transcription: Transcription): number | null => {
  const raw = piece.duration ?? (typeof transcription.durationMs === 'number' ? transcription.durationMs : null);
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : null;
};

export function servedTranscript(piece: SearchHitAttachment, needle: string, languages: readonly string[]): MessageSearchTranscript | null {
  const transcription = transcriptionOf(piece);
  if (!transcription) return null;
  const served = resolvePrismTranslation({
    translations: transcriptTranslationTexts(piece.translations),
    originalLanguage: transcription.language,
    preferredLanguages: languages,
  });
  return {
    attachmentId: piece.id,
    mediaKind: mediaKindOf(piece, transcription),
    text: excerptAround(served?.text ?? transcription.text, needle),
    servedLanguage: served?.language ?? null,
    durationMs: durationOf(piece, transcription),
  };
}
