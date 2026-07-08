import { generateShortToken, TrackingLinkService } from './TrackingLinkService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Prisma } from '@meeshy/shared/prisma/client';
import { PostVisibility, PostType } from '@meeshy/shared/prisma/client';
import { PostReactionService } from './PostReactionService';
import type { MobileTranscription } from '../routes/posts/types';
import { PostAudioService } from './posts/PostAudioService';
import { NOT_DELETED } from './posts/postIncludes';
import { buildPostVisibilityOrFilter } from './posts/postVisibility';
import { getCommunityCoMemberIds } from './posts/communityVisibility';
import { MediaService } from './MediaService';
import type { MediaStorage, MediaDuplicateResult } from './storage/MediaStorage';
import type { OrphanMediaCleanupService } from './storage/OrphanMediaCleanupService';
import { enhancedLogger } from '../utils/logger-enhanced';
import { ZMQSingleton } from './ZmqSingleton';
import { authorSelect, mediaSelect, mediaInclude, postInclude } from './posts/postIncludes';

const log = enhancedLogger.child({ module: 'PostService' });

interface StoryTextObjectRaw {
  id?: string;
  // The iOS composer encodes overlay text under `text`; `content` is the
  // pre-rename legacy alias (still accepted by the SDK decoder and the web
  // transform). Both optional — resolve via `PostService.storyTextObjectText`.
  text?: string;
  content?: string;
  sourceLanguage?: string;
  translations?: Record<string, string>;
  [key: string]: unknown;
}

const STORY_EXPIRY_HOURS = 21;
const STATUS_EXPIRY_HOURS = 1;

function computeExpiresAt(type: PostType): Date | undefined {
  if (type === PostType.STORY) return new Date(Date.now() + STORY_EXPIRY_HOURS * 3600_000);
  if (type === PostType.STATUS) return new Date(Date.now() + STATUS_EXPIRY_HOURS * 3600_000);
  return undefined;
}

// Minimal language detection (first word heuristics + fallback)
function detectLanguage(text: string): string {
  if (!text) return 'en';
  const lower = text.toLowerCase();
  // Simple heuristic based on common words
  const langPatterns: Record<string, RegExp> = {
    fr: /\b(le|la|les|un|une|des|je|tu|il|nous|vous|est|sont|avec|pour|dans|que|qui|pas|mais)\b/,
    es: /\b(el|la|los|las|un|una|es|son|con|para|en|que|por|del|como|pero|más)\b/,
    de: /\b(der|die|das|ein|eine|ist|sind|mit|für|und|ich|nicht|auf|dem|den)\b/,
    pt: /\b(o|a|os|as|um|uma|é|são|com|para|em|que|por|do|da|não|mas)\b/,
    ar: /[\u0600-\u06FF]/,
    zh: /[\u4e00-\u9fff]/,
    ja: /[\u3040-\u309F\u30A0-\u30FF]/,
  };
  for (const [lang, pattern] of Object.entries(langPatterns)) {
    if (pattern.test(lower)) return lang;
  }
  return 'en';
}

// postInclude is shared — see ./posts/postIncludes for the single source of truth.

export class PostService {
  private readonly postReactionService: PostReactionService;
  private readonly trackingLinkService: TrackingLinkService;

  constructor(
    private readonly prisma: PrismaClient,
    // Typed against the MediaStorage interface so a future swap to MinIO/R2
    // (Pilier 7 SOTA migration path) does not need to touch this class.
    // The default value remains the local-filesystem implementation.
    private readonly mediaService: MediaStorage = new MediaService(),
    // Optional outbox tracker — when injected (production server bootstrap),
    // every snapshot file produced inside `repostPost` is registered before
    // the surrounding transaction commits, and the registration is removed
    // on commit. If the process crashes mid-call, the worker reaps the
    // orphan files. When omitted (unit tests, ad-hoc invocations), the
    // path-based inline rollback in the catch block remains the only
    // safety net — same behavior as before the outbox was introduced.
    // Reference: SOTA audit Pilier 4.
    private readonly orphanCleanup?: OrphanMediaCleanupService,
    postReactionService?: PostReactionService,
    // Source UNIQUE du mapping `metadata.trackingLinks` (URLs brutes → token
    // `/l/<token>`), partagée avec messages/stories/commentaires. Injectable
    // pour les tests ; défaut = instance câblée sur le même prisma.
    trackingLinkService?: TrackingLinkService,
  ) {
    this.postReactionService = postReactionService ?? new PostReactionService(prisma);
    this.trackingLinkService = trackingLinkService ?? new TrackingLinkService(prisma);
  }

