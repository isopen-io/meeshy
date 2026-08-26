import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Post } from '@meeshy/shared/types/post';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { PostService } from '../../services/PostService';
import { storyContentEditRequested } from '../../services/posts/storyEditPolicy';
import { PostTranslationService } from '../../services/posts/PostTranslationService';
import { CreatePostSchema, UpdatePostSchema, TranslatePostSchema, PostParams, PublishAttachmentSchema } from './types';
import { MediaService } from '../../services/MediaService';
import {
  planAttachmentPublication,
  postMediaFieldsFromAttachment,
  defaultVisibilityForPostType,
} from '../../services/posts/publishAttachment';
// Les prédicats PARTAGÉS de protection — les mêmes qui gouvernent la bannière de
// notification (cycle 125). La protection se lit aux DEUX niveaux : le message
// parent (`protectedPreview`, où vit une vraie vue unique / flou / éphémère /
// chiffré) et la pièce jointe (`maskedAttachment`). Les réutiliser, plutôt que
// de réécrire la règle, garantit qu'un post publié ne fuit pas ce qu'un push
// masque.
import { protectedPreview, maskedAttachment } from '../../services/notifications/NotificationService';
import { canAccessConversation } from '../conversations/utils/access-control';
import { sendSuccess, sendUnauthorized, sendBadRequest, sendNotFound, sendForbidden, sendInternalError, sendError, sendUpgradeRequired, sendGone } from '../../utils/response';
import { getAppVersionFloor, getAppStoreUrl, isBelowFloor } from '../../utils/appVersion';
import { CanvasV3Schema } from '@meeshy/shared/types/canvas-v3';
import { MentionService } from '../../services/MentionService';
import { resolvePostMentions, reconcilePostMentions } from '../../services/posts/postMentions';
import type { ResolvedPostMentions } from '../../services/posts/postMentions';
import {
  withMentions,
  graftReferences,
  readPostReferences,
  projectReferencesForViewer,
  type PostReference,
} from '../../services/posts/postReferences';
import { HashtagService } from '../../services/HashtagService';
import { createPostRouteRateLimitConfig } from '../../middleware/rate-limiter';
import { withMutationLog, MutationResultGone } from '../../utils/withMutationLog';
import { SecuritySanitizer } from '../../utils/sanitize.js';
import { hoistLocationDeep, parseSharedPlace, type SharedPlace } from '../../services/location/sharedPlace';
import { WIRE_BROADCAST, wireReaderFromRequest, isCanvasV3, unclaimedCanvasMediaIds } from '../../services/posts/storyEffectsV3';
import { broadcastPostRemoval } from '../../socketio/broadcastPostRemoval';

/**
 * Hisse `metadata.trackingLinks` ([{ url, token }]) en top-level sur le payload
 * socket d'un post/story/status — miroir exact du hoist `trackingLinks` des
 * messages (`MessageHandler`). Le destinataire rend le lien (texte + façade
 * vidéo) vers `/l/<token>` sans réécrire l'URL. Les réponses REST exposent déjà
 * `metadata` ; ce hoist ne sert que les payloads temps réel. No-op si absent.
 */
function hoistTrackingLinks<T extends Record<string, unknown>>(post: T): T {
  const metadata = post?.metadata as Record<string, unknown> | null | undefined;
  const tl = metadata?.trackingLinks;
  if (Array.isArray(tl) && tl.length > 0) {
    return { ...post, trackingLinks: tl } as T;
  }
  return post;
}

/**
 * Hisse `metadata.location` en top-level `location`, sur le post ET sur
 * chaque commentaire de son aperçu embarqué (`post.comments`) — voir
 * `hoistLocationDeep` (services/location/sharedPlace.ts). Appliqué à la fois
 * à la réponse REST et au payload socket (contrairement à `trackingLinks`,
 * qui ne hissait jusqu'ici que le payload socket, et qui ne descend pas dans
 * `comments`). No-op si rien ne porte de lieu.
 */
const hoistLocation = hoistLocationDeep;

/**
 * Écriture stricte de `storyEffects` (spec §C3, O15) — DERRIÈRE
 * `CANVAS_V3_WRITE_STRICT` (env, défaut OFF : le merge du lot A est inerte à
 * l'écriture, l'armement est un acte de déploiement postérieur aux trois
 * écrivains v3). Drapeau armé, deux refus DISTINCTS :
 * - blob SANS `v:3` (client du passé) ⇒ 426 UPGRADE_REQUIRED, `minVersion` et
 *   `storeUrl` à la racine — `storeUrl` résolu par `X-App-Platform`
 *   (`android` ⇒ Play Store, sinon App Store) ;
 * - blob AVEC `v:3` invalide (client neuf cassé — l'inviter à se mettre à
 *   jour serait un mensonge) ⇒ 400 CANVAS_INVALID + `issues`.
 * Rend `true` si une réponse d'erreur est partie (l'appelant sort).
 */
