import type { FeedMedia } from '@/lib/api/feed-pages';
import type { PostComment } from '@/lib/api/publication-comments';
import { electAudio } from '@/lib/view/media';

import { authoredBy, cardMediaOf, maskedByEffects, mediaAuthorOf, type MessageCardMediaItem, type MessageCardSubject, type MessageCardSubjectPart } from './message-card-subject';

/**
 * **UN COMMENTAIRE S'IMAGE COMME UN MESSAGE** (#8693) — même carte, même
 * atelier : le commentaire est la « réponse », celui auquel il répond est la
 * « citation ». Les mots sont ceux que le lecteur VOIT (`resolveFeedText`, le
 * Prisme des commentaires), passés par l'hôte qui les a déjà rendus.
 *
 * GARDE : un commentaire encore EN VOL n'a pas d'existence à partager, et un
 * commentaire masqué par ses effets (vue unique, flou) ne se peint pas — ni
 * comme sujet, ni comme citation, ni comme l'une de ses RÉPONSES, qu'on peut
 * joindre à la carte d'une racine (« Imager avec les réponses », #8734).
 */

/**
 * LES MÉDIAS D'UN COMMENTAIRE SUR SA CARTE (#9687) — un VOCAL part dans la
 * piste du texte SERVI : `electAudio` élit la transcription PUIS reçoit sa
 * langue pour élire la piste, d'UNE seule descente (CLAUDE.md § Prisme,
 * cycle 128). `prism: null` — la rangée montre l'original : son vocal original.
 */
export function commentCardMediaOf(
  media: readonly FeedMedia[] | null | undefined,
  prism: { readonly readerLanguages: readonly string[]; readonly fallbackLanguage: string } | null,
): readonly MessageCardMediaItem[] {
  return cardMediaOf(media).map((item) => {
    const piece = media?.find((candidate) => candidate.id === item.id);
    if (prism === null || piece === undefined || item.card.kind !== 'audio') return item;
    const { track } = electAudio({
      attachment: {
        fileUrl: piece.fileUrl,
        originalName: '',
        ...(piece.transcription == null ? {} : { transcription: piece.transcription }),
        ...(piece.translations == null ? {} : { translations: piece.translations }),
        ...(piece.alt == null ? {} : { alt: piece.alt }),
      },
      readerLanguages: prism.readerLanguages,
      fallbackLanguage: prism.fallbackLanguage,
    });
    return track.translated ? { ...item, url: track.url, card: { ...item.card, durationMs: track.durationMs ?? item.card.durationMs } } : item;
  });
}

type ServedComment = { readonly comment: PostComment; readonly servedText: string };

const paintable = (entry: ServedComment): boolean =>
  entry.comment.pending !== true && !maskedByEffects(entry.comment.effectFlags) && entry.servedText.trim() !== '';

const nonBlank = (value: string | null | undefined): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

const partOf = (comment: PostComment, text: string): MessageCardSubjectPart => ({
  author: nonBlank(comment.author.displayName) ?? nonBlank(comment.author.username) ?? 'Meeshy',
  text,
  handle: nonBlank(comment.author.username)?.replace(/^@+/, '') ?? null,
});

export function commentCardSubjectOf(params: {
  readonly comment: PostComment;
  /** Le texte SERVI du commentaire, tel que la rangée l'affiche. */
  readonly servedText: string;
  readonly parent: ServedComment | null;
  /** Les réponses à joindre sous le commentaire, dans leur ordre — rien par défaut. */
  readonly replies?: readonly ServedComment[];
  /** Le prisme du lecteur, qui élit la piste d'un vocal — `null` ou absent : la rangée montre l'original, son vocal original. */
  readonly readerLanguages?: readonly string[] | null;
}): MessageCardSubject | null {
  const { comment, parent } = params;
  if (comment.pending === true || maskedByEffects(comment.effectFlags)) return null;
  const text = params.servedText.trim();
  const readerLanguages = params.readerLanguages ?? null;
  const media = commentCardMediaOf(comment.media, readerLanguages === null ? null : { readerLanguages, fallbackLanguage: comment.originalLanguage ?? '' });
  if (text === '' && media.length === 0) return null;
  const quotedText = parent === null || maskedByEffects(parent.comment.effectFlags) ? '' : parent.servedText.trim();
  const reply = partOf(comment, text);
  return {
    quoted: parent === null || quotedText === '' ? null : partOf(parent.comment, quotedText),
    reply,
    sentAt: new Date(comment.createdAt),
    quotedAt: parent === null || quotedText === '' ? null : new Date(parent.comment.createdAt),
    media: authoredBy(media, mediaAuthorOf(reply, false)),
    followUps: (params.replies ?? []).filter(paintable).map((entry) => partOf(entry.comment, entry.servedText.trim())),
  };
}
