package me.meeshy.sdk.socket

import me.meeshy.sdk.model.PostEngagementSnapshot
import me.meeshy.sdk.model.socket.SocketEventNames
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.flow
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.SocketPostCreatedData
import me.meeshy.sdk.model.SocketPostReactionUpdateData
import me.meeshy.sdk.model.SocketCommentMediaUpdatedData
import me.meeshy.sdk.model.SocketPostRepostedData
import me.meeshy.sdk.model.SocketPostUpdatedData
import me.meeshy.sdk.model.SocketPostLikedData
import me.meeshy.sdk.model.SocketPostUnlikedData
import me.meeshy.sdk.model.SocketPostBookmarkedData
import me.meeshy.sdk.model.SocketPostDeletedData
import me.meeshy.sdk.model.SocketPostTranslationUpdatedData
import me.meeshy.sdk.model.SocketCommentAddedData
import me.meeshy.sdk.model.SocketCommentUpdatedData
import me.meeshy.sdk.model.SocketCommentTranslationUpdatedData
import me.meeshy.sdk.model.SocketMediaCaptionTranslationUpdatedData
import me.meeshy.sdk.model.SocketCommentLikedData
import me.meeshy.sdk.model.SocketCommentDeletedData
import me.meeshy.sdk.model.SocketCommentReactionUpdateData
import me.meeshy.sdk.model.SocketStoryCreatedData
import me.meeshy.sdk.model.SocketStoryUpdatedData
import me.meeshy.sdk.model.SocketStoryViewedData
import me.meeshy.sdk.model.SocketStoryReactedData
import me.meeshy.sdk.model.SocketStoryTranslationUpdatedData
import me.meeshy.sdk.model.SocketStoryUnreactedData
import me.meeshy.sdk.model.SocketStoryDeletedData
import me.meeshy.sdk.model.SocketStatusCreatedData
import me.meeshy.sdk.model.SocketStatusUpdatedData
import me.meeshy.sdk.model.SocketStatusDeletedData
import me.meeshy.sdk.model.SocketStatusReactedData
import me.meeshy.sdk.model.SocketStatusUnreactedData
import me.meeshy.sdk.model.ConversationDeletedSocketEvent
import me.meeshy.sdk.model.social.PostRoomRefCount
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.Dispatchers
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Subscribes to social-domain Socket.IO events (ARCHITECTURE.md §3).
 * Mirrors iOS SocialSocketManager.
 */