  async createPost(data: {
    type: PostType;
    visibility: PostVisibility;
    visibilityUserIds?: string[];
    content?: string;
    originalLanguage?: string;
    communityId?: string;
    storyEffects?: Record<string, unknown>;
    moodEmoji?: string;
    audioUrl?: string;
    audioDuration?: number;
    mediaIds?: string[];
    mobileTranscription?: MobileTranscription;
    repostOfId?: string;
  }, userId: string) {
    const now = new Date();
    let expiresAt: Date | undefined;

    if (data.type === PostType.STORY) {
      expiresAt = new Date(now.getTime() + STORY_EXPIRY_HOURS * 3600_000);
    } else if (data.type === PostType.STATUS) {
      expiresAt = new Date(now.getTime() + STATUS_EXPIRY_HOURS * 3600_000);
    }

    const originalLanguage = data.originalLanguage ?? (data.content ? detectLanguage(data.content) : undefined);

    let repostOfId: string | undefined;
    let originalRepostOfId: string | undefined;

    if (data.repostOfId) {
      const sourcePost = await this.prisma.post.findFirst({
        where: { id: data.repostOfId, deletedAt: NOT_DELETED },
        select: { id: true, repostOfId: true, originalRepostOfId: true },
      });
      if (!sourcePost) {
        const err: any = new Error('Repost source not found');
        err.statusCode = 404;
        throw err;
      }
      repostOfId = sourcePost.id;
      originalRepostOfId = (sourcePost.originalRepostOfId as string | null)
        ?? (sourcePost.repostOfId as string | null)
        ?? sourcePost.id;
    }

    const post = await this.prisma.post.create({
      data: {
        authorId: userId,
        type: data.type,
        visibility: data.visibility,
        visibilityUserIds: data.visibilityUserIds ?? [],
        content: data.content,
        originalLanguage,
        communityId: data.communityId,
        storyEffects: (data.storyEffects as any) ?? undefined,
        moodEmoji: data.moodEmoji,
        audioUrl: data.audioUrl,
        audioDuration: data.audioDuration,
        expiresAt,
        ...(repostOfId !== undefined ? { repostOfId, originalRepostOfId } : {}),
      },
      include: postInclude,
    });

    // Link pre-uploaded media if any
    // mediaIds contains PostMedia IDs (created directly by TUS handler with postId=null)
    if (data.mediaIds?.length) {
      await this.prisma.postMedia.updateMany({
        where: { id: { in: data.mediaIds } },
        data: { postId: post.id },
      });

      // Locate the first audio PostMedia for transcription processing
      const audioMedia = await this.prisma.postMedia.findFirst({
        where: { id: { in: data.mediaIds }, mimeType: { startsWith: 'audio/' } },
        orderBy: { order: 'asc' },
        select: { id: true, fileUrl: true },
      });

      // If a mobileTranscription is provided, persist it in the audio PostMedia
      if (data.mobileTranscription && audioMedia) {
        const transcriptionPayload: Prisma.InputJsonValue = {
          ...data.mobileTranscription,
          segments: data.mobileTranscription.segments ?? [],
          source: 'mobile',
        };
        await this.prisma.postMedia.update({
          where: { id: audioMedia.id },
          data: { transcription: transcriptionPayload },
        });
      }

      // Trigger server-side Whisper transcription only when no mobile transcription was provided (fire-and-forget)
      if (audioMedia && !data.mobileTranscription) {
        PostAudioService.shared.processPostAudio({
          postId: post.id,
          postMediaId: audioMedia.id,
          fileUrl: audioMedia.fileUrl ?? '',
          authorId: post.authorId,
        }).catch((err: unknown) => {
          log.error('Post audio processing failed', err, { postId: post.id });
        });
      }
    }

    // Déclencher la traduction Prisme pour les stories avec texte (fire-and-forget)
    if (data.type === PostType.STORY && data.content) {
      this.triggerStoryTextTranslation(post.id, data.content, userId).catch((err: unknown) => {
        log.error('triggerStoryTextTranslation failed', err instanceof Error ? err : new Error(String(err)));
      });
    }

    // Si story avec textObjects : remplir content comme index de recherche + déclencher traductions
    const effects = data.storyEffects as Record<string, unknown> | undefined;
    const rawTextObjects = effects?.textObjects;
    const textObjects = Array.isArray(rawTextObjects) ? (rawTextObjects as StoryTextObjectRaw[]) : undefined;

    if (textObjects?.length) {
      const searchContent = textObjects
        .map((t) => PostService.storyTextObjectText(t))
        .filter(Boolean)
        .join(' ');

      if (searchContent && !data.content) {
        await this.prisma.post.update({
          where: { id: post.id },
          data: { content: searchContent },
        });
      }

      this.triggerStoryTextObjectTranslation(post.id, textObjects, userId).catch((err: unknown) => {
        log.error('triggerStoryTextObjectTranslation failed', err instanceof Error ? err : new Error(String(err)));
      });
    }

    // Tracking des URLs brutes du post/story : mapping `url → token` rangé dans
    // `metadata.trackingLinks`. Même mécanisme que les messages — le client rend
    // le lien (texte + façade vidéo) vers `/l/<token>` SANS réécrire le contenu
    // (aperçu vidéo + URL lisible préservés). Le texte effectif est le corps du
    // post, le texte de la story (`content`) ou l'index de recherche des
    // textObjects. JAMAIS bloquant : le helper avale ses erreurs (→ []) et
    // l'écriture metadata est gardée.
    const trackingContent =
      data.content
      ?? (textObjects?.length
        ? textObjects.map((t) => PostService.storyTextObjectText(t)).filter(Boolean).join(' ')
        : undefined);
    if (trackingContent) {
      try {
        const trackingLinks = await this.trackingLinkService.collectContentTrackingLinks({
          content: trackingContent,
          createdBy: userId,
          postId: post.id,
        });
        if (trackingLinks.length > 0) {
          const existingMetadata = (post.metadata as Record<string, unknown> | null) ?? {};
          await this.prisma.post.update({
            where: { id: post.id },
            data: { metadata: { ...existingMetadata, trackingLinks } as Prisma.InputJsonValue },
          });
        }
      } catch (err) {
        log.warn('createPost: tracking link persistence failed', { postId: post.id, err });
      }
    }

    // Refetch pour inclure transcription et translations après toutes les opérations media
    const refreshed = await this.prisma.post.findUnique({
      where: { id: post.id },
      include: postInclude,
    });
    return refreshed ?? post;
  }

  private async triggerStoryTextTranslation(postId: string, content: string, authorId: string, sourceLanguageOverride?: string): Promise<void> {
    try {
      // An explicit source (e.g. the language chosen when editing a post) wins
      // over the heuristic detector, which only guesses from word patterns.
      const sourceLanguage = sourceLanguageOverride ?? detectLanguage(content);

      // 1. Résoudre les langues cibles depuis les contacts de l'auteur, hors
      // la langue source elle-même — même garde que le sibling
      // `triggerStoryTextObjectTranslation`. Sans elle, un auteur écrivant
      // dans une langue déjà parlée par (une partie de) son audience
      // déclenche un aller-retour NLLB source→source qui réécrit
      // `translations.<source>` avec une paraphrase de l'original au lieu de
      // le laisser intact.
      const allTargetLanguages = await this.resolveAudienceTargetLanguages(authorId);
      const targetLanguages = allTargetLanguages.filter(l => l !== sourceLanguage);

      if (targetLanguages.length === 0) {
        log.info('StoryTranslation: no target languages', { postId });
        return;
      }

      // 2. Obtenir le client ZMQ
      const zmqClient = ZMQSingleton.getInstanceSync();
      if (!zmqClient) {
        log.warn('StoryTranslation: ZMQ client not available', { postId });
        return;
      }

      const storyMessageId = `story:${postId}`;

      log.info('StoryTranslation: sending ZMQ request', { postId, sourceLanguage, targetLanguages });

      // 3. Listener pour recevoir les résultats un par un
      let receivedCount = 0;
      const expectedCount = targetLanguages.length;
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

      // Subscribe to the per-messageId scoped event instead of the global
      // `translationCompleted`. Avoids O(active_stories × global_events) filter
      // overhead — previously every translation across the entire gateway
      // (messages, comments, etc.) fanned out to every active story listener
      // which then filtered by messageId. With 100 active stories and 1000
      // messages/min that was ~100k listener invocations/min.
      const scopedEvent = `translationCompleted:${storyMessageId}`;

      const removeListener = () => {
        zmqClient.off(scopedEvent, handleResult);
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
      };

      const handleResult = async (event: { taskId: string; result: { messageId: string; translatedText: string; confidenceScore?: number; translatorModel?: string }; targetLanguage: string; metadata: Record<string, unknown> }) => {
        // The scoped event guarantees messageId match, but keep the guard for
        // defense in depth (the event payload is reused).
        if (event.result.messageId !== storyMessageId) return;

        // Reject malformed `targetLanguage` before interpolating into the
        // raw Mongo `$set` field path. A value like `"a.b.$inject"` would
        // otherwise let a compromised translator write arbitrary fields.
        if (!/^[a-z]{2,5}$/.test(event.targetLanguage)) {
          log.warn('StoryTranslation: rejected malformed targetLanguage', { postId, targetLanguage: event.targetLanguage });
          return;
        }

        try {
          await (this.prisma as any).$runCommandRaw({
            update: 'Post',
            updates: [{
              q: { _id: { $oid: postId } },
              u: { $set: { [`translations.${event.targetLanguage}`]: {
                text: event.result.translatedText,
                translationModel: event.result.translatorModel ?? 'nllb',
                confidenceScore: event.result.confidenceScore ?? 1,
                createdAt: new Date().toISOString(),
              }}},
            }],
          });

          log.info('StoryTranslation: saved', { postId, lang: event.targetLanguage });
        } catch (err) {
          log.warn('StoryTranslation: save failed', { err, postId });
        }

        receivedCount++;
        if (receivedCount >= expectedCount) {
          log.info('StoryTranslation: all languages received, removing listener', { postId, receivedCount });
          removeListener();
        }
      };

      zmqClient.on(scopedEvent, handleResult);

      // 4. Envoyer la requête ZMQ
      try {
        await zmqClient.translateToMultipleLanguages(
          content,
          sourceLanguage,
          targetLanguages,
          storyMessageId,
          `story_context:${postId}`,
        );
      } catch (sendError) {
        removeListener();
        throw sendError;
      }

      // 5. Cleanup du listener après timeout (fallback si certaines langues échouent)
      timeoutHandle = setTimeout(() => {
        if (receivedCount < expectedCount) {
          log.warn('StoryTranslation: timeout, removing listener', { postId, receivedCount, expectedCount });
        }
        removeListener();
      }, 60_000);

    } catch (error) {
      log.warn('StoryTranslation failed', { err: error, postId });
    }
  }

