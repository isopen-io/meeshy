/**
 * SocialEventsHandler
 * Gère le broadcasting des événements sociaux (posts, stories, statuts, commentaires)
 * vers les rooms feed:{userId} des amis
 */

import type { MeeshyIOServer as SocketIOServer, MeeshySocket as Socket } from '../typed-socket';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type { ServerToClientEvents } from '@meeshy/shared/types/socketio-events';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { getCommunityCoMemberIds } from '../../services/posts/communityVisibility';
import { emitServerEvent, type ServerEventName, type ServerEventPayload } from '../serverEmit';
import type {
  Post,
  PostComment,
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
} from '@meeshy/shared/types/post';

// enhancedLogger (Pino) sort en prod ; le `logger` Winston de server.ts est
// configuré à `level: 'warn'` en prod et filtre tous les `logger.info(...)`.
// Sans ce logger dédié, le fanout social était totalement invisible côté
// production et empêchait tout diagnostic en cas de "ma story n'arrive pas".
const logger = enhancedLogger.child({ module: 'SocialEventsHandler' });

/**
 * Cycle 100 — les quatre seams de diffusion sociale, CONTRAINTS par le contrat.
 *
 * Le cycle 99 a typé le `Socket` d'un handler et rendu impossibles, à la
 * compilation, deux fautes : émettre un nom absent de `ServerToClientEvents`, et
 * émettre un payload d'une autre forme que celle déclarée pour ce nom.
 *
 * Ce handler échappait ENTIÈREMENT à cette garde, et pas par oubli d'import :
 * ses vingt-et-un sites d'émission ne touchent jamais `io.emit` directement.
 * Ils passent par quatre helpers privés déclarés `(event: string, data: unknown)`
 * — une signature qui BLANCHIT le couple. Typer `this.io` ne changeait rien :
 * à l'intérieur du helper, `event` est un `string` quelconque et `data` un
 * `unknown`, donc le contrat ne peut rien exiger, et au site d'appel il n'y a
 * plus rien à vérifier.
 *
 * > Un seam qui prend `(string, unknown)` annule le contrat de tout ce qui passe
 * > par lui. La garde ne vaut que jusqu'au premier paramètre non typé.
 *
 * C'est le chemin le PLUS exposé du dépôt : une diffusion Socket.IO n'a aucun
 * sérialiseur — pas de `fast-json-stringify` pour retirer un champ de trop, pas
 * de schéma de réponse pour signaler un champ manquant. Le typage de l'émission
 * est ici la SEULE garde qui existe entre le producteur et les décodeurs
 * iOS/Android/web, qui sont tous les trois écrits contre `ServerToClientEvents`.
 */
// Alias locaux des deux dérivations du contrat. Elles ont été ÉCRITES ici au
// cycle 100, puis retrouvées mot pour mot au cycle 104 dans les huit portes
// d'émission de la passerelle — c'est ce qui a décidé de leur donner un
// domicile unique (`socketio/serverEmit.ts`). Les noms locaux survivent parce
// que vingt-et-un sites d'appel les lisent dans les signatures publiques.
type SocialEventName = ServerEventName;
type SocialEventPayload<E extends SocialEventName> = ServerEventPayload<E>;

/**
 * L'erasure de corrélation vit désormais dans `emitServerEvent`
 * (`socketio/serverEmit.ts`), partagée avec les huit autres portes d'émission
 * de la passerelle. Elle ne blanchit toujours rien, et pour la même raison
 * qu'ici : `socket.io` enveloppe sa map d'événements dans
 * `DecorateAcknowledgementsWithMultipleResponses<…>` avant d'en dériver la
 * signature d'`emit`, et sur un `E` GÉNÉRIQUE TypeScript ne peut pas prouver
 * que cette enveloppe laisse le paramètre inchangé — alors qu'elle le fait pour
 * tout `E` concret, aucun de nos événements serveur→client ne portant d'accusé
 * de réception. Une limite d'inférence sur type mappé, pas un désaccord de
 * forme.
 *
 * Ce que l'erasure ne touche PAS : le couple `(event, data)` a déjà été vérifié
 * contre `ServerToClientEvents` à la frontière des quatre helpers publics, donc
 * à chacun des vingt-et-un sites d'appel.
 */

