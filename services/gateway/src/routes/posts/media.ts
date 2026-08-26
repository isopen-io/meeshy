import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendUnauthorized, sendNotFound, sendInternalError } from '../../utils/response';
import { claimableMediaWhere } from '../../services/posts/mediaOwnership';
import { reclaimMediaRowBytes, type PostMediaByteRemover } from '../../services/posts/reclaimPostMediaBytes';
import { MediaService } from '../../services/MediaService';

export interface PostMediaParams {
  mediaId: string;
}

/**
 * DELETE /posts/media/:mediaId — supprime un `PostMedia` encore EN ATTENTE
 * (jamais rattaché à un post ni un commentaire) que le composer web a
 * téléversé puis retiré de sa sélection avant publication.
 *
 * Cette route existe parce que `AttachmentService.deleteAttachment`
 * (`routes/attachments/metadata.ts`) ne connaît que `MessageAttachment` —
 * appelée sur un id de `PostMedia`, elle rend 404 sans rien supprimer, et le
 * média retiré de l'écran restait sur le serveur pour toujours (aucun
 * balayage ne moissonne un `PostMedia` en attente, voir
 * `reclaimPostMediaBytes.ts`).
 *
 * **L'autorisation n'est pas un prédicat neuf.** Un média en attente est
 * supprimable exactement par l'identité qui pourrait le RÉCLAMER —
 * `claimableMediaWhere(userId)`, le même prédicat que `createPost` et
 * `updatePost` utilisent pour rattacher un média. Un prédicat, deux verbes
 * (réclamer / relâcher), qui ne peuvent plus diverger — et qui couvre déjà
 * les deux formes MongoDB de « libre » (`postId: null` ET `postId` absent du
 * document, `isSet: false`) : la clause qui a rendu tout média fraîchement
 * téléversé irréclamable en production le 2026-07-31.
 *
 * Un média déjà RATTACHÉ (`postId` ou `commentId` posé) n'est pas « libre » :
 * `claimableMediaWhere` l'exclut, et cette route rend 404 — il sort par
 * `PUT /posts/:postId` (`removeMediaIds`), qui porte l'autorisation du POST,
 * pas celle de l'uploadeur seul.
 */
export function registerPostMediaRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any,
  mediaService: PostMediaByteRemover = new MediaService(),
) {
  fastify.delete(
    '/posts/media/:mediaId',
    { preValidation: [requiredAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authContext = (request as UnifiedAuthRequest).authContext;
        if (!authContext?.isAuthenticated || !authContext.registeredUser) {
          return sendUnauthorized(reply, 'Authentication required');
        }

        const { mediaId } = request.params as PostMediaParams;
        const userId = authContext.registeredUser.id;

        const media = await prisma.postMedia.findFirst({
          where: { id: mediaId, ...claimableMediaWhere(userId) },
          select: { id: true, fileUrl: true, thumbnailUrl: true },
        });

        if (!media) {
          return sendNotFound(reply, 'Media not found');
        }

        // Les octets AVANT la ligne : une fois la ligne partie, plus rien ne
        // dit où ils sont (même ordre que `updatePost`/le balayage éphémère).
        await reclaimMediaRowBytes(prisma, mediaService, [media]);
        await prisma.postMedia.delete({ where: { id: media.id } });

        return sendSuccess(reply, { message: 'Media deleted' });
      } catch (error) {
        return sendInternalError(reply, 'Failed to delete media');
      }
    },
  );
}
