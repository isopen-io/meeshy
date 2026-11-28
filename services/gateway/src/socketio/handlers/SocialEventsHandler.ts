/**
 * SocialEventsHandler
 * Gère le broadcasting des événements sociaux (posts, stories, statuts, commentaires)
 * vers les rooms feed:{userId} des amis
 */

import type { MeeshyIOServer as SocketIOServer, MeeshySocket as Socket } from '../typed-socket';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type { CommunityPostRef } from '../../services/posts/communityVisibility';
import { emitServerEvent } from '../serverEmit';
import { withServedCarrierMedia } from '../../services/posts/servedPostMedia';
import { logger, NOTHING_TO_SILENCE, SocialEmissionCore } from './socialEmissionCore';
import type {
  Post,
  PostLikedEventData,
  PostUnlikedEventData,
  PostRepostedEventData,
  PostBookmarkedEventData,
  StoryViewedEventData,
  StoryReactedEventData,
  StoryUnreactedEventData,
  StatusReactedEventData,
  StatusUnreactedEventData,
  CommentAddedEventData,
  CommentUpdatedEventData,
  CommentDeletedEventData,
  CommentLikedEventData,
  CommentUnlikedEventData,
  PostTranslationUpdatedEventData,
  CommentTranslationUpdatedEventData,
  CommentMediaUpdatedEventData,
  MediaCaptionTranslationUpdatedEventData,
  MediaAltTranslationUpdatedEventData,
} from '@meeshy/shared/types/post';

export interface SocialEventsHandlerDependencies {
  io: SocketIOServer;
  prisma: PrismaClient;
}

/**
 * L'auteur d'un commentaire diffusé. Les producteurs le SÉLECTIONNENT sous
 * `author` (`CREATED_COMMENT_SELECT`, `updateComment`, `PostAudioService`) et
 * jamais à plat : lire `authorId` seul ne trouverait personne, et la diffusion
 * partirait sans filtre (#20216). `authorId` reste lu pour une charge qui le porte.
 */
export function commentAuthorIdOf(comment: { readonly author?: { readonly id?: string } | null; readonly authorId?: string } | null | undefined): string | undefined {
  return comment?.author?.id ?? comment?.authorId;
}

export class SocialEventsHandler {
  private readonly core: SocialEmissionCore;

  constructor(deps: SocialEventsHandlerDependencies) {
    this.core = new SocialEmissionCore(deps);
  }


  /** @see SocialEmissionCore.getVisibilityFilteredRecipients */
  private getVisibilityFilteredRecipients(
    authorId: string,
    visibility: string | null | undefined,
    visibilityUserIds: string[],
    post: CommunityPostRef,
  ): Promise<string[]> {
    return this.core.getVisibilityFilteredRecipients(authorId, visibility, visibilityUserIds, post);
  }

  // ==============================================
  // FEED ROOM MANAGEMENT
  // ==============================================

  /**
   * Appelé quand un socket reçoit feed:subscribe
   */
  async handleFeedSubscribe(socket: Socket, userId: string): Promise<void> {
    const room = ROOMS.feed(userId);
    await socket.join(room);
  }

  /**
   * Appelé quand un socket reçoit feed:unsubscribe
   */
  async handleFeedUnsubscribe(socket: Socket, userId: string): Promise<void> {
    const room = ROOMS.feed(userId);
    await socket.leave(room);
  }

  // ==============================================
  // POST BROADCASTS
  // ==============================================

  async broadcastPostCreated(post: Post, authorId: string, clientMutationId?: string): Promise<void> {
    // Respect the post's visibility — an ONLY/EXCEPT/PRIVATE/COMMUNITY post must
    // NOT be fanned out (full body) to friends outside the allowed set.
    const recipients = await this.getVisibilityFilteredRecipients(
      authorId,
      post.visibility as string | undefined,
      (post.visibilityUserIds as string[] | undefined) ?? [],
      { postId: post.id, communityId: post.communityId },
    );
    logger.info(`📣 post:created fanout author=${authorId} postId=${post.id} recipients=${recipients.length}`);
    // U1 — echo the cmid so the author's offline-created optimistic post (keyed
    // by cmid) reconciles to the server id instead of duplicating.
    const companions = await this.core.companionSeparation(post);
    await this.core.emitPostToAudience(recipients, authorId, SERVER_EVENTS.POST_CREATED, (p) => ({ post: p, clientMutationId }), post, companions);
  }