export interface SocialEventsHandlerDependencies {
  io: SocketIOServer;
  prisma: PrismaClient;
}

export class SocialEventsHandler {
  private io: SocketIOServer;
  private prisma: PrismaClient;

  // Cache des amis (TTL court pour éviter des queries trop fréquentes)
  private friendsCache: Map<string, { ids: string[]; expiresAt: number }> = new Map();
  private readonly FRIENDS_CACHE_TTL_MS = 30_000; // 30s

  constructor(deps: SocialEventsHandlerDependencies) {
    this.io = deps.io;
    this.prisma = deps.prisma;
  }

  // ==============================================
  // FRIEND IDS (pour le broadcast vers les feed rooms)
  // ==============================================

  private async getFriendIds(userId: string): Promise<string[]> {
    const cached = this.friendsCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.ids;
    }

    try {
      const friendships = await this.prisma.friendRequest.findMany({
        where: {
          OR: [
            { senderId: userId, status: 'accepted' },
            { receiverId: userId, status: 'accepted' },
          ],
        },
        select: { senderId: true, receiverId: true },
      });

      const ids = friendships.map(f =>
        f.senderId === userId ? f.receiverId : f.senderId
      );

      if (this.friendsCache.size >= 500) {
        const now = Date.now();
        for (const [k, v] of this.friendsCache) {
          if (v.expiresAt <= now) this.friendsCache.delete(k);
        }
        if (this.friendsCache.size >= 500) {
          const oldest = this.friendsCache.keys().next().value;
          if (oldest !== undefined) this.friendsCache.delete(oldest);
        }
      }
      this.friendsCache.set(userId, { ids, expiresAt: Date.now() + this.FRIENDS_CACHE_TTL_MS });
      return ids;
    } catch (error) {
      logger.error('social events — error fetching friend IDs', { userId, error });
      return [];
    }
  }

  /**
   * Broadcast vers les feed rooms des amis + l'auteur lui-même
   */
  private emitToFriends<E extends SocialEventName>(
    friendIds: string[],
    authorId: string,
    event: E,
    data: SocialEventPayload<E>,
  ): void {
    // Inclure l'auteur pour feedback immédiat
    const targetIds = [...friendIds, authorId];
    for (const id of targetIds) {
      emitServerEvent(this.io.to(ROOMS.feed(id)), event, data);
    }
  }

  /**
   * Émission UNIQUE sur l'union des feed rooms (amis filtrés par visibilité +
   * auteur) ET de la post room (`ROOMS.post`). Socket.IO dédoublonne un socket
   * présent dans plusieurs rooms → livraison EXACTEMENT une fois, ce qui supprime
   * la double-livraison du modèle « boucle feed + emit post room séparé » (un
   * ami-viewer était dans sa feed room ET la post room). Cf. `commentBroadcastRooms`.
   */
  private emitToFeedsAndPostRoom<E extends SocialEventName>(
    recipientIds: string[],
    authorId: string,
    postId: string,
    event: E,
    data: SocialEventPayload<E>,
  ): void {
    const rooms = [...recipientIds, authorId].map((id) => ROOMS.feed(id));
    rooms.push(ROOMS.post(postId));
    emitServerEvent(this.io.to(rooms), event, data);
  }

  /**
   * Broadcast uniquement vers l'auteur du post (notifs personnelles)
   */
  private emitToUser<E extends SocialEventName>(
    userId: string,
    event: E,
    data: SocialEventPayload<E>,
  ): void {
    emitServerEvent(this.io.to(ROOMS.feed(userId)), event, data);
  }

  /**
   * Émission UNIQUE sur l'union de la feed room d'un utilisateur ET de la post
   * room — déduplication Socket.IO incluse (`io.to([...])`). Un même socket
   * présent dans LES DEUX rooms (typiquement l'auteur qui regarde sa propre
   * story/statut : il est dans sa feed room ET dans la post room du viewer)
   * reçoit l'événement EXACTEMENT une fois.
   *
   * Avant ce seam, `broadcastStoryReacted`/`broadcastStatusReacted` faisaient
   * deux `.emit()` séparés (feed room PUIS post room) → l'auteur-viewer recevait
   * `story:reacted` DEUX fois → le delta `+1` côté iOS s'appliquait deux fois →
   * compteur de réactions affiché en `+2`. Miroir de `emitToFeedsAndPostRoom`.
   */
  private emitToUserFeedAndPostRoom<E extends SocialEventName>(
    userId: string,
    postId: string,
    event: E,
    data: SocialEventPayload<E>,
  ): void {
    emitServerEvent(this.io.to([ROOMS.feed(userId), ROOMS.post(postId)]), event, data);
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

  /**
   * L'ÉNUMÉRATEUR d'audience du temps réel : « à qui pousser cet événement ? »,
   * par dépliage du graphe de l'auteur. Ce n'est pas un test d'admission — pour
   * juger un utilisateur ARBITRAIRE, voir `filterPostConsumers` /
   * `canUserConsumePost` (leçon du cycle 28).
   *
   * `visibility` et `visibilityUserIds` sont REQUIS. Ils portaient un défaut
   * `'PUBLIC'` / `[]` que huit méthodes de diffusion propageaient : un appelant
   * qui les omettait diffusait un post `PRIVATE` à tous les amis de l'auteur, ou
   * un `EXCEPT` sans sa liste noire, sans que rien ne le signale. Aucun appelant
   * ne les omettait — c'est justement pourquoi le défaut ne coûte rien à retirer
   * et tout à garder.
   *
   * Une visibilité INCONNUE retombe sur les amis (`default:`), jamais sur une
   * ouverture plus large : même politique que `filterPostConsumers`.
   */
  private async getVisibilityFilteredRecipients(
    authorId: string,
    visibility: string | null | undefined,
    visibilityUserIds: string[]
  ): Promise<string[]> {
    if (visibility === 'COMMUNITY') {
      return getCommunityCoMemberIds(this.prisma, authorId);
    }

    const friendIds = await this.getFriendIds(authorId);

    switch (visibility) {
      case 'PUBLIC':
      case 'FRIENDS':
        return friendIds;
      case 'EXCEPT':
        return friendIds.filter(id => !visibilityUserIds.includes(id));
      case 'ONLY':
        return visibilityUserIds;
      case 'PRIVATE':
        return [];
      default:
        return friendIds;
    }
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
    );
    logger.info(`📣 post:created fanout author=${authorId} postId=${post.id} recipients=${recipients.length}`);
    // U1 — echo the cmid so the author's offline-created optimistic post (keyed
    // by cmid) reconciles to the server id instead of duplicating.
    this.emitToFriends(recipients, authorId, SERVER_EVENTS.POST_CREATED, { post, clientMutationId });
  }

  async broadcastPostUpdated(post: Post, authorId: string): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(
      authorId,
      post.visibility as string | undefined,
      (post.visibilityUserIds as string[] | undefined) ?? [],
    );
    // Feed rooms filtrées par visibilité + post room, UN SEUL emit dédoublonné
    // (miroir broadcastPostLiked). Caveat assumé : si l'édition RESTREINT la
    // visibilité, les membres déjà joints à la post room reçoivent encore
    // cette update — même sémantique que comment:added, pas d'éviction de room.
    this.emitToFeedsAndPostRoom(recipients, authorId, post.id, SERVER_EVENTS.POST_UPDATED, { post });
  }

  async broadcastPostDeleted(postId: string, authorId: string): Promise<void> {
    // Sur-diffusion sûre (payload id-only) : la post room reçoit aussi la
    // suppression, sinon un viewer non-ami resté sur le détail/reel d'un post
    // supprimé ne le sait jamais. `post:join` est gaté par visibilité côté
    // serveur (PostReactionHandler) et io.to([...]) dédoublonne.
    const friendIds = await this.getFriendIds(authorId);
    this.emitToFeedsAndPostRoom(friendIds, authorId, postId, SERVER_EVENTS.POST_DELETED, { postId, authorId });
  }

  async broadcastPostLiked(
    data: PostLikedEventData,
    postAuthorId: string,
    visibility: string | null | undefined,
    visibilityUserIds: string[],
  ): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds);
    // Feed rooms (amis filtrés par visibilité + auteur) ET post room (détail /
    // reel viewer) en UN SEUL emit dédoublonné — plus de double-livraison.
    this.emitToFeedsAndPostRoom(recipients, postAuthorId, data.postId, SERVER_EVENTS.POST_LIKED, data);
  }

  async broadcastPostUnliked(
    data: PostUnlikedEventData,
    postAuthorId: string,
    visibility: string | null | undefined,
    visibilityUserIds: string[],
  ): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds);
    this.emitToFeedsAndPostRoom(recipients, postAuthorId, data.postId, SERVER_EVENTS.POST_UNLIKED, data);
  }

  async broadcastPostReposted(data: PostRepostedEventData, authorId: string): Promise<void> {
    // The repost is itself a post authored by the reposter; honour ITS visibility.
    const repost = data.repost as Post | undefined;
    const recipients = await this.getVisibilityFilteredRecipients(
      authorId,
      repost?.visibility as string | undefined,
      (repost?.visibilityUserIds as string[] | undefined) ?? [],
    );
    this.emitToFriends(recipients, authorId, SERVER_EVENTS.POST_REPOSTED, data);
  }

  /**
   * Broadcast d'un toggle de favori — PERSONNEL : le favori n'intéresse que
   * l'utilisateur qui l'a posé. On émet donc uniquement vers SA feed room (toutes
   * ses sessions/vues : feed + reel viewer). Permet de garder `isBookmarkedByMe`
   * synchronisé en direct et de le réhydrater à la réouverture du viewer.
   */
  broadcastPostBookmarked(data: PostBookmarkedEventData, userId: string): void {
    this.emitToUser(userId, SERVER_EVENTS.POST_BOOKMARKED, data);
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
    const recipients = await this.getVisibilityFilteredRecipients(authorId, visibility, visibilityUserIds);
    logger.info(
      `📣 story:created fanout author=${authorId} storyId=${story.id} visibility=${visibility} recipients=${recipients.length}`
    );
    // U1 parity — echo the cmid so an offline author's optimistic story
    // (keyed by cmid) reconciles to the server story instead of duplicating.
    this.emitToFriends(recipients, authorId, SERVER_EVENTS.STORY_CREATED, { story, clientMutationId });
  }

  /// Emitted when an author edits a published story (PUT /posts/:id). Mirrors
  /// `broadcastStoryCreated`'s visibility filtering — only viewers who can
  /// currently see the story receive the update.
  /// `engagementReset: true` when the edit wiped views/reactions (content
  /// edit) — clients must mark the story unseen again for every viewer.
  async broadcastStoryUpdated(
    story: Post,
    authorId: string,
    options?: { engagementReset?: boolean },
  ): Promise<void> {
    const visibility = story.visibility;
    const visibilityUserIds = [...(story.visibilityUserIds ?? [])];
    const recipients = await this.getVisibilityFilteredRecipients(authorId, visibility, visibilityUserIds);
    this.emitToFriends(recipients, authorId, SERVER_EVENTS.STORY_UPDATED, {
      story,
      engagementReset: options?.engagementReset ?? false,
    });
  }

  /// Emitted when an author deletes a story. Sent to all friends (we don't have
  /// the visibility metadata anymore — and over-broadcasting a deletion is safe:
  /// recipients who never had the story silently ignore it).
  async broadcastStoryDeleted(storyId: string, authorId: string): Promise<void> {
    const friendIds = await this.getFriendIds(authorId);
    this.emitToFriends(friendIds, authorId, SERVER_EVENTS.STORY_DELETED, { storyId, authorId });
  }

  broadcastStoryViewed(data: StoryViewedEventData, storyAuthorId: string): void {
    // Seul l'auteur de la story doit voir les vues
    this.emitToUser(storyAuthorId, SERVER_EVENTS.STORY_VIEWED, data);
  }

  broadcastStoryReacted(data: StoryReactedEventData, storyAuthorId: string): void {
    // UN SEUL emit dédoublonné vers la feed room de l'auteur ET la story room
    // des viewers. L'auteur qui regarde sa propre story est dans les deux rooms :
    // sans dédup il recevait l'event deux fois → compteur `+2` (cf. helper).
    this.emitToUserFeedAndPostRoom(storyAuthorId, data.storyId, SERVER_EVENTS.STORY_REACTED, data);
  }

  broadcastStoryUnreacted(data: StoryUnreactedEventData, storyAuthorId: string): void {
    this.emitToUserFeedAndPostRoom(storyAuthorId, data.storyId, SERVER_EVENTS.STORY_UNREACTED, data);
  }

  // ==============================================
  // STATUS/MOOD BROADCASTS
  // ==============================================

  async broadcastStatusCreated(status: Post, authorId: string, clientMutationId?: string): Promise<void> {
    const visibility = status.visibility;
    const visibilityUserIds = [...(status.visibilityUserIds ?? [])];
    const recipients = await this.getVisibilityFilteredRecipients(authorId, visibility, visibilityUserIds);
    logger.info(
      `📣 status:created fanout author=${authorId} statusId=${status.id} visibility=${visibility} recipients=${recipients.length}`
    );
    // U1 parity — echo the cmid so an offline author's optimistic status
    // (keyed by cmid) reconciles to the server status instead of duplicating.
    this.emitToFriends(recipients, authorId, SERVER_EVENTS.STATUS_CREATED, { status, clientMutationId });
  }

  async broadcastStatusUpdated(status: Post, authorId: string): Promise<void> {
    const visibility = status.visibility;
    const visibilityUserIds = [...(status.visibilityUserIds ?? [])];
    const recipients = await this.getVisibilityFilteredRecipients(authorId, visibility, visibilityUserIds);
    this.emitToFriends(recipients, authorId, SERVER_EVENTS.STATUS_UPDATED, { status });
  }

  async broadcastStatusDeleted(statusId: string, authorId: string, visibility: string | null | undefined, visibilityUserIds: string[]): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(authorId, visibility, visibilityUserIds);
    this.emitToFriends(recipients, authorId, SERVER_EVENTS.STATUS_DELETED, { statusId, authorId });
  }

  broadcastStatusReacted(data: StatusReactedEventData, statusAuthorId: string): void {
    // Même dédup que `broadcastStoryReacted` : l'auteur-viewer ne compte plus son
    // émoji deux fois.
    this.emitToUserFeedAndPostRoom(statusAuthorId, data.statusId, SERVER_EVENTS.STATUS_REACTED, data);
  }

  broadcastStatusUnreacted(data: StatusUnreactedEventData, statusAuthorId: string): void {
    this.emitToUserFeedAndPostRoom(statusAuthorId, data.statusId, SERVER_EVENTS.STATUS_UNREACTED, data);
  }

  // ==============================================
  // COMMENT BROADCASTS
  // ==============================================

  /**
   * Rooms devant recevoir un événement de commentaire : les feed rooms de
   * l'auteur du post et de ses amis (fil d'actualité) ET la post room
   * (`ROOMS.post`) où se trouvent les viewers du détail / reel viewer qui ne
   * sont PAS amis de l'auteur (post PUBLIC, co-membre de communauté, ou le
   * commentateur lui-même). Sans la post room, un viewer ouvrant le détail d'un
   * post qui ne suit pas l'auteur ne voyait JAMAIS les nouveaux commentaires en
   * temps réel — il fallait recharger. Miroir de `broadcastPostLiked` /
   * `broadcastStoryReacted` qui atteignent déjà la post room.
   *
   * Émission UNIQUE sur l'union des rooms : Socket.IO dédoublonne les sockets
   * présents dans plusieurs rooms (un viewer ami est dans SA feed room ET dans la
   * post room), donc l'événement est livré EXACTEMENT une fois. C'est requis
   * pour les commentaires : l'insertion d'un commentaire et l'incrément du
   * compteur de réponses côté client ne sont PAS idempotents en cas de double
   * livraison (contrairement au payload absolu de `post:liked`).
   */
  private commentBroadcastRooms(recipientIds: string[], postAuthorId: string, postId: string): string[] {
    const feedRooms = [...recipientIds, postAuthorId].map((id) => ROOMS.feed(id));
    return [...feedRooms, ROOMS.post(postId)];
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
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds);
    const rooms = this.commentBroadcastRooms(recipients, postAuthorId, data.postId);
    this.io.to(rooms).emit(SERVER_EVENTS.COMMENT_ADDED, data);
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
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds);
    const rooms = this.commentBroadcastRooms(recipients, postAuthorId, data.postId);
    this.io.to(rooms).emit(SERVER_EVENTS.COMMENT_UPDATED, data);
  }

  async broadcastCommentDeleted(
    data: CommentDeletedEventData,
    postAuthorId: string,
    visibility: string | null | undefined,
    visibilityUserIds: string[],
  ): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds);
    const rooms = this.commentBroadcastRooms(recipients, postAuthorId, data.postId);
    this.io.to(rooms).emit(SERVER_EVENTS.COMMENT_DELETED, data);
  }

  broadcastCommentLiked(data: CommentLikedEventData, commentAuthorId: string): void {
    this.emitToUser(commentAuthorId, SERVER_EVENTS.COMMENT_LIKED, data);
    // Reach every viewer of the post detail (join-gated post room) so the
    // comment's like count updates live for them too — not just the comment
    // author. Payload is ABSOLUTE (likeCount) → idempotent even if the comment
    // author is in both their feed room and the post room. Mirrors
    // `broadcastPostLiked`.
    this.io.to(ROOMS.post(data.postId)).emit(SERVER_EVENTS.COMMENT_LIKED, data);
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
  broadcastCommentUnliked(data: CommentUnlikedEventData, commentAuthorId: string): void {
    this.emitToUser(commentAuthorId, SERVER_EVENTS.COMMENT_UNLIKED, data);
    this.io.to(ROOMS.post(data.postId)).emit(SERVER_EVENTS.COMMENT_UNLIKED, data);
  }

  // ==============================================
  // POST/COMMENT TRANSLATION BROADCASTS
  // ==============================================

  async broadcastPostTranslationUpdated(
    data: PostTranslationUpdatedEventData,
    postAuthorId: string,
    visibility: string | null | undefined,
    visibilityUserIds: string[],
  ): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds);
    this.emitToFriends(recipients, postAuthorId, SERVER_EVENTS.POST_TRANSLATION_UPDATED, data);
  }

  async broadcastCommentTranslationUpdated(
    data: CommentTranslationUpdatedEventData,
    postAuthorId: string,
    visibility: string | null | undefined,
    visibilityUserIds: string[],
  ): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds);
    const rooms = this.commentBroadcastRooms(recipients, postAuthorId, data.postId);
    this.io.to(rooms).emit(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, data);
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
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds);
    const rooms = this.commentBroadcastRooms(recipients, postAuthorId, data.postId);
    this.io.to(rooms).emit(SERVER_EVENTS.COMMENT_MEDIA_UPDATED, data);
  }

  // ==============================================
  // CACHE INVALIDATION
  // ==============================================

  /**
   * Invalide le cache des amis (par ex. après un nouvel ami accepté)
   */
  invalidateFriendsCache(userId: string): void {
    this.friendsCache.delete(userId);
  }
}