/**
 * Plancher `X-App-Version` (spec §C3, O2) — la porte d'en-tête ne juge que
 * les requêtes qui EN PORTENT UN : l'ABSENCE passe TOUJOURS (le web est
 * exempt — R6 — et les vieux binaires sont attrapés par le FORMAT, la garde
 * d'à côté, jamais par un en-tête qu'ils n'envoient pas). Portée : les
 * créations à scène (`storyEffects` présent OU `type === 'STORY'`). Plancher
 * vide (défaut) = porte désarmée — elle sert les ruptures FUTURES.
 * Rend `true` si le 426 est parti (l'appelant sort).
 */
function rejectBelowAppVersionFloor(
  request: FastifyRequest,
  reply: FastifyReply,
  data: { storyEffects?: unknown; type?: string }
): boolean {
  if (data.storyEffects == null && data.type !== 'STORY') return false;
  const versionHeader = request.headers['x-app-version'];
  const version = typeof versionHeader === 'string' ? versionHeader : undefined;
  if (!isBelowFloor(version, getAppVersionFloor())) return false;
  const platformHeader = request.headers['x-app-platform'];
  sendUpgradeRequired(reply, 'App version outdated - update the app', {
    details: {
      minVersion: getAppVersionFloor(),
      storeUrl: getAppStoreUrl(typeof platformHeader === 'string' ? platformHeader : undefined),
    },
  });
  return true;
}

function rejectNonV3StoryEffects(
  request: FastifyRequest,
  reply: FastifyReply,
  storyEffects: unknown
): boolean {
  if (process.env.CANVAS_V3_WRITE_STRICT !== '1') return false;
  if (storyEffects == null) return false;
  if (!isCanvasV3(storyEffects)) {
    const platformHeader = request.headers['x-app-platform'];
    sendUpgradeRequired(reply, 'Story format outdated - update the app', {
      details: {
        minVersion: getAppVersionFloor(),
        storeUrl: getAppStoreUrl(typeof platformHeader === 'string' ? platformHeader : undefined),
      },
    });
    return true;
  }
  const parsedCanvas = CanvasV3Schema.safeParse(storyEffects);
  if (!parsedCanvas.success) {
    sendBadRequest(reply, 'Invalid canvas', {
      code: 'CANVAS_INVALID',
      details: { issues: parsedCanvas.error.issues.slice(0, 5) },
    });
    return true;
  }
  return false;
}

/**
 * Claim des stickers posés (spec O8, tâche A7) — même drapeau que l'écriture
 * stricte. Un objet `sticker`/`media` du canvas v3 qui référence un média par
 * id (`payload.mediaId`/`payload.postMediaId`) doit appartenir à
 * `body.mediaIds` : c'est ce qui l'expose au claim de propriété réel —
 * `claimableMediaWhere` dans PostService, jamais dupliqué ici. Création
 * uniquement : à l'édition, le canvas référence légitimement des médias déjà
 * attachés au post (hors de `body.mediaIds` par contrat tri-état).
 * Rend `true` si le 400 est parti (l'appelant sort).
 */
function rejectUnclaimedCanvasMedia(
  reply: FastifyReply,
  storyEffects: unknown,
  mediaIds: readonly string[] | undefined
): boolean {
  if (process.env.CANVAS_V3_WRITE_STRICT !== '1') return false;
  const unclaimed = unclaimedCanvasMediaIds(storyEffects, mediaIds ?? []);
  if (unclaimed.length === 0) return false;
  sendBadRequest(reply, 'Canvas references media outside the claimed set', {
    code: 'MEDIA_NOT_CLAIMED',
    details: { mediaIds: unclaimed },
  });
  return true;
}

