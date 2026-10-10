import type { MessageSticker } from '@meeshy/shared/types/message-sticker';

import type { PostComment } from '@/lib/api/publication-comments';

import { stickerOf } from './message-body';

/**
 * **LE STICKER D'UN COMMENTAIRE** (#9080) — la MÊME forme que celui d'un
 * message, donc la MÊME loi de lecture (`stickerOf`) : le descripteur hissé à
 * la racine (`sticker`, REST et socket), `metadata.sticker` en repli (l'aperçu
 * embarqué d'une publication), et l'image rendue dans le PREMIER média joint
 * — comme `bodyKindOf` prend `attachments[0]` pour un message.
 */
export type CommentSticker = {
  readonly sticker: MessageSticker;
  readonly picture: { readonly fileUrl: string } | undefined;
};

const recordOf = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

export function commentStickerOf(comment: Pick<PostComment, 'sticker' | 'metadata' | 'media'>): CommentSticker | null {
  const metadata = recordOf(comment.metadata);
  const sticker = stickerOf({ ...(metadata === undefined ? {} : { metadata }), sticker: comment.sticker });
  if (sticker === null) return null;
  const first = comment.media?.[0];
  return { sticker, picture: first === undefined ? undefined : { fileUrl: first.fileUrl } };
}
