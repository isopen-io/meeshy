import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { claimableMediaWhere, describeClaimShortfall } from './mediaOwnership';

/**
 * Admission puis réclamation des médias d'un COMMENTAIRE (#9745).
 *
 * Un commentaire ne naît que si CHAQUE média demandé est libre ET téléversé
 * par l'auteur de la requête. La création précédait la réclamation : une
 * requête sous le compte B portant les ids de A créait le commentaire, voyait
 * la réclamation ne rien matcher, journalisait — et rendait un succès, sur la
 * foi duquel le client de A supprimait ses fichiers.
 *
 * Deux temps, la même clause (`claimableMediaWhere`) :
 *   1. `assertCommentMediaClaimable` — AVANT toute écriture ;
 *   2. `claimCommentMedia` — dans la transaction de la création, où un écart
 *      (le média pris entre les deux temps) LÈVE, donc annule la création.
 *
 * Un seul code pour « inconnu », « déjà pris » et « à quelqu'un d'autre » :
 * les distinguer ferait de la route un oracle d'existence des médias d'autrui.
 */
export const COMMENT_MEDIA_NOT_AVAILABLE = 'MEDIA_NOT_AVAILABLE';

type MediaClient = Pick<PrismaClient, 'postMedia'>;

export async function assertCommentMediaClaimable(
  client: MediaClient,
  params: { readonly authorId: string; readonly mediaIds: readonly string[] },
): Promise<void> {
  if (params.mediaIds.length === 0) return;
  const claimable = await client.postMedia.findMany({
    where: { id: { in: [...params.mediaIds] }, ...claimableMediaWhere(params.authorId) },
    select: { id: true },
  });
  const claimableIds = new Set(claimable.map((media) => media.id));
  if (params.mediaIds.some((id) => !claimableIds.has(id))) {
    throw new Error(COMMENT_MEDIA_NOT_AVAILABLE);
  }
}

export async function claimCommentMedia(
  client: MediaClient,
  params: { readonly commentId: string; readonly authorId: string; readonly mediaIds: readonly string[] },
): Promise<void> {
  const claimed = await client.postMedia.updateMany({
    where: { id: { in: [...params.mediaIds] }, ...claimableMediaWhere(params.authorId) },
    data: { commentId: params.commentId },
  });
  if (describeClaimShortfall(params.mediaIds, claimed.count)) {
    throw new Error(COMMENT_MEDIA_NOT_AVAILABLE);
  }
}