export function registerCoreRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  const postService = new PostService(prisma);
  const mentionService = new MentionService(prisma);
  const hashtagService = new HashtagService(prisma);

  /**
   * Le jeu FINAL des références d'un post, à servir après une écriture.
   *
   * Trois états, et les distinguer est tout l'intérêt : la résolution n'a rien
   * pu établir (`undefined` — l'appelant garde ce que la relation portait, une
   * mention périmée valant mieux qu'une mention détruite), le post ne nomme
   * plus personne (`[]` sans ouvrir de requête — le cas de l'immense majorité
   * des publications), ou il en nomme, et la seule source de leur profil et de
   * leur mode est la base d'APRÈS l'écriture.
   */
  const finalReferences = async (
    postId: string,
    resolved: ResolvedPostMentions,
    onError: (error: unknown) => void
  ): Promise<PostReference[] | undefined> => {
    if (!resolved.reconciled) return undefined;
    if (resolved.mentionedUserIds.length === 0) return [];
    return readPostReferences({ prisma, postId, onError });
  };

  // POST /posts — Create a new post
  //
  // Per-route bodyLimit 1MB : suffisant pour content (5KB max) + storyEffects
  // (256KB max via StoryEffectsSchema refine) + autres champs ≈ 300KB worst-case.
  // Le bodyLimit global serveur (50MB) reste actif pour les routes d'upload
  // audio/TUS qui en ont besoin ; ici on durcit avant que Zod parse, évite
  // le DoS où un attaquant force 50MB de JSON à parser (CPU/RAM).
  /**
   * Publier une pièce jointe reçue en conversation — sans la retélécharger.
   *
   * La feuille de partage offre les conversations ET les destinations publiques.
   * Le fichier existe déjà sur le stockage : le faire redescendre chez le client
   * pour le remonter paierait deux fois la bande passante d'un octet immobile.
   *
   * Le fichier est DUPLIQUÉ, jamais partagé : un `PostMedia` pointant sur le
   * fichier d'un `MessageAttachment` ferait de la suppression du post une
   * suppression DANS la conversation — `reclaimMediaRowBytes` n'interroge que
   * la table `Sound` avant d'effacer des octets, et les pièces jointes n'y
   * figurent pas.
   */
  fastify.post('/posts/from-attachment', {
    preValidation: [requiredAuth],
    config: { rateLimit: createPostRouteRateLimitConfig('create') },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const parsed = PublishAttachmentSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid request', { code: 'VALIDATION_ERROR' });
      }

      const attachment = await prisma.messageAttachment.findUnique({
        where: { id: parsed.data.attachmentId },
        select: {
          id: true, messageId: true, mimeType: true, fileUrl: true, thumbnailUrl: true,
          originalName: true, width: true, height: true, duration: true, codec: true, thumbHash: true,
          // Protection au niveau PIÈCE JOINTE (lue par `maskedAttachment`).
          isViewOnce: true, isBlurred: true, effectFlags: true,
          // Protection au niveau MESSAGE PARENT (lue par `protectedPreview`) —
          // c'est LÀ que vit une vraie vue unique / flou / éphémère / chiffré.
          // Une garde qui ne lisait que la pièce jointe laissait tout cela
          // sortir EN CLAIR vers un post.
          message: { select: {
            conversationId: true,
            conversation: { select: { identifier: true } },
            messageType: true, isViewOnce: true, isBlurred: true, isEncrypted: true,
            effectFlags: true, expiresAt: true, createdAt: true,
          } },
        },
      });

      // Le VERDICT de protection, composé par les prédicats partagés aux DEUX
      // niveaux. `protectedPreview` couvre aussi l'éphémère (refusé, cohérent
      // avec la bannière) ; `maskedAttachment` couvre la pièce jointe masquée.
      const mediaProtected =
        protectedPreview({
          messageType: attachment?.message?.messageType ?? null,
          isViewOnce: attachment?.message?.isViewOnce,
          isBlurred: attachment?.message?.isBlurred,
          isEncrypted: attachment?.message?.isEncrypted,
          effectFlags: attachment?.message?.effectFlags,
          expiresAt: attachment?.message?.expiresAt,
          createdAt: attachment?.message?.createdAt,
        }) !== null
        || maskedAttachment({
          isViewOnce: attachment?.isViewOnce,
          isBlurred: attachment?.isBlurred,
          effectFlags: attachment?.effectFlags,
        });

      // L'appartenance est établie AVANT de planifier : le plan lui-même refuse
      // sans elle, mais lui donner un verdict d'accès faux le rendrait complice.
      const conversationId = attachment?.message?.conversationId ?? null;
      const isMember = conversationId
        ? await canAccessConversation(
            prisma,
            authContext,
            conversationId,
            attachment?.message?.conversation?.identifier ?? conversationId,
          )
        : false;

      const plan = planAttachmentPublication({
        attachment: attachment
          ? { ...attachment, messageId: attachment.messageId ?? null }
          : null,
        callerIsMemberOfConversation: isMember,
        mediaIsProtected: mediaProtected,
        target: parsed.data.target,
      });

      if (plan.ok === false) {
        const { reason } = plan;
        if (reason === 'forbidden') {
          return sendForbidden(reply, 'Not a member of this conversation', { code: 'FORBIDDEN' });
        }
        if (reason === 'protected-media') {
          return sendBadRequest(reply, 'This media is protected and cannot be published', { code: 'PROTECTED_MEDIA' });
        }
        if (reason === 'unpublishable-media') {
          return sendBadRequest(reply, 'This media cannot be published', { code: 'UNPUBLISHABLE_MEDIA' });
        }
        return sendNotFound(reply, 'Attachment not found', { code: 'ATTACHMENT_NOT_FOUND' });
      }

      const media = new MediaService();
      const duplicated = await media.duplicate(plan.plan.attachment.fileUrl);
      const duplicatedThumbnail = plan.plan.attachment.thumbnailUrl
        ? (await media.duplicate(plan.plan.attachment.thumbnailUrl)).fileUrl
        : null;

      const postMedia = await prisma.postMedia.create({
        data: postMediaFieldsFromAttachment({
          attachment: { ...plan.plan.attachment, messageId: plan.plan.attachment.messageId },
          duplicated,
          duplicatedThumbnailUrl: duplicatedThumbnail,
          uploaderId: authContext.registeredUser.id,
        }),
      });

      const postType = plan.plan.postType;
      const post = await postService.createPost(
        {
          type: postType,
          // La visibilité par défaut SUIT le type : une STORY tombe sur FRIENDS
          // (parité avec `POST /posts`), tout le reste sur PUBLIC. Une constante
          // unique rendait toute story publiée depuis un partage PUBLIQUE.
          visibility: parsed.data.visibility ?? defaultVisibilityForPostType(postType),
          content: parsed.data.content
            ? SecuritySanitizer.sanitizeText(parsed.data.content)
            : undefined,
          mediaIds: [postMedia.id],
        },
        authContext.registeredUser.id,
      );

      const postId = (post as any).id as string;
      const postContent = (post as any).content as string | undefined;

      // Le Prisme couvre AUSSI la légende d'un média publié — sans ce
      // déclenchement, le texte d'un REEL/POST from-attachment n'était jamais
      // traduit. Parité stricte avec `POST /posts` : STORY exclue (son `content`
      // est déjà traduit par le pipeline audience-driven du service), langue
      // source = celle persistée par `createPost` (SSOT), fire-and-forget.
      const shouldTranslateContent = Boolean(parsed.data.content) && postType !== 'STORY';
      if (shouldTranslateContent) {
        try {
          PostTranslationService.shared.translatePost(
            postId,
            parsed.data.content,
            (post as any).originalLanguage,
            authContext.registeredUser.id,
          ).catch((err) => fastify.log.warn({ err }, '[POST /posts/from-attachment]: translate post failed'));
        } catch {
          // PostTranslationService not initialized — skip silently
        }
      }

      // La publication n'est plus SILENCIEUSE : elle résout les mentions du
      // contenu et diffuse en temps réel, exactement comme `POST /posts`. La
      // charge de from-attachment n'a pas de canal `mentions` déclaré — seul le
      // TEXTE de la légende nomme, d'où `declared: undefined`.
      const createdMentions = await resolvePostMentions({
        prisma,
        mentionService,
        notificationService: fastify.notificationService,
        post: {
          id: postId,
          authorId: authContext.registeredUser.id,
          type: postType as 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL',
          visibility: (post as any).visibility as string | undefined,
          visibilityUserIds: (post as any).visibilityUserIds as string[] | undefined,
        },
        content: postContent,
        declared: undefined,
        onError: (err: unknown) => {
          fastify.log.error(`[POST /posts/from-attachment] post mention reconcile failed: ${err}`);
        },
      });

      // Le jeu FINAL, relu APRÈS l'écriture des lignes — même raison qu'à
      // `POST /posts` : `createPost` a chargé sa relation avant que ces lignes
      // n'existent, la servir telle quelle rendrait `mentions: []` par
      // construction.
      const references = await finalReferences(postId, createdMentions, (err: unknown) => {
        fastify.log.error(`[POST /posts/from-attachment] post reference reload failed: ${err}`);
      });

      const socialEvents = fastify.socialEvents;
      if (socialEvents) {
        // Charge utile d'AUDIENCE : neutre, sans les silencieuses — même règle
        // que `POST /posts`.
        const broadcastReferences = references && projectReferencesForViewer({
          references,
          authorId: authContext.registeredUser.id,
          viewerId: undefined,
        });
        const broadcastPost = withMentions(
          graftReferences(
            hoistLocation(hoistTrackingLinks(post)) as unknown as Record<string, unknown>,
            broadcastReferences
          ),
          WIRE_BROADCAST
        ) as unknown as Post;
        if (postType === 'STORY') {
          socialEvents.broadcastStoryCreated(broadcastPost, authContext.registeredUser.id, request.clientMutationId).catch((err) => fastify.log.warn({ err }, '[POST /posts/from-attachment]: broadcast story created failed'));
        } else if (postType === 'STATUS') {
          socialEvents.broadcastStatusCreated(broadcastPost, authContext.registeredUser.id, request.clientMutationId).catch((err) => fastify.log.warn({ err }, '[POST /posts/from-attachment]: broadcast status created failed'));
        } else {
          socialEvents.broadcastPostCreated(broadcastPost, authContext.registeredUser.id, request.clientMutationId).catch((err) => fastify.log.warn({ err }, '[POST /posts/from-attachment]: broadcast post created failed'));
        }
      }

      // La réponse va à l'AUTEUR, et lui voit tout — y compris les silencieuses
      // qu'il vient de poser (parité avec `POST /posts`).
      return sendSuccess(
        reply,
        withMentions(
          graftReferences(hoistLocation(post as unknown as Record<string, unknown>), references),
          wireReaderFromRequest(request as UnifiedAuthRequest)
        ),
        { message: 'Published' }
      );
    } catch (error) {
      return sendInternalError(reply, 'Failed to publish attachment', { code: 'PUBLISH_FAILED' });
    }
  });

  fastify.post('/posts', {
    preValidation: [requiredAuth],
    config: { rateLimit: createPostRouteRateLimitConfig('create') },
    bodyLimit: 1 * 1024 * 1024,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const parsed = CreatePostSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid request', { code: 'VALIDATION_ERROR' });
      }

      if (rejectBelowAppVersionFloor(request, reply, parsed.data)) {
        return;
      }

      if (rejectNonV3StoryEffects(request, reply, parsed.data.storyEffects)) {
        return;
      }

      if (rejectUnclaimedCanvasMedia(reply, parsed.data.storyEffects, parsed.data.mediaIds)) {
        return;
      }

      type CreatedPost = Awaited<ReturnType<typeof postService.createPost>>;
      const post = await withMutationLog<CreatedPost>({
        request,
        fastify,
        userId: authContext.registeredUser.id,
        kind: 'createPost',
        // `diverges` — voir `ReplayCost` : chaque exécution INSÈRE une ligne.
        // Rejouer sur un résultat disparu fabriquerait un doublon (contenu
        // supprimé qui ressuscite), d'où le 410 rendu par le catch de la route.
        replayCost: 'diverges',
        op: () => postService.createPost({
          ...parsed.data,
          content: parsed.data.content !== undefined ? SecuritySanitizer.sanitizeText(parsed.data.content) : undefined,
          type: parsed.data.type ?? 'POST',
          visibility: parsed.data.visibility ?? (parsed.data.type === 'STORY' ? 'FRIENDS' : 'PUBLIC'),
        }, authContext.registeredUser.id) as Promise<CreatedPost & { id: string }>,
        onDuplicate: async (resultId) => {
          const replayed = await postService.getPostById(resultId, authContext.registeredUser.id);
          return replayed ? (replayed as unknown as CreatedPost & { id: string }) : null;
        },
      });

      // Trigger async translation for text content (fire-and-forget).
      //
      // G2 — seules les STORY sont EXCLUES : leur `content` est déjà traduit
      // par le pipeline audience-driven du service
      // (`PostService.triggerStoryTextTranslation`) ; déclencher AUSSI
      // `translatePost` (5 langues fixes) doublait les jobs ZMQ et créait
      // des écritures concurrentes dans `Post.translations`.
      //
      // La condition testait `=== 'POST'`, ce qui laissait REEL et STATUS
      // sans aucun pipeline — ni ici, ni dans le service. Or le feed de
      // production est fait presque uniquement de REEL portant du texte :
      // vérifié le 2026-07-27, 40 REEL consécutifs sans une seule traduction.
      // Le Prisme ne s'appliquait donc pas au gros du contenu. On exclut
      // désormais STORY explicitement, pour qu'un futur type soit couvert
      // par défaut plutôt qu'oublié en silence.
      const postType = parsed.data.type ?? 'POST';
      const shouldTranslateContent = Boolean(parsed.data.content) && postType !== 'STORY';
      if (shouldTranslateContent) {
        try {
          const translationService = PostTranslationService.shared;
          translationService.translatePost(
            (post as any).id,
            parsed.data.content,
            // Use the canonical language persisted by createPost (SSOT) rather
            // than the raw client claim — it already incorporates the normalized
            // claim (or the detected fallback) and matches the NLLB source keys.
            (post as any).originalLanguage,
            authContext.registeredUser.id,
          ).catch((err) => fastify.log.warn({ err }, '[POST /posts]: translate post failed'));
        } catch {
          // PostTranslationService not initialized — skip silently
        }
      }

      const postContent = (post as any).content as string | undefined;

      // GW1 — use the DECORATED instance (wired push+socket+email by
      // server.ts), never a bare local NotificationService: a bare instance
      // persists notifications but silently drops every push and socket emit
      // (friend_new_post/friend_new_story/friend_new_mood never delivered).
      // The guard keeps degraded boot working (decoration happens after
      // SocketIOManager init; standalone harnesses may not have it).
      const notifService = fastify.notificationService;

      // Persist and notify post-body mentions. Single entry point shared with
      // the edit path (services/posts/postMentions.ts) — never throws.
      const createdMentions = await resolvePostMentions({
        prisma,
        mentionService,
        notificationService: notifService,
        post: {
          id: (post as any).id as string,
          authorId: authContext.registeredUser.id,
          // Discriminant d'entité → surface ouverte au tap côté client.
          type: postType as 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL',
          // Audience du post — décide qui, parmi les nommés, a le droit d'être
          // prévenu. Un mentionné hors audience recevait l'extrait du contenu.
          visibility: (post as any).visibility as string | undefined,
          visibilityUserIds: (post as any).visibilityUserIds as string[] | undefined,
        },
        content: postContent,
        // Le texte d'une story ne vit pas dans sa légende : il vit dans les
        // objets de canevas. Sans ce champ, un `@handle` tapé sur une slide ne
        // nommait personne.
        storyEffects: parsed.data.storyEffects,
        // Les nommés que le TEXTE ne porte pas : badge posé sur le canevas
        // d'une story, note sous le contenu, métadonnée silencieuse. Sans ce
        // canal, les nommer imposait d'écrire leur `@handle` dans la légende —
        // une phrase inventée pour satisfaire l'extracteur, visible de tous et
        // traduite par le Prisme comme du contenu d'auteur.
        declared: parsed.data.mentions,
        onError: (err: unknown) => {
          fastify.log.error(`[POST /posts] post mention reconcile failed: ${err}`);
        },
      });
      // L'éventail vers les amis exclut les mentionnés : `user_mentioned` prime
      // sur `friend_new_post`, sinon un ami nommé reçoit les deux.
      const mentionedUserIdsForDedup = [...createdMentions.mentionedUserIds];

      // Le jeu FINAL, relu APRÈS l'écriture des lignes. `createPost` a chargé
      // sa relation avant que `resolvePostMentions` n'existe pour ce post : la
      // servir telle quelle rendait `mentions: []` PAR CONSTRUCTION, et les
      // deux clients lisent `[]` comme un verdict (« personne ne matche »),
      // pas comme une absence de savoir — l'auteur voyait son propre `@alice`
      // en texte mort.
      const references = await finalReferences((post as any).id as string, createdMentions, (err: unknown) => {
        fastify.log.error(`[POST /posts] post reference reload failed: ${err}`);
      });

      // Broadcast via Socket.IO — APRÈS la résolution, seul instant où les
      // références du post existent. Avant, l'événement partait avec la
      // relation vide qu'il venait de charger.
      const socialEvents = fastify.socialEvents;
      if (socialEvents) {
        // La charge utile temps réel est servie à une AUDIENCE : elle reste
        // neutre, sans les silencieuses — même règle que le `select` des feeds
        // (`postMentionInclude`), appliquée ici parce que le jeu relu, lui, les
        // porte toutes.
        const broadcastReferences = references && projectReferencesForViewer({
          references,
          authorId: authContext.registeredUser.id,
          viewerId: undefined,
        });
        // `withMentions` AUSSI sur l'événement : une charge utile temps réel est
        // une charge utile. Servie sous le nom de la relation Prisma
        // (`postMentions`), elle ne se décode pas — la clé exposée est
        // `mentions`, ici comme dans la réponse rendue plus bas.
        const broadcastPost = withMentions(
          graftReferences(
            hoistLocation(hoistTrackingLinks(post)) as unknown as Record<string, unknown>,
            broadcastReferences
          ),
          WIRE_BROADCAST
        ) as unknown as Post;
        if (postType === 'STORY') {
          // U1 parity — voir `broadcastPostCreated` juste en dessous : sans
          // l'écho du cmid, une STORY créée hors-ligne (dont un repost via
          // `POST /posts { repostOfId }`) ne pouvait jamais réconcilier son
          // item optimiste avec la story serveur.
          socialEvents.broadcastStoryCreated(broadcastPost, authContext.registeredUser.id, request.clientMutationId).catch((err) => fastify.log.warn({ err }, '[POST /posts]: broadcast story created failed'));
        } else if (postType === 'STATUS') {
          // U1 parity — même raison que STORY ci-dessus.
          socialEvents.broadcastStatusCreated(broadcastPost, authContext.registeredUser.id, request.clientMutationId).catch((err) => fastify.log.warn({ err }, '[POST /posts]: broadcast status created failed'));
        } else {
          // U1 — echo the request cmid so an offline author reconciles its
          // optimistic temp post (keyed by cmid) with this server post.
          socialEvents.broadcastPostCreated(broadcastPost, authContext.registeredUser.id, request.clientMutationId).catch((err) => fastify.log.warn({ err }, '[POST /posts]: broadcast post created failed'));
        }
      }

      if (postContent) {
        const hashtags = hashtagService.extractHashtags(postContent);
        if (hashtags.length > 0) {
          hashtagService.createPostHashtags((post as any).id as string, hashtags).catch((err: unknown) => {
            fastify.log.error(`[POST /posts] hashtag persist failed: ${err}`);
          });
        }
      }

      // Fan-out to friends: user_mentioned takes priority (dedup via excludeUserIds)
      if (notifService) {
        const postTypeForNotif = ((post as any).type ?? parsed.data.type ?? 'POST') as 'STORY' | 'POST' | 'MOOD' | 'STATUS' | 'REEL';
        notifService.createFriendContentNotificationsBatch({
          postId: (post as any).id as string,
          authorId: authContext.registeredUser.id,
          contentType: postTypeForNotif,
          excerpt: postContent?.slice(0, 100),
          postCreatedAt: (post as any).createdAt ?? undefined,
          postExpiresAt: (post as any).expiresAt ?? undefined,
          excludeUserIds: mentionedUserIdsForDedup,
          visibility: (post as any).visibility as string | undefined,
          visibilityUserIds: (post as any).visibilityUserIds as string[] | undefined,
        }).catch((err: unknown) => {
          fastify.log.error(`[POST /posts] friend content notification fan-out failed: ${err}`);
        });
      }

      // La réponse va à l'AUTEUR, et lui voit tout — y compris les silencieuses
      // qu'il vient de poser, sans quoi il ne pourrait plus en retirer une.
      return sendSuccess(
        reply,
        withMentions(
          graftReferences(hoistLocation(post as unknown as Record<string, unknown>), references),
          wireReaderFromRequest(request as UnifiedAuthRequest)
        ),
        { statusCode: 201 }
      );
    } catch (error) {
      // Le cmid a bien été appliqué, mais son résultat n'est plus relisible
      // (contenu supprimé, expiré, ou hors de la tranche ACL du lecteur) et
      // l'op DIVERGE — la rejouer recréerait une ligne que l'auteur a fait
      // disparaître. 410 le dit exactement : le geste a eu lieu, il n'y a
      // rien à refaire.
      if (error instanceof MutationResultGone) {
        return sendGone(reply, 'Post already applied, its result is gone', { code: 'MUTATION_RESULT_GONE' });
      }
      fastify.log.error(`[POST /posts] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/:postId — Get post by ID
  fastify.get('/posts/:postId', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const viewerUserId = authContext?.registeredUser?.id;
      const { postId } = request.params;

      const post = await postService.getPostById(postId, viewerUserId);
      if (!post) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      reply.header('Cache-Control', 'private, no-cache');

      // `getPostById` a déjà aplati ET projeté la racine pour CE lecteur —
      // `withMentions` y est neutre. Ce qu'il reste à faire est l'imbriqué : le
      // post ORIGINAL d'une republication porte, lui, la relation sous son nom
      // de schéma (`repostOfInclude`), et un client ne décode pas
      // `repostOf.postMentions`.
      return sendSuccess(reply, withMentions(
        hoistLocation(post as unknown as Record<string, unknown>),
        wireReaderFromRequest(request as UnifiedAuthRequest)
      ));
    } catch (error) {
      fastify.log.error(`[GET /posts/:postId] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // PUT /posts/:postId — Update a post (author only)
  // Per-route bodyLimit 1MB — voir POST /posts pour la justification.
  fastify.put('/posts/:postId', {
    preValidation: [requiredAuth],
    bodyLimit: 1 * 1024 * 1024,
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const parsed = UpdatePostSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid request', { code: 'VALIDATION_ERROR' });
      }

      if (rejectNonV3StoryEffects(request, reply, parsed.data.storyEffects)) {
        return;
      }

      // Lieu à l'édition — tri-état : absent = inchangé, null = retrait,
      // objet = remplacement validé par le MÊME parseSharedPlace que la
      // création (jamais de passthrough du bloc client vers metadata).
      let locationUpdate: SharedPlace | null | undefined;
      if (parsed.data.location !== undefined) {
        if (parsed.data.location === null) {
          locationUpdate = null;
        } else {
          const place = parseSharedPlace(parsed.data.location);
          if (!place) {
            return sendBadRequest(reply, 'Invalid location', { code: 'INVALID_LOCATION' });
          }
          locationUpdate = place;
        }
      }

      const baseUpdateData = parsed.data.content !== undefined
        ? { ...parsed.data, content: SecuritySanitizer.sanitizeText(parsed.data.content) }
        : parsed.data;
      const sanitizedUpdateData = { ...baseUpdateData, location: locationUpdate };
      const post = await postService.updatePost(postId, authContext.registeredUser.id, sanitizedUpdateData);
      if (!post) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      // Une édition RÉCONCILIE : elle retire les lignes des partants et ne
      // prévient que les entrants. Le bloc qui vivait ici recréait sans jamais
      // supprimer, et renotifiait tout le monde à chaque édition.
      const editedContent = (post as any).content as string | undefined;
      const reconciled = await reconcilePostMentions({
        prisma,
        mentionService,
        notificationService: fastify.notificationService,
        post: {
          id: postId,
          authorId: authContext.registeredUser.id,
          // Discriminant d'entité → surface ouverte au tap côté client.
          type: (post as any).type as 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL' | undefined,
          // Audience APRÈS édition : `post` est le document rendu par
          // `updatePost`, donc restreindre la visibilité d'un post et y ajouter
          // une mention dans la même requête applique bien la NOUVELLE règle.
          visibility: (post as any).visibility as string | undefined,
          visibilityUserIds: (post as any).visibilityUserIds as string[] | undefined,
        },
        content: editedContent,
        // Même source de texte qu'à la création : la légende ET les objets de
        // canevas.
        storyEffects: parsed.data.storyEffects,
        // TRI-ÉTAT : clé absente = les références déclarées survivent, `[]` =
        // elles partent. Les déduire du texte les effacerait à la première
        // correction de frappe — elles n'y sont pas, c'est leur raison d'être.
        declared: parsed.data.mentions,
        onError: (err: unknown) => {
          fastify.log.error(`[PUT /posts/:postId] post mention reconcile failed: ${err}`);
        },
      });

      // Le jeu FINAL, relu APRÈS la réconciliation. `updatePost` rend son
      // document DANS sa transaction, donc d'avant : servir sa relation
      // laissait une référence révoquée affichée chez tous les lecteurs, que
      // rien n'invalidait ensuite (le web remplace le post en cache sans
      // refetch), et privait l'édition de toute façon d'annoncer une entrante.
      const references = await finalReferences(postId, reconciled, (err: unknown) => {
        fastify.log.error(`[PUT /posts/:postId] post reference reload failed: ${err}`);
      });

      {
        const editHashtags = editedContent ? hashtagService.extractHashtags(editedContent) : [];
        if (editHashtags.length > 0) {
          hashtagService.createPostHashtags(postId, editHashtags).catch((err: unknown) => {
            fastify.log.error(`[PUT /posts/:postId] hashtag persist failed: ${err}`);
          });
        }
        hashtagService.reconcileRemovedHashtags(postId, editHashtags.map((h) => h.tag)).catch((err: unknown) => {
          fastify.log.error(`[PUT /posts/:postId] hashtag reconcile failed: ${err}`);
        });
      }

      // Broadcast post edits. Each type has its own event so clients can listen narrowly:
      // - STORY → story:updated (visibility-filtered, per audit X7)
      // - STATUS → status:updated (visibility-filtered)
      // - POST/MOOD → post:updated to friends feed
      const socialEvents = fastify.socialEvents;
      if (socialEvents) {
        const updatedPostType = (post as any).type as string;
        // Charge utile d'AUDIENCE : neutre, sans les silencieuses. Même règle
        // qu'à la création.
        const broadcastReferences = references && projectReferencesForViewer({
          references,
          authorId: authContext.registeredUser.id,
          viewerId: undefined,
        });
        // Second chemin d'enrichissement (le premier est la création
        // ci-dessus) : le lieu — posé à la création OU modifié/retiré par
        // l'édition (tri-état `location`, merge metadata dans `updatePost`)
        // — doit rester visible sur CE broadcast aussi, sinon un post modifié
        // après coup (visibilité, contenu…) republierait sans sa position.
        const broadcastPost = withMentions(
          graftReferences(hoistLocation(post as unknown as Record<string, unknown>), broadcastReferences),
          WIRE_BROADCAST
        ) as unknown as Post;
        if (updatedPostType === 'STORY') {
          // Même prédicat que le reset d'engagement du service — les deux ne
          // peuvent pas diverger sur un même payload.
          socialEvents.broadcastStoryUpdated(broadcastPost, authContext.registeredUser.id, {
            engagementReset: storyContentEditRequested(parsed.data),
          }).catch((err) => fastify.log.warn({ err }, '[PUT /posts/:postId]: broadcast story updated failed'));
        } else if (updatedPostType === 'STATUS') {
          socialEvents.broadcastStatusUpdated(broadcastPost, authContext.registeredUser.id).catch((err) => fastify.log.warn({ err }, '[PUT /posts/:postId]: broadcast status updated failed'));
        } else {
          socialEvents.broadcastPostUpdated(broadcastPost, authContext.registeredUser.id).catch((err) => fastify.log.warn({ err }, '[PUT /posts/:postId]: broadcast post updated failed'));
        }
      }

      // La réponse va à l'AUTEUR — seul autorisé à éditer — et lui voit tout.
      return sendSuccess(
        reply,
        withMentions(
          graftReferences(hoistLocation(post as unknown as Record<string, unknown>), references),
          wireReaderFromRequest(request as UnifiedAuthRequest)
        )
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return sendForbidden(reply, 'Not authorized to edit this post', { code: 'FORBIDDEN' });
      }
      // Business-rule rejections from updatePost (invalid type switch, reel
      // without media, type change on a repost) carry a 422 statusCode.
      if (error instanceof Error && (error as { statusCode?: number }).statusCode === 422) {
        return sendBadRequest(reply, error.message, { code: 'INVALID_POST_UPDATE' });
      }
      fastify.log.error(`[PUT /posts/:postId] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /posts/:postId — Soft delete (auteur, ou modérateur et plus avec audit)
  fastify.delete('/posts/:postId', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const result = await postService.deletePost(postId, authContext.registeredUser.id, {
        actorRole: authContext.registeredUser.role,
      });
      if (!result) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      // `deletePost` autorise « l'auteur OU un modérateur et plus » : l'acteur
      // n'est donc pas forcément l'auteur, et c'est bien l'auteur que la
      // diffusion attend (voir `broadcastPostRemoval`, invariant 1).
      broadcastPostRemoval(
        fastify.socialEvents,
        result,
        (err) => fastify.log.warn({ err }, '[DELETE /posts/:postId]: broadcast deletion failed')
      );

      return sendSuccess(reply, { deleted: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return sendForbidden(reply, 'Not authorized to delete this post', { code: 'FORBIDDEN' });
      }
      fastify.log.error(`[DELETE /posts/:postId] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/:postId/translate — Request on-demand translation for a specific language
  fastify.post('/posts/:postId/translate', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const parsed = TranslatePostSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid request', { code: 'VALIDATION_ERROR' });
      }

      // Le viewer DOIT être transmis : sans lui, `getPostById` retombe sur le
      // filtre anonyme (`visibility: PUBLIC`) et ne trouve rien d'autre qu'une
      // publication publique. Une story Meeshy étant réservée aux contacts par
      // défaut, la route répondait « Post not found » à un lecteur pourtant
      // légitime — et la feuille « Traductions » du lecteur restait sur un
      // anneau tournant sans fin (constaté au simulateur le 2026-07-27).
      const post = await postService.getPostById(postId, authContext.registeredUser.id);
      if (!post) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      try {
        const translationService = PostTranslationService.shared;
        await translationService.translateOnDemand(postId, parsed.data.targetLanguage, {
          force: parsed.data.force,
        });
      } catch {
        return sendError(reply, 503, 'Translation service not available', { code: 'SERVICE_UNAVAILABLE' });
      }

      return sendSuccess(reply, { requested: true, targetLanguage: parsed.data.targetLanguage });
    } catch (error) {
      fastify.log.error(`[POST /posts/:postId/translate] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });
}
