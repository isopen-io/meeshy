import { generateShortToken, TrackingLinkService } from './TrackingLinkService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Prisma } from '@meeshy/shared/prisma/client';
import { PostVisibility, PostType } from '@meeshy/shared/prisma/client';
import { PostReactionService } from './PostReactionService';
import type { MobileTranscription } from '../routes/posts/types';
import { PostAudioService } from './posts/PostAudioService';
import { NOT_DELETED } from './posts/postIncludes';
import { claimableMediaWhere, describeClaimShortfall } from './posts/mediaOwnership';
import { applyMediaOrder } from './posts/mediaOrder';
import { qualifiesAsReel } from '@meeshy/shared/utils/reel-composition';
import { ephemeralExpiresAt } from './posts/ephemeralPosts';
import { buildPostVisibilityOrFilter, isEphemeralPostType } from './posts/postVisibility';
import {
  isRepostVisibilityAllowed,
  repostVisibilityInheritsAudienceList,
} from '@meeshy/shared/utils/repost-audience';
import { getCommunityCoMemberIds } from './posts/communityVisibility';
import { MediaService } from './MediaService';
import type { MediaStorage, MediaDuplicateResult } from './storage/MediaStorage';
import type { OrphanMediaCleanupService } from './storage/OrphanMediaCleanupService';
import { enhancedLogger } from '../utils/logger-enhanced';
import { ZMQSingleton } from './ZmqSingleton';
import { authorSelect, mediaSelect, mediaInclude, postInclude } from './posts/postIncludes';
import { projectReferencesForViewer, toPostReferences } from './posts/postReferences';
import { attachReferenceAccess, consumeReferenceView, resolveReferenceAccess } from './posts/referenceAccess';
import { remapStoryEffectsMediaIds } from './posts/storyEffectsMediaRemap';
import { composeStoryContent, storyTextObjectText } from './posts/storyContentComposition';
import { storyTranslatableTexts } from './posts/storyEffectsV3';
import { storyContentEditRequested } from './posts/storyEditPolicy';
import { SoundCaptureService } from './posts/SoundCaptureService';
import { applyPostRemovalEffects } from './posts/postRemovalEffects';
import { retractReactionNotifications } from './notifications/retractReactionNotifications';
import { reproduceEditedSubjectNotifications } from './posts/reproduceEditedSubjectNotifications';
import { getSharedNotificationService } from './notifications/notification-service-registry';
import { reclaimMediaRowBytes } from './posts/reclaimPostMediaBytes';
import { extractCaptureTracks } from './posts/captureTracks';
import { mediaCaptureTracks } from './posts/mediaCaptureTracks';
import { feedsSoundLibrary } from './posts/soundEligibility';
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';
import { parseSharedPlace, type SharedPlace } from './location/sharedPlace';
import { quantizeCoordinate, type DiscoverabilityPrecision } from './location/geoDiscoverability';
import { translationTargetId } from './zmq-translation/utils/zmq-helpers';

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

/**
 * Les durées vivent dans `posts/ephemeralPosts.ts`, avec la liste des types
 * qu'elles rendent éphémères — la même que celle du balayage. Elles étaient
 * ici, en copie privée : le balayage en avait sa propre version, réduite aux
 * stories, et les statuts recevaient donc une échéance que personne n'honorait.
 */
