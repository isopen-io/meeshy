import { MAX_POST_MEDIA } from '@meeshy/shared/types/attachment';

import type { ApiResult } from '@/lib/api/http';
import type { PostMediaUploadResult } from '@/lib/api/post-media-upload';
import { pendingAttachmentOf, type PendingAttachment } from '@/lib/send/attachments';

/**
 * **LES MÉDIAS D'UN COMMENTAIRE** (#9167, miroir `CommentMediaUploader` et
 * `CommentComposerStaging` iOS) — la photothèque ne propose que photos et
 * vidéos ; chaque pièce monte en TUS sous `uploadContext: comment` (un
 * `PostMedia` en attente), puis ses ids partent dans `attachmentIds` de
 * `POST /posts/:postId/comments`, borné par la passerelle à `MAX_POST_MEDIA`
 * (`CreateCommentSchema`) — la même borne ici, sans quoi le corps entier serait
 * refusé APRÈS le téléversement.
 */
export const COMMENT_MEDIA_ACCEPT = 'image/*,video/*';

export function acceptCommentFiles(list: readonly PendingAttachment[], files: readonly File[]): readonly PendingAttachment[] {
  const added = files.map((file) => pendingAttachmentOf(file)).filter((piece) => piece.kind === 'image' || piece.kind === 'video');
  return [...list, ...added].slice(0, Math.max(MAX_POST_MEDIA, list.length));
}

export type CommentMediaUpload = (file: File) => Promise<ApiResult<PostMediaUploadResult>>;

export type CommentMediaUploaded = { readonly ok: true; readonly media: readonly PostMediaUploadResult[] } | { readonly ok: false };

/** UNE pièce après l'autre : la première refusée arrête tout, rien ne part. */
export async function uploadCommentMedia(pending: readonly PendingAttachment[], upload: CommentMediaUpload): Promise<CommentMediaUploaded> {
  let media: readonly PostMediaUploadResult[] = [];
  for (const piece of pending) {
    const result = await upload(piece.file);
    if (!result.ok) return { ok: false };
    media = [...media, result.data];
  }
  return { ok: true, media };
}

/** Le téléversement de production — le client TUS chargé au premier envoi. */
export const browserCommentUpload: CommentMediaUpload = async (file) => {
  const [{ uploadPostMedia }, { postMediaUploadDeps }] = await Promise.all([import('@/lib/api/post-media-upload'), import('@/lib/api/deps')]);
  return uploadPostMedia({ ...postMediaUploadDeps, file, uploadContext: 'comment' });
};
