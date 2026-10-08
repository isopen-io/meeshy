import { recordCommentFacts } from '../../services/game/commentGameFacts';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { visibilityVariant } from '@meeshy/shared/types/engagement-operations';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { PostCommentService } from '../../services/PostCommentService';
import { retractReactionNotifications } from '../../services/notifications/retractReactionNotifications';
import { PostTranslationService } from '../../services/posts/PostTranslationService';
import { PostAudioService } from '../../services/posts/PostAudioService';
import { EngagementService } from '../../services/engagement/EngagementService';
import { creditSource } from '../../services/posts/postEngagementCredits';
import { admitCommentHome, commentEventAudience, commentThreadOf, threadAudience } from '../../services/posts/commentHome';
import { notifyCommentAdded } from './commentAddedNotifications';
import { DailyGestureGate, DailyGestureLimitReached, mayCredit } from '../../services/engagement/DailyGestureGate';
import { refuseDailyGesture } from '../../utils/daily-gesture-refusal';
import { CreateCommentSchema, UpdateCommentSchema, FeedQuerySchema, LikeSchema, PostParams, CommentParams, UnlikeSchema, TranslatePostSchema } from './types';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { safeBroadcast } from '../../socketio/serverEmit';
import { sendSuccess, sendUnauthorized, sendBadRequest, sendNotFound, sendForbidden, sendInternalError, sendConflict, sendGone } from '../../utils/response';
import { ConflictError } from '../../errors/custom-errors';
import { resolveMentionedUsers, MentionService } from '../../services/MentionService';
import { createPostRouteRateLimitConfig } from '../../middleware/rate-limiter';
import { createSocialTranslateRateLimitConfig } from './socialRateLimit';
import { withMutationLog, withMutationVerdict, MutationResultGone } from '../../utils/withMutationLog';
import { MutationInFlight } from '../../services/MutationLogService';
import { SecuritySanitizer } from '../../utils/sanitize.js';
import { hoistLocationOnto } from '../../services/location/sharedPlace';
import { hoistStickerOnto } from '../../services/stickers/messageSticker';
import { admitQuotedPostMedia } from '../../services/posts/quotedPostMediaSnapshot';
import { serveCitedPostMedia } from '../../services/posts/citedPostMediaBackfill';
import {
  loadCommentPostAcl,
  canUserConsumeThread,
  canUserInteractWithThread,
  resolveInteractionTarget,
  resolveConsumptionTarget,
} from '../../services/posts/postVisibility';
import { sliceCodePointsOrUndefined } from '@meeshy/shared/utils/text-truncate';

/**
 * Hisse `metadata.trackingLinks` ([{ url, token }]) en top-level sur le payload
 * socket d'un commentaire — miroir exact du hoist des messages / posts. Permet
 * au destinataire de rendre le lien cliquable/tracé vers `/l/<token>` sans
 * réécrire l'URL. No-op si le commentaire ne porte aucun lien tracé.
 */
function hoistCommentTrackingLinks<T extends Record<string, unknown>>(comment: T): T {
  const metadata = comment?.metadata as Record<string, unknown> | null | undefined;
  const tl = metadata?.trackingLinks;
  if (Array.isArray(tl) && tl.length > 0) {
    return { ...comment, trackingLinks: tl } as T;
  }
  return comment;
}

/**
 * Hisse `metadata.location` et `metadata.sticker` (#9080) en top-level
 * `location` / `sticker` sur un commentaire — appliqué à la liste (GET), aux
 * réponses (GET replies), à la création (POST) et à l'édition (PATCH), donc
 * aussi aux payloads socket qui en partent. Mêmes sources UNIQUES que les
 * messages (`hoistLocationOnto`, `hoistStickerOnto`) et que l'aperçu embarqué
 * dans un post (`hoistLocationDeep`) — pas de copie locale de la logique.
 */
function hoistCommentCarriers<T extends Record<string, unknown>>(comment: T): T {
  return hoistStickerOnto(hoistLocationOnto(comment));
}

