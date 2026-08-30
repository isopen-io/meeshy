import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import type { PostService } from '../../services/PostService';
import { PostParams } from './types';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { sendSuccess, sendUnauthorized, sendNotFound, sendBadRequest, sendInternalError } from '../../utils/response';
import { resolveFrontendBaseUrl } from '../../services/TrackingLinkService';
import { mayConsumePost } from './postConsumptionGate';

/** La tranche de `PostService` que le partage touche — rien d'autre n'est prêté. */
type ShareService = Pick<PostService, 'sharePost' | 'shareWithTrackingLink'>;

/**
 * Le corps du partage, borné.
 *
 * Il vit ICI plutôt que dans `types.ts` parce qu'il n'a qu'un consommateur, et
 * que le laisser à côté de sa route est ce qui garantit qu'on le relise en
 * touchant celle-ci. Ce qu'il remplace : `const body = (request.body as any) ??
 * {}` puis `body.platform` — une chaîne de longueur libre, de forme libre,
 * recopiée telle quelle dans `TrackingLink.source`, c'est-à-dire persistée et
 * ressortie dans l'analytique des liens.
 *
 * `generateLink` est un vrai booléen, non plus un `Boolean(...)` qui acceptait
 * `"false"`, `1` ou un objet. Les deux clients envoient littéralement `true`
 * (web : `if (options.generateLink) body.generateLink = true` ;
 * iOS : `if generateLink { body["generateLink"] = true }`), donc rien de vivant
 * ne dépendait de la coercition — seul un appel malformé la traversait, et il
 * doit désormais se voir.
 */
const SharePostSchema = z.object({
  platform: z.string().trim().max(64).optional(),
  generateLink: z.boolean().optional(),
});

/**
 * Le partage — extrait d'`interactions.ts` (issue #4146).
 *
 * POST /posts/:postId/share — Track a share, optionally mint a tracking link
 *
 * Body (all optional):
 *   - platform: marketing tag forwarded to PostService.sharePost
 *   - generateLink: when true, mint a TrackingLink owned by the caller so
 *     they can paste an attributable `meeshy.me/l/<token>` URL into any
 *     external share sheet. The link points at the post detail route on the
 *     web frontend (`FRONTEND_URL`/feeds/post/<postId>`); subsequent
 *     redirects are counted into the existing `trackingLinkClick` analytics.
 *     The same `/feeds/post/<postId>` path is also claimed by the iOS app via
 *     Universal Links, so the recipient lands directly inside the native
 *     PostDetailView when the app is installed.
 *
 * Response always carries `{ shared, shareCount }`; if `generateLink` was
 * requested the same payload also exposes `shortUrl` (absolute, ready for
 * sharing) and `token` (6-char id) so the client can deep-link / display
 * analytics later.
 */
export function registerShareRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any,
  postService: ShareService,
) {
  fastify.post('/posts/:postId/share', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const parsed = SharePostSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid request', { code: 'VALIDATION_ERROR' });
      }
      // Une étiquette vide ne vaut pas une étiquette : elle est traitée comme
      // absente plutôt que persistée en `source: ''`.
      const platform = parsed.data.platform !== undefined && parsed.data.platform.length > 0
        ? parsed.data.platform
        : undefined;
      const generateLink = parsed.data.generateLink === true;
      const baseUrl = resolveFrontendBaseUrl();

      // Ce que la garde ferme (#4146) : `sharePost` et `shareWithTrackingLink`
      // ne filtraient que `deletedAt`. Un compte connaissant un id frappait
      // donc un `TrackingLink` — ATTRIBUABLE (il porte `createdBy`) et
      // PERSISTANT — pointant sur le détail d'un post qu'il n'a pas le droit
      // de lire, incrémentait le `shareCount` que son auteur consulte, et
      // repartait avec une URL `meeshy.me/l/<token>` diffusable. Le lien ne
      // contourne pas l'ACL de son destinataire, mais il n'aurait jamais dû
      // être frappé : l'audience se vérifie AVANT la frappe, pas au clic.
      if (!(await mayConsumePost(prisma, postId, authContext.registeredUser.id))) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      const payload: {
        shared: boolean;
        shareCount: number;
        shortUrl?: string;
        token?: string;
      } = { shared: true, shareCount: 0 };

      if (generateLink) {
        // Tracked share: upsert one link per (post, sharer). Reusing an existing
        // link does NOT re-increment shareCount — the counter tracks unique
        // sharers, not repeated taps of the share button.
        const result = await postService.shareWithTrackingLink(
          postId,
          authContext.registeredUser.id,
          { baseUrl, platform },
        );
        if (!result) {
          return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
        }
        payload.shareCount = result.shareCount;
        payload.token = result.token;
        payload.shortUrl = result.shortUrl;
      } else {
        // Plain share (no tracked link) — increment the counter as before.
        const post = await postService.sharePost(postId, authContext.registeredUser.id, platform);
        if (!post) {
          return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
        }
        payload.shareCount = post.shareCount;
      }

      return sendSuccess(reply, payload);
    } catch (error) {
      enhancedLogger.error('[POST /posts/:postId/share]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // #4190 — `GET /posts/:postId/share` a été RETIRÉE : aucun appelant sur les
  // trois clients (le web n'émet que le POST, `posts.service.ts` → `sharePost`).
  // Le couple homonyme reste vivant en POST juste au-dessus — c'est pourquoi ce
  // retrait ne pouvait pas se décider depuis le CHEMIN, seulement depuis le
  // couple méthode+chemin. `postService.getPostShareLink` n'a plus de site
  // d'appel HTTP ; l'analytique d'un lien suivi se lit sur `/tracking-links`.
}