@Singleton
class SocialSocketManager @Inject constructor(
    private val socketManager: SocketManager,
    private val json: Json,
    private val router: SocketEventRouter,
) {
    internal constructor(
        socketManager: SocketManager,
        json: Json,
    ) : this(
        socketManager, json,
        SocketEventRouter(SocketEventRegistrar { event, callback -> socketManager.on(event, callback) }, Dispatchers.Default),
    )

    private val _postCreated = SocketInboundRoute.subject<SocketPostCreatedData>()
    private val _postUpdated = SocketInboundRoute.subject<SocketPostUpdatedData>()
    private val _postReposted = SocketInboundRoute.subject<SocketPostRepostedData>()
    private val _postLiked = SocketInboundRoute.subject<SocketPostLikedData>()
    private val _postUnliked = SocketInboundRoute.subject<SocketPostUnlikedData>()
    private val _postBookmarked = SocketInboundRoute.subject<SocketPostBookmarkedData>()
    private val _postDeleted = SocketInboundRoute.subject<SocketPostDeletedData>()
    private val _postTranslationUpdated = SocketInboundRoute.subject<SocketPostTranslationUpdatedData>()
    private val _postReactionAdded = SocketInboundRoute.subject<SocketPostReactionUpdateData>()
    private val _postReactionRemoved = SocketInboundRoute.subject<SocketPostReactionUpdateData>()
    private val _postEngagementUpdated = SocketInboundRoute.subject<PostEngagementSnapshot>()
    private val _commentMediaUpdated = SocketInboundRoute.subject<SocketCommentMediaUpdatedData>()
    private val _commentAdded = SocketInboundRoute.subject<SocketCommentAddedData>()
    private val _commentUpdated = SocketInboundRoute.subject<SocketCommentUpdatedData>()
    private val _commentLiked = SocketInboundRoute.subject<SocketCommentLikedData>()
    private val _commentUnliked = SocketInboundRoute.subject<SocketCommentLikedData>()
    private val _commentDeleted = SocketInboundRoute.subject<SocketCommentDeletedData>()
    private val _commentReactionAdded = SocketInboundRoute.subject<SocketCommentReactionUpdateData>()
    private val _commentReactionRemoved = SocketInboundRoute.subject<SocketCommentReactionUpdateData>()
    private val _commentTranslationUpdated = SocketInboundRoute.subject<SocketCommentTranslationUpdatedData>()
    private val _mediaCaptionTranslationUpdated = SocketInboundRoute.subject<SocketMediaCaptionTranslationUpdatedData>()
    private val _storyCreated = SocketInboundRoute.subject<SocketStoryCreatedData>()
    private val _storyUpdated = SocketInboundRoute.subject<SocketStoryUpdatedData>()
    private val _storyViewed = SocketInboundRoute.subject<SocketStoryViewedData>()
    private val _storyReacted = SocketInboundRoute.subject<SocketStoryReactedData>()
    private val _storyUnreacted = SocketInboundRoute.subject<SocketStoryUnreactedData>()
    private val _storyDeleted = SocketInboundRoute.subject<SocketStoryDeletedData>()
    private val _storyTranslationUpdated = SocketInboundRoute.subject<SocketStoryTranslationUpdatedData>()
    private val _statusCreated = SocketInboundRoute.subject<SocketStatusCreatedData>()
    private val _statusUpdated = SocketInboundRoute.subject<SocketStatusUpdatedData>()
    private val _statusDeleted = SocketInboundRoute.subject<SocketStatusDeletedData>()
    private val _statusReacted = SocketInboundRoute.subject<SocketStatusReactedData>()
    private val _statusUnreacted = SocketInboundRoute.subject<SocketStatusUnreactedData>()
    private val _conversationDeleted = SocketInboundRoute.subject<ConversationDeletedSocketEvent>()

    private val lock = Any()
    private var postRooms = PostRoomRefCount()
    private var feedSubscribed = false
    private var replayScope: CoroutineScope? = null

    /**
     * `conversation:deleted` / `:closed` / `:obsoleted` : la passerelle émet `closed` pour une suppression douce et
     * `deleted` pour une dure ; le cache social les lit sans savoir lequel est parti (miroir d'iOS `conversationDeleted`).
     */
    val conversationDeleted: SharedFlow<ConversationDeletedSocketEvent> = _conversationDeleted.exposed()

    val postCreated: SharedFlow<SocketPostCreatedData> = _postCreated.exposed()

    /**
     * `post:updated` — the author edited a post; carries the COMPLETE new post. The feed
     * viewer folds it onto the cached card so the edit shows in place, preserving the
     * reader's own like/bookmark/view/reaction state (the broadcast is unpersonalized).
     * The content-edit sibling of [postCreated] / [postTranslationUpdated].
     */
    val postUpdated: SharedFlow<SocketPostUpdatedData> = _postUpdated.exposed()

    /**
     * `post:reposted` — a user reposted a post; carries the COMPLETE repost as a new post.
     * The feed folds it onto the head exactly like a [postCreated] arrival (a repost is
     * itself a new feed post). The arrival sibling of [postCreated].
     */
    val postReposted: SharedFlow<SocketPostRepostedData> = _postReposted.exposed()
    val postLiked: SharedFlow<SocketPostLikedData> = _postLiked.exposed()
    val postUnliked: SharedFlow<SocketPostUnlikedData> = _postUnliked.exposed()
    val postBookmarked: SharedFlow<SocketPostBookmarkedData> = _postBookmarked.exposed()
    val postDeleted: SharedFlow<SocketPostDeletedData> = _postDeleted.exposed()

    /**
     * `post:translation-updated` — the gateway translated a post server-side and pushed
     * the finished entry. The feed viewer folds it into the cache so an open card
     * re-renders in the reader's preferred language the instant it lands (the caption
     * sibling of [storyTranslationUpdated]).
     */
    val postTranslationUpdated: SharedFlow<SocketPostTranslationUpdatedData> =
        _postTranslationUpdated.exposed()
    val commentAdded: SharedFlow<SocketCommentAddedData> = _commentAdded.exposed()

    /** `post:reaction-added` : le compte ABSOLU de l'emoji (`aggregation`), jamais un delta. */
    val postReactionAdded: SharedFlow<SocketPostReactionUpdateData> = _postReactionAdded.exposed()

    /** `post:reaction-removed` : meme forme que [postReactionAdded], le sens vit dans le flux. */
    val postReactionRemoved: SharedFlow<SocketPostReactionUpdateData> = _postReactionRemoved.exposed()

    /** `engagement:post-updated` : ce qu'un post a rapporté au lecteur, poussé à sa seule room (#9569). */
    val postEngagementUpdated: SharedFlow<PostEngagementSnapshot> = _postEngagementUpdated.exposed()

    /** `comment:media-updated` : le commentaire enrichi (transcription audio prete) a substituer. */
    val commentMediaUpdated: SharedFlow<SocketCommentMediaUpdatedData> = _commentMediaUpdated.exposed()

    /**
     * Chaque RECONNEXION de la socket (une connexion qui en suit une autre vue par le collecteur) : le fil relit sa
     * tete et se reabonne, car les evenements emis pendant la coupure sont perdus. Miroir d'iOS `didReconnect`.
     */
    val reconnected: Flow<Unit> = flow {
        var seen = socketManager.isConnected
        socketManager.connected.collect {
            if (seen) emit(Unit)
            seen = true
        }
    }

    /**
     * `comment:updated` — a comment was edited server-side; carries the COMPLETE new comment.
     * The open thread replaces the matched row in place (content/effects/regenerated
     * translations), idempotent by id — the edit sibling of [commentAdded].
     */
    val commentUpdated: SharedFlow<SocketCommentUpdatedData> = _commentUpdated.exposed()
    val commentLiked: SharedFlow<SocketCommentLikedData> = _commentLiked.exposed()

    /**
     * Jumelle DESCENDANTE de [commentLiked]. Même forme de charge : `likeCount`
     * y est le total ABSOLU après retrait, jamais un delta — le contrat déclare
     * deux interfaces identiques et le SENS vit dans le flux, pas dans les
     * champs (comme [commentReactionAdded] / [commentReactionRemoved], qui
     * partagent déjà un seul type).
     */
    val commentUnliked: SharedFlow<SocketCommentLikedData> = _commentUnliked.exposed()
    val commentDeleted: SharedFlow<SocketCommentDeletedData> = _commentDeleted.exposed()
    val commentReactionAdded: SharedFlow<SocketCommentReactionUpdateData> = _commentReactionAdded.exposed()
    val commentReactionRemoved: SharedFlow<SocketCommentReactionUpdateData> = _commentReactionRemoved.exposed()

    /**
     * `comment:translation-updated` — the gateway translated a comment server-side and pushed
     * the finished entry. The open comment thread folds it into the matched row so it
     * re-renders in the reader's preferred language the instant it lands (the comment-keyed
     * sibling of [postTranslationUpdated]).
     */
    val commentTranslationUpdated: SharedFlow<SocketCommentTranslationUpdatedData> =
        _commentTranslationUpdated.exposed()

    /**
     * `media:caption-translation-updated` — the gateway translated a `PostMedia.caption`
     * server-side and pushed the finished entry (#6280). DISTINCT of [postTranslationUpdated]
     * (translates `Post.content`): the open feed card folds this into the targeted media's
     * caption-translations map so it re-renders in the reader's preferred language the
     * instant it lands — the media-caption sibling of [postTranslationUpdated].
     */
    val mediaCaptionTranslationUpdated: SharedFlow<SocketMediaCaptionTranslationUpdatedData> =
        _mediaCaptionTranslationUpdated.exposed()
    val storyCreated: SharedFlow<SocketStoryCreatedData> = _storyCreated.exposed()

    /**
     * `story:updated` — an author edited a story; carries the COMPLETE new story. The
     * open viewer re-projects the matched slide in place (content/media/text objects),
     * and re-seeds its reaction count when `engagementReset` is set — the edit sibling
     * of [storyCreated]. Mirror of iOS `SocialSocketManager.storyUpdated`.
     */
    val storyUpdated: SharedFlow<SocketStoryUpdatedData> = _storyUpdated.exposed()
    val storyViewed: SharedFlow<SocketStoryViewedData> = _storyViewed.exposed()
    val storyReacted: SharedFlow<SocketStoryReactedData> = _storyReacted.exposed()
    val storyUnreacted: SharedFlow<SocketStoryUnreactedData> = _storyUnreacted.exposed()

    /**
     * `story:deleted` — an author removed a story. The open viewer drops the matched
     * slide, dropping an emptied author group and re-anchoring the cursor (the removal
     * sibling of [storyCreated]). Mirror of iOS `SocialSocketManager.storyDeleted`.
     */
    val storyDeleted: SharedFlow<SocketStoryDeletedData> = _storyDeleted.exposed()
    val storyTranslationUpdated: SharedFlow<SocketStoryTranslationUpdatedData> =
        _storyTranslationUpdated.exposed()
    val statusCreated: SharedFlow<SocketStatusCreatedData> = _statusCreated.exposed()
    val statusUpdated: SharedFlow<SocketStatusUpdatedData> = _statusUpdated.exposed()
    val statusDeleted: SharedFlow<SocketStatusDeletedData> = _statusDeleted.exposed()
    val statusReacted: SharedFlow<SocketStatusReactedData> = _statusReacted.exposed()
    val statusUnreacted: SharedFlow<SocketStatusUnreactedData> = _statusUnreacted.exposed()

    fun attach() {
        router.install(routes())
        startReplay()
    }

    /** À chaque connexion (première ou reconnexion) : le serveur a oublié nos salles, la mémoire du client les rejoue. */
    private fun startReplay() {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        synchronized(lock) {
            replayScope?.cancel()
            replayScope = scope
        }
        scope.launch {
            try {
                socketManager.connected.collect { replaySubscriptions() }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
                Timber.w(failure, "SocialSocket: rejeu des abonnements en échec")
            }
        }
    }

    private fun replaySubscriptions() {
        val (feed, rooms) = synchronized(lock) { feedSubscribed to postRooms.toRejoin() }
        if (feed) socketManager.emit(SocketEventNames.FEED_SUBSCRIBE, JSONObject())
        rooms.forEach { socketManager.emit(SocketEventNames.POST_JOIN, JSONObject().put("postId", it)) }
    }

    /** S'abonne au fil (`feed:subscribe`), rejoué à chaque reconnexion sur la socket unique. */
    fun subscribeFeed() {
        synchronized(lock) { feedSubscribed = true }
        socketManager.emit(SocketEventNames.FEED_SUBSCRIBE, JSONObject())
    }

    fun unsubscribeFeed() {
        synchronized(lock) { feedSubscribed = false }
        socketManager.emit(SocketEventNames.FEED_UNSUBSCRIBE, JSONObject())
    }

    private fun routes(): List<SocketInboundRoute> = buildList {
        route(SocketEventNames.POST_CREATED, _postCreated)
        route(SocketEventNames.POST_UPDATED, _postUpdated)
        route(SocketEventNames.POST_REPOSTED, _postReposted)
        route(SocketEventNames.POST_LIKED, _postLiked)
        route(SocketEventNames.POST_UNLIKED, _postUnliked)
        route(SocketEventNames.POST_BOOKMARKED, _postBookmarked)
        route(SocketEventNames.POST_DELETED, _postDeleted)
        route(SocketEventNames.POST_TRANSLATION_UPDATED, _postTranslationUpdated)
        route(SocketEventNames.POST_REACTION_ADDED, _postReactionAdded)
        route(SocketEventNames.POST_REACTION_REMOVED, _postReactionRemoved)
        route(SocketEventNames.ENGAGEMENT_POST_UPDATED, _postEngagementUpdated)
        route(SocketEventNames.COMMENT_MEDIA_UPDATED, _commentMediaUpdated)
        route(SocketEventNames.COMMENT_ADDED, _commentAdded)
        route(SocketEventNames.COMMENT_UPDATED, _commentUpdated)
        route(SocketEventNames.COMMENT_LIKED, _commentLiked)
        route(SocketEventNames.COMMENT_UNLIKED, _commentUnliked)
        route(SocketEventNames.COMMENT_DELETED, _commentDeleted)
        route(SocketEventNames.COMMENT_REACTION_ADDED, _commentReactionAdded)
        route(SocketEventNames.COMMENT_REACTION_REMOVED, _commentReactionRemoved)
        route(SocketEventNames.COMMENT_TRANSLATION_UPDATED, _commentTranslationUpdated)
        route(SocketEventNames.MEDIA_CAPTION_TRANSLATION_UPDATED, _mediaCaptionTranslationUpdated)
        route(SocketEventNames.STORY_CREATED, _storyCreated)
        route(SocketEventNames.STORY_UPDATED, _storyUpdated)
        route(SocketEventNames.STORY_VIEWED, _storyViewed)
        route(SocketEventNames.STORY_REACTED, _storyReacted)
        route(SocketEventNames.STORY_UNREACTED, _storyUnreacted)
        route(SocketEventNames.STORY_DELETED, _storyDeleted)
        route(SocketEventNames.STORY_TRANSLATION_UPDATED, _storyTranslationUpdated)
        route(SocketEventNames.STATUS_CREATED, _statusCreated)
        route(SocketEventNames.STATUS_UPDATED, _statusUpdated)
        route(SocketEventNames.STATUS_DELETED, _statusDeleted)
        route(SocketEventNames.STATUS_REACTED, _statusReacted)
        route(SocketEventNames.STATUS_UNREACTED, _statusUnreacted)
        route(SocketEventNames.CONVERSATION_DELETED, _conversationDeleted)
        route(SocketEventNames.CONVERSATION_CLOSED, _conversationDeleted)
        route(SocketEventNames.CONVERSATION_OBSOLETED, _conversationDeleted)
    }

    /**
     * Joins the post-detail realtime room (port of iOS `SocialSocketManager.joinPostRoom`) —
     * required to receive `post:liked`/`post:unliked`/`comment:added`/`comment:deleted` for a
     * post the viewer isn't otherwise implicitly subscribed to via a friend's feed room.
     */
    fun joinPostRoom(postId: String) {
        val step = synchronized(lock) { postRooms.join(postId).also { postRooms = it.next } }
        if (step.emit) socketManager.emit(SocketEventNames.POST_JOIN, JSONObject().put("postId", postId))
    }

    /**
     * Le coeur (ou toute réaction) d'un commentaire par le socket, avec accusé — iso `addCommentReaction` /
     * `removeCommentReaction` iOS. Rend quand la passerelle accuse `success`, lève sinon (refus, socket absente,
     * session finie) : l'appelant décide du repli. Aucun délai ici, il appartient à l'appelant.
     */
    suspend fun reactToComment(add: Boolean, commentId: String, postId: String, emoji: String) {
        val event = if (add) SocketEventNames.COMMENT_REACTION_ADD else SocketEventNames.COMMENT_REACTION_REMOVE
        val payload = JSONObject().put("commentId", commentId).put("postId", postId).put("emoji", emoji)
        suspendCancellableCoroutine<Unit> { continuation ->
            socketManager.emit(event, payload) { args ->
                val accepted = (args.firstOrNull() as? JSONObject)?.optBoolean("success", false) == true
                if (!continuation.isActive) return@emit
                if (accepted) continuation.resume(Unit)
                else continuation.resumeWithException(IllegalStateException("comment reaction refused"))
            }
        }
    }

    /** Leaves the post-detail realtime room — pairs with [joinPostRoom]. */
    fun leavePostRoom(postId: String) {
        val step = synchronized(lock) { postRooms.leave(postId).also { postRooms = it.next } }
        if (step.emit) socketManager.emit(SocketEventNames.POST_LEAVE, JSONObject().put("postId", postId))
    }

    private inline fun <reified T> MutableList<SocketInboundRoute>.route(event: String, subject: RouteSubject<T>) {
        add(SocketInboundRoute.decoding(event, json, subject))
    }
}