  private async triggerStoryTextObjectTranslation(
    postId: string,
    textObjects: StoryTextObjectRaw[],
    authorId: string
  ): Promise<void> {
    // Envoie les textObjects au pipeline de traduction.
    // La persistence des résultats est gérée par le handler ZMQ Task 15
    // (story_text_object_translation_completed → storyEffects.textObjects[n].translations).
    // G3 — langues RÉELLES de l'audience (mêmes règles que le pipeline
    // `content` ci-dessus), plus la liste fixe de 10 langues : un auteur
    // sans contact n'émet aucun job (le Prisme sert l'original au viewer).
    const allTargetLanguages = await this.resolveAudienceTargetLanguages(authorId);
    if (allTargetLanguages.length === 0) {
      log.info('StoryTextObjectTranslation: no audience languages', { postId });
      return;
    }

    textObjects.forEach((obj, index) => {
      const text = PostService.storyTextObjectText(obj)?.trim();
      if (!text) return;

      const zmqClient = ZMQSingleton.getInstanceSync();
      if (!zmqClient) {
        log.warn('StoryTextObjectTranslation: ZMQ client not available', { postId, index });
        return;
      }

      const sourceLanguage = obj.sourceLanguage ?? detectLanguage(text);
      const targetLanguages = allTargetLanguages.filter(l => l !== sourceLanguage);

      if (targetLanguages.length === 0) {
        log.info('StoryTextObjectTranslation: no target languages after filtering source', { postId, index, sourceLanguage });
        return;
      }

      log.info('StoryTextObjectTranslation: sending ZMQ request', { postId, index, sourceLanguage, targetLanguages });

      zmqClient.translateTextObject({
        postId,
        textObjectIndex: index,
        text,
        sourceLanguage,
        targetLanguages,
      });
    });
  }

