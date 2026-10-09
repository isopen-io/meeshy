import { MAX_POST_MEDIA } from '@meeshy/shared/types/attachment';

import type { ApiResult } from '@/lib/api/http';
import type { PostMediaUploadResult } from '@/lib/api/post-media-upload';
import { fileSignature, pendingAttachmentOf, type PendingAttachment } from '@/lib/send/attachments';

/**
 * **LES MÉDIAS D'UN COMMENTAIRE** (#9167, miroir `CommentMediaUploader` et
 * `CommentComposerStaging` iOS) — photos (GIF compris, qui s'animent tels
 * quels), vidéos et SONS (#9318 : un fichier audio, ou le vocal enregistré au
 * micro — la passerelle lance alors le pipeline audio du commentaire,
 * `routes/posts/comments.ts`) ; chaque pièce monte en TUS sous
 * `uploadContext: comment` (un
 * `PostMedia` en attente), puis ses ids partent dans `attachmentIds` de
 * `POST /posts/:postId/comments`, borné par la passerelle à `MAX_POST_MEDIA`
 * (`CreateCommentSchema`) — la même borne ici, sans quoi le corps entier serait
 * refusé APRÈS le téléversement.
 */
export const COMMENT_MEDIA_ACCEPT = 'image/*,video/*,audio/*';

const COMMENT_MEDIA_KINDS: ReadonlySet<PendingAttachment['kind']> = new Set(['image', 'video', 'audio']);

/**
 * CE QU'UN COMMENTAIRE ACCEPTE, ET CE QU'IL ÉCARTE EN LE DISANT (#9736) — la
 * forme de `acceptPendingFiles` du message : un fichier qui n'est ni photo, ni
 * vidéo, ni son, la même pièce reprise, le surplus au-delà de la borne du
 * serveur. Ce qui est juste entre ; le premier écart est rendu avec sa cause.
 */
export type CommentFilesRefusal =
  | { readonly reason: 'unsupported' | 'duplicate'; readonly name: string }
  | { readonly reason: 'limit' };

export type CommentFilesAccepted = { readonly list: readonly PendingAttachment[]; readonly refusal?: CommentFilesRefusal };

export function acceptCommentFiles(list: readonly PendingAttachment[], files: readonly File[]): CommentFilesAccepted {
  const pieces = files.map((file) => pendingAttachmentOf(file));
  const unsupported = pieces.find((piece) => !COMMENT_MEDIA_KINDS.has(piece.kind));
  const known = new Set(list.map((piece) => fileSignature(piece.file)));
  const sorted = pieces
    .filter((piece) => COMMENT_MEDIA_KINDS.has(piece.kind))
    .reduce<{ readonly kept: readonly PendingAttachment[]; readonly seen: ReadonlySet<string>; readonly duplicate?: string }>(
      (acc, piece) => {
        const signature = fileSignature(piece.file);
        if (acc.seen.has(signature)) return { ...acc, duplicate: acc.duplicate ?? piece.name };
        return { ...acc, kept: [...acc.kept, piece], seen: new Set([...acc.seen, signature]) };
      },
      { kept: [], seen: known },
    );
  const all = [...list, ...sorted.kept];
  const bounded = all.slice(0, Math.max(MAX_POST_MEDIA, list.length));
  if (unsupported !== undefined) return { list: bounded, refusal: { reason: 'unsupported', name: unsupported.name } };
  if (bounded.length < all.length) return { list: bounded, refusal: { reason: 'limit' } };
  if (sorted.duplicate !== undefined) return { list: bounded, refusal: { reason: 'duplicate', name: sorted.duplicate } };
  return { list: bounded };
}

/** LE VOCAL ENREGISTRÉ (#9318) rejoint la sélection sous la MÊME borne ; une
 * sélection déjà pleine reste telle quelle. */
export function withCommentPiece(list: readonly PendingAttachment[], piece: PendingAttachment): readonly PendingAttachment[] {
  return list.length >= MAX_POST_MEDIA ? list : [...list, piece];
}

/** `onProgress` — la part montée de CE fichier, de 0 à 1 (#9736). */
export type CommentMediaUpload = (file: File, onProgress?: (fraction: number) => void) => Promise<ApiResult<PostMediaUploadResult>>;

export type CommentMediaUploaded = { readonly ok: true; readonly media: readonly PostMediaUploadResult[] } | { readonly ok: false };

/** UNE pièce après l'autre : la première refusée arrête tout, rien ne part.
 * `report` reçoit la montée de CHAQUE pièce, par son `localId` (#9736). */
export async function uploadCommentMedia(
  pending: readonly PendingAttachment[],
  upload: CommentMediaUpload,
  report?: (localId: string, fraction: number) => void,
): Promise<CommentMediaUploaded> {
  let media: readonly PostMediaUploadResult[] = [];
  for (const piece of pending) {
    const result = await upload(piece.file, report === undefined ? undefined : (fraction) => report(piece.localId, fraction));
    if (!result.ok) return { ok: false };
    report?.(piece.localId, 1);
    media = [...media, result.data];
  }
  return { ok: true, media };
}

/** Le téléversement de production — le client TUS chargé au premier envoi. */
export const browserCommentUpload: CommentMediaUpload = async (file, onProgress) => {
  const [{ uploadPostMedia }, { postMediaUploadDeps }] = await Promise.all([import('@/lib/api/post-media-upload'), import('@/lib/api/deps')]);
  return uploadPostMedia({ ...postMediaUploadDeps, file, uploadContext: 'comment', ...(onProgress === undefined ? {} : { onProgress }) });
};