export function registerCommentRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  const commentService = new PostCommentService(prisma);
  const mentionService = new MentionService(prisma);
  const engagementService = new EngagementService(prisma);
  const gestureGate = new DailyGestureGate(prisma);

  // GET /posts/:postId/comments — Top-level comments, cursor-paginated
  fastify.get('/posts/:postId/comments', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const { postId } = request.params;
      const query = FeedQuerySchema.safeParse(request.query);
      // Une requête malformée est REFUSÉE, jamais remplacée par des défauts
      // (#4339, dette nommée par `no-silent-query-fallback-guard`). Le repli
      // silencieux rendait la première page à qui demandait `?limit=abc` ou
      // `?cursor=<expiré>` : l'appelant croyait paginer, et recevait
      // indéfiniment le même début de fil sans qu'aucune erreur ne le dise.
      if (!query.success) {
        return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
      }
      const { cursor, limit } = query.data;

      const authContext = (request as UnifiedAuthRequest).authContext;
      const currentUserId = authContext.type === 'user' && !authContext.isAnonymous ? authContext.userId : undefined;

      // Le fil hérite de l'audience du post : lire les commentaires d'un post
      // qu'on n'a pas le droit de voir, c'est en lire le contenu. Refus en 404
      // et non 403 — distinguer révélerait l'existence du post.
      //
      // Une republication simple a SON fil (#9584, `commentThreadOf`), lisible
      // si elle ET son original le sont (`resolveConsumptionTarget` vérifie les
      // deux, verdict de CONSOMMATION — amis ∪ contacts DM).
      const target = await resolveConsumptionTarget(prisma, postId, currentUserId);
      if (!target) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      const result = await commentService.getComments(commentThreadOf(target), cursor, limit, currentUserId);

      const commentContents = result.items
        .map((c: any) => c.content as string)
        .filter(Boolean);
      const mentionedUsers = commentContents.length > 0
        ? await resolveMentionedUsers(prisma, commentContents)
        : [];

      reply.header('Cache-Control', 'private, no-cache');
      // #6578 — la citation d'un média : l'ancre FIGÉE hissée en top-level, et
      // le média RELU. Une requête pour toute la page, aucune quand personne ne
      // cite.
      const servis = await serveCitedPostMedia(
        prisma,
        result.items.map((c) => hoistCommentCarriers(c as unknown as Record<string, unknown>)),
      );
      return sendSuccess(reply, servis, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
        meta: { mentionedUsers },
      });
    } catch (error) {
      enhancedLogger.error('[GET /posts/:postId/comments]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/:postId/comments/:commentId/replies — Replies to a comment
  fastify.get('/posts/:postId/comments/:commentId/replies', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: CommentParams }>, reply: FastifyReply) => {
    try {
      const { commentId } = request.params;
      const query = FeedQuerySchema.safeParse(request.query);
      // Une requête malformée est REFUSÉE, jamais remplacée par des défauts
      // (#4339, dette nommée par `no-silent-query-fallback-guard`). Le repli
      // silencieux rendait la première page à qui demandait `?limit=abc` ou
      // `?cursor=<expiré>` : l'appelant croyait paginer, et recevait
      // indéfiniment le même début de fil sans qu'aucune erreur ne le dise.
      if (!query.success) {
        return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
      }
      const { cursor, limit } = query.data;

      const authContext = (request as UnifiedAuthRequest).authContext;
      const currentUserId = authContext.type === 'user' && !authContext.isAnonymous ? authContext.userId : undefined;

      // Le post est résolu DEPUIS le commentaire : cette route n'adresse la
      // cible que par `commentId`, donc le `:postId` du chemin peut nommer
      // n'importe quel post public tout en visant le fil d'un post privé.
      const thread = await loadCommentPostAcl(prisma, commentId);
      if (!thread || !(await canUserConsumeThread(prisma, thread, currentUserId))) {
        return sendNotFound(reply, 'Comment not found', { code: 'COMMENT_NOT_FOUND' });
      }

      const result = await commentService.getReplies(commentId, cursor, limit, currentUserId);

      const replyContents = result.items
        .map((c: any) => c.content as string)
        .filter(Boolean);
      const replyMentionedUsers = replyContents.length > 0
        ? await resolveMentionedUsers(prisma, replyContents)
        : [];

      reply.header('Cache-Control', 'private, no-cache');
      const reponsesServies = await serveCitedPostMedia(
        prisma,
        result.items.map((r) => hoistCommentCarriers(r as unknown as Record<string, unknown>)),
      );
      return sendSuccess(reply, reponsesServies, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
        meta: { mentionedUsers: replyMentionedUsers },
      });
    } catch (error) {
      enhancedLogger.error('[GET comments/:commentId/replies]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/:postId/comments — Add a comment
  fastify.post('/posts/:postId/comments', {
    preValidation: [requiredAuth],
    config: { rateLimit: createPostRouteRateLimitConfig('comment') },
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const parsed = CreateCommentSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid request', { code: 'VALIDATION_ERROR' });
      }

      // Commenter est une INTERACTION : amis stricts, l'audience plus étroite
      // des deux (cf. `postVisibility.ts`). Un contact DM non-ami peut lire le
      // fil d'une story FRIENDS sans pouvoir y écrire. La garde précède
      // l'écriture — sans elle, le commentaire était persisté puis notifiait
      // l'auteur, qui découvrait un intrus dans un fil restreint.
      //
      // Sous une republication simple, le commentaire est rangé dans SON fil
      // (#9584, `admitCommentHome`) : interaction sur elle ET sur l'original,
      // commentaires ouverts des deux côtés (#3959, fail-closed, auteur
      // compris), aucun blocage avec l'un ou l'autre auteur.
      const target = await resolveInteractionTarget(prisma, postId, authContext.registeredUser.id);
      if (!target) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }
      const admission = await admitCommentHome(prisma, target, {
        commenterId: authContext.registeredUser.id,
        parentId: parsed.data.parentId,
      });
      if (admission.refusal === 'COMMENTS_DISABLED') {
        return sendForbidden(reply, 'Comments are disabled on this post', { code: 'COMMENTS_DISABLED' });
      }
      if (admission.refusal) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }
      const home = admission.home;
      const targetPostId = home.id;

      // #6578 — LA GARDE D'ÉCRITURE DE LA CITATION, avant toute écriture.
      //
      // Elle précède `withMutationLog` à dessein : un `postMediaId` étranger au
      // post commenté est une FUITE (on citerait le média d'une publication
      // qu'on ne lit pas), et refuser APRÈS avoir inséré la ligne laisserait le
      // commentaire publié. `target.id` — le post dont les médias sont À
      // L'ÉCRAN, la racine pour une republication simple, qui n'en a pas — et
      // jamais le `:postId` du chemin.
      const citation = await admitQuotedPostMedia(prisma, {
        postId: target.id,
        quotedPostMedia: parsed.data.quotedPostMedia,
      });
      if (!citation.ok) {
        return sendBadRequest(reply, citation.reason ?? 'Invalid quoted media', {
          code: 'QUOTED_MEDIA_INVALID',
        });
      }

      // Idempotent via clientMutationId — replays return the same comment.
      //
      // #9603 — et ils ne REFONT rien : ni crédit, ni diffusion, ni
      // notification, ni traduction. Le verdict vient du journal
      // (`withMutationVerdict`), jamais de la forme du résultat.
      type CommentResult = NonNullable<Awaited<ReturnType<typeof commentService.addComment>>>;
      let counted = false;
      const { result: comment, replayed } = await withMutationVerdict<CommentResult>({
        request,
        fastify,
        userId: authContext.registeredUser.id,
        kind: 'createComment',
        // `diverges` — voir `ReplayCost` : chaque exécution INSÈRE une ligne.
        // Rejouer sur un résultat disparu fabriquerait un doublon (contenu
        // supprimé qui ressuscite), d'où le 410 rendu par le catch de la route.
        replayCost: 'diverges',
        op: async () => {
          // #9584 — la limite quotidienne de commentaires, AVANT l'écriture et
          // dans l'op : un rejeu ne prend pas de place, un refus n'en consomme
          // pas, un commentaire qui n'a pas pu s'écrire rend la sienne.
          const ticket = await gestureGate.admit(authContext.registeredUser.id, 'comment', home.path);
          counted = mayCredit(ticket);
          const c = await commentService.addComment(
            targetPostId,
            authContext.registeredUser.id,
            SecuritySanitizer.sanitizeText(parsed.data.content),
            {
              parentId: parsed.data.parentId,
              effectFlags: parsed.data.effectFlags,
              originalLanguage: parsed.data.originalLanguage,
              // TOUS les médias joints (#6578) — le bandeau du composer en
              // affiche plusieurs, et il n'en envoyait qu'un.
              mediaIds: parsed.data.attachmentIds,
              mobileTranscription: parsed.data.mobileTranscription,
              location: parsed.data.location,
              sticker: parsed.data.sticker,
              quotedPostMedia: citation.snapshot,
            },
          ).catch(async (err: unknown) => {
            await gestureGate.release(ticket);
            throw err;
          });
          if (!c) {
            await gestureGate.release(ticket);
            throw new Error('POST_NOT_FOUND');
          }
          return c as CommentResult & { id: string };
        },
        // Relu au format de la CRÉATION — la ligne brute (`authorId`, sans
        // auteur ni médias) servait au rejeu un corps que le client ne décodait
        // pas comme celui du premier envoi.
        onDuplicate: async (resultId) => {
          const existing = await commentService.getCommentAsCreated(resultId);
          return existing ? (existing as unknown as CommentResult & { id: string }) : null;
        },
      }).catch((err) => {
        if (err instanceof Error && err.message === 'POST_NOT_FOUND') return { result: null, replayed: false };
        throw err;
      });

      if (!comment) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      // #6578 — la citation se sert UNE fois, pour les DEUX surfaces : la
      // réponse REST et l'écho Socket.IO. Deux appels coûteraient deux lectures
      // du même média, et surtout laisseraient les deux diverger — c'est la
      // forme exacte du défaut que `hoistCommentTrackingLinks` avait déjà
      // (hissé sur l'écho, absent de la réponse).
      const [commentCite] = await serveCitedPostMedia(prisma, [
        hoistCommentCarriers(comment as unknown as Record<string, unknown>),
      ]);

      // Rejeu : la même réponse, et rien d'autre. Tout ce qui suit a eu lieu à
      // la première exécution — le refaire créditerait deux fois (deux fois deux
      // depuis une republication), diffuserait et notifierait deux fois.
      if (replayed) {
        return sendSuccess(reply, commentCite, {
          statusCode: 201,
          meta: { mentionedUsers: parsed.data.content ? await resolveMentionedUsers(prisma, [parsed.data.content]) : [] },
        });
      }

      // Broadcast comment added via Socket.IO — porte l'id du post où le
      // commentaire est RANGÉ (`targetPostId`, la republication pour un
      // commentaire écrit sous elle) : son compteur et son fil.
      const socialEvents = fastify.socialEvents;
      const post = await fastify.prisma?.post?.findUnique({
        where: { id: targetPostId },
        select: { authorId: true, commentCount: true, type: true, createdAt: true, expiresAt: true, visibility: true, visibilityUserIds: true, isQuote: true, repostOfId: true },
      });
      if (socialEvents && post) {
        const audience = commentEventAudience(post);
        socialEvents.broadcastCommentAdded({
          postId: targetPostId,
          comment: hoistCommentTrackingLinks(commentCite) as unknown as typeof comment,
          commentCount: post.commentCount,
          // L'écho porte le cmid du créateur : l'émetteur remplace sa ligne
          // optimiste (id local = cmid) au lieu d'en insérer un doublon.
          clientMutationId: request.clientMutationId,
        }, post.authorId, audience.visibility, audience.visibilityUserIds).catch((err) => enhancedLogger.warn('[POST /posts/:postId/comments]: broadcast comment added failed', { err }));
      }

      await notifyCommentAdded({
        fastify,
        mentionService,
        commenterId: authContext.registeredUser.id,
        commentId: comment.id,
        postId: targetPostId,
        post,
        content: parsed.data.content,
        parentId: parsed.data.parentId,
        audience: threadAudience(prisma, target, home, authContext.registeredUser.id),
      });

      // Trigger async translation for comment content (fire-and-forget)
      if (parsed.data.content) {
        try {
          const translationService = PostTranslationService.shared;
          translationService.translateComment(
            comment.id,
            targetPostId,
            parsed.data.content,
            (comment as any).originalLanguage,
          ).catch((err) => enhancedLogger.warn('[POST /posts/:postId/comments]: translate comment failed', { err }));
        } catch {
          // PostTranslationService not initialized — skip silently
        }
      }

      // Pipeline audio pour un média de commentaire audio (fire-and-forget).
      // Réutilise PostAudioService : Whisper → NLLB → TTS pour les langues plateforme.
      // Le routing ZMQ passe par `postId`/`postMediaId` (= commentMedia.id) ; à
      // l'arrivée, PostAudioService désambiguïse via `PostMedia.commentId` et émet
      // `comment:media-updated`. Pas de re-transcription si mobileTranscription fournie.
      const linkedMedia = (comment as unknown as { media?: Array<{ id: string; mimeType?: string; fileUrl?: string }> }).media?.[0];
      if (
        linkedMedia
        && linkedMedia.mimeType?.startsWith('audio/')
        && !parsed.data.mobileTranscription
      ) {
        PostAudioService.shared.processPostAudio({
          postId: targetPostId,
          postMediaId: linkedMedia.id,
          fileUrl: linkedMedia.fileUrl ?? '',
          authorId: authContext.registeredUser.id,
        }).catch((err) => enhancedLogger.error('comment audio processing failed', err));
      }

      // Axes d'engagement « commentaire texte » (#5537) et « comment.audio »
      // (#5536) — mutuellement exclusifs, sur la même distinction que le
      // pipeline audio ci-dessus : un commentaire SANS pièce jointe audio
      // crédite `comment.text`, un commentaire AVEC crédite `comment.audio`.
      //
      // #9584 — un commentaire ne crédite qu'UN post, celui où il est rangé :
      // seules les réactions se dupliquent. Il est la SOURCE de son crédit :
      // le supprimer le reprend. Un geste que la limite du jour n'a pas pu
      // compter (compteur muet) passe, mais ne rapporte rien.
      //
      // #9635 — N'IMPORTE QUEL média audio du commentaire fait un commentaire
      // vocal, pas seulement le premier : le pipeline ci-dessus ne traite que le
      // premier, le geste, lui, ne dépend pas de l'ordre des pièces.
      const commentMedia = (comment as unknown as { media?: Array<{ mimeType?: string }> }).media ?? [];
      const commentAxis = commentMedia.some((media) => media.mimeType?.startsWith('audio/')) ? 'comment.audio' : 'comment.text';
      // #9667 — il vaut selon la visibilité du CONTENU COMMENTÉ, celle de la publication qui porte le fil,
      // lue ici en base (inconnue ⇒ amis, jamais public).
      if (counted) engagementService
        .recordActivity(authContext.registeredUser.id, commentAxis, {
          postId: targetPostId,
          receipt: creditSource.comment(comment.id),
          variant: visibilityVariant(post?.visibility),
        })
        .catch((err) => enhancedLogger.warn(`[POST /posts/:postId/comments]: engagement ${commentAxis} failed`, { err }));
      if (counted) recordCommentFacts({
        prisma,
        engagement: engagementService,
        commenterId: authContext.registeredUser.id,
        postId: targetPostId,
        post,
      }).catch((err) => enhancedLogger.warn('[POST /posts/:postId/comments]: comment game facts failed', { err }));

      const newCommentMentionedUsers = parsed.data.content
        ? await resolveMentionedUsers(prisma, [parsed.data.content])
        : [];

      return sendSuccess(reply, commentCite, { statusCode: 201, meta: { mentionedUsers: newCommentMentionedUsers } });
    } catch (error) {
      // Le cmid a bien été appliqué, mais son résultat n'est plus relisible
      // (contenu supprimé, expiré, ou hors de la tranche ACL du lecteur) et
      // l'op DIVERGE — la rejouer recréerait une ligne que l'auteur a fait
      // disparaître. 410 le dit exactement : le geste a eu lieu, il n'y a
      // rien à refaire.
      if (error instanceof MutationResultGone) {
        return sendGone(reply, 'Comment already applied, its result is gone', { code: 'MUTATION_RESULT_GONE' });
      }
      if (error instanceof DailyGestureLimitReached) {
        return refuseDailyGesture(reply, error);
      }
      // Une requête jumelle (même cmid) applique ce commentaire en ce moment :
      // ni resservir ni rejouer. 409, que la file durable iOS retente.
      if (error instanceof MutationInFlight) {
        return sendConflict(reply, 'Comment already in flight', { code: 'MUTATION_IN_FLIGHT' });
      }
      if (error instanceof Error && error.message === 'PARENT_NOT_FOUND') {
        return sendNotFound(reply, 'Parent comment not found', { code: 'COMMENT_NOT_FOUND' });
      }
      if (error instanceof Error && error.message === 'MEDIA_NOT_AVAILABLE') {
        return sendBadRequest(reply, 'Attached media not found or already linked', { code: 'MEDIA_NOT_AVAILABLE' });
      }
      enhancedLogger.error('[POST /posts/:postId/comments]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // PATCH /posts/:postId/comments/:commentId — Edit own comment (content
  // and/or visual effects). isEdited passe à true ; un contenu modifié purge
  // les traductions et relance le pipeline (elles décrivaient l'ANCIEN texte).
  //
  // DÉCISION D'AUDIENCE (issue #4146), tranchée et écrite plutôt que constatée.
  // Cette route et son jumeau `DELETE` en bas de fichier sont les deux seules
  // routes de commentaire SANS garde d'audience du post, et c'est VOULU. Leurs
  // six voisines en portent une (quatre via `loadCommentPostAcl`, deux via
  // `resolveConsumptionTarget` / `resolveInteractionTarget`) ; l'écart était
  // jusqu'ici visible sans être motivé, donc indistinguable d'un oubli — et un
  // écart qu'on ne sait pas expliquer finit toujours par être « corrigé ».
  //
  // La ressource visée ici n'est pas le post : c'est le COMMENTAIRE, adressé
  // par son seul `commentId` (le `:postId` du chemin n'est lu par personne),
  // et le contrôle d'auteur du service — `PostCommentService.updateComment` /
  // `deleteComment` lèvent `FORBIDDEN` hors auteur — est la garde S3 COMPLÈTE
  // de cette ressource-là.
  //
  // Y ajouter l'audience du post rendrait ses propres mots IRRÉVOCABLES par la
  // décision d'un AUTRE : l'auteur du post rompt l'amitié, bascule en `ONLY`
  // ou en `PRIVATE`, et le commentaire reste affiché sous le nom de qui l'a
  // écrit — sans qu'il puisse ni le corriger ni le retirer. Le droit de retirer
  // ce qu'on a publié ne peut pas dépendre de quelqu'un d'autre.
  //
  // Rien ne fuit pour autant, et c'est ce qui rend la décision tenable : ni
  // `PATCH` ni `DELETE` ne RENDENT le post ; la réponse ne porte que le
  // commentaire de l'appelant, et le fan-out socket reste borné par l'audience
  // du post (`broadcastCommentUpdated` / `broadcastCommentDeleted` reçoivent
  // `authorId`, `visibility`, `visibilityUserIds`). Même règle que
  // `DELETE /posts/:postId/bookmark` : on peut toujours défaire ce qu'on a
  // fait. Témoin : `comments-retraction-decision.test.ts`.
  fastify.patch('/posts/:postId/comments/:commentId', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: CommentParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { commentId } = request.params;
      const parsed = UpdateCommentSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid request', { code: 'VALIDATION_ERROR' });
      }
      const sanitizedContent = parsed.data.content !== undefined
        ? SecuritySanitizer.sanitizeText(parsed.data.content)
        : undefined;

      // Idempotent via clientMutationId — replays return the same comment.
      type UpdateResult = NonNullable<Awaited<ReturnType<typeof commentService.updateComment>>>;
      const comment = await withMutationLog<UpdateResult>({
        request,
        fastify,
        userId: authContext.registeredUser.id,
        kind: 'updateComment',
        // `converges` — voir `ReplayCost` : rejouer cette op rend le même état.
        replayCost: 'converges',
        op: async () => {
          const c = await commentService.updateComment(commentId, authContext.registeredUser.id, {
            content: sanitizedContent,
            effectFlags: parsed.data.effectFlags,
            originalLanguage: parsed.data.originalLanguage,
          });
          if (!c) throw new Error('COMMENT_NOT_FOUND');
          return c as UpdateResult & { id: string };
        },
        // Rejeu idempotent : relire au MÊME format que updateComment (author +
        // media + postId) — la ligne Prisma brute cassait le décodage client.
        onDuplicate: async (resultId) => {
          const existing = await commentService.getCommentAsUpdateResult(resultId);
          return existing ? (existing as unknown as UpdateResult & { id: string }) : null;
        },
      }).catch((err) => {
        if (err instanceof Error && err.message === 'COMMENT_NOT_FOUND') return null;
        throw err;
      });

      if (!comment) {
        return sendNotFound(reply, 'Comment not found', { code: 'COMMENT_NOT_FOUND' });
      }

      // Une ÉDITION ne touche pas la citation — elle vit dans `metadata`, que
      // `updateComment` conserve. Le média, lui, se RELIT : entre la création et
      // l'édition il a pu être recadré, relégendé ou supprimé.
      const [commentEditeCite] = await serveCitedPostMedia(prisma, [
        hoistCommentCarriers(comment as unknown as Record<string, unknown>),
      ]);

      // Broadcast comment:updated — mêmes rooms et même filtrage de visibilité
      // que comment:added ; visibilité passée BRUTE (jamais de défaut permissif).
      const socialEvents = fastify.socialEvents;
      const post = await fastify.prisma?.post?.findUnique({
        where: { id: comment.postId },
        select: { authorId: true, visibility: true, visibilityUserIds: true, isQuote: true, repostOfId: true },
      });
      if (socialEvents && post) {
        const audience = commentEventAudience(post);
        socialEvents.broadcastCommentUpdated({
          postId: comment.postId,
          comment: hoistCommentTrackingLinks(commentEditeCite) as unknown as typeof comment,
        }, post.authorId, audience.visibility, audience.visibilityUserIds).catch((err) => enhancedLogger.warn('[PATCH /posts/:postId/comments/:commentId]: broadcast comment updated failed', { err }));
      }

      // Contenu modifié → les traductions stockées ont été purgées par le
      // service ; relance du pipeline sur le NOUVEAU texte (fire-and-forget,
      // même chemin que la création).
      if (comment.contentChanged && sanitizedContent) {
        try {
          PostTranslationService.shared.translateComment(
            comment.id,
            comment.postId,
            sanitizedContent,
            (comment as { originalLanguage?: string | null }).originalLanguage ?? undefined,
          ).catch((err) => enhancedLogger.warn('[PATCH /posts/:postId/comments/:commentId]: translate comment failed', { err }));
        } catch {
          // PostTranslationService not initialized — skip silently
        }
      }

      return sendSuccess(reply, commentEditeCite);
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return sendForbidden(reply, 'Not authorized to edit this comment', { code: 'FORBIDDEN' });
      }
      if (error instanceof Error && error.message === 'EMPTY_CONTENT') {
        return sendBadRequest(reply, 'A text comment cannot be edited to blank', { code: 'EMPTY_CONTENT' });
      }
      enhancedLogger.error('[PATCH /posts/:postId/comments/:commentId]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/:postId/comments/:commentId/translate — Traduction à la
  // demande vers UNE langue (miroir de POST /posts/:postId/translate). Le
  // résultat arrive via comment:translation-updated ; hors des 5 langues
  // pré-générées, c'était le SEUL recours manquant du Prisme côté commentaires.
  //
  // #4147 critère 3 — DEUX défauts fermés dans le même geste : (a) aucun
  // plafond avant ce lot (chaque appel enfile, comme son miroir post, un job
  // ZMQ vers le translator — budget PROPRE à cette route, `config.rateLimit`
  // ne pouvant pas le fusionner avec celui du post, cf. socialRateLimit.ts) ;
  // (b) une validation À LA MAIN qui divergeait silencieusement du contrat du
  // post — `targetLanguage.length > 5` ici contre `.max(6)` côté
  // `TranslatePostSchema`, deux comportements pour un même geste : une langue
  // régionalisée à 6 caractères passait côté post et se refusait ici.
  // `TranslatePostSchema` (routes/posts/types.ts) est désormais la SEULE
  // source de validation des deux routes — la garde à la main disparaît.
  fastify.post('/posts/:postId/comments/:commentId/translate', {
    preValidation: [requiredAuth],
    config: { rateLimit: createSocialTranslateRateLimitConfig() },
  }, async (request: FastifyRequest<{ Params: CommentParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { commentId } = request.params;
      const parsed = TranslatePostSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid request', { code: 'VALIDATION_ERROR' });
      }
      const { targetLanguage, force } = parsed.data;

      // Lecture-scope : même garde que le fil (un lecteur autorisé à VOIR le
      // fil peut en demander la traduction).
      const thread = await loadCommentPostAcl(prisma, commentId);
      if (!thread || !(await canUserConsumeThread(prisma, thread, authContext.registeredUser.id))) {
        return sendNotFound(reply, 'Comment not found', { code: 'COMMENT_NOT_FOUND' });
      }

      try {
        PostTranslationService.shared.translateCommentOnDemand(commentId, targetLanguage, { force })
          .catch((err) => enhancedLogger.warn('[POST comments/:commentId/translate]: on-demand translate failed', { err }));
      } catch {
        // PostTranslationService not initialized — skip silently
      }

      return sendSuccess(reply, { requested: true, targetLanguage });
    } catch (error) {
      enhancedLogger.error('[POST comments/:commentId/translate]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/:postId/comments/:commentId/like — Like a comment
  fastify.post('/posts/:postId/comments/:commentId/like', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: CommentParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { commentId } = request.params;
      const parsed = LikeSchema.safeParse(request.body ?? {});
      const emoji = parsed.success ? parsed.data.emoji : '❤️';

      // Même verdict que le chemin socket (`CommentReactionHandler`) : réagir
      // est une interaction. Le post est résolu depuis le commentaire, jamais
      // depuis le `:postId` du chemin.
      const thread = await loadCommentPostAcl(prisma, commentId);
      if (!thread || !(await canUserInteractWithThread(prisma, thread, authContext.registeredUser.id))) {
        return sendNotFound(reply, 'Comment not found', { code: 'COMMENT_NOT_FOUND' });
      }

      const result = await commentService.likeComment(commentId, authContext.registeredUser.id, emoji);
      if (!result) {
        return sendNotFound(reply, 'Comment not found', { code: 'COMMENT_NOT_FOUND' });
      }

      // `thread.postId` et non `:postId` : la garde ci-dessus a déjà résolu le
      // post DEPUIS le commentaire, et c'est cette valeur qui fait autorité.
      // `broadcastCommentLiked` en fait une room (`ROOMS.post`) et les clients
      // une clé de cache (`patchCommentInPostCaches`) — servi depuis l'URL, que
      // l'appelant choisit librement, il diffuse dans une room où les lecteurs
      // du fil ne sont pas et écrit l'agrégation d'un commentaire dans le cache
      // d'un post étranger. Le cas se produit sans malveillance sur un repost
      // simple, dont le client affiche l'id alors que le commentaire vit sur la
      // racine. Jumeau REST de l'invariant que porte `CommentReactionHandler`.
      const commentPostId = thread.postId;

      // Broadcast comment liked via Socket.IO
      const socialEvents = fastify.socialEvents;
      if (socialEvents && result.authorId) {
        safeBroadcast('comment:liked', () => {
          socialEvents.broadcastCommentLiked({
            postId: commentPostId,
            commentId,
            userId: authContext.registeredUser.id,
            emoji,
            likeCount: result.likeCount,
          }, result.authorId);
        });
      }

      // Notify comment author — l'extrait du commentaire liké voyage en
      // subtitle pour identifier QUEL commentaire reçoit la réaction.
      const notifService = fastify.notificationService;
      if (notifService && result.authorId) {
        // Le type de l'entité portant le commentaire est le discriminant qui
        // décide de la surface ouverte au tap (lecteur de réel / viewer
        // éphémère / détail de post) — sans lui le client retombe sur une
        // heuristique de cache et peut ouvrir la mauvaise surface.
        const [likedComment, likedPost] = await Promise.all([
          fastify.prisma?.postComment?.findUnique({
            where: { id: commentId },
            select: { content: true },
          }),
          fastify.prisma?.post?.findUnique({
            where: { id: commentPostId },
            select: { type: true },
          }),
        ]);
        notifService.createCommentLikeNotification({
          actorId: authContext.registeredUser.id,
          postId: commentPostId,
          commentId,
          commentAuthorId: result.authorId,
          emoji,
          commentPreview: sliceCodePointsOrUndefined(likedComment?.content, 80),
          postType: likedPost?.type as 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL' | undefined,
        }).catch((err) => enhancedLogger.warn('[POST /posts/:postId/comments/:commentId/like]: notify comment like failed', { err }));
      }

      return sendSuccess(reply, { liked: true, likeCount: result.likeCount, reactionSummary: result.reactionSummary });
    } catch (error) {
      // Plafond des cinq réactions par personne et par objet
      // (`packages/shared/utils/reaction-limit.ts`) : `PostCommentService.likeComment`
      // lève un `ConflictError` dédié — un refus légitime, pas une panne. Sans
      // cette branche il retombait sur le `sendInternalError` du bas.
      if (error instanceof ConflictError) {
        return sendConflict(reply, error.message, { code: error.code });
      }
      enhancedLogger.error('[POST comments/:commentId/like]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /posts/:postId/comments/:commentId/like — Unlike a comment
  fastify.delete('/posts/:postId/comments/:commentId/like', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: CommentParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { commentId } = request.params;
      // `UnlikeSchema` et NON `LikeSchema` : son jumeau porte un défaut '❤️'
      // qui rendrait le repli inatteignable — « rien demandé » deviendrait
      // « retire le cœur », et une pile sans cœur ne se pèlerait jamais.
      // Emoji absent ⇒ `unlikeComment` retire la PLUS RÉCENTE, ce que la règle
      // produit appelle « la dernière posée ».
      const parsed = UnlikeSchema.safeParse(request.body ?? {});
      const emoji = parsed.success ? parsed.data.emoji : undefined;

      // Retirer une réaction reste une interaction avec le fil — même garde
      // que la pose, pour que l'ACL ne dépende pas du sens du geste.
      const thread = await loadCommentPostAcl(prisma, commentId);
      if (!thread || !(await canUserInteractWithThread(prisma, thread, authContext.registeredUser.id))) {
        return sendNotFound(reply, 'Comment not found', { code: 'COMMENT_NOT_FOUND' });
      }

      const result = await commentService.unlikeComment(commentId, authContext.registeredUser.id, emoji);
      if (!result) {
        return sendNotFound(reply, 'Comment not found', { code: 'COMMENT_NOT_FOUND' });
      }

      // Jumelle descendante de la diffusion que fait la route de pose. Elle
      // manquait : le compteur d'un commentaire ne savait que MONTER en direct,
      // et l'écart tenait jusqu'au prochain REST (côté iOS jusqu'au prochain
      // REST *et* par-delà les redémarrages, la valeur reçue y étant persistée).
      // `thread.postId` et non `:postId`, pour la même raison qu'à la pose : la
      // garde d'audience a déjà résolu le post DEPUIS le commentaire, et c'est
      // cette valeur qui adresse la room et sert de clé de cache aux clients.
      const socialEvents = fastify.socialEvents;
      if (socialEvents && result.authorId) {
        safeBroadcast('comment:unliked', () => {
          socialEvents.broadcastCommentUnliked({
            postId: thread.postId,
            commentId,
            userId: authContext.registeredUser.id,
            emoji,
            likeCount: result.likeCount,
          }, result.authorId);
        });
      }

      // Le symétrique du `createCommentLikeNotification` de la route de pose :
      // la réaction défaite emporte la notification qu'elle avait produite.
      // Fire-and-forget, comme la notification jumelle — le dé-like est déjà
      // persisté et ne doit pas dépendre du retrait.
      const notifService = fastify.notificationService;
      void retractReactionNotifications(
        prisma,
        {
          subject: { kind: 'comment', id: commentId },
          actorId: authContext.registeredUser.id,
          emoji: result.removedEmoji ?? emoji ?? '',
        },
        notifService
      ).catch((err) => enhancedLogger.warn('[DELETE /posts/:postId/comments/:commentId/like]: retract comment like notification failed', { err }));

      return sendSuccess(reply, { liked: false, likeCount: result.likeCount, reactionSummary: result.reactionSummary });
    } catch (error) {
      enhancedLogger.error('[DELETE comments/:commentId/like]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /posts/:postId/comments/:commentId — Delete a comment
  //
  // SANS garde d'audience du post, DÉLIBÉRÉMENT : retirer ses propres mots ne
  // peut pas dépendre de l'accès qu'un autre nous laisse au post qui les
  // porte. La motivation complète est écrite une fois, au-dessus du `PATCH`
  // jumeau (issue #4146) ; le contrôle d'auteur de
  // `PostCommentService.deleteComment` reste la garde de cette ressource.
  fastify.delete('/posts/:postId/comments/:commentId', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: CommentParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { commentId } = request.params;
      // Le `:postId` du chemin n'est LU par rien ici : la cible est adressée
      // par `commentId` seul, et l'annonce l'est par le post que le service
      // rend. Cf. `GET .../replies`, qui pose la même règle pour la lecture.
      //
      // Idempotent via clientMutationId. The MutationLog row records
      // the deleted comment id so replays are observably consistent
      // (broadcast side-effect fires exactly once).
      type DeleteOutcome = {
        readonly postId?: string;
        readonly deletedCommentIds?: string[];
        readonly parentId?: string | null;
      };
      const result = await withMutationLog<DeleteOutcome>({
        request,
        fastify,
        userId: authContext.registeredUser.id,
        kind: 'deleteComment',
        // `converges` — voir `ReplayCost` : rejouer cette op rend le même état.
        replayCost: 'converges',
        op: async () => {
          const res = await commentService.deleteComment(commentId, authContext.registeredUser.id);
          if (!res) throw new Error('COMMENT_NOT_FOUND');
          return { id: commentId, ...res };
        },
        // Le rejeu n'exécute pas le service : sans cette relecture, l'annonce
        // n'aurait plus d'adresse dérivée du serveur. Le soft-delete n'efface
        // pas la ligne — `deletedAt` la marque — donc `postId` reste lisible,
        // contrairement au sous-arbre que `NOT_DELETED` masque désormais.
        onDuplicate: async () => {
          const row = await fastify.prisma?.postComment?.findUnique({
            where: { id: commentId },
            select: { postId: true },
          });
          return { id: commentId, ...(row?.postId ? { postId: row.postId } : {}) };
        },
      }).catch((err) => {
        if (err instanceof Error && err.message === 'COMMENT_NOT_FOUND') return null;
        throw err;
      });
      if (!result) {
        return sendNotFound(reply, 'Comment not found', { code: 'COMMENT_NOT_FOUND' });
      }

      // Broadcast comment deleted via Socket.IO
      //
      // Le post vient du COMMENTAIRE, jamais du chemin. Il ne porte pas que
      // l'adresse : `authorId`, `visibility` et `visibilityUserIds` sont
      // l'AUDIENCE du fan-out, et `commentCount` le compteur annoncé. Les tirer
      // du `:postId` de l'URL laissait l'appelant choisir à qui sa propre
      // suppression était annoncée — et, sur un repost simple, l'annonçait à
      // une room où les lecteurs du fil ne sont pas.
      //
      // Adresse introuvable (ligne non relisable au rejeu) → aucune annonce.
      // Se taire laisse la ligne à l'écran ; l'annoncer à une audience nommée
      // par l'appelant l'y laisse AUSSI, en polluant un fil étranger.
      const socialEvents = fastify.socialEvents;
      const commentPostId = result.postId;
      if (socialEvents && commentPostId) {
        const post = await fastify.prisma?.post?.findUnique({
          where: { id: commentPostId },
          select: { authorId: true, commentCount: true, visibility: true, visibilityUserIds: true, isQuote: true, repostOfId: true },
        });
        if (post) {
          // Le fil retiré, pas la seule cible : `deleteComment` soft-delete la
          // cible ET tous ses descendants. Un client qui avait déplié les
          // réponses garderait sinon à l'écran des lignes déjà retirées, sans
          // aucun refetch pour l'en débarrasser (`getComments` filtre
          // `parentId: null`, donc `getReplies` n'est plus appelé pour un parent
          // supprimé).
          //
          // Repli sur `[commentId]` : le rejeu idempotent (`onDuplicate`) ne
          // rend que l'id et l'ADRESSE — la suppression a déjà eu lieu et son
          // sous-arbre n'est plus reconstructible par une lecture vivante,
          // `NOT_DELETED` le masquant désormais (le `postId`, lui, survit sur
          // la ligne soft-supprimée : c'est ce qui permet de l'y relire). Le
          // repli reproduit exactement le comportement d'avant ce correctif ;
          // une liste vide, elle, ferait survivre la cible elle-même.
          const deletedCommentIds = result.deletedCommentIds ?? [commentId];
          // `parentId` est OMIS — jamais mis à `null` — quand le service ne le
          // rend pas, c'est-à-dire sur le rejeu idempotent : le décrément de
          // `replyCount` a déjà eu lieu en base, et un client qui le
          // reflèterait une seconde fois ferait dériver son compteur. La clé
          // absente est donc la garde, et `null` reste réservé à son sens
          // propre : « la cible était un commentaire racine, rien à
          // décrémenter ».
          socialEvents.broadcastCommentDeleted({
            postId: commentPostId,
            commentId,
            deletedCommentIds,
            ...(result.parentId !== undefined ? { parentId: result.parentId } : {}),
            commentCount: post.commentCount,
          }, post.authorId, commentEventAudience(post).visibility, commentEventAudience(post).visibilityUserIds).catch((err) => enhancedLogger.warn('[DELETE /posts/:postId/comments/:commentId]: broadcast comment deleted failed', { err }));
        }
      }

      return sendSuccess(reply, { deleted: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return sendForbidden(reply, 'Not authorized to delete this comment', { code: 'FORBIDDEN' });
      }
      enhancedLogger.error('[DELETE comments/:commentId]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });
}