  /** Résolution canonique du texte d'un overlay de story. Le composer iOS encode
   *  désormais le texte sous `text` ; `content` est l'alias legacy pré-renommage
   *  (encore accepté par le décodeur SDK et le transform web). On lit la clé
   *  canonique d'abord, fallback sur la legacy — sans ça la gateway abandonnait
   *  chaque overlay iOS de l'indexation de recherche, de l'extraction des liens
   *  de tracking ET de la traduction (mêmes symptômes que le bug déjà corrigé
   *  côté web dans `apps/web/lib/story-transforms.ts`). */
  static storyTextObjectText(obj: { text?: unknown; content?: unknown }): string | undefined {
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.content === 'string') return obj.content;
    return undefined;
  }

  /** G3 — cœur PUR de la résolution d'audience (testable) : systemLanguage
   *  des contacts, dédupliqués, hors 'en' (langue pivot), cap 10. */
  static audienceLanguages(systemLanguages: Array<string | null | undefined>): string[] {
    return [...new Set(
      systemLanguages.filter((l): l is string => !!l && l !== 'en')
    )].slice(0, 10);
  }

  /** G3 — langues cibles réelles de l'audience de `authorId` (participants de
   *  conversations communes). Partagée par les pipelines `content`
   *  (triggerStoryTextTranslation) et `textObjects`. */
  private async resolveAudienceTargetLanguages(authorId: string): Promise<string[]> {
    const contacts = await this.prisma.participant.findMany({
      where: {
        conversation: { participants: { some: { userId: authorId } } },
        userId: { not: authorId },
      },
      include: { user: { select: { systemLanguage: true } } },
      take: 100,
    });
    return PostService.audienceLanguages(contacts.map((c) => c.user?.systemLanguage));
  }

  /// Returns the post if and only if `viewerUserId` is allowed to see it,
  /// according to the post's `visibility` and `visibilityUserIds`. Unauthenticated
  /// callers (`viewerUserId === undefined`) can only see PUBLIC posts. The 404 is
  /// indistinguishable from "doesn't exist" by design (no enumeration leak).
  ///
  /// View recording is NOT triggered here — callers that want to record a view
  /// must call `recordView()` explicitly (e.g., the dedicated POST /:id/view
  /// route). Previously, every fetch silently inflated viewCount.
  async getPostById(postId: string, viewerUserId?: string) {
    const visibilityFilter = await this.buildVisibilityFilter(viewerUserId);
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED, ...visibilityFilter },
      include: postInclude,
    });
    if (!post) return null;

    // Anonymous read: no viewer-specific state to resolve.
    if (!viewerUserId) {
      return {
        ...post,
        currentUserReactions: [],
        isLikedByMe: false,
        isBookmarkedByMe: false,
        isRepostedByMe: false,
      };
    }

    // Personal-state enrichment, identical to PostFeedService so the post
    // detail hydrates the SAME flags as the feed and the reel viewer
    // (single source of truth). Without these, the detail always rendered
    // « non liké / non bookmarké / non reposté » even when the post was
    // liked, saved or reposted (absent field → SDK decodes `?? false`).
    const [userReactions, viewerBookmark, viewerRepostCount] = await Promise.all([
      this.prisma.postReaction.findMany({
        where: { userId: viewerUserId, postId: post.id },
        select: { postId: true, emoji: true },
      }),
      this.prisma.postBookmark.findFirst({
        where: { userId: viewerUserId, postId: post.id },
        select: { postId: true },
      }),
      // A repost is any non-deleted post authored by the viewer whose
      // `repostOfId` points at this post — mirrors PostFeedService.
      this.prisma.post.count({
        where: { authorId: viewerUserId, repostOfId: post.id, deletedAt: NOT_DELETED },
      }),
    ]);
    const currentUserReactions = userReactions.map((r) => r.emoji);

    return {
      ...post,
      currentUserReactions,
      isLikedByMe: currentUserReactions.length > 0,
      isBookmarkedByMe: viewerBookmark !== null,
      isRepostedByMe: viewerRepostCount > 0,
    };
  }

  /// Builds the Prisma `where` fragment that enforces post visibility for a viewer.
  /// Mirrors `PostFeedService.buildVisibilityFilter` so single-post fetches, view
  /// recording, and the feed apply the SAME audience rules.
  private async buildVisibilityFilter(viewerUserId?: string) {
    if (!viewerUserId) {
      return { visibility: PostVisibility.PUBLIC };
    }
    const [friendIds, dmContactIds, communityCoMemberIds] = await Promise.all([
      this.getFriendIdsForViewer(viewerUserId),
      this.getDirectConversationContactIds(viewerUserId),
      getCommunityCoMemberIds(this.prisma, viewerUserId),
    ]);
    // G5 — filtre canonique unique. Audience = friends ∪ contacts DM, ALIGNÉE sur
    // `PostFeedService.buildVisibilityFilter` (résout la divergence story-sota §4).
    // Sans cet alignement, un contact DM (non-ami strict) pouvait VOIR une story
    // via son feed mais son `POST /view` était rejeté par ce filtre → aucun
    // `PostView` créé, aucun `story:viewed` émis → l'auteur ne voyait jamais cette
    // vue (ni en temps réel ni après relance). Cf. `recordView`.
    const audienceIds = [...new Set([...friendIds, ...dmContactIds])];
    return buildPostVisibilityOrFilter(viewerUserId, audienceIds, communityCoMemberIds);
  }

  /// Contacts DM (autres membres actifs des conversations directes du viewer).
  /// Miroir de `PostFeedService.getDirectConversationContactIds` (sans le cache
  /// Redis : le seul appelant chaud est `recordView`, une fois par vue). Fait
  /// partie de l'audience FRIENDS/EXCEPT pour matcher exactement le feed.
  private async getDirectConversationContactIds(userId: string): Promise<string[]> {
    try {
      const myMemberships = await this.prisma.participant.findMany({
        where: { userId, isActive: true, conversation: { type: 'direct' } },
        select: { conversationId: true },
      });
      const conversationIds = myMemberships.map((m) => m.conversationId);
      if (conversationIds.length === 0) return [];

      const otherMembers = await this.prisma.participant.findMany({
        where: {
          conversationId: { in: conversationIds },
          userId: { not: userId },
          isActive: true,
        },
        select: { userId: true },
      });
      return [...new Set(otherMembers.map((m) => m.userId).filter(Boolean) as string[])];
    } catch {
      return [];
    }
  }

  private async getFriendIdsForViewer(userId: string): Promise<string[]> {
    try {
      const friendRequests = await this.prisma.friendRequest.findMany({
        where: {
          status: 'accepted',
          OR: [{ senderId: userId }, { receiverId: userId }],
        },
        select: { senderId: true, receiverId: true },
      });
      return Array.from(new Set(friendRequests.flatMap((fr) => [fr.senderId, fr.receiverId])
        .filter((id) => id !== userId)));
    } catch {
      return [];
    }
  }

  async updatePost(postId: string, userId: string, data: {
    content?: string;
    visibility?: PostVisibility;
    visibilityUserIds?: string[];
    storyEffects?: Record<string, unknown>;
    moodEmoji?: string;
    originalLanguage?: string;
    type?: PostType;
    removeMediaIds?: string[];
  }) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
      include: { media: { select: { id: true } } },
    });

    if (!post) return null;
    if (post.authorId !== userId) {
      throw new Error('FORBIDDEN');
    }

    // The edit-only fields are handled explicitly below; keep them out of the
    // blind spread so they are never written unconditionally.
    const { type: requestedType, originalLanguage: requestedLanguage, removeMediaIds, ...rest } = data;

    const updateData: any = {
      ...rest,
      visibility: data.visibility,
      storyEffects: (data.storyEffects as any) ?? undefined,
      isEdited: true,
    };
    if (data.visibilityUserIds !== undefined) {
      updateData.visibilityUserIds = data.visibilityUserIds;
    }

    // Only remove media that actually belongs to this post — an id pointing at
    // another post's media is silently ignored (never cross-deletes).
    const ownMediaIds = new Set(post.media.map((m) => m.id));
    const mediaIdsToRemove = (removeMediaIds ?? []).filter((id) => ownMediaIds.has(id));
    const remainingMediaCount = post.media.length - mediaIdsToRemove.length;
    const finalType = requestedType ?? post.type;

    // Type switch is limited to POST <-> REEL on the author's OWN original post:
    // never on a repost (it mirrors its source) and never to/from STORY/STATUS
    // (their expiry/lifecycle is not managed by the edit flow). Switching to a
    // REEL requires media — a text-only reel has nothing to show on the
    // immersive surface.
    if (requestedType !== undefined && requestedType !== post.type) {
      const switchable: PostType[] = [PostType.POST, PostType.REEL];
      if (!switchable.includes(post.type) || !switchable.includes(requestedType)) {
        const err: any = new Error('Only POST <-> REEL type changes are allowed');
        err.statusCode = 422;
        throw err;
      }
      if (post.repostOfId) {
        const err: any = new Error('Cannot change the type of a repost');
        err.statusCode = 422;
        throw err;
      }
      updateData.type = requestedType;
    }

    // A reel must always keep at least one media — whether it is being switched
    // to REEL or staying a REEL while media is being removed.
    if (finalType === PostType.REEL && remainingMediaCount === 0) {
      const err: any = new Error('A reel requires at least one media');
      err.statusCode = 422;
      throw err;
    }

    // A language change re-runs the Prisme translation pipeline from the new
    // source language and discards the now-stale translations. Fire-and-forget
    // like the create path; the client re-hydrates as ZMQ results land.
    const languageChanged =
      requestedLanguage !== undefined && requestedLanguage !== post.originalLanguage;
    if (languageChanged) {
      updateData.originalLanguage = requestedLanguage;
      updateData.translations = {};
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (mediaIdsToRemove.length > 0) {
        await tx.postMedia.deleteMany({ where: { id: { in: mediaIdsToRemove }, postId } });
      }
      return tx.post.update({
        where: { id: postId },
        data: updateData,
        include: postInclude,
      });
    });

    if (languageChanged) {
      const content = data.content ?? post.content;
      if (content) {
        this.triggerStoryTextTranslation(postId, content, userId, requestedLanguage).catch((err: unknown) => {
          log.error('triggerStoryTextTranslation failed on update', err instanceof Error ? err : new Error(String(err)));
        });
      }
    }

    return updated;
  }

  async deletePost(postId: string, userId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
    });

    if (!post) return null;
    if (post.authorId !== userId) {
      throw new Error('FORBIDDEN');
    }

    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: { deletedAt: new Date() },
    });

    // Soft-delete only flips `deletedAt` — the Prisma `onDelete: Cascade` relation
    // never fires, so any share-tracking links targeting this post would keep
    // redirecting to a dead page. Deactivate them explicitly (best-effort).
    try {
      await this.prisma.trackingLink.updateMany({
        where: { targetId: postId },
        data: { isActive: false },
      });
    } catch (err) {
      log.warn('deletePost: tracking link deactivation failed', { postId, err });
    }

    return updated;
  }

  async likePost(postId: string, userId: string, emoji: string = '❤️') {
    try {
      await this.postReactionService.addReaction({ postId, userId, emoji });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('not found') || message.includes('deleted')) {
        return null;
      }
      throw err;
    }

    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
      include: postInclude,
    });
    if (!post) return null;

    const reactions = await this.prisma.postReaction.findMany({
      where: { postId },
      select: { userId: true, emoji: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const reactionsJson = reactions.map(r => ({
      userId: r.userId,
      emoji: r.emoji,
      createdAt: r.createdAt.toISOString(),
    }));

    await this.prisma.post.update({
      where: { id: postId },
      data: {
        reactions: reactionsJson as Prisma.InputJsonValue,
        likeCount: reactions.length,
      },
    });

    return this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
      include: postInclude,
    });
  }

  async unlikePost(postId: string, userId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
      include: postInclude,
    });
    if (!post) return null;

    const userReactions = await this.prisma.postReaction.findMany({
      where: { postId, userId },
      select: { userId: true, emoji: true, createdAt: true },
    });

    if (userReactions.length === 0) return post;

    const foundEmoji = userReactions[0].emoji;
    await this.postReactionService.removeReaction({ postId, userId, emoji: foundEmoji });

    const remainingReactions = await this.prisma.postReaction.findMany({
      where: { postId },
      select: { userId: true, emoji: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const reactionsJson = remainingReactions.map(r => ({
      userId: r.userId,
      emoji: r.emoji,
      createdAt: r.createdAt.toISOString(),
    }));

    await this.prisma.post.update({
      where: { id: postId },
      data: {
        reactions: reactionsJson as Prisma.InputJsonValue,
        likeCount: remainingReactions.length,
      },
    });

    return this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
      include: postInclude,
    });
  }

  async bookmarkPost(postId: string, userId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
    });
    if (!post) return null;

    // Create + catch P2002 instead of unconditional upsert: a duplicate bookmark
    // must NOT re-increment bookmarkCount (the previous `upsert` always ran the
    // increment, inflating the counter on every repeat tap).
    try {
      await this.prisma.postBookmark.create({ data: { postId, userId } });
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
        // Already bookmarked — idempotent no-op. Return the unchanged absolute
        // count so the broadcast stays authoritative.
        return { success: true, bookmarkCount: (post as { bookmarkCount?: number }).bookmarkCount ?? 0 };
      }
      throw err;
    }

    // `update` returns the post AFTER the increment → the absolute bookmarkCount
    // that `post:bookmarked` carries so feed / reel / detail reconcile without
    // a reload (mirrors the canonical likeCount on `post:liked`).
    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: { bookmarkCount: { increment: 1 } },
      select: { bookmarkCount: true },
    });

    return { success: true, bookmarkCount: updated.bookmarkCount };
  }

  async unbookmarkPost(postId: string, userId: string) {
    let existed = true;
    try {
      await this.prisma.postBookmark.delete({
        where: { postId_userId: { postId, userId } },
      });
    } catch {
      // Not bookmarked — nothing to decrement, but still surface the count.
      existed = false;
    }

    if (existed) {
      // Guarded decrement: only when the counter is still > 0, so a drifted /
      // already-zero counter can never go negative.
      await this.prisma.post.updateMany({
        where: { id: postId, bookmarkCount: { gt: 0 } },
        data: { bookmarkCount: { decrement: 1 } },
      });
    }

    // Read-after-write the absolute count for the broadcast (the guarded
    // updateMany returns a batch count, not the new value).
    const fresh = await this.prisma.post.findFirst({
      where: { id: postId },
      select: { bookmarkCount: true },
    });

    return { success: true, bookmarkCount: fresh?.bookmarkCount ?? 0 };
  }

  /**
   * Upsert applicatif du lien de partage tracé d'un post pour le partageur courant
   * (LOT 6). Un partageur = un lien réutilisé par post : si le lien existe déjà,
   * on réutilise son token SANS ré-incrémenter `shareCount`. Sinon on crée le lien
   * + incrémente `shareCount` dans une transaction. Une collision concurrente
   * (P2002 sur l'index unique partiel `(targetId, createdBy)`) est rattrapée :
   * on relit le lien gagnant sans ré-incrémenter.
   */
  async shareWithTrackingLink(
    postId: string,
    userId: string,
    opts: { baseUrl: string; platform?: string },
  ): Promise<{ shared: boolean; shareCount: number; shortUrl: string; token: string; reused: boolean } | null> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
      select: { id: true, shareCount: true, type: true },
    });
    if (!post) return null;

    const baseUrl = opts.baseUrl.replace(/\/+$/, '');

    const existing = await this.prisma.trackingLink.findFirst({
      where: { targetId: postId, createdBy: userId },
    });
    if (existing) {
      return { shared: true, shareCount: post.shareCount, token: existing.token, shortUrl: `${baseUrl}${existing.shortUrl}`, reused: true };
    }

    const token = await this.generateShareToken();
    const shortUrl = `/l/${token}`;

    // Type the link from the post's OWN type (POST/REEL/STORY/STATUS map 1:1 to
    // TrackingTargetType) so the redirect page + DeepLinkRouter open the right
    // surface — never blindly "POST". Stories get their dedicated viewer URL.
    const targetType = ({ POST: 'POST', REEL: 'REEL', STORY: 'STORY', STATUS: 'STATUS' } as const)[post.type];
    // Real v1 page per type: /post, /reel, /story, /mood (fallback /feeds/post).
    const webPath = ({ POST: 'post', REEL: 'reel', STORY: 'story', STATUS: 'mood' } as const)[post.type] ?? 'feeds/post';
    const originalUrl = `${baseUrl}/${webPath}/${postId}`;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const link = await tx.trackingLink.create({
          data: {
            token,
            name: `Post ${postId.slice(0, 8)}`,
            source: opts.platform,
            medium: 'share',
            originalUrl,
            shortUrl,
            createdBy: userId,
            targetType,
            targetId: postId,
            isActive: true,
            totalClicks: 0,
            uniqueClicks: 0,
          },
        });
        const updated = await tx.post.update({
          where: { id: postId },
          data: { shareCount: { increment: 1 } },
          select: { shareCount: true },
        });
        return { link, shareCount: updated.shareCount };
      });
      return { shared: true, shareCount: created.shareCount, token: created.link.token, shortUrl: `${baseUrl}${created.link.shortUrl}`, reused: false };
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
        // Concurrent sharer won the race — reuse the winning link, no re-increment.
        const raced = await this.prisma.trackingLink.findFirst({
          where: { targetId: postId, createdBy: userId },
        });
        if (raced) {
          return { shared: true, shareCount: post.shareCount, token: raced.token, shortUrl: `${baseUrl}${raced.shortUrl}`, reused: true };
        }
      }
      throw err;
    }
  }

  /**
   * Analytics du lien de partage du post pour le partageur courant (LOT 6).
   * Retourne `null` si l'utilisateur n'a pas (encore) partagé ce post.
   */
  async getPostShareLink(
    postId: string,
    userId: string,
    baseUrl: string,
  ): Promise<{ token: string; shortUrl: string; totalClicks: number; uniqueClicks: number; lastClickedAt: Date | null } | null> {
    const link = await this.prisma.trackingLink.findFirst({
      where: { targetId: postId, createdBy: userId },
    });
    if (!link) return null;
    return {
      token: link.token,
      shortUrl: `${baseUrl.replace(/\/+$/, '')}${link.shortUrl}`,
      totalClicks: link.totalClicks,
      uniqueClicks: link.uniqueClicks,
      lastClickedAt: link.lastClickedAt,
    };
  }

  /**
   * Génère un token de partage unique de 6 caractères (collision → re-tirage).
   * Utilise un CSPRNG (`crypto.randomInt`) — JAMAIS `Math.random()` : un PRNG
   * prédictible laisserait deviner les tokens d'autres partageurs (énumération,
   * usurpation d'attribution). 6 chars suffisent face au brute-force grâce au
   * rate-limiting de `/l/:token` (contenu partagé déjà public).
   */
  private async generateShareToken(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const token = generateShortToken(6);
      const clash = await this.prisma.trackingLink.findUnique({ where: { token } });
      if (!clash) return token;
    }
    throw new Error('Unable to generate unique share token');
  }

  /**
   * Enregistre une vue. Retourne `true` UNIQUEMENT lors de la première vue
   * réelle (création du PostView) — permet à l'appelant de ne déclencher les
   * effets de bord coûteux « une fois » (ex : marquer les notifications du post
   * comme lues) sans les rejouer à chaque impression répétée du feed.
   */
  async recordView(postId: string, userId: string, duration?: number): Promise<boolean> {
    try {
      // Enforce visibility before recording — without this, any authenticated
      // user could increment viewCount on any private story by ID, and have
      // their userId surface in the author's `/posts/:id/views` response
      // (information disclosure + view inflation).
      const visibilityFilter = await this.buildVisibilityFilter(userId);
      const post = await this.prisma.post.findFirst({
        where: { id: postId, deletedAt: NOT_DELETED, ...visibilityFilter },
        select: { id: true, authorId: true },
      });
      if (!post) return false;

      // Author re-opening their own story shouldn't inflate viewCount.
      if (post.authorId === userId) return false;

      // Sanitize duration: client-supplied → cap at 5 minutes (way past any
      // reasonable story).
      const safeDuration = duration !== undefined
        ? Math.max(0, Math.min(300_000, Math.round(duration)))
        : undefined;

      const existing = await this.prisma.postView.findUnique({
        where: { postId_userId: { postId, userId } },
      });

      if (existing) {
        if (safeDuration !== undefined) {
          await this.prisma.postView.update({
            where: { id: existing.id },
            data: { duration: safeDuration },
          });
        }
        return false;
      }

      await this.prisma.postView.create({
        data: { postId, userId, duration: safeDuration },
      });

      await this.prisma.post.update({
        where: { id: postId },
        data: { viewCount: { increment: 1 } },
      });

      return true;
    } catch (error) {
      // P7-2 — course double-submit : l'index unique (postId,userId) fait
      // lever P2002 sur le create concurrent. Dédup ATTENDUE → no-op
      // silencieux ; les compteurs restent exacts (l'incrément n'a pas été
      // atteint). Pattern miroir de recordAnonymousOpen ci-dessous.
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        return false;
      }
      // Toute AUTRE erreur (Mongo injoignable, validation) était avalée en
      // silence par l'ancien `catch {}` — loggée désormais pour ne pas
      // masquer une vraie panne sur ce chemin (initiative 6cd1a3c47).
      log.warn('recordView failed', {
        postId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Compte une ouverture ANONYME (sans compte) d'un post. v1 "comptage bête" :
   * dédup faible par `sessionKey` (chaîne opaque du header X-Session-Token).
   * Retourne `true` UNIQUEMENT au 1ᵉʳ insert d'un (postId, sessionKey) — ce qui
   * incrémente `postOpenCount`. Doublon (P2002) ou post non public → `false`.
   * Failles connues : voir la section Sécurité de la spec 2026-06-17.
   */
  async recordAnonymousOpen(postId: string, sessionKey: string): Promise<boolean> {
    try {
      // Un anonyme ne voit que du PUBLIC — réutilise la source de vérité de visibilité.
      const visibilityFilter = await this.buildVisibilityFilter(undefined);
      const post = await this.prisma.post.findFirst({
        where: { id: postId, deletedAt: NOT_DELETED, ...visibilityFilter },
        select: { id: true },
      });
      if (!post) return false;

      // Dédup INSERT-only : l'unicité (postId, sessionKey) fait lever P2002 sur doublon.
      try {
        await this.prisma.anonymousPostOpen.create({ data: { postId, sessionKey } });
      } catch {
        return false; // déjà compté pour cette session (ou insert en échec) → no-op
      }

      await this.prisma.post.update({
        where: { id: postId },
        data: { postOpenCount: { increment: 1 } },
      });
      return true;
    } catch {
      return false; // fire-and-forget : un compteur ne doit jamais casser une requête
    }
  }

  /**
   * Ingestion append-only des sessions d'engagement (LOT 4 + agrégation LOT 5).
   *
   * - Upsert sur `sessionId` → idempotent : rejouer un ACK perdu après un 200 est
   *   un no-op (aucun double comptage).
   * - Skip-and-continue : un post supprimé entre `begin` et `flush` est ignoré
   *   sans faire échouer le reste du batch.
   * - Caps défensifs (300 s) sur `dwellMs`/`watchMs`.
   * - `userId` provient de la route (jamais du client) — anti spoofing.
   * - Agrégation dénormalisée alimentée UNIQUEMENT à l'INSERT d'une nouvelle ligne
   *   (jamais aux updates/retries idempotents) : `postOpenCount`, `playCount`,
   *   `qualifiedViewCount`. N'altère NI `viewCount` NI `PostView`.
   *
   * Retourne le nombre de sessions persistées (insert ou update).
   */
  async recordEngagementBatch(
    sessions: Array<{
      sessionId: string; userId?: string; postId: string; contentType: string; surface: string;
      startedAt: string; dwellMs: number; watchMs?: number; mediaDurationMs?: number;
      completed?: boolean; truncated?: boolean; consent?: string;
      actions?: unknown[]; watchSamples?: unknown[];
    }>,
    userId: string,
  ): Promise<number> {
    const capped = sessions.slice(0, 50);
    let recorded = 0;

    for (const s of capped) {
      try {
        const post = await this.prisma.post.findFirst({
          where: { id: s.postId, deletedAt: NOT_DELETED },
          select: { id: true, authorId: true },
        });
        if (!post) continue; // skip-and-continue: post deleted between begin and flush

        const dwellMs = Math.max(0, Math.min(300_000, Math.round(s.dwellMs)));
        const watchMs = s.watchMs !== undefined
          ? Math.max(0, Math.min(300_000, Math.round(s.watchMs)))
          : undefined;
        const mediaDurationMs = s.mediaDurationMs !== undefined
          ? Math.max(0, Math.round(s.mediaDurationMs))
          : undefined;

        const completed = s.completed === true;
        const data = {
          postId: s.postId,
          userId,
          contentType: s.contentType,
          surface: s.surface,
          startedAt: new Date(s.startedAt),
          dwellMs,
          watchMs,
          mediaDurationMs,
          completed,
          truncated: s.truncated === true,
          consent: s.consent,
          actions: (s.actions ?? []) as Prisma.InputJsonValue,
          watchSamples: (s.watchSamples ?? []) as Prisma.InputJsonValue,
        };

        const before = await this.prisma.postEngagement.findUnique({
          where: { sessionId: s.sessionId },
          select: { id: true },
        });
        const isInsert = !before;

        await this.prisma.postEngagement.upsert({
          where: { sessionId: s.sessionId },
          update: data,
          create: { sessionId: s.sessionId, ...data },
        });
        recorded += 1;

        if (isInsert) {
          const increments = this.engagementAggregateIncrements({
            surface: s.surface,
            contentType: s.contentType,
            dwellMs,
            watchMs,
            mediaDurationMs,
            completed,
            watchSamples: s.watchSamples ?? [],
          });
          if (Object.keys(increments).length > 0) {
            await this.prisma.post.update({
              where: { id: s.postId },
              data: increments,
            });
          }
        }
      } catch {
        continue; // never fail the whole batch on one row
      }
    }
    return recorded;
  }

  /**
   * Calcule les incréments de compteurs dénormalisés pour une NOUVELLE session
   * (spec §19.3). Renvoie un objet `Prisma.PostUpdateInput` partiel — vide si
   * la session ne déclenche aucun compteur.
   */
  private engagementAggregateIncrements(s: {
    surface: string; contentType: string; dwellMs: number;
    watchMs?: number; mediaDurationMs?: number; completed: boolean;
    watchSamples: unknown[];
  }): Prisma.PostUpdateInput {
    const SHORT_VIDEO_MS = 8300;
    const QUALIFY_MS = 2500;

    const increments: Record<string, { increment: number }> = {};

    // "Ouverture" d'un post = consommation plein-cadre. Sur le feed de reels,
    // l'ouverture (vue totale) est comptée par l'engagement (défilement plein
    // écran). La page Detail, elle, compte sa vue IMMÉDIATEMENT à l'ouverture
    // (route /impression?source=detail) → on ne la recompte PAS ici, sinon une
    // ouverture de Detail vaudrait +2. Les surfaces éphémères (story/status) ont
    // leurs propres métriques et ne comptent pas ici.
    if (s.surface === 'reels') {
      increments.postOpenCount = { increment: 1 };
    }

    if (s.completed) {
      increments.playCount = { increment: 1 };
    }

    const maxPositionMs = Array.isArray(s.watchSamples)
      ? s.watchSamples.reduce<number>((max, sample) => {
          const pos = (sample as { positionMs?: unknown })?.positionMs;
          return typeof pos === 'number' && pos > max ? pos : max;
        }, 0)
      : 0;

    const duration = s.mediaDurationMs ?? 0;
    const positionThresh = duration < SHORT_VIDEO_MS ? 0.90 : 0.30;
    const positionQualifies = duration > 0 && (maxPositionMs / duration) >= positionThresh;
    const watchQualifies = (s.watchMs ?? 0) >= QUALIFY_MS;
    const dwellQualifies = s.watchMs === undefined && s.dwellMs >= QUALIFY_MS;

    if (positionQualifies || watchQualifies || dwellQualifies) {
      increments.qualifiedViewCount = { increment: 1 };
    }

    return increments as Prisma.PostUpdateInput;
  }

  async sharePost(postId: string, userId: string, platform?: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
    });
    if (!post) return null;

    return this.prisma.post.update({
      where: { id: postId },
      data: { shareCount: { increment: 1 } },
      include: postInclude,
    });
  }

  async pinPost(postId: string, userId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
    });
    if (!post) return null;
    if (post.authorId !== userId) throw new Error('FORBIDDEN');

    return this.prisma.post.update({
      where: { id: postId },
      data: { isPinned: true },
      include: postInclude,
    });
  }

  async unpinPost(postId: string, userId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
    });
    if (!post) return null;
    if (post.authorId !== userId) throw new Error('FORBIDDEN');

    return this.prisma.post.update({
      where: { id: postId },
      data: { isPinned: false },
      include: postInclude,
    });
  }

  async getPostViews(postId: string, userId: string, limit: number = 50, offset: number = 0) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
    });
    if (!post) return null;
    if (post.authorId !== userId) throw new Error('FORBIDDEN');

    const views = await this.prisma.postView.findMany({
      where: { postId },
      include: {
        user: { select: authorSelect },
      },
      orderBy: { viewedAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await this.prisma.postView.count({ where: { postId } });

    return { items: views, total, hasMore: offset + limit < total };
  }

  async getPostInteractions(postId: string, userId: string, limit: number = 50, offset: number = 0) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
      select: { id: true, authorId: true, reactions: true },
    });
    if (!post) return null;
    if (post.authorId !== userId) throw new Error('FORBIDDEN');

    const [views, total] = await Promise.all([
      this.prisma.postView.findMany({
        where: { postId },
        include: { user: { select: authorSelect } },
        orderBy: { viewedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.postView.count({ where: { postId } }),
    ]);

    const reactions = (post.reactions as any[] | null) ?? [];
    const reactionByUser = new Map<string, string>();
    for (const r of reactions) {
      reactionByUser.set(r.userId, r.emoji);
    }

    const viewers = views.map((v) => ({
      id: v.user.id,
      username: v.user.username,
      displayName: v.user.displayName,
      avatarUrl: v.user.avatar,
      viewedAt: v.viewedAt,
      reaction: reactionByUser.get(v.user.id) ?? null,
    }));

    return { viewers, total, hasMore: offset + limit < total };
  }

  async repostPost(
    postId: string,
    userId: string,
    opts: {
      targetType?: PostType;
      content?: string;
      isQuote?: boolean;
    } = {},
  ) {
    const original = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
      include: { media: mediaInclude },
    });
    if (!original) return null;

    if (original.expiresAt && (original.expiresAt as Date).getTime() < Date.now()) {
      return null;
    }

    if (original.visibility !== 'PUBLIC') {
      const err: any = new Error('Cannot repost private content');
      err.statusCode = 403;
      throw err;
    }

    const targetType = opts.targetType ?? original.type;
    const content = opts.content;
    const isQuote = opts.isQuote ?? false;

    const originalLanguage = content ? detectLanguage(content) : undefined;

    const originalRepostOfId = original.originalRepostOfId
      ?? original.repostOfId
      ?? original.id;

    const expiresAt = computeExpiresAt(targetType);

    // Snapshot the source's intrinsic content into the repost whenever the
    // SOURCE is EPHEMERAL (STORY = 21h, STATUS = 1h). The original can expire
    // and be deleted, so a repost that merely referenced it via `repostOfId`
    // would render EMPTY once the source is gone — the exact "status/story
    // vide" bug. Duplicating media + audio and copying storyEffects / moodEmoji
    // / content makes every ephemeral repost self-contained. This is the same
    // guarantee the story→POST path always relied on, now generalized to
    // story→story, status→status, status→post, etc.
    const isEphemeralSourceRepost =
      original.type === PostType.STORY || original.type === PostType.STATUS;

    type SnapshotMediaCreate = {
      fileName: string;
      originalName: string;
      mimeType: string;
      fileSize: number;
      filePath: string;
      fileUrl: string;
      thumbnailUrl?: string;
      order: number;
    };

    let snapshotMedia: SnapshotMediaCreate[] | undefined;
    let snapshotAudioUrl: string | undefined;
    let snapshotStoryEffects: Prisma.InputJsonValue | undefined;

    if (isEphemeralSourceRepost) {
      const duplicatedMedia: SnapshotMediaCreate[] = [];
      let duplicatedAudioUrl: string | undefined;
      // Outbox row IDs to release once the surrounding transaction commits.
      // If we crash before reaching the untrack call, the worker will reap
      // the snapshot files on the next sweep cycle.
      const orphanRowIds: string[] = [];

      // Helper that runs the producer pattern correctly : when an outbox
      // is wired, register the destination URL BEFORE writing the file so
      // a crash mid-write is recoverable. When no outbox, fall back to the
      // simple single-shot duplicate() + post-hoc track that this code
      // path used previously (no producer guarantee, but the inline catch
      // still cleans up on synchronous failure).
      const trackedDuplicate = async (sourceUrl: string): Promise<MediaDuplicateResult> => {
        if (!this.orphanCleanup) {
          return await this.mediaService.duplicate(sourceUrl);
        }
        const plan = this.mediaService.planDuplicate(sourceUrl);
        const trackId = await this.orphanCleanup.track(plan.plannedFileUrl, 'repost-snapshot');
        orphanRowIds.push(trackId);
        return await plan.commit();
      };

      try {
        const originalMedia = (original.media ?? []) as Array<{
          fileUrl: string;
          mimeType: string;
          thumbnailUrl?: string | null;
          order?: number;
        }>;

        for (const [idx, m] of originalMedia.entries()) {
          const dup = await trackedDuplicate(m.fileUrl);
          let dupThumbUrl: string | undefined;
          if (m.thumbnailUrl) {
            const dupThumb = await trackedDuplicate(m.thumbnailUrl);
            dupThumbUrl = dupThumb.fileUrl;
          }
          duplicatedMedia.push({
            fileName: dup.fileName,
            originalName: dup.fileName,
            mimeType: dup.mimeType,
            fileSize: dup.fileSize,
            filePath: dup.filePath,
            fileUrl: dup.fileUrl,
            thumbnailUrl: dupThumbUrl,
            order: idx,
          });
        }

        const audioUrl = original.audioUrl as string | null | undefined;
        if (audioUrl) {
          const dupAudio = await trackedDuplicate(audioUrl);
          duplicatedAudioUrl = dupAudio.fileUrl;
          snapshotAudioUrl = dupAudio.fileUrl;
        }

        snapshotMedia = duplicatedMedia;
        snapshotStoryEffects = original.storyEffects as Prisma.InputJsonValue | undefined;

        // STATUS carries its text in `content` (the mood caption); STORY carries
        // its text inside `storyEffects` (rendered on the canvas). Inherit the
        // source body/language only for STATUS reshares with no overriding quote
        // — otherwise a story's caption would be duplicated into the post body.
        const inheritStatusBody = original.type === PostType.STATUS && !content;
        const snapshotContent = content
          ?? (inheritStatusBody ? ((original.content as string | null | undefined) ?? undefined) : undefined);
        const snapshotOriginalLanguage = content
          ? originalLanguage
          : (inheritStatusBody ? ((original.originalLanguage as string | null | undefined) ?? undefined) : originalLanguage);
        const sourceMoodEmoji = (original.moodEmoji as string | null | undefined) ?? undefined;

        const repost = await this.prisma.post.create({
          data: {
            authorId: userId,
            type: targetType,
            visibility: original.visibility,
            content: snapshotContent ?? undefined,
            originalLanguage: snapshotOriginalLanguage,
            repostOfId: postId,
            originalRepostOfId,
            isQuote,
            ...(sourceMoodEmoji !== undefined ? { moodEmoji: sourceMoodEmoji } : {}),
            ...(expiresAt !== undefined ? { expiresAt } : {}),
            ...(snapshotAudioUrl !== undefined ? { audioUrl: snapshotAudioUrl } : {}),
            ...(snapshotStoryEffects !== undefined ? { storyEffects: snapshotStoryEffects } : {}),
            ...(snapshotMedia !== undefined ? { media: { create: snapshotMedia } } : {}),
          },
          include: postInclude,
        });

        await this.prisma.post.update({
          where: { id: postId },
          data: { repostCount: { increment: 1 } },
        });

        // Post created — release the outbox rows. Done in a fire-and-forget
        // catch since failure here only means the worker will still see the
        // rows past their cleanup window and try to delete files that are
        // now legitimately referenced by the new Post. The worker handles
        // that case via MediaStorage.delete idempotence + the row's TTL,
        // but to be safe we use the typed batch helper.
        if (this.orphanCleanup && orphanRowIds.length > 0) {
          await this.orphanCleanup.untrackBatch(orphanRowIds);
        }

        return repost;
      } catch (err) {
        // Inline (best-effort) compensation. Same as before — fast-path
        // cleanup. The outbox rows stay registered, so the worker provides
        // a second-line safety net if a delete here fails (or if the
        // process dies before reaching this catch).
        for (const dup of duplicatedMedia) {
          await this.mediaService.delete(dup.fileUrl).catch(() => {});
        }
        if (duplicatedAudioUrl) {
          await this.mediaService.delete(duplicatedAudioUrl).catch(() => {});
        }
        // Note : on failure we deliberately do NOT untrack the outbox
        // rows. They remain so the worker can verify the files are
        // actually gone (idempotent delete) and reap any that the inline
        // compensation missed.
        throw err instanceof Error
          ? new Error('Media snapshot or post creation failed during repost', { cause: err })
          : new Error('Media snapshot failed during repost');
      }
    }

    const repost = await this.prisma.post.create({
      data: {
        authorId: userId,
        type: targetType,
        visibility: original.visibility,
        content: content ?? undefined,
        originalLanguage,
        repostOfId: postId,
        originalRepostOfId,
        isQuote,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
      },
      include: postInclude,
    });

    await this.prisma.post.update({
      where: { id: postId },
      data: { repostCount: { increment: 1 } },
    });

    return repost;
  }
}