  async broadcastPostUpdated(post: Post, authorId: string): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(
      authorId,
      post.visibility as string | undefined,
      (post.visibilityUserIds as string[] | undefined) ?? [],
      { postId: post.id, communityId: post.communityId },
    );
    // Feed rooms filtrées par visibilité + post room, chaque socket servi UNE
    // fois (`emitPostToAudience`). Caveat assumé : si l'édition RESTREINT la
    // visibilité, les membres déjà joints à la post room reçoivent encore
    // cette update — même sémantique que comment:added, pas d'éviction de room.
    const separated = await this.core.contentSeparation(authorId);
    const companions = await this.core.companionSeparation(post);
    await this.core.emitPostToAudience(recipients, authorId, SERVER_EVENTS.POST_UPDATED, (p) => ({ post: p }), post, companions, { id: post.id, separated });
  }

  async broadcastPostDeleted(postId: string, authorId: string): Promise<void> {
    // Sur-diffusion sûre (payload id-only) : la post room reçoit aussi la
    // suppression, sinon un viewer non-ami resté sur le détail/reel d'un post
    // supprimé ne le sait jamais. `post:join` est gaté par visibilité côté
    // serveur (PostReactionHandler) et io.to([...]) dédoublonne.
    const friendIds = await this.core.getUnblockedFriendIds(authorId);
    /* RIEN À TAIRE, et c'est une décision : `post:deleted` ne porte que
       `{ postId, authorId }` — il nomme l'AUTEUR, qui est le sujet de la room,
       et aucun acteur tiers. Sur-diffuser une suppression est sûr (un lecteur
       qui n'avait pas le post l'ignore). Le paramètre est REQUIS pour que la
       prochaine famille branchée ici ait à répondre à la question. */
    this.core.emitToFeedsAndPostRoom(friendIds, authorId, postId, SERVER_EVENTS.POST_DELETED, { postId, authorId }, undefined, NOTHING_TO_SILENCE);
  }

  async broadcastPostLiked(
    data: PostLikedEventData,
    postAuthorId: string,
    visibility: string | null | undefined,
    visibilityUserIds: string[],
    separated: readonly string[] | null,
  ): Promise<void> {
    if (separated === null) return;
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds, { postId: data.postId });
    // Feed rooms (amis filtrés par visibilité + auteur) ET post room (détail /
    // reel viewer) en UN SEUL emit dédoublonné — plus de double-livraison.
    this.core.emitToFeedsAndPostRoom(recipients, postAuthorId, data.postId, SERVER_EVENTS.POST_LIKED, data, data.userId, separated);
  }

  async broadcastPostUnliked(
    data: PostUnlikedEventData,
    postAuthorId: string,
    visibility: string | null | undefined,
    visibilityUserIds: string[],
    separated: readonly string[] | null,
  ): Promise<void> {
    if (separated === null) return;
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds, { postId: data.postId });
    this.core.emitToFeedsAndPostRoom(recipients, postAuthorId, data.postId, SERVER_EVENTS.POST_UNLIKED, data, data.userId, separated);
  }

  async broadcastPostReposted(data: PostRepostedEventData, authorId: string): Promise<void> {
    // The repost is itself a post authored by the reposter; honour ITS visibility.
    const repost = data.repost as Post | undefined;
    const recipients = await this.getVisibilityFilteredRecipients(
      authorId,
      repost?.visibility as string | undefined,
      (repost?.visibilityUserIds as string[] | undefined) ?? [],
      { postId: repost?.id ?? data.originalPostId, communityId: repost?.communityId },
    );
    if (!repost) {
      this.core.emitToFriends(recipients, authorId, SERVER_EVENTS.POST_REPOSTED, data);
      return;
    }
    const companions = await this.core.companionSeparation(repost);
    await this.core.emitPostToAudience(recipients, authorId, SERVER_EVENTS.POST_REPOSTED, (p) => ({ ...data, repost: p }), repost, companions);
  }

  /**
   * Broadcast d'un toggle de favori — PERSONNEL : le favori n'intéresse que
   * l'utilisateur qui l'a posé. On émet donc uniquement vers SA feed room (toutes
   * ses sessions/vues : feed + reel viewer). Permet de garder `isBookmarkedByMe`
   * synchronisé en direct et de le réhydrater à la réouverture du viewer.
   */
  broadcastPostBookmarked(data: PostBookmarkedEventData, userId: string): void {
    this.core.emitToUser(userId, SERVER_EVENTS.POST_BOOKMARKED, data);
  }

  // ==============================================
  // STORY BROADCASTS
  // ==============================================

  async broadcastStoryCreated(story: Post, authorId: string, clientMutationId?: string): Promise<void> {
    // Honor `visibility` / `visibilityUserIds` like `broadcastStatusCreated` —
    // previously this always fanned out to ALL friends, leaking ONLY/EXCEPT
    // stories via the realtime event payload even though the REST list was
    // correctly filtered.
    const visibility = story.visibility;
    const visibilityUserIds = [...(story.visibilityUserIds ?? [])];
    const recipients = await this.getVisibilityFilteredRecipients(authorId, visibility, visibilityUserIds, {
      postId: story.id,
      communityId: story.communityId,
    });
    logger.info(
      `📣 story:created fanout author=${authorId} storyId=${story.id} visibility=${visibility} recipients=${recipients.length}`
    );
    // U1 parity — echo the cmid so an offline author's optimistic story
    // (keyed by cmid) reconciles to the server story instead of duplicating.
    const companions = await this.core.companionSeparation(story);
    await this.core.emitPostToAudience(recipients, authorId, SERVER_EVENTS.STORY_CREATED, (p) => ({ story: p, clientMutationId }), story, companions);
  }

  /// Emitted when an author edits a published story (PUT /posts/:id). Mirrors
  /// `broadcastStoryCreated`'s visibility filtering — only viewers who can
  /// currently see the story receive the update.
  /// `engagementReset` stays in the contract for older clients; an edit keeps
  /// views and reactions since #16386, so the route sends `false`.
  async broadcastStoryUpdated(
    story: Post,
    authorId: string,
    options?: { engagementReset?: boolean },
  ): Promise<void> {
    const visibility = story.visibility;
    const visibilityUserIds = [...(story.visibilityUserIds ?? [])];
    const recipients = await this.getVisibilityFilteredRecipients(authorId, visibility, visibilityUserIds, {
      postId: story.id,
      communityId: story.communityId,
    });
    const engagementReset = options?.engagementReset ?? false;
    const companions = await this.core.companionSeparation(story);
    await this.core.emitPostToAudience(recipients, authorId, SERVER_EVENTS.STORY_UPDATED, (p) => ({ story: p, engagementReset }), story, companions);
  }

  /// Emitted when an author deletes a story. Sent to all friends (we don't have
  /// the visibility metadata anymore — and over-broadcasting a deletion is safe:
  /// recipients who never had the story silently ignore it).
  async broadcastStoryDeleted(storyId: string, authorId: string): Promise<void> {
    const friendIds = await this.core.getUnblockedFriendIds(authorId);
    this.core.emitToFriends(friendIds, authorId, SERVER_EVENTS.STORY_DELETED, { storyId, authorId });
  }

  /** @see SocialEmissionCore.separationAroundActor */
  separationAroundActor(actorId: string): Promise<readonly string[] | null> {
    return this.core.separationAroundActor(actorId);
  }

  /**
   * **LA HUITIÈME FAMILLE D'ACTIVITÉ** (#20429), et la plus NOMINATIVE : là où
   * les sept de #20338 ne portent qu'un `userId`, cette charge nomme le viewer
   * par son id **ET son pseudo**. Elle partait vers la feed room de l'auteur
   * sans aucune exclusion.
   *
   * `separated` est REQUIS — un appelant qui l'oublie ne compile pas —, il est
   * résolu AVANT l'écriture de la vue, et `null` tait la diffusion.
   *
   * **On NE DIFFUSE PAS, plutôt que de diffuser en excluant** (même forme que
   * `emitCommentActivity`, #20236) : l'audience n'ayant qu'UN destinataire, le
   * taire c'est se taire, et aucune charge nominative n'est remise à la couche
   * de diffusion — sous l'adaptateur Redis, `.except()` encode le paquet
   * ENTIER et le publie aux autres nœuds, qui ne filtrent qu'à l'arrivée.
   * (Un premier jet invoquait un join de room qui échouerait : mesuré FAUX par
   * l'audit du lot — `Adapter.addAll` est synchrone et ne rend rien, et
   * l'adaptateur Redis ne la surcharge pas.)
   */
  broadcastStoryViewed(
    data: StoryViewedEventData,
    storyAuthorId: string,
    separated: readonly string[] | null,
  ): void {
    if (separated === null) return;
    if (separated.includes(ROOMS.user(storyAuthorId))) return;
    emitServerEvent(this.core.io.to(ROOMS.feed(storyAuthorId)), SERVER_EVENTS.STORY_VIEWED, data);
  }

  broadcastStoryReacted(data: StoryReactedEventData, storyAuthorId: string, separated: readonly string[] | null): void {
    // UN SEUL emit dédoublonné vers la feed room de l'auteur ET la story room
    // des viewers. L'auteur qui regarde sa propre story est dans les deux rooms :
    // sans dédup il recevait l'event deux fois → compteur `+2` (cf. helper).
    if (separated === null) return;
    this.core.emitToUserFeedAndPostRoom(storyAuthorId, data.storyId, SERVER_EVENTS.STORY_REACTED, data, separated);
  }

  broadcastStoryUnreacted(data: StoryUnreactedEventData, storyAuthorId: string, separated: readonly string[] | null): void {
    if (separated === null) return;
    this.core.emitToUserFeedAndPostRoom(storyAuthorId, data.storyId, SERVER_EVENTS.STORY_UNREACTED, data, separated);
  }

  // ==============================================
  // STATUS/MOOD BROADCASTS
  // ==============================================

  async broadcastStatusCreated(status: Post, authorId: string, clientMutationId?: string): Promise<void> {
    const visibility = status.visibility;
    const visibilityUserIds = [...(status.visibilityUserIds ?? [])];
    const recipients = await this.getVisibilityFilteredRecipients(authorId, visibility, visibilityUserIds, {
      postId: status.id,
      communityId: status.communityId,
    });
    logger.info(
      `📣 status:created fanout author=${authorId} statusId=${status.id} visibility=${visibility} recipients=${recipients.length}`
    );
    // U1 parity — echo the cmid so an offline author's optimistic status
    // (keyed by cmid) reconciles to the server status instead of duplicating.
    const companions = await this.core.companionSeparation(status);
    await this.core.emitPostToAudience(recipients, authorId, SERVER_EVENTS.STATUS_CREATED, (p) => ({ status: p, clientMutationId }), status, companions);
  }

  async broadcastStatusUpdated(status: Post, authorId: string): Promise<void> {
    const visibility = status.visibility;
    const visibilityUserIds = [...(status.visibilityUserIds ?? [])];
    const recipients = await this.getVisibilityFilteredRecipients(authorId, visibility, visibilityUserIds, {
      postId: status.id,
      communityId: status.communityId,
    });
    const companions = await this.core.companionSeparation(status);
    await this.core.emitPostToAudience(recipients, authorId, SERVER_EVENTS.STATUS_UPDATED, (p) => ({ status: p }), status, companions);
  }

  async broadcastStatusDeleted(statusId: string, authorId: string, visibility: string | null | undefined, visibilityUserIds: string[]): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(authorId, visibility, visibilityUserIds, { postId: statusId });
    this.core.emitToFriends(recipients, authorId, SERVER_EVENTS.STATUS_DELETED, { statusId, authorId });
  }

  broadcastStatusReacted(data: StatusReactedEventData, statusAuthorId: string, separated: readonly string[] | null): void {
    // Même dédup que `broadcastStoryReacted` : l'auteur-viewer ne compte plus son
    // émoji deux fois.
    if (separated === null) return;
    this.core.emitToUserFeedAndPostRoom(statusAuthorId, data.statusId, SERVER_EVENTS.STATUS_REACTED, data, separated);
  }

  broadcastStatusUnreacted(data: StatusUnreactedEventData, statusAuthorId: string, separated: readonly string[] | null): void {
    if (separated === null) return;
    this.core.emitToUserFeedAndPostRoom(statusAuthorId, data.statusId, SERVER_EVENTS.STATUS_UNREACTED, data, separated);
  }

  // ==============================================
  // COMMENT BROADCASTS
  // ==============================================

  /** @see SocialEmissionCore.commentActivitySeparation */
  commentActivitySeparation(actorId: string, commentAuthorId: string | null | undefined): Promise<readonly string[] | null> {
    return this.core.commentActivitySeparation(actorId, commentAuthorId);
  }

  /** @see SocialEmissionCore.activitySeparation */
  activitySeparation(actorId: string, targetAuthorId: string | null | undefined): Promise<readonly string[] | null> {
    return this.core.activitySeparation(actorId, targetAuthorId);
  }

  /**
   * Recipients of a comment-scoped event = the feed rooms allowed by the POST's
   * visibility (NOT the author's full friend list) + the post author + the
   * join-gated post room. Without the visibility filter, a comment on an
   * `ONLY` / `EXCEPT` / `PRIVATE` / `COMMUNITY` post leaked its content to every
   * friend of the author, including friends not permitted to see the post.
   * Mirrors `getVisibilityFilteredRecipients` already used by story/status
   * creation. `visibility` defaults to `PUBLIC` (legacy friend fan-out) so a
   * caller that cannot resolve the post's visibility degrades to the previous
   * behaviour rather than dropping delivery.
   */
  async broadcastCommentAdded(
    data: CommentAddedEventData,
    postAuthorId: string,
    visibility: string | null | undefined,
    visibilityUserIds: string[],
  ): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds, { postId: data.postId });
    const emitter = await this.core.commentEmitter(this.core.commentBroadcastRooms(recipients, postAuthorId, data.postId), commentAuthorIdOf(data.comment));
    emitter?.emit(SERVER_EVENTS.COMMENT_ADDED, { ...data, comment: withServedCarrierMedia(data.comment) });
  }

  /**
   * Édition d'un commentaire (contenu / effets visuels) : le payload porte le
   * commentaire complet — le client remplace la ligne en place (idempotent
   * par id, contrairement à l'insertion de `comment:added`). Mêmes rooms et
   * même filtrage de visibilité que la création — passer `visibility` BRUT du
   * post, jamais un défaut permissif (cf. R1 du contrat ci-dessus).
   */
  async broadcastCommentUpdated(
    data: CommentUpdatedEventData,
    postAuthorId: string,
    visibility: string | null | undefined,
    visibilityUserIds: string[],
  ): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds, { postId: data.postId });
    const emitter = await this.core.commentEmitter(this.core.commentBroadcastRooms(recipients, postAuthorId, data.postId), commentAuthorIdOf(data.comment));
    emitter?.emit(SERVER_EVENTS.COMMENT_UPDATED, { ...data, comment: withServedCarrierMedia(data.comment) });
  }

  async broadcastCommentDeleted(
    data: CommentDeletedEventData,
    postAuthorId: string,
    visibility: string | null | undefined,
    visibilityUserIds: string[],
  ): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds, { postId: data.postId });
    const rooms = this.core.commentBroadcastRooms(recipients, postAuthorId, data.postId);
    this.core.io.to(rooms).emit(SERVER_EVENTS.COMMENT_DELETED, data);
  }

  broadcastCommentLiked(data: CommentLikedEventData, commentAuthorId: string, separated: readonly string[] | null): void {
    this.core.emitCommentActivity(SERVER_EVENTS.COMMENT_LIKED, data, commentAuthorId, separated);
  }

  /**
   * Jumelle DESCENDANTE de `broadcastCommentLiked` — mêmes deux adresses, même
   * charge absolue (`likeCount` APRÈS retrait), donc même idempotence sous
   * double livraison.
   *
   * Sans elle, le compteur d'un commentaire ne savait que MONTER en direct : la
   * pose diffusait, le retrait ne diffusait rien, et l'écart tenait jusqu'au
   * prochain REST. Côté iOS il tenait plus longtemps encore — `FeedSocketHandler`
   * PERSISTE la valeur reçue, si bien que le compte gonflé survivait au
   * redémarrage. Calque de `post:liked` / `post:unliked`.
   */
  broadcastCommentUnliked(data: CommentUnlikedEventData, commentAuthorId: string, separated: readonly string[] | null): void {
    this.core.emitCommentActivity(SERVER_EVENTS.COMMENT_UNLIKED, data, commentAuthorId, separated);
  }

  // ==============================================
  // POST/COMMENT TRANSLATION BROADCASTS
  // ==============================================

  /**
   * Même audience que sa jumelle `broadcastMediaCaptionTranslationUpdated` : les
   * feed rooms autorisées par la visibilité + l'auteur + la post room (#7395).
   * Sans la post room, le lecteur d'une publication PUBLIQUE qui n'est pas ami
   * de son auteur recevait la légende traduite en direct, jamais le TEXTE.
   */
  async broadcastPostTranslationUpdated(
    data: PostTranslationUpdatedEventData,
    postAuthorId: string,
    visibility: string | null | undefined,
    visibilityUserIds: string[],
  ): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds, { postId: data.postId });
    const separated = await this.core.contentSeparation(postAuthorId);
    this.core.emitToFeedsAndPostRoom(recipients, postAuthorId, data.postId, SERVER_EVENTS.POST_TRANSLATION_UPDATED, data, undefined, separated);
  }

  /**
   * `commentAuthorId` : la charge ne nomme pas le commentateur, l'appelant le
   * passe pour que la traduction se taise chez qui en est séparé (#20216).
   */
  async broadcastCommentTranslationUpdated(
    data: CommentTranslationUpdatedEventData,
    postAuthorId: string,
    visibility: string | null | undefined,
    visibilityUserIds: string[],
    commentAuthorId?: string | null,
  ): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds, { postId: data.postId });
    const emitter = await this.core.commentEmitter(this.core.commentBroadcastRooms(recipients, postAuthorId, data.postId), commentAuthorId);
    emitter?.emit(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, data);
  }

  /**
   * Diffuse `comment:media-updated` (transcription/traductions audio d'un média de
   * commentaire prêtes) à la même audience filtrée par visibilité que
   * `comment:translation-updated` : les destinataires autorisés par la visibilité
   * du post + l'auteur + la post room (join-gated).
   */
  async broadcastCommentMediaUpdated(
    data: CommentMediaUpdatedEventData,
    postAuthorId: string,
    visibility: string | null | undefined,
    visibilityUserIds: string[],
  ): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds, { postId: data.postId });
    const emitter = await this.core.commentEmitter(this.core.commentBroadcastRooms(recipients, postAuthorId, data.postId), commentAuthorIdOf(data.comment));
    emitter?.emit(SERVER_EVENTS.COMMENT_MEDIA_UPDATED, { ...data, comment: withServedCarrierMedia(data.comment) });
  }

  /**
   * Diffuse `media:caption-translation-updated` (traduction de légende de
   * média prête, #6280) à la même audience filtrée par visibilité que les
   * autres traductions du post porteur. Un média de COMMENTAIRE utilise les
   * mêmes rooms que `comment:translation-updated`/`comment:media-updated`
   * (post room comprise, join-gated) ; un média de POST direct utilise
   * `emitToFeedsAndPostRoom` (même déduplication que `broadcastPostUpdated`).
   */
  async broadcastMediaCaptionTranslationUpdated(
    data: MediaCaptionTranslationUpdatedEventData,
    postAuthorId: string,
    visibility: string | null | undefined,
    visibilityUserIds: string[],
    commentAuthorId?: string | null,
  ): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds, { postId: data.postId });
    if (data.commentId) {
      const emitter = await this.core.commentEmitter(this.core.commentBroadcastRooms(recipients, postAuthorId, data.postId), commentAuthorId);
      emitter?.emit(SERVER_EVENTS.MEDIA_CAPTION_TRANSLATION_UPDATED, data);
      return;
    }
    const separated = await this.core.contentSeparation(postAuthorId);
    this.core.emitToFeedsAndPostRoom(recipients, postAuthorId, data.postId, SERVER_EVENTS.MEDIA_CAPTION_TRANSLATION_UPDATED, data, undefined, separated);
  }

  /**
   * Diffuse `media:alt-translation-updated` (traduction de texte alternatif
   * d'accessibilité prête, #6737) — jumelle exacte de
   * `broadcastMediaCaptionTranslationUpdated`, même audience.
   */
  async broadcastMediaAltTranslationUpdated(
    data: MediaAltTranslationUpdatedEventData,
    postAuthorId: string,
    visibility: string | null | undefined,
    visibilityUserIds: string[],
    commentAuthorId?: string | null,
  ): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds, { postId: data.postId });
    if (data.commentId) {
      const emitter = await this.core.commentEmitter(this.core.commentBroadcastRooms(recipients, postAuthorId, data.postId), commentAuthorId);
      emitter?.emit(SERVER_EVENTS.MEDIA_ALT_TRANSLATION_UPDATED, data);
      return;
    }
    const separated = await this.core.contentSeparation(postAuthorId);
    this.core.emitToFeedsAndPostRoom(recipients, postAuthorId, data.postId, SERVER_EVENTS.MEDIA_ALT_TRANSLATION_UPDATED, data, undefined, separated);
  }

  // ==============================================
  // CACHE INVALIDATION
  // ==============================================

  /** @see SocialEmissionCore.invalidateFriendsCache */
  invalidateFriendsCache(userId: string): void {
    this.core.invalidateFriendsCache(userId);
  }
}
