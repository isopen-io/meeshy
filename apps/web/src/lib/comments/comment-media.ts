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
 * vidéo, ni son, et le surplus au-delà de la borne du serveur. Ce qui est
 * juste entre ; le premier écart est rendu avec sa cause. Une pièce REPRISE
 * n'entre pas deux fois et ne s'annonce pas : sa vignette est déjà là.
 */
export type CommentFilesRefusal = { readonly reason: 'unsupported'; readonly name: string } | { readonly reason: 'limit' };

export type CommentFilesAccepted = { readonly list: readonly PendingAttachment[]; readonly refusal?: CommentFilesRefusal };

export function acceptCommentFiles(list: readonly PendingAttachment[], files: readonly File[]): CommentFilesAccepted {
  const pieces = files.map((file) => pendingAttachmentOf(file));
  const unsupported = pieces.find((piece) => !COMMENT_MEDIA_KINDS.has(piece.kind));
  const known = new Set(list.map((piece) => fileSignature(piece.file)));
  const sorted = pieces
    .filter((piece) => COMMENT_MEDIA_KINDS.has(piece.kind))
    .reduce<{ readonly kept: readonly PendingAttachment[]; readonly seen: ReadonlySet<string> }>(
      (acc, piece) => {
        const signature = fileSignature(piece.file);
        if (acc.seen.has(signature)) return acc;
        return { kept: [...acc.kept, piece], seen: new Set([...acc.seen, signature]) };
      },
      { kept: [], seen: known },
    );
  const all = [...list, ...sorted.kept];
  const bounded = all.slice(0, Math.max(MAX_POST_MEDIA, list.length));
  if (unsupported !== undefined) return { list: bounded, refusal: { reason: 'unsupported', name: unsupported.name } };
  if (bounded.length < all.length) return { list: bounded, refusal: { reason: 'limit' } };
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

/**
 * UNE PIÈCE MONTÉE NE REMONTE PAS (#9743) — retenue par son `File` : quand une
 * pièce suivante échoue (réseau coupé à mi-envoi) ou que l'envoi est repris,
 * celles déjà sur le serveur sont reprises telles quelles. Bornée dans le
 * temps : un `PostMedia` jamais rattaché est balayé par la passerelle à 24 h.
 */
const UPLOADED_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const uploadedFiles = new WeakMap<File, { readonly media: PostMediaUploadResult; readonly at: number }>();

const alreadyUploaded = (file: File, now: number): PostMediaUploadResult | undefined => {
  const held = uploadedFiles.get(file);
  return held !== undefined && now - held.at < UPLOADED_MAX_AGE_MS ? held.media : undefined;
};

/** UNE pièce après l'autre : la première refusée arrête tout, rien ne part.
 * `report` reçoit la montée de CHAQUE pièce, par son `localId` (#9736). */
export async function uploadCommentMedia(
  pending: readonly PendingAttachment[],
  upload: CommentMediaUpload,
  report?: (localId: string, fraction: number) => void,
  now: () => number = Date.now,
): Promise<CommentMediaUploaded> {
  let media: readonly PostMediaUploadResult[] = [];
  for (const piece of pending) {
    const held = alreadyUploaded(piece.file, now());
    const result = held !== undefined ? { ok: true as const, data: held } : await upload(piece.file, report === undefined ? undefined : (fraction) => report(piece.localId, fraction));
    if (!result.ok) return { ok: false };
    if (held === undefined) uploadedFiles.set(piece.file, { media: result.data, at: now() });
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