function computeExpiresAt(type: PostType): Date | undefined {
  return ephemeralExpiresAt(type, new Date());
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
  private readonly soundCaptureService: SoundCaptureService;

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
    // Bibliothèque de sons — capture des pistes audio originales à la
    // publication d'un contenu public. Injectable pour les tests ; défaut =
    // instance câblée sur le même prisma.
    soundCaptureService?: SoundCaptureService,
  ) {
    this.postReactionService = postReactionService ?? new PostReactionService(prisma);
    this.trackingLinkService = trackingLinkService ?? new TrackingLinkService(prisma);
    this.soundCaptureService = soundCaptureService ?? new SoundCaptureService(prisma);
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
    /** Texte alternatif par média — clé = un id de `mediaIds`, ignoré sinon. */
    mediaAlt?: Record<string, string>;
    /** LÉGENDE par média (`PostMedia.caption`) — même contrat que `mediaAlt` (#4055). */
    mediaCaption?: Record<string, string>;
    mobileTranscription?: MobileTranscription;
    repostOfId?: string;
    /** Opt-in auteur : extraction de la bande-son des VIDÉOS vers la bibliothèque de sons. */
    allowSoundExtraction?: boolean;
    /** Lieu partagé — champ dédié, jamais un `metadata` brut. Validé par `parseSharedPlace`. */
    location?: unknown;
    /**
     * Découvrabilité géographique — INDÉPENDANTE de `location` ci-dessus.
     * `unknown` en défense en profondeur (même contrat que `location`) : la
     * route valide déjà l'énumération via Zod, mais ce service ne doit pas
     * supposer qu'il n'est jamais appelé autrement. Voir geoDiscoverability.ts.
     */
    discoverabilityPrecision?: unknown;
  }, userId: string) {
    const now = new Date();
    const expiresAt = ephemeralExpiresAt(data.type, now);

    // Canonicalize the client claim at the write boundary — clients send the raw
    // platform locale (iOS `fr_FR`, web `fr-FR`). `detectLanguage` already returns
    // canonical codes, so only the claim path needs normalization. Irreducible
    // codes (`bas`) fall back verbatim. Mirrors the message funnel (218/219).
    const originalLanguage = data.originalLanguage
      ? (normalizeLanguageCode(data.originalLanguage) ?? data.originalLanguage)
      : (data.content ? detectLanguage(data.content) : undefined);

    // Lieu partagé : validation stricte des coordonnées côté serveur (bornes,
    // rejet NaN/Infinity, bornage des chaînes). Chiffrement : stockage EN
    // CLAIR dans `metadata.location`, décision assumée — cf. sharedPlace.ts.
    const sharedPlace = parseSharedPlace(data.location);

    // Découvrabilité géographique — champ SÉPARÉ de `metadata.location`
    // (badge d'affichage, inchangé ci-dessus) : deux opt-in indépendants,
    // l'un n'implique jamais l'autre. Le client n'envoie JAMAIS geoPoint/
    // geoPrecision bruts : ils sont TOUJOURS calculés ici, à partir de la
    // même coordonnée exacte que `sharedPlace`, et seulement quand
    // `discoverabilityPrecision` est présent ET que la coordonnée est
    // valide. Absent (ou coordonnée invalide) => les deux champs restent
    // `null` (spec §2, geoDiscoverability.ts).
    const geoPoint = sharedPlace && data.discoverabilityPrecision !== undefined
      ? quantizeCoordinate(sharedPlace.latitude, sharedPlace.longitude, data.discoverabilityPrecision)
      : null;
    const geoPrecision = geoPoint ? (data.discoverabilityPrecision as DiscoverabilityPrecision) : null;

    let repostOfId: string | undefined;
    let originalRepostOfId: string | undefined;

    if (data.repostOfId) {
      const sourcePost = await this.prisma.post.findFirst({
        where: { id: data.repostOfId, deletedAt: NOT_DELETED },
        // `visibility`/`visibilityUserIds` sont lus pour la LOI D'AUDIENCE
        // ci-dessous — sans eux ce chemin ne pouvait rien vérifier.
        select: {
          id: true,
          repostOfId: true,
          originalRepostOfId: true,
          visibility: true,
          visibilityUserIds: true,
        },
      });
      if (!sourcePost) {
        const err: any = new Error('Repost source not found');
        err.statusCode = 404;
        throw err;
      }

      // ── Loi d'audience, seconde porte ─────────────────────────────────────
      //
      // `POST /posts` accepte `repostOfId` (« for StoryComposer publishing a
      // repost via POST /posts », schéma `CreatePostSchema`) et ne validait
      // AUCUNE audience : la source n'était lue que pour sa chaîne d'IDs. Un
      // client pouvait donc publier `{ repostOfId: <story PRIVATE>,
      // visibility: 'PUBLIC' }` et contourner intégralement la barrière de
      // `repostPost`.
      //
      // La sécurité ne peut pas dépendre de l'endpoint choisi par le client :
      // les deux portes appliquent la MÊME loi partagée. Cette faille précède
      // le lot « republication de story » (2026-08-19) — le chemin n'avait
      // simplement aucun appelant côté app ; brancher le composeur le rend
      // vivant.
      const sourceVisibility = sourcePost.visibility as PostVisibility;
      if (!isRepostVisibilityAllowed(sourceVisibility, data.visibility as PostVisibility)) {
        const err: any = new Error(
          `Repost audience ${data.visibility} is broader than the source ${sourceVisibility}`,
        );
        err.statusCode = 403;
        err.code = 'REPOST_AUDIENCE_WIDENING';
        throw err;
      }

      repostOfId = sourcePost.id;
      originalRepostOfId = (sourcePost.originalRepostOfId as string | null)
        ?? (sourcePost.repostOfId as string | null)
        ?? sourcePost.id;

      // `EXCEPT`/`ONLY` : la portée EST la liste. Elle vient de la SOURCE,
      // jamais de la requête — « même audience » avec une liste plus longue
      // est plus large.
      if (repostVisibilityInheritsAudienceList(data.visibility as PostVisibility)) {
        data = {
          ...data,
          visibilityUserIds: (sourcePost.visibilityUserIds ?? []) as string[],
        };
      }
    }

    // Règle produit (directive user 2026-08-02, étendue par la directive durée
    // minimale) : un REEL exige une composition qualifiante — vidéo (>=3s) ||
    // audio (>=3s) || >= 2 images (`qualifiesAsReel`, miroir du SDK).
    // DÉGRADATION SILENCIEUSE en POST plutôt qu'un 422 : les clients
    // antérieurs à la règle envoient `type: REEL` dès 1 média (ancienne
    // doctrine) — rejeter casserait leur publication, alors qu'un reclassement
    // en POST préserve le contenu. Un REEL sans aucun mediaId (trou
    // UnifiedPostComposer) retombe aussi sur POST. Les PostMedia sont lus AVANT
    // `post.create`, avec la MÊME garde de propriété que le rattachement plus
    // bas, pour classifier exactement ce qui sera réellement attaché.
    let effectiveType = data.type;
    if (data.type === PostType.REEL) {
      const claimableMedia = data.mediaIds?.length
        ? await this.prisma.postMedia.findMany({
            where: { id: { in: data.mediaIds }, ...claimableMediaWhere(userId) },
            select: { mimeType: true, duration: true },
          })
        : [];
      // Un son EMPRUNTÉ à la bibliothèque (piste `soundId` de storyEffects)
      // compte comme audio dans la règle de composition : un réel « son de
      // bibliothèque seul » est légitime — c'est la réutilisation d'audio.
      const borrowedEntries = qualifiesAsReel(claimableMedia)
        ? []
        : await this.borrowedSoundReelEntries(data.storyEffects, userId);
      if (!qualifiesAsReel([...claimableMedia, ...borrowedEntries])) {
        effectiveType = PostType.POST;
        log.info('createPost: REEL non qualifiant dégradé en POST', {
          authorId: userId,
          requestedMediaCount: data.mediaIds?.length ?? 0,
          claimableMediaCount: claimableMedia.length,
        });
      }
    }

    const post = await this.prisma.post.create({
      data: {
        authorId: userId,
        type: effectiveType,
        visibility: data.visibility,
        visibilityUserIds: data.visibilityUserIds ?? [],
        content: data.content,
        originalLanguage,
        communityId: data.communityId,
        storyEffects: (data.storyEffects as any) ?? undefined,
        allowSoundExtraction: data.allowSoundExtraction ?? false,
        moodEmoji: data.moodEmoji,
        audioUrl: data.audioUrl,
        audioDuration: data.audioDuration,
        expiresAt,
        ...(sharedPlace ? { metadata: { location: sharedPlace } as unknown as Prisma.InputJsonValue } : {}),
        ...(geoPoint ? { geoPoint: geoPoint as unknown as Prisma.InputJsonValue, geoPrecision } : {}),
        ...(repostOfId !== undefined ? { repostOfId, originalRepostOfId } : {}),
      },
      include: postInclude,
    });

    // Link pre-uploaded media if any
    // mediaIds contains PostMedia IDs (created directly by TUS handler with postId=null)
    if (data.mediaIds?.length) {
      // Garde de propriété : seuls les médias LIBRES et téléversés par l'auteur
      // (ou hérités, sans propriétaire connu — cf. `mediaOwnership.ts`).
      const claimed = await this.prisma.postMedia.updateMany({
        // `userId` — l'identité de la REQUÊTE — et non `post.authorId` relu de
        // l'objet créé : la garde doit dépendre de qui appelle, pas de ce que
        // l'écriture précédente a bien voulu renvoyer.
        where: { id: { in: data.mediaIds }, ...claimableMediaWhere(userId) },
        data: { postId: post.id },
      });
      const shortfall = describeClaimShortfall(data.mediaIds, claimed.count);
      if (shortfall) {
        // Jamais silencieux : un média écarté disparaît de la publication, et
        // sans cette trace le symptôme est indiscernable d'un vol réussi.
        enhancedLogger.warn(`[PostService] createPost: ${shortfall}`, {
          postId: post.id, authorId: userId, requested: data.mediaIds.length,
        });
      }

      await this.applyMediaAlt(post.id, data.mediaIds, data.mediaAlt);
      await this.applyMediaCaption(post.id, data.mediaIds, data.mediaCaption);
      // L'ordre de `mediaIds` EST l'ordre de sélection de l'utilisateur : le
      // seul site qui le connaisse. Voir `posts/mediaOrder.ts`.
      await applyMediaOrder(this.prisma, post.id, data.mediaIds);

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

    // Bibliothèque de sons : capture des pistes audio du blob storyEffects ET
    // des médias audio/vidéo attachés (posts vocaux sans storyEffects, réels
    // avec opt-in d'extraction — `collectCaptureTracks`, résiliente).
    // HORS de la garde médias — une story peut réutiliser un média déjà attaché
    // — et fire-and-forget : publier ne dépend jamais de la bibliothèque.
    const captureTracks = await this.collectCaptureTracks(
      post.id, data.storyEffects, data.allowSoundExtraction ?? false,
      Boolean(data.mediaIds?.length));
    this.soundCaptureService.captureSounds({
      postId: post.id,
      authorId: post.authorId,
      // Règle UNIQUE et partagée (PUBLIC ou COMMUNITY, jamais un repost). Elle
      // vivait dupliquée ici et dans `updatePost`, et la seconde copie avait
      // déjà été oubliée une fois — c'était la troisième porte du piège
      // d'attribution.
      feedsLibrary: feedsSoundLibrary({ visibility: data.visibility, repostOfId: data.repostOfId }),
      tracks: captureTracks,
    }).catch((err: unknown) => {
      log.error('captureSounds (createPost) a échoué', err instanceof Error ? err : new Error(String(err)), { postId: post.id });
    });

    // Déclencher la traduction Prisme pour les stories avec texte (fire-and-forget)
    if (data.type === PostType.STORY && data.content) {
      this.triggerStoryTextTranslation(post.id, data.content, userId).catch((err: unknown) => {
        log.error('triggerStoryTextTranslation failed', err instanceof Error ? err : new Error(String(err)));
      });
    }

    // Si story avec textes posés (v1 `textObjects` OU v3 `scenes[].objects[kind=text]`,
    // A7b) : remplir content comme index de recherche + déclencher traductions
    const textObjects = storyTranslatableTexts(data.storyEffects);

    if (textObjects?.length) {
      const searchContent = composeStoryContent(textObjects);

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
      ?? (textObjects?.length ? composeStoryContent(textObjects) : undefined);
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

      const storyMessageId = translationTargetId('story', postId);

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
   *  côté web dans `apps/web/lib/story-transforms.ts`).
   *
   *  L'implémentation vit dans `storyContentComposition` avec la composition de
   *  l'index dérivé : lire le texte d'un overlay et assembler le `content` sont
   *  la même règle vue de deux endroits, elles ne peuvent pas diverger. */
  static storyTextObjectText = storyTextObjectText;

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
    const detailInclude = {
      ...postInclude,
      // Le détail charge TOUTES les références, silencieuses comprises : c'est
      // `projectReferencesForViewer` qui décide de ce que CE lecteur en voit.
      // Filtrer ici priverait l'auteur de sa propre liste — et la personne
      // silencieusement nommée de la seule réponse à sa notification.
      //
      // `postMentions` est le nom de la RELATION (le schéma nomme
      // `Post.postMentions`) ; la clé exposée au client, elle, est `mentions`.
      postMentions: { select: { display: true, mentionedUser: { select: authorSelect } } },
    };
    const visible = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED, ...visibilityFilter },
      include: detailInclude,
    });

    // Un référencé HORS audience ne passe pas le filtre ci-dessus — c'est
    // pourtant lui que la référence a le droit d'amener ici : sa notification
    // le mène à CETTE ouverture, et un 404 la rendrait morte. Même relecture
    // que `recordView`, et rien de plus : le filtre reste seul maître pour un
    // lecteur anonyme, qu'aucune référence ne peut désigner.
    const post = visible ?? (viewerUserId
      ? await this.prisma.post.findFirst({
          where: { id: postId, deletedAt: NOT_DELETED },
          include: detailInclude,
        })
      : null);
    if (!post) return null;

    const { postMentions, ...bare } = post;
    const mentions = projectReferencesForViewer({
      references: toPostReferences(postMentions),
      authorId: post.authorId,
      viewerId: viewerUserId,
    });

    // Un seul `now` pour les deux branches ci-dessous : le viewer calcule
    // l'expiration en local et ne voit pas la référence — sans ce verdict dans
    // la charge utile, il refuserait d'afficher un contenu que le serveur
    // autorise.
    const now = new Date();

    // Le verdict est résolu ICI, avant tout enrichissement, parce qu'il décide
    // aussi de l'OUVERTURE : hors audience, seule une référence encore vivante
    // ouvre le contenu. Une LECTURE ne dépense jamais rien — `attachReferenceAccess`
    // lit, la consommation reste l'affaire de `POST /posts/:postId/view`.
    const accessed = await attachReferenceAccess({
      prisma: this.prisma,
      post: bare,
      viewerId: viewerUserId,
      now,
    });
    if (!visible && accessed.referenceAccess !== 'granted') return null;

    // Anonymous read: no viewer-specific state to resolve.
    if (!viewerUserId) {
      return {
        ...accessed,
        mentions,
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
    //
    // Repost simple → racine (chantier reposts cohérents & watermark, tâche
    // 9) : `isLikedByMe`/`currentUserReactions` d'un repost `isQuote:false`
    // reflètent l'état de l'utilisateur sur sa RACINE (`originalRepostOfId ??
    // repostOfId`), jamais sur le repost lui-même — un repost simple n'a pas
    // de vie sociale propre. Une citation garde son propre état. Bookmark et
    // `isRepostedByMe` restent ceux du post AFFICHÉ, inchangés.
    //
    // EXCLUSION ÉPHÉMÈRE (review task-9, critique #1, miroir de
    // `resolveRedirectTarget` dans postVisibility.ts) : quand la racine est
    // une STORY/STATUS, ce repost porte son propre instantané et garde donc
    // SA PROPRE vie sociale — sinon la lecture (ce flag) et l'écriture
    // (like/unlike, désormais posés sur le repost lui-même) divergeraient :
    // « j'ai liké mais ça s'affiche en non-liké ». `post.repostOf.type`
    // (déjà chargé par `postInclude`) suffit : un repost simple non-citation
    // a toujours `repostOf` renseigné, et c'est la RACINE elle-même pour la
    // très large majorité des reposts (chaîne d'un seul niveau).
    const repostRootIsEphemeral = post.repostOf != null && isEphemeralPostType(post.repostOf.type);
    const reactionRootId = (!post.isQuote && post.repostOfId && !repostRootIsEphemeral)
      ? (post.originalRepostOfId ?? post.repostOfId)
      : post.id;

    const [userReactions, viewerBookmark, viewerRepostCount] = await Promise.all([
      this.prisma.postReaction.findMany({
        where: { userId: viewerUserId, postId: reactionRootId },
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
      ...accessed,
      mentions,
      currentUserReactions,
      isLikedByMe: currentUserReactions.length > 0,
      isBookmarkedByMe: viewerBookmark !== null,
      isRepostedByMe: viewerRepostCount > 0,
    };
  }

  /**
   * Enregistre le téléchargement des médias d'un poste par un utilisateur.
   *
   * ACL — c'est le filtre de VISIBILITÉ qui s'applique, pas celui
   * d'interaction : enregistrer un média est un acte de consommation, donc si
   * l'utilisateur a pu afficher le média il doit pouvoir l'enregistrer.
   * `canUserViewPost` (amis stricts) refuserait le téléchargement d'un média
   * affiché à l'écran d'un contact DM — l'asymétrie voir ⊇ interagir est
   * documentée dans `services/posts/postVisibility.ts`.
   *
   * Retourne `null` si le poste est introuvable, supprimé OU invisible : les
   * trois cas sont indiscernables par construction (le filtre fait partie du
   * `where`), et c'est voulu — distinguer révélerait l'existence du poste.
   *
   * ORDRE D'ÉCRITURE : événements d'abord, compteurs ensuite. Le gateway
   * n'utilise pas de transaction ; une panne entre les deux laisse le compteur
   * en retard sur l'historique, ce qui se recalcule. L'ordre inverse
   * produirait un compteur en avance, irréparable.
   */
  async recordMediaDownloads(
    postId: string,
    userId: string,
    input: { mediaIds: string[]; surface: string },
  ): Promise<{ recorded: number } | null> {
    const visibilityFilter = await this.buildVisibilityFilter(userId);
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED, ...visibilityFilter },
      select: { id: true },
    });
    if (!post) return null;

    // Déduplication AVANT toute écriture : `updateMany` + `in` ne matche
    // qu'une fois un id répété, donc un batch non dédupliqué écrirait N lignes
    // d'historique pour un seul incrément de compteur — divergence silencieuse
    // et définitive entre les deux.
    const requestedIds = Array.from(new Set(input.mediaIds));

    // Seuls les médias réellement attachés à CE poste sont retenus. Un client
    // dont le cache est en retard sur une édition ne doit pas voir tout son
    // batch rejeté pour un média détaché entre-temps.
    const ownedMedia = await this.prisma.postMedia.findMany({
      where: { id: { in: requestedIds }, postId },
      select: { id: true },
    });
    const mediaIds = ownedMedia.map((m) => m.id);
    if (mediaIds.length === 0) return { recorded: 0 };

    await this.prisma.postMediaDownload.createMany({
      data: mediaIds.map((mediaId) => ({
        postId,
        mediaId,
        userId,
        surface: input.surface,
      })),
    });

    await this.prisma.postMedia.updateMany({
      where: { id: { in: mediaIds } },
      data: { downloadCount: { increment: 1 } },
    });

    // +1 par ACTION, jamais par média : ce compteur répond à « combien de fois
    // ce poste a-t-il été enregistré ».
    await this.prisma.post.update({
      where: { id: postId },
      data: { downloadCount: { increment: 1 } },
    });

    return { recorded: mediaIds.length };
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

  /**
   * Applique le texte alternatif (accessibilité) fourni par le client aux
   * médias qu'il vient RÉELLEMENT de rattacher à `postId`.
   *
   * Deux gardes, pas une :
   * - `mediaAlt` est filtré aux clés présentes dans `requestedMediaIds` — un
   *   id absent de la carte de la requête est ignoré, jamais interprété
   *   comme « touche un média que l'appelant n'a pas nommé » ;
   * - le `where` porte `postId` (déjà réécrit par le claim qui précède cet
   *   appel) — un id dont le claim a échoué (propriété refusée) garde son
   *   ancien `postId` et cette clause ne le trouve pas, donc ne le modifie
   *   pas. Pas de second contrôle de propriété à dupliquer ici.
   *
   * Une chaîne vide EFFACE `alt` (`null`) plutôt que de laisser une valeur
   * strictement vide sur le fil : cohérent avec `caption`/`content`, où le
   * client retire un texte en envoyant `''`, jamais en omettant la clé.
   */
  private async applyMediaAlt(
    postId: string,
    requestedMediaIds: string[] | undefined,
    mediaAlt: Record<string, string> | undefined,
    client: Pick<PrismaClient, 'postMedia'> = this.prisma,
  ): Promise<void> {
    await this.applyMediaText('alt', postId, requestedMediaIds, mediaAlt, client);
  }

  /**
   * LÉGENDE par média (`PostMedia.caption`) — jumelle exacte d'`applyMediaAlt`,
   * et c'est pour cela qu'elles partagent leur corps (#4055).
   *
   * La colonne existait, était SERVIE (`postIncludes.ts`) et n'était écrite par
   * PERSONNE : ni les routes, ni iOS, ni le web. Un champ rendu que rien ne
   * remplit — donc une promesse de contrat qu'aucun client ne peut tenir.
   *
   * Elle porte, en profil Post, la légende de CE média — distincte du `content`
   * du post, qui reste celui de la publication (modèle § 3). Les deux textes ont
   * des sujets différents : le premier décrit une image, le second dit ce que
   * l'auteur publie.
   */
  private async applyMediaCaption(
    postId: string,
    requestedMediaIds: string[] | undefined,
    mediaCaption: Record<string, string> | undefined,
    client: Pick<PrismaClient, 'postMedia'> = this.prisma,
  ): Promise<void> {
    await this.applyMediaText('caption', postId, requestedMediaIds, mediaCaption, client);
  }

  /**
   * Le corps PARTAGÉ des deux appliqueurs de texte par média.
   *
   * EXTRAIT plutôt que recopié : `alt` et `caption` portent exactement les mêmes
   * deux gardes, la même normalisation du vide et la même borne. Deux copies
   * auraient divergé au premier ajustement de l'une — et c'est le genre de
   * divergence qu'aucun témoin ne voit, puisque chaque copie reste cohérente
   * avec elle-même.
   *
   * La colonne est un paramètre LITTÉRAL, pas une chaîne : le compilateur refuse
   * tout nom qui n'est pas l'un des deux, si bien qu'aucun appelant ne peut
   * écrire dans une colonne voisine par faute de frappe.
   */
  private async applyMediaText(
    column: 'alt' | 'caption',
    postId: string,
    requestedMediaIds: string[] | undefined,
    texts: Record<string, string> | undefined,
    client: Pick<PrismaClient, 'postMedia'>,
  ): Promise<void> {
    if (!texts || !requestedMediaIds?.length) return;
    const requested = new Set(requestedMediaIds);
    const entries = Object.entries(texts).filter(([id]) => requested.has(id));
    if (entries.length === 0) return;
    await Promise.all(entries.map(([id, text]) =>
      client.postMedia.updateMany({
        where: { id, postId },
        data: { [column]: text.trim().length > 0 ? text : null },
      }),
    ));
  }

  /**
   * Pistes de capture COMPLÈTES d'un post : celles du blob `storyEffects`
   * (composer riche) + celles synthétisées depuis ses médias attachés (posts
   * vocaux sans blob, vidéos sous opt-in d'extraction). Les médias déjà
   * référencés par une piste du blob restent à cette piste-là
   * (`mediaCaptureTracks` les exclut).
   */
  private async collectCaptureTracks(
    postId: string,
    storyEffects: Record<string, unknown> | undefined,
    allowVideoExtraction: boolean,
    /** Épargne la lecture Prisma quand l'appelant SAIT qu'aucun média n'est attaché. */
    hasAttachedMedia: boolean,
  ) {
    const effectTracks = extractCaptureTracks(storyEffects);
    if (!hasAttachedMedia) return effectTracks;
    try {
      const media = await this.prisma.postMedia.findMany({
        where: { postId },
        select: { id: true, mimeType: true, duration: true },
      });
      return [
        ...effectTracks,
        ...mediaCaptureTracks({ media, storyEffectsTracks: effectTracks, allowVideoExtraction }),
      ];
    } catch (error) {
      // RÉSILIENTE : publier/éditer ne dépend jamais de la bibliothèque. Sans
      // la lecture des médias, les pistes du blob restent capturables.
      log.error('collectCaptureTracks: lecture des médias impossible',
        error instanceof Error ? error : new Error(String(error)), { postId });
      return effectTracks;
    }
  }

  /**
   * Entrées « audio » synthétiques pour `qualifiesAsReel` : les sons EMPRUNTÉS
   * du blob (pistes `soundId`), avec la même garde d'autorisation que
   * `recordBorrowed` — un son privé d'autrui ou coupé ne qualifie pas plus un
   * réel qu'il ne se laisse emprunter.
   */
  private async borrowedSoundReelEntries(
    storyEffects: Record<string, unknown> | undefined,
    authorId: string,
  ): Promise<Array<{ mimeType: string; duration: number | null }>> {
    const soundIds = extractCaptureTracks(storyEffects)
      .map((t) => t.soundId)
      .filter((id): id is string => Boolean(id));
    if (soundIds.length === 0) return [];
    const sounds = await this.prisma.sound.findMany({
      where: { id: { in: soundIds } },
      select: { durationMs: true, isPublic: true, uploaderId: true, mutedAt: true },
    });
    return sounds
      .filter((s) => !s.mutedAt && (s.isPublic || s.uploaderId === authorId))
      .map((s) => ({ mimeType: 'audio/mp4', duration: s.durationMs ?? null }));
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
    mediaIds?: string[];
    /** Texte alternatif par média — clé = un id de `mediaIds`, ignoré sinon. */
    mediaAlt?: Record<string, string>;
    /** LÉGENDE par média — même contrat que `mediaAlt` (#4055). */
    mediaCaption?: Record<string, string>;
    /** Opt-in extraction bande-son vidéo — `undefined` = inchangé. */
    allowSoundExtraction?: boolean;
    /// Tri-état : `undefined` = inchangé, `null` = retirer, objet = remplacer.
    /// Déjà validé par `parseSharedPlace` côté route — jamais un bloc client brut.
    location?: SharedPlace | null;
  }) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
      // `mimeType`/`duration` alimentent la règle de composition REEL
      // (`qualifiesAsReel`, y compris le plancher de durée 3s) sur la liste
      // FINALE des médias — Prisma `select` : tout champ vérifié DOIT y
      // figurer.
      // `fileUrl`/`thumbnailUrl` : les octets des médias RETIRÉS par cette
      // édition, lus ICI parce qu'après la transaction plus aucune ligne ne
      // dira où ils sont (cf. `reclaimMediaRowBytes`). Coût nul — la requête
      // partait de toute façon.
      include: {
        media: {
          select: {
            id: true,
            mimeType: true,
            duration: true,
            fileUrl: true,
            thumbnailUrl: true,
          },
        },
      },
    });

    if (!post) return null;
    if (post.authorId !== userId) {
      throw new Error('FORBIDDEN');
    }

    // The edit-only fields are handled explicitly below; keep them out of the
    // blind spread so they are never written unconditionally.
    const { type: requestedType, originalLanguage: requestedLanguage, removeMediaIds, mediaIds, mediaAlt, mediaCaption, location: locationUpdate, ...rest } = data;

    const updateData: any = {
      ...rest,
      visibility: data.visibility,
      storyEffects: (data.storyEffects as any) ?? undefined,
      isEdited: true,
    };
    if (data.visibilityUserIds !== undefined) {
      updateData.visibilityUserIds = data.visibilityUserIds;
    }

    // Lieu à l'édition : merge NON destructif de metadata — les autres blocs
    // à autorité serveur (postReplyTo, trackingLinks…) sont préservés.
    // `null` retire le bloc, un objet le remplace, absent ne touche à rien.
    if (locationUpdate !== undefined) {
      const baseMetadata: Record<string, unknown> =
        post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata)
          ? { ...(post.metadata as Record<string, unknown>) }
          : {};
      if (locationUpdate === null) {
        delete baseMetadata['location'];
      } else {
        baseMetadata['location'] = locationUpdate as unknown as Record<string, unknown>;
      }
      updateData.metadata = baseMetadata;
    }

    // Only remove media that actually belongs to this post — an id pointing at
    // another post's media is silently ignored (never cross-deletes).
    const ownMediaIds = new Set(post.media.map((m) => m.id));
    const mediaIdsToRemove = (removeMediaIds ?? []).filter((id) => ownMediaIds.has(id));
    const mediaIdsToAttach = mediaIds ?? [];
    const finalType = requestedType ?? post.type;

    // Liste FINALE des médias après édition : (médias du post − retraits) +
    // fraîchement téléversés. Les mimeTypes des ajouts sont MATÉRIALISÉS ici,
    // avec la même garde de propriété que le rattachement dans la transaction,
    // pour que la règle de composition juge ce qui sera réellement attaché.
    const removalSet = new Set(mediaIdsToRemove);
    const attachedMedia = mediaIdsToAttach.length > 0
      ? await this.prisma.postMedia.findMany({
          where: { id: { in: mediaIdsToAttach }, ...claimableMediaWhere(userId) },
          select: { mimeType: true, duration: true },
        })
      : [];
    const finalMedia = [
      ...post.media.filter((m) => !removalSet.has(m.id)),
      ...attachedMedia,
    ];

    // Type switch is limited to POST <-> REEL on the author's OWN original post:
    // never on a repost (it mirrors its source) and never to/from STORY/STATUS
    // (their expiry/lifecycle is not managed by the edit flow). Switching to a
    // REEL requires a qualifying composition — see the guard below.
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

    // Règle produit (directive user 2026-08-02, étendue par la directive durée
    // minimale) : un REEL doit rester QUALIFIANT — vidéo (>=3s) || audio
    // (>=3s) || >= 2 images (`qualifiesAsReel`) — après retraits/ajouts, qu'il
    // soit basculé en REEL ou qu'il le reste. Le 422 ne
    // vaut que quand l'édition TOUCHE le type ou la composition : une édition
    // de texte seule sur un REEL hérité non conforme (corpus pré-backfill,
    // ex. 1 image) doit continuer de passer — le backfill
    // `reclassify-nonqualifying-reels-to-post.ts` reclasse ce corpus.
    const editTouchesComposition =
      requestedType !== undefined || mediaIdsToRemove.length > 0 || mediaIdsToAttach.length > 0;
    if (finalType === PostType.REEL && editTouchesComposition && !qualifiesAsReel(finalMedia)) {
      // Même extension qu'à la création : un son EMPRUNTÉ (piste `soundId` du
      // blob effectif — celui de l'édition, sinon celui en base) compte comme
      // audio dans la composition.
      const effectiveEffects = data.storyEffects
        ?? (post.storyEffects as Record<string, unknown> | null) ?? undefined;
      const borrowedEntries = await this.borrowedSoundReelEntries(effectiveEffects, userId);
      if (!qualifiesAsReel([...finalMedia, ...borrowedEntries])) {
        // Assertion locale justifiée : porte le `statusCode` que la route
        // traduit en 422 INVALID_POST_UPDATE — sans élargir le type en `any`.
        const err = new Error('A reel requires a video, an audio, or at least two images') as Error & { statusCode: number };
        err.statusCode = 422;
        throw err;
      }
    }

    // A language change re-runs the Prisme translation pipeline from the new
    // source language and discards the now-stale translations. Fire-and-forget
    // like the create path; the client re-hydrates as ZMQ results land.
    // Canonicalize the claim before comparing — a regional variant of the stored
    // language (`fr-FR` vs stored `fr`) is NOT a language change and must not wipe
    // valid translations nor relaunch ZMQ jobs. Irreducible codes fall back verbatim.
    const requestedCanonical =
      requestedLanguage !== undefined
        ? (normalizeLanguageCode(requestedLanguage) ?? requestedLanguage)
        : undefined;
    const languageChanged =
      requestedCanonical !== undefined && requestedCanonical !== post.originalLanguage;
    if (languageChanged) {
      updateData.originalLanguage = requestedCanonical;
      updateData.translations = {};
    }

    // Editing a published story's CONTENT restarts its life (directive
    // 2026-07-29): views, reactions and impressions are wiped — rows,
    // denormalized counters AND embedded JSON mirrors — so every viewer sees
    // the story as new again. The publication date never moves: createdAt and
    // expiresAt are absent from updateData. Metadata-only updates (visibility)
    // leave engagement untouched. Same predicate as the route's broadcast flag.
    const editedTextObjects = storyTranslatableTexts(data.storyEffects);
    const storyContentEdit = post.type === PostType.STORY && storyContentEditRequested(data);
    if (storyContentEdit) {
      // `updatedAt` bouge sur CHAQUE écriture (compteurs de vues inclus) —
      // ce champ dédié est le SEUL horodatage fiable pour que les clients
      // fassent céder leur garde « viewed monotone » après cette édition.
      updateData.contentEditedAt = new Date();
      updateData.viewCount = 0;
      updateData.impressionCount = 0;
      updateData.reactionCount = 0;
      updateData.likeCount = 0;
      updateData.reactionSummary = {};
      updateData.reactions = [];
      updateData.storyViews = [];
      // Text changed → the existing translations describe the OLD content.
      // (languageChanged already wiped them with the new source language.)
      if (!languageChanged) {
        updateData.translations = {};
      }
      // Keep the search index in sync when the composition carries the text
      // (same rule as createPost: content mirrors the textObjects).
      if (data.content === undefined && editedTextObjects?.length) {
        const searchContent = composeStoryContent(editedTextObjects);
        if (searchContent) {
          updateData.content = searchContent;
        }
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (mediaIdsToRemove.length > 0) {
        await tx.postMedia.deleteMany({ where: { id: { in: mediaIdsToRemove }, postId } });
      }
      // Attach freshly uploaded media (TUS creates PostMedia with postId=null).
      // `userId` est déjà vérifié comme auteur du post plus haut : la garde
      // limite le rattachement à SES propres téléversements.
      if (mediaIdsToAttach.length > 0) {
        const claimed = await tx.postMedia.updateMany({
          where: { id: { in: mediaIdsToAttach }, ...claimableMediaWhere(userId) },
          data: { postId },
        });
        const shortfall = describeClaimShortfall(mediaIdsToAttach, claimed.count);
        if (shortfall) {
          enhancedLogger.warn(`[PostService] updatePost: ${shortfall}`, { postId, authorId: userId });
        }
        await this.applyMediaAlt(postId, mediaIdsToAttach, mediaAlt, tx);
        await this.applyMediaCaption(postId, mediaIdsToAttach, mediaCaption, tx);
        await applyMediaOrder(tx, postId, mediaIdsToAttach);
      }
      if (storyContentEdit) {
        await tx.postView.deleteMany({ where: { postId } });
        await tx.postReaction.deleteMany({ where: { postId } });
        await tx.postImpression.deleteMany({ where: { postId } });
      }
      return tx.post.update({
        where: { id: postId },
        data: updateData,
        include: postInclude,
      });
    });

    // Les octets des médias que l'édition vient de retirer. APRÈS le commit,
    // et c'est l'inverse de l'ordre du balayage : ici la transaction peut
    // encore échouer, et effacer avant elle détruirait les fichiers de lignes
    // qui survivent. Les chemins sont lus plus haut, sur le `post` chargé —
    // après le commit, aucune ligne ne les porte plus.
    //
    // BEST-EFFORT, contrairement au balayage qui rejette : là-bas renoncer
    // repousse la destruction à la passe suivante ; ici les lignes sont DÉJÀ
    // parties, donc rejeter transformerait une édition réussie en 500 sans
    // rien récupérer.
    if (mediaIdsToRemove.length > 0) {
      const doomed = post.media.filter((m) => removalSet.has(m.id));
      await reclaimMediaRowBytes(this.prisma, this.mediaService, doomed).catch((err: unknown) => {
        log.warn('[PostService] updatePost: media byte reclamation failed', { postId, err });
      });
    }

    // Les notifications que le post a produites portent une copie DÉNORMALISÉE
    // de son texte, qu'aucune lecture ne rafraîchit — la ligne ne relit jamais
    // le post. Sans cette réécriture, l'inbox de toute l'audience garde le
    // texte d'AVANT, définitivement, y compris quand l'édition existait
    // précisément pour retirer ce qui n'aurait pas dû être publié.
    //
    // La source est le contenu PERSISTÉ (`updated.content`) et non celui de la
    // requête : les deux diffèrent dès qu'une story recompose son texte
    // (`composeStoryContent`), et c'est le persisté que le destinataire verra
    // en ouvrant le post.
    //
    // BEST-EFFORT, comme la reprise d'octets ci-dessus : l'édition est déjà
    // committée, et une ligne récalcitrante ne doit pas la transformer en 500.
    await reproduceEditedSubjectNotifications(
      this.prisma,
      { subject: { kind: 'post', id: postId }, content: updated.content },
      getSharedNotificationService()
    ).catch((err: unknown) => {
      log.warn('[PostService] updatePost: notification reproduction failed', { postId, err });
    });

    if (languageChanged) {
      const content = data.content ?? post.content;
      if (content) {
        this.triggerStoryTextTranslation(postId, content, userId, requestedCanonical).catch((err: unknown) => {
          log.error('triggerStoryTextTranslation failed on update', err instanceof Error ? err : new Error(String(err)));
        });
      }
    }

    // Re-run the Prisme pipeline over the edited story text — mirrors
    // createPost. Fire-and-forget; clients re-hydrate as ZMQ results land.
    // The languageChanged branch above already covers the plain-content case
    // with an explicit source override, so only fill the gaps here.
    if (storyContentEdit) {
      if (!languageChanged && data.content) {
        this.triggerStoryTextTranslation(postId, data.content, userId, post.originalLanguage ?? undefined)
          .catch((err: unknown) => {
            log.error('triggerStoryTextTranslation failed on story edit', err instanceof Error ? err : new Error(String(err)));
          });
      }
      if (editedTextObjects?.length) {
        this.triggerStoryTextObjectTranslation(postId, editedTextObjects, userId).catch((err: unknown) => {
          log.error('triggerStoryTextObjectTranslation failed on story edit', err instanceof Error ? err : new Error(String(err)));
        });
      }
    }

    // Édition : même contrat qu'à la création. Le service retire aussi les
    // usages des pistes disparues, sinon elles surcompteraient pour toujours.
    //
    // GARDE 1 — l'édition ne repasse par la capture que si elle EXPRIME quelque
    // chose sur les sons : blob `storyEffects` envoyé, composition média
    // touchée, ou bascule de l'opt-in d'extraction. Et quand le blob n'est PAS
    // envoyé, les pistes sont relues du blob EN BASE (`updated.storyEffects`) :
    // un changement d'audience seul ne doit jamais faire croire « plus aucune
    // piste » et supprimer les usages d'une story qui joue toujours son audio.
    //
    // GARDE 2 — repost : troisième porte du piège d'attribution.
    // `repostPost` snapshotte les médias de la source SOUS le reposteur ; un PUT
    // sur le repost passerait donc le scope `postId` et créerait un `Sound`
    // crédité au reposteur avec l'audio d'autrui. `feedsSoundLibrary` renvoie
    // false sur tout repost, et `captureSounds` libère alors les usages.
    if (data.storyEffects !== undefined || editTouchesComposition || data.allowSoundExtraction !== undefined) {
      const effectiveEffects = data.storyEffects
        ?? (updated.storyEffects as Record<string, unknown> | null) ?? undefined;
      const editedTracks = await this.collectCaptureTracks(
        updated.id, effectiveEffects, updated.allowSoundExtraction === true,
        finalMedia.length > 0);
      this.soundCaptureService.captureSounds({
        postId: updated.id,
        authorId: updated.authorId,
        feedsLibrary: feedsSoundLibrary({ visibility: updated.visibility, repostOfId: updated.repostOfId }),
        tracks: editedTracks,
      }).catch((err: unknown) => {
        log.error('captureSounds (updatePost) a échoué', err instanceof Error ? err : new Error(String(err)), { postId: updated.id });
      });
    }

    return updated;
  }

  /**
   * Republication d'une STORY par son auteur : la MÊME story repart avec une
   * date de publication fraîche (`createdAt = now`, `expiresAt = now + TTL`)
   * et un engagement remis à zéro — mêmes effacements que l'édition de contenu
   * (`storyContentEdit`) : la story « recommence » pour tous, `contentEditedAt`
   * fait céder la garde « viewed monotone » des clients. Aucun nouveau Post,
   * aucune duplication de PostMedia : c'est l'archive de l'auteur (les stories
   * ne sont plus jamais détruites) qui redevient publique.
   *
   * Retourne le post rechargé avec l'include canonique (prêt pour le
   * broadcast `story:created` qui la re-fanne dans les trays), `null` si la
   * story n'existe pas/plus, jette `FORBIDDEN` (non-auteur) ou `NOT_A_STORY`.
   */
  async republishStory(postId: string, userId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
      select: { id: true, authorId: true, type: true },
    });
    if (!post) return null;
    if (post.authorId !== userId) throw new Error('FORBIDDEN');
    if (post.type !== PostType.STORY) throw new Error('NOT_A_STORY');

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.postView.deleteMany({ where: { postId } });
      await tx.postReaction.deleteMany({ where: { postId } });
      await tx.postImpression.deleteMany({ where: { postId } });
      await tx.post.update({
        where: { id: postId },
        data: {
          createdAt: now,
          expiresAt: ephemeralExpiresAt(PostType.STORY, now),
          contentEditedAt: now,
          viewCount: 0,
          impressionCount: 0,
          reactionCount: 0,
          likeCount: 0,
          reactionSummary: {},
          reactions: [],
          storyViews: [],
        },
      });
    });

    return this.prisma.post.findFirst({
      where: { id: postId },
      include: postInclude,
    });
  }

  /**
   * Soft-delete d'un poste.
   *
   * Auteur : toujours autorisé. Modérateur et plus : autorisé sur le poste
   * d'autrui, avec une ligne AdminAuditLog. Un modérateur ne peut PAS modifier
   * un poste — réécrire le texte de quelqu'un sous sa signature casserait
   * l'intégrité du contenu ; `updatePost` reste réservé à l'auteur.
   */
  async deletePost(postId: string, actorId: string, options: { actorRole: string; reason?: string }) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
    });

    if (!post) return null;

    const isAuthor = post.authorId === actorId;
    const canModerate = ['BIGBOSS', 'ADMIN', 'MODERATOR'].includes(options.actorRole);
    if (!isAuthor && !canModerate) {
      throw new Error('FORBIDDEN');
    }

    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: { deletedAt: new Date() },
    });

    // Audit, liens de partage, usages de sons : la liste vit dans
    // `applyPostRemovalEffects`, partagée avec `DELETE /admin/posts/:postId`
    // qui retire le même objet. La tenir ici en double a coûté trois cycles
    // d'omissions découvertes une par une côté console.
    await applyPostRemovalEffects(
      this.prisma,
      post,
      { id: actorId, reason: options.reason },
      this.soundCaptureService
    );

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

  /**
   * Retire UNE réaction du lecteur sur un post.
   *
   * `emoji` FOURNI ⇒ c'est celui-là qui part, exactement — le client connaît
   * sa propre pile. ABSENT ⇒ la PLUS RÉCENTE part, ce que la règle produit
   * appelle « la dernière posée » : re-toucher pèle la pile une par une,
   * jusqu'à n'en plus avoir.
   *
   * Le tri n'est donc pas cosmétique, c'est la règle elle-même. Sans lui,
   * `userReactions[0]` prenait un élément d'un ensemble NON ORDONNÉ — en
   * pratique l'ordre naturel de la collection, donc la PLUS ANCIENNE — et cet
   * emoji alimente ensuite `post:unliked` / `story:unreacted` /
   * `status:unreacted` : un client optimiste qui retirait un pouce s'entendait
   * annoncer le départ d'un cœur, et se désynchronisait sur un geste RÉUSSI.
   * Le `findMany` SUIVANT de cette même fonction portait déjà son `orderBy` :
   * l'omission était ISOLÉE.
   *
   * Rend `null` si le post n'existe pas ; sinon une enveloppe
   * `{ id, post, removedEmoji }` où `removedEmoji` est la réaction RÉELLEMENT
   * retirée, ou `null` quand il n'y en avait aucune à retirer — pile vide, ou
   * emoji désigné que le lecteur n'a pas posé. Le geste reste idempotent.
   *
   * L'enveloppe existe pour ce seul champ : `foundEmoji` ne se lit qu'ICI,
   * avant la suppression de la ligne `PostReaction`, et il n'est reconstructible
   * nulle part en aval. La route en a besoin pour DIRE quel emoji est parti —
   * elle en fabriquait un ('❤️') faute de l'avoir. `id` est repris du post :
   * c'est l'identité que `withMutationLog` journalise (`T & { id: string }`).
   */
  async unlikePost(postId: string, userId: string, emoji?: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
      include: postInclude,
    });
    if (!post) return null;

    // L'emoji demandé restreint la pile ; son absence la laisse entière. Dans
    // les deux cas le tri décroissant fait de la tête la réaction à retirer :
    // la désignée, ou la plus récente.
    const requestedEmoji = emoji?.trim();
    const userReactions = await this.prisma.postReaction.findMany({
      where: { postId, userId, ...(requestedEmoji ? { emoji: requestedEmoji } : {}) },
      select: { userId: true, emoji: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    if (userReactions.length === 0) return { id: post.id, post, removedEmoji: null };

    const foundEmoji = userReactions[0].emoji;
    await this.postReactionService.removeReaction({ postId, userId, emoji: foundEmoji });

    // La notification que le like avait produite (`post_like` /
    // `story_reaction` / `status_reaction`) n'a plus de sujet. Le retrait vit
    // ICI et non dans la route, pour la même raison que l'enveloppe ci-dessus :
    // `foundEmoji` — la réaction RÉELLEMENT retirée — n'existe qu'à cet endroit.
    // L'annonceur par défaut est le service PARTAGÉ du processus (le seul
    // câblé avec `io`), exactement comme `applyPostRemovalEffects`.
    try {
      await retractReactionNotifications(
        this.prisma,
        { subject: { kind: 'post', id: postId }, actorId: userId, emoji: foundEmoji },
        getSharedNotificationService()
      );
    } catch (err) {
      // Le retrait est un EFFET du dé-like, jamais sa condition : la réaction
      // est déjà partie de la base.
      log.warn('post unlike: notification retraction failed', { postId, userId, err });
    }

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

    const refreshed = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
      include: postInclude,
    });

    // Le post a été relu après le retrait ; s'il a disparu entre-temps, la
    // ligne d'origine reste la meilleure description de ce qui a été retiré.
    return { id: post.id, post: refreshed ?? post, removedEmoji: foundEmoji };
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
   * Dédup + incrément d'UN post : singleton `PostView` (postId,userId) + `viewCount`
   * au premier insert, `duration` promue au max sur ré-ouverture. Factorisé hors de
   * `recordView` pour être appliqué IDENTIQUEMENT au post affiché ET, pour un
   * repost, à la racine créditée ci-dessous — même mécanique de dédup, aucune
   * règle nouvelle inventée pour la racine.
   */
  private async creditPostView(
    postId: string,
    userId: string,
    safeDuration: number | undefined,
  ): Promise<boolean> {
    const existing = await this.prisma.postView.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (existing) {
      if (safeDuration !== undefined) {
        // Le PostView est un singleton (postId,userId) : `duration` est le
        // signal watch-time du moteur reco/monétisation (cf. PostFeedService).
        // Une ré-ouverture plus courte (retap + swipe immédiat) ne doit JAMAIS
        // rétrograder la plus longue durée déjà observée — on conserve le max.
        const nextDuration = Math.max(existing.duration ?? 0, safeDuration);
        if (nextDuration !== existing.duration) {
          await this.prisma.postView.update({
            where: { id: existing.id },
            data: { duration: nextDuration },
          });
        }
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
  }

  /**
   * Enregistre une vue. Retourne `true` UNIQUEMENT lors de la première vue
   * réelle du post AFFICHÉ (création du PostView) — permet à l'appelant de ne
   * déclencher les effets de bord coûteux « une fois » (ex : marquer les
   * notifications du post comme lues) sans les rejouer à chaque impression
   * répétée du feed. Le crédit de la racine (ci-dessous) n'influence JAMAIS
   * cette valeur de retour.
   *
   * Repost (chantier reposts cohérents & watermark, tâche 1) : quand le post
   * visionné pointe vers un original (`repostOfId`), la RACINE de la chaîne
   * (`originalRepostOfId ?? repostOfId` — jamais le parent intermédiaire) est
   * créditée EN PLUS via `creditPostView`, donc avec EXACTEMENT les mêmes
   * règles de dédup que le post affiché — y compris le MÊME filtre de
   * visibilité que le post affiché (une racine FRIENDS-only repostée en
   * PUBLIC reste inaccessible à un inconnu : sans ce filtre, n'importe qui
   * pourrait créditer/exposer un original privé via son repost public).
   *
   * Chaque crédit (affiché, racine) est gardé INDÉPENDAMMENT par le même
   * invariant anti-auto-inflation : l'auteur d'UN post donné n'inflate jamais
   * SON PROPRE compteur en le consultant. Un reposteur qui revisionne son
   * propre repost ne gonfle donc pas ce repost, mais reste un viewer légitime
   * de l'ORIGINAL — dont l'auteur diffère — et crédite bien la racine.
   *
   * RÉFÉRENCES (2026-08-19) : cette route est aussi le SEUL acte qui dépense le
   * droit qu'une référence ouvre sur un contenu expiré. Elle l'est parce
   * qu'elle est DÉCLARÉE — la vue est affirmée par le client au moment où il
   * affiche. Poser la consommation sur une lecture l'aurait dépensée avant tout
   * affichage : la NSE préfetche le post à la réception de la notification, la
   * revalidation cache-first relit derrière, le pull-to-refresh relit encore.
   * Le crédit de la RACINE, lui, garde le filtre d'audience : une référence
   * posée sur un repost n'ouvre pas l'original.
   */
  async recordView(postId: string, userId: string, duration?: number): Promise<boolean> {
    try {
      // Enforce visibility before recording — without this, any authenticated
      // user could increment viewCount on any private story by ID, and have
      // their userId surface in the author's `/posts/:id/views` response
      // (information disclosure + view inflation).
      const visibilityFilter = await this.buildVisibilityFilter(userId);
      const VIEW_SELECT = {
        id: true, authorId: true, repostOfId: true, originalRepostOfId: true,
        type: true, expiresAt: true,
      } as const;
      const post = await this.prisma.post.findFirst({
        where: { id: postId, deletedAt: NOT_DELETED, ...visibilityFilter },
        select: VIEW_SELECT,
      });

      // Un référencé HORS audience ne passe pas le filtre ci-dessus — c'est
      // pourtant lui que la référence a le droit d'amener ici. On relit sans
      // filtre, et seule la référence décide.
      const target = post ?? await this.prisma.post.findFirst({
        where: { id: postId, deletedAt: NOT_DELETED },
        select: VIEW_SELECT,
      });
      if (!target) return false;

      const now = new Date();
      const referencePost = { id: target.id, type: target.type, expiresAt: target.expiresAt };
      const access = await resolveReferenceAccess({
        prisma: this.prisma,
        post: referencePost,
        viewerId: userId,
        now,
      });

      // Ni membre de l'audience, ni référencé : rien à enregistrer.
      if (!post && access !== 'granted') return false;
      if (access === 'consumed') return false;

      // La vue DÉCLARÉE est le seul acte qui dépense le droit. Une lecture ne
      // consomme jamais rien — la NSE préfetche, le cache revalide, le
      // pull-to-refresh relit.
      if (access === 'granted') {
        await consumeReferenceView({
          prisma: this.prisma,
          post: referencePost,
          viewerId: userId,
          now,
        });
      }

      // Sanitize duration: client-supplied → cap at 5 minutes (way past any
      // reasonable story).
      const safeDuration = duration !== undefined
        ? Math.max(0, Math.min(300_000, Math.round(duration)))
        : undefined;

      // Author re-opening their own story shouldn't inflate viewCount — but
      // this guards ONLY the displayed post's own credit. It must NOT abort
      // the whole call: a reposter viewing their own repost is still a
      // legitimate viewer of the ORIGINAL (see root credit below).
      const isNewView = target.authorId === userId
        ? false
        : await this.creditPostView(postId, userId, safeDuration);

      const rootId = target.originalRepostOfId ?? target.repostOfId;
      if (rootId && rootId !== postId) {
        // Même filtre de visibilité que le post affiché — pas de requête
        // supplémentaire hors périmètre, le filtre est déjà résolu ci-dessus.
        const root = await this.prisma.post.findFirst({
          where: { id: rootId, deletedAt: NOT_DELETED, ...visibilityFilter },
          select: { id: true, authorId: true },
        });
        if (root && root.authorId !== userId) {
          await this.creditPostView(rootId, userId, safeDuration);
        }
      }

      return isNewView;
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
      select: { id: true, authorId: true },
    });
    if (!post) return null;
    if (post.authorId !== userId) throw new Error('FORBIDDEN');

    // Réactions dérivées de la table `PostReaction` (SSOT) — PAS du JSON legacy
    // `post.reactions`, jamais mis à jour par le chemin socket (voir
    // PostFeedService.enrichWithLikeStatus). Une réaction posée via
    // `post:reaction-add` s'affichait sinon `reaction: null` pour l'auteur.
    const [views, total, reactionRows] = await Promise.all([
      this.prisma.postView.findMany({
        where: { postId },
        include: { user: { select: authorSelect } },
        orderBy: { viewedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.postView.count({ where: { postId } }),
      this.prisma.postReaction.findMany({
        where: { postId },
        select: { userId: true, emoji: true },
      }),
    ]);

    const reactionByUser = new Map<string, string>();
    for (const r of reactionRows) {
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
      /** Audience choisie par le reposteur. Absente ⇒ on hérite de l'original.
       *
       *  Cette doc affirmait jusqu'au 2026-08-19 : « un repost n'étant permis
       *  que sur un original PUBLIC, toute valeur ne fait que RESTREINDRE la
       *  portée ». La prémisse est ABOLIE — la republication est ouverte aux
       *  originaux non publics, et la restriction n'est donc plus DÉDUITE mais
       *  VÉRIFIÉE : voir la loi d'audience appliquée plus bas
       *  (`isRepostVisibilityAllowed`, 403 `REPOST_AUDIENCE_WIDENING`). Ne pas
       *  rétablir le raisonnement par déduction : c'est lui qui laissait ce
       *  champ sans garde propre. */
      visibility?: PostVisibility;
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

    // ── Loi d'audience de la republication ────────────────────────────────
    //
    // Jusqu'au 2026-08-19 cette barrière refusait TOUT original non-`PUBLIC`,
    // et le commentaire de `opts.visibility` ci-dessus en DÉDUISAIT
    // l'invariant « toute valeur ne fait que restreindre la portée ». La
    // décision produit ouvre la republication aux stories non publiques, à
    // audience égale ou plus restreinte : ce raisonnement tombe, et la
    // restriction doit être vérifiée ICI. C'est la frontière de sécurité —
    // le plafond du sélecteur côté client est une affordance, pas une
    // garantie : sans ce contrôle, un client pourrait republier une story
    // `PRIVATE` en `PUBLIC`.
    //
    // La loi (`@meeshy/shared/utils/repost-audience`) démontre au passage que
    // les six audiences ne forment PAS un ordre total — `FRIENDS` et
    // `COMMUNITY` sont incomparables, donc un « rétrécissement » apparent
    // peut exposer le contenu à d'autres gens.
    const originalVisibility = original.visibility as PostVisibility;
    const requestedVisibility = opts.visibility ?? originalVisibility;

    if (!isRepostVisibilityAllowed(originalVisibility, requestedVisibility)) {
      const err: any = new Error(
        `Repost audience ${requestedVisibility} is broader than the original ${originalVisibility}`,
      );
      err.statusCode = 403;
      err.code = 'REPOST_AUDIENCE_WIDENING';
      throw err;
    }

    // `EXCEPT`/`ONLY` ne se lisent pas sans leur liste : « même audience »
    // avec une liste plus longue est plus LARGE. La liste vient donc de
    // l'original, jamais de la requête.
    const effectiveVisibilityUserIds = repostVisibilityInheritsAudienceList(requestedVisibility)
      ? ((original.visibilityUserIds ?? []) as string[])
      : [];

    // Reposter crée un POST, quel que soit le type de l'original (2026-08-19).
    //
    // Le défaut était `?? original.type` : le repost HÉRITAIT du type de sa
    // source. À l'époque (2026-08-19), presque aucun site d'appel ne
    // renseignait `targetType` — seul le viewer de story passait `.post` —,
    // si bien que republier une story
    // depuis le fil, le profil ou le détail fabriquait une STORY : elle
    // atterrissait dans le tray du reposteur et jamais dans son fil, alors
    // que le geste demandait « partager dans mon fil ». Et comme
    // `post:reposted` n'est pas typé, le fil l'insérait quand même en direct
    // — le même contenu se voyait dans le fil ET dans les stories.
    //
    // C'est le modèle des réseaux à fil : partager une story la fait entrer
    // dans le fil, elle ne crée pas une story chez le repartageur.
    // Corollaire : un POST n'est pas éphémère, donc `computeExpiresAt` ne
    // pose plus d'échéance sur un repost.
    //
    // Republier SA PROPRE story garde son chemin dédié — `republishStory`
    // (`POST /posts/:postId/republish`), auteur uniquement, type STORY, date
    // fraîche. `targetType` reste au protocole : ce chemin-là et un futur
    // « reposter en story » en dépendent.
    //
    // ÉTAT AU 2026-08-24 — à lire avant de toucher au `??` ci-dessous. La
    // prémisse « presque aucun site ne renseigne `targetType` » ne vaut PLUS,
    // et le repli a changé de NATURE sans changer de valeur. iOS le passe
    // partout depuis `92529dac5` (loi du miroir, `RepostTargeting`) — zéro
    // site de production n'écrit `targetType: nil`, une garde de source le
    // vérifie (`ComposerIntentTests.swift:553-584`) — et le web depuis
    // `1214afbcb` : ses dix sites de repost le passent tous.
    //
    // `?? PostType.POST` n'est donc plus le chemin NORMAL : c'est le FILET des
    // clients anciens, et rien d'autre. Deux conséquences pour la suite : ne
    // pas le durcir en `throw` tant que le parc n'est pas à jour, et ne pas le
    // relire comme une intention produit — l'intention arrive maintenant
    // explicitement, et c'est l'appelant qui la porte.
    const targetType = opts.targetType ?? PostType.POST;
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

    // ── Ce que la copie doit dire de SES PROPRES PIXELS ────────────────────
    //
    // Les octets sont dupliqués (`trackedDuplicate`), mais la LIGNE qui les
    // décrit était réénumérée à la main sur huit champs quand `mediaSelect`
    // en avait chargé dix-sept. Tout le reste naissait sur le défaut Prisma :
    //   - `width`/`height` : sans elles le lecteur ne peut réserver le cadre,
    //     et le repost saute au chargement (`FeedMedia.aspectRatio` rend nil) ;
    //   - `thumbHash` : le placeholder instantané est DÉRIVÉ de ces pixels-là,
    //     le laisser derrière condamne la copie à l'attente pleine taille ;
    //   - `duration` : un lecteur audio/vidéo sans durée ne sait pas dessiner
    //     sa barre avant d'avoir téléchargé le média ;
    //   - `alt`/`caption` : le texte alternatif EST l'accessibilité du média.
    //     Un repost qui le perd rend le contenu muet à VoiceOver ;
    //   - `language`/`transcription` : le Prisme Linguistique s'applique à TOUT
    //     le contenu, transcriptions comprises. Une story repostée perdait sa
    //     transcription — donc ses sous-titres et toute traduction ultérieure.
    //
    // Deux champs sont volontairement ABSENTS de cette liste, et ce n'est pas
    // un oubli :
    //   - `variantOf` pointe vers une AUTRE ligne PostMedia. Un pointeur n'est
    //     pas un fait sur ces octets : recopié tel quel il désignerait la ligne
    //     source, que le hard-delete de l'éphémère va effacer. Même raisonnement
    //     que le remap d'ids de `storyEffects` plus bas.
    //   - `translations` porte les URL des variantes TTS. Ces blobs-là n'ont PAS
    //     été dupliqués : les recopier promettrait au lecteur des pistes audio
    //     qui disparaîtront avec la source. Dupliquer les TTS (ou les
    //     régénérer) est une décision produit, consignée en constat latent.
    type SnapshotMediaCreate = {
      fileName: string;
      originalName: string;
      mimeType: string;
      fileSize: number;
      filePath: string;
      fileUrl: string;
      thumbnailUrl?: string;
      order: number;
      width?: number;
      height?: number;
      thumbHash?: string;
      duration?: number;
      caption?: string;
      alt?: string;
      language?: string;
      transcription?: Prisma.InputJsonValue;
      uploaderId?: string;
    };

    let snapshotMedia: SnapshotMediaCreate[] | undefined;
    let snapshotAudioUrl: string | undefined;
    let snapshotAudioDuration: number | undefined;
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
          id: string;
          fileUrl: string;
          mimeType: string;
          thumbnailUrl?: string | null;
          order?: number;
          width?: number | null;
          height?: number | null;
          thumbHash?: string | null;
          duration?: number | null;
          caption?: string | null;
          alt?: string | null;
          language?: string | null;
          transcription?: Prisma.JsonValue | null;
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
            // Les faits que ces octets portent déjà. `?? undefined` et non
            // `?? null` : copier l'ABSENCE aussi fidèlement que la présence,
            // sans jamais inventer une dimension ou une légende à un média
            // qui n'en avait pas.
            width: m.width ?? undefined,
            height: m.height ?? undefined,
            thumbHash: m.thumbHash ?? undefined,
            duration: m.duration ?? undefined,
            caption: m.caption ?? undefined,
            alt: m.alt ?? undefined,
            language: m.language ?? undefined,
            transcription: (m.transcription ?? undefined) as Prisma.InputJsonValue | undefined,
            // Le reposteur possède la copie : c'est LUI qui vient d'en écrire
            // les octets. Le schéma ne tolère `uploaderId` nul que pour les
            // lignes antérieures au champ, le temps du rattrapage.
            uploaderId: userId,
          });
        }

        const audioUrl = original.audioUrl as string | null | undefined;
        if (audioUrl) {
          const dupAudio = await trackedDuplicate(audioUrl);
          duplicatedAudioUrl = dupAudio.fileUrl;
          snapshotAudioUrl = dupAudio.fileUrl;
          // `audioDuration` décrit CES octets-là : la copie dure exactement
          // aussi longtemps que la source. Sans elle le lecteur de note vocale
          // affiche 0:00 jusqu'à ce que le fichier entier soit téléchargé.
          snapshotAudioDuration = (original.audioDuration as number | null | undefined) ?? undefined;
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
            visibility: requestedVisibility,
            visibilityUserIds: effectiveVisibilityUserIds,
            content: snapshotContent ?? undefined,
            originalLanguage: snapshotOriginalLanguage,
            repostOfId: postId,
            originalRepostOfId,
            isQuote,
            ...(sourceMoodEmoji !== undefined ? { moodEmoji: sourceMoodEmoji } : {}),
            ...(expiresAt !== undefined ? { expiresAt } : {}),
            ...(snapshotAudioUrl !== undefined ? { audioUrl: snapshotAudioUrl } : {}),
            ...(snapshotAudioDuration !== undefined ? { audioDuration: snapshotAudioDuration } : {}),
            ...(snapshotStoryEffects !== undefined ? { storyEffects: snapshotStoryEffects } : {}),
            ...(snapshotMedia !== undefined ? { media: { create: snapshotMedia } } : {}),
          },
          include: postInclude,
        });

        // The media just duplicated above got fresh `PostMedia` ids — but
        // `snapshotStoryEffects` was copied verbatim and still references the
        // SOURCE's media ids. Left as-is, a repost of a repost would carry
        // forward ids from however many hops back the chain started, and the
        // reader's plain `postMediaId` lookup (scoped to the post's own
        // `media[]`) would never find them — the exact "contenu non affiché"
        // bug. Rewrite them here so every repost is self-contained regardless
        // of chain depth.
        let finalRepost = repost;
        if (snapshotStoryEffects !== undefined) {
          const repostMedia = repost.media ?? [];
          const idMap: Record<string, string> = {};
          originalMedia.forEach((om, idx) => {
            const newMedia = repostMedia[idx];
            if (newMedia) {
              idMap[om.id] = newMedia.id;
            }
          });

          const remapped = remapStoryEffectsMediaIds(snapshotStoryEffects, idMap);
          if (remapped.changed) {
            try {
              await this.prisma.post.update({
                where: { id: repost.id },
                data: { storyEffects: remapped.effects },
              });
              // Cast: `remapped.effects` is `Prisma.InputJsonValue` (write-side
              // JSON type); `repost.storyEffects` is Prisma's read-side JSON
              // output type. They're structurally the same data, but Prisma
              // generates them as separate, not-mutually-assignable aliases —
              // this cast bridges that without widening to `any`.
              finalRepost = { ...repost, storyEffects: remapped.effects as typeof repost.storyEffects };
            } catch (err) {
              log.warn('repostPost: failed to correct storyEffects media ids', { repostId: repost.id, err });
            }
          }
        }

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

        return finalRepost;
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
        visibility: requestedVisibility,
        visibilityUserIds: effectiveVisibilityUserIds,
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
