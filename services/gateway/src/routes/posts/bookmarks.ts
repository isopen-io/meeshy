import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import type { PostService } from '../../services/PostService';
import { PostParams } from './types';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { safeBroadcast } from '../../socketio/serverEmit';
import { sendSuccess, sendUnauthorized, sendNotFound, sendInternalError } from '../../utils/response';
import { mayConsumePost } from './postConsumptionGate';

/** La tranche de `PostService` que le favori touche — rien d'autre n'est prêté. */
type BookmarkService = Pick<PostService, 'bookmarkPost' | 'unbookmarkPost'>;

/**
 * Le favori — extrait d'`interactions.ts` (issue #4146).
 *
 * POSER un favori suit l'audience du post ; le RETIRER n'en dépend pas. Ce
 * n'est pas une omission, c'est la même règle lue dans les deux sens : poser
 * touche un contenu d'autrui (l'incrément de `bookmarkCount` le confirme à son
 * auteur), retirer ne touche que la ligne `PostBookmark` de l'appelant, adressée
 * par `(postId, userId)` — personne ne peut retirer le favori d'un autre, et
 * conditionner ce retrait à une audience rendrait IRRÉVOCABLE un favori posé
 * avant que l'amitié ne se rompe. On peut toujours défaire ce qu'on a fait.
 */
export function registerBookmarkRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any,
  postService: BookmarkService,
) {
  // POST /posts/:postId/bookmark
  fastify.post('/posts/:postId/bookmark', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;

      // IDOR fermé (#4146). `bookmarkPost` ne filtrait que `deletedAt` : tout
      // compte connaissant un id mettait en favori une story `FRIENDS` ou un
      // post `ONLY` dont il est exclu — et l'incrément de `bookmarkCount`
      // ANNONÇAIT ce favori à l'auteur, qui apprenait ainsi qu'un tiers avait
      // atteint son contenu restreint. Refus indistinct des trois cas
      // (absent / supprimé / hors audience), sans quoi la route dirait
      // l'existence des posts qu'elle est censée protéger.
      if (!(await mayConsumePost(prisma, postId, authContext.registeredUser.id))) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      const result = await postService.bookmarkPost(postId, authContext.registeredUser.id);
      // Le `null` du service n'est plus ignoré. La route répondait
      // `{ bookmarked: true }` quand le post avait disparu entre la garde et
      // l'écriture : elle AFFIRMAIT un effet qui n'avait pas eu lieu, et le
      // client rangeait durablement dans ses favoris un post qui n'en portait
      // aucun. Rien à annoncer non plus : l'événement partait avec un
      // `bookmarkCount` de 0 fabriqué par le `?? 0`.
      if (!result) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      // Sync temps réel (perso) : le feed et le reel viewer réhydratent
      // `isBookmarkedByMe` + le `bookmarkCount` absolu → le favori et son
      // compteur survivent à la fermeture/réouverture, sans reload.
      // Le favori est ÉCRIT : plus rien de ce qui suit n'a le droit de faire
      // échouer la requête. Sans cette porte, une panne d'émission rendait 500
      // sur une opération réussie, et le client effaçait de l'écran un favori
      // bien présent en base.
      // `?? 0` conservé tel quel : le contrat de réponse ne bouge pas d'un
      // octet dans le cas nominal (critère 4 de l'issue). Il ne couvre plus le
      // post disparu — la porte au-dessus s'en charge —, seulement un compteur
      // absent sur un favori pourtant écrit.
      safeBroadcast('post:bookmarked', () => {
        fastify.socialEvents?.broadcastPostBookmarked(
          { postId, bookmarked: true, bookmarkCount: result.bookmarkCount ?? 0 },
          authContext.registeredUser.id,
        );
      });
      return sendSuccess(reply, { bookmarked: true, bookmarkCount: result.bookmarkCount ?? 0 });
    } catch (error) {
      enhancedLogger.error('[POST /posts/:postId/bookmark]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /posts/:postId/bookmark — sans garde d'audience, voir l'en-tête.
  fastify.delete('/posts/:postId/bookmark', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const result = await postService.unbookmarkPost(postId, authContext.registeredUser.id);
      safeBroadcast('post:unbookmarked', () => {
        fastify.socialEvents?.broadcastPostBookmarked(
          { postId, bookmarked: false, bookmarkCount: result?.bookmarkCount ?? 0 },
          authContext.registeredUser.id,
        );
      });
      return sendSuccess(reply, { bookmarked: false, bookmarkCount: result?.bookmarkCount ?? 0 });
    } catch (error) {
      enhancedLogger.error('[DELETE /posts/:postId/bookmark]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });
}
