package me.meeshy.sdk.socket

import me.meeshy.sdk.model.socket.SocketEventNames
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.SocketPostCreatedData
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
import org.json.JSONObject
import kotlinx.coroutines.Dispatchers
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

    val postCreated: SharedFlow<SocketPostCreatedData> = _postCreated.asSharedFlow()

    /**
     * `post:updated` — the author edited a post; carries the COMPLETE new post. The feed
     * viewer folds it onto the cached card so the edit shows in place, preserving the
     * reader's own like/bookmark/view/reaction state (the broadcast is unpersonalized).
     * The content-edit sibling of [postCreated] / [postTranslationUpdated].
     */
    val postUpdated: SharedFlow<SocketPostUpdatedData> = _postUpdated.asSharedFlow()

    /**
     * `post:reposted` — a user reposted a post; carries the COMPLETE repost as a new post.
     * The feed folds it onto the head exactly like a [postCreated] arrival (a repost is
     * itself a new feed post). The arrival sibling of [postCreated].
     */
    val postReposted: SharedFlow<SocketPostRepostedData> = _postReposted.asSharedFlow()
    val postLiked: SharedFlow<SocketPostLikedData> = _postLiked.asSharedFlow()
    val postUnliked: SharedFlow<SocketPostUnlikedData> = _postUnliked.asSharedFlow()
    val postBookmarked: SharedFlow<SocketPostBookmarkedData> = _postBookmarked.asSharedFlow()
    val postDeleted: SharedFlow<SocketPostDeletedData> = _postDeleted.asSharedFlow()

    /**
     * `post:translation-updated` — the gateway translated a post server-side and pushed
     * the finished entry. The feed viewer folds it into the cache so an open card
     * re-renders in the reader's preferred language the instant it lands (the caption
     * sibling of [storyTranslationUpdated]).
     */
    val postTranslationUpdated: SharedFlow<SocketPostTranslationUpdatedData> =
        _postTranslationUpdated.asSharedFlow()
    val commentAdded: SharedFlow<SocketCommentAddedData> = _commentAdded.asSharedFlow()

    /**
     * `comment:updated` — a comment was edited server-side; carries the COMPLETE new comment.
     * The open thread replaces the matched row in place (content/effects/regenerated
     * translations), idempotent by id — the edit sibling of [commentAdded].
     */
    val commentUpdated: SharedFlow<SocketCommentUpdatedData> = _commentUpdated.asSharedFlow()
    val commentLiked: SharedFlow<SocketCommentLikedData> = _commentLiked.asSharedFlow()

    /**
     * Jumelle DESCENDANTE de [commentLiked]. Même forme de charge : `likeCount`
     * y est le total ABSOLU après retrait, jamais un delta — le contrat déclare
     * deux interfaces identiques et le SENS vit dans le flux, pas dans les
     * champs (comme [commentReactionAdded] / [commentReactionRemoved], qui
     * partagent déjà un seul type).
     */
    val commentUnliked: SharedFlow<SocketCommentLikedData> = _commentUnliked.asSharedFlow()
    val commentDeleted: SharedFlow<SocketCommentDeletedData> = _commentDeleted.asSharedFlow()
    val commentReactionAdded: SharedFlow<SocketCommentReactionUpdateData> = _commentReactionAdded.asSharedFlow()
    val commentReactionRemoved: SharedFlow<SocketCommentReactionUpdateData> = _commentReactionRemoved.asSharedFlow()

    /**
     * `comment:translation-updated` — the gateway translated a comment server-side and pushed
     * the finished entry. The open comment thread folds it into the matched row so it
     * re-renders in the reader's preferred language the instant it lands (the comment-keyed
     * sibling of [postTranslationUpdated]).
     */
    val commentTranslationUpdated: SharedFlow<SocketCommentTranslationUpdatedData> =
        _commentTranslationUpdated.asSharedFlow()

    /**
     * `media:caption-translation-updated` — the gateway translated a `PostMedia.caption`
     * server-side and pushed the finished entry (#6280). DISTINCT of [postTranslationUpdated]
     * (translates `Post.content`): the open feed card folds this into the targeted media's
     * caption-translations map so it re-renders in the reader's preferred language the
     * instant it lands — the media-caption sibling of [postTranslationUpdated].
     */
    val mediaCaptionTranslationUpdated: SharedFlow<SocketMediaCaptionTranslationUpdatedData> =
        _mediaCaptionTranslationUpdated.asSharedFlow()
    val storyCreated: SharedFlow<SocketStoryCreatedData> = _storyCreated.asSharedFlow()

    /**
     * `story:updated` — an author edited a story; carries the COMPLETE new story. The
     * open viewer re-projects the matched slide in place (content/media/text objects),
     * and re-seeds its reaction count when `engagementReset` is set — the edit sibling
     * of [storyCreated]. Mirror of iOS `SocialSocketManager.storyUpdated`.
     */
    val storyUpdated: SharedFlow<SocketStoryUpdatedData> = _storyUpdated.asSharedFlow()
    val storyViewed: SharedFlow<SocketStoryViewedData> = _storyViewed.asSharedFlow()
    val storyReacted: SharedFlow<SocketStoryReactedData> = _storyReacted.asSharedFlow()
    val storyUnreacted: SharedFlow<SocketStoryUnreactedData> = _storyUnreacted.asSharedFlow()

    /**
     * `story:deleted` — an author removed a story. The open viewer drops the matched
     * slide, dropping an emptied author group and re-anchoring the cursor (the removal
     * sibling of [storyCreated]). Mirror of iOS `SocialSocketManager.storyDeleted`.
     */
    val storyDeleted: SharedFlow<SocketStoryDeletedData> = _storyDeleted.asSharedFlow()
    val storyTranslationUpdated: SharedFlow<SocketStoryTranslationUpdatedData> =
        _storyTranslationUpdated.asSharedFlow()
    val statusCreated: SharedFlow<SocketStatusCreatedData> = _statusCreated.asSharedFlow()
    val statusUpdated: SharedFlow<SocketStatusUpdatedData> = _statusUpdated.asSharedFlow()
    val statusDeleted: SharedFlow<SocketStatusDeletedData> = _statusDeleted.asSharedFlow()
    val statusReacted: SharedFlow<SocketStatusReactedData> = _statusReacted.asSharedFlow()
    val statusUnreacted: SharedFlow<SocketStatusUnreactedData> = _statusUnreacted.asSharedFlow()

    fun attach() {
        router.install(routes())
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
    }

    /**
     * Joins the post-detail realtime room (port of iOS `SocialSocketManager.joinPostRoom`) —
     * required to receive `post:liked`/`post:unliked`/`comment:added`/`comment:deleted` for a
     * post the viewer isn't otherwise implicitly subscribed to via a friend's feed room.
     */
    fun joinPostRoom(postId: String) {
        socketManager.emit(SocketEventNames.POST_JOIN, JSONObject().put("postId", postId))
    }

    /** Leaves the post-detail realtime room — pairs with [joinPostRoom]. */
    fun leavePostRoom(postId: String) {
        socketManager.emit(SocketEventNames.POST_LEAVE, JSONObject().put("postId", postId))
    }

    private inline fun <reified T> MutableList<SocketInboundRoute>.route(event: String, subject: MutableSharedFlow<T>) {
        add(SocketInboundRoute.decoding(event, json, subject))
    }
}
