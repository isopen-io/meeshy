package me.meeshy.sdk.socket

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.SocketPostCreatedData
import me.meeshy.sdk.model.SocketPostUpdatedData
import me.meeshy.sdk.model.SocketPostLikedData
import me.meeshy.sdk.model.SocketPostUnlikedData
import me.meeshy.sdk.model.SocketPostBookmarkedData
import me.meeshy.sdk.model.SocketPostDeletedData
import me.meeshy.sdk.model.SocketPostTranslationUpdatedData
import me.meeshy.sdk.model.SocketCommentAddedData
import me.meeshy.sdk.model.SocketCommentUpdatedData
import me.meeshy.sdk.model.SocketCommentTranslationUpdatedData
import me.meeshy.sdk.model.SocketCommentLikedData
import me.meeshy.sdk.model.SocketCommentDeletedData
import me.meeshy.sdk.model.SocketCommentReactionUpdateData
import me.meeshy.sdk.model.SocketStoryCreatedData
import me.meeshy.sdk.model.SocketStoryViewedData
import me.meeshy.sdk.model.SocketStoryReactedData
import me.meeshy.sdk.model.SocketStoryTranslationUpdatedData
import me.meeshy.sdk.model.SocketStoryUnreactedData
import me.meeshy.sdk.model.SocketStatusCreatedData
import me.meeshy.sdk.model.SocketStatusUpdatedData
import me.meeshy.sdk.model.SocketStatusDeletedData
import me.meeshy.sdk.model.SocketStatusReactedData
import me.meeshy.sdk.model.SocketStatusUnreactedData
import org.json.JSONObject
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
) {
    private val _postCreated = buf<SocketPostCreatedData>()
    private val _postUpdated = buf<SocketPostUpdatedData>()
    private val _postLiked = buf<SocketPostLikedData>()
    private val _postUnliked = buf<SocketPostUnlikedData>()
    private val _postBookmarked = buf<SocketPostBookmarkedData>()
    private val _postDeleted = buf<SocketPostDeletedData>()
    private val _postTranslationUpdated = buf<SocketPostTranslationUpdatedData>()
    private val _commentAdded = buf<SocketCommentAddedData>()
    private val _commentUpdated = buf<SocketCommentUpdatedData>()
    private val _commentLiked = buf<SocketCommentLikedData>()
    private val _commentUnliked = buf<SocketCommentLikedData>()
    private val _commentDeleted = buf<SocketCommentDeletedData>()
    private val _commentReactionAdded = buf<SocketCommentReactionUpdateData>()
    private val _commentReactionRemoved = buf<SocketCommentReactionUpdateData>()
    private val _commentTranslationUpdated = buf<SocketCommentTranslationUpdatedData>()
    private val _storyCreated = buf<SocketStoryCreatedData>()
    private val _storyViewed = buf<SocketStoryViewedData>()
    private val _storyReacted = buf<SocketStoryReactedData>()
    private val _storyUnreacted = buf<SocketStoryUnreactedData>()
    private val _storyTranslationUpdated = buf<SocketStoryTranslationUpdatedData>()
    private val _statusCreated = buf<SocketStatusCreatedData>()
    private val _statusUpdated = buf<SocketStatusUpdatedData>()
    private val _statusDeleted = buf<SocketStatusDeletedData>()
    private val _statusReacted = buf<SocketStatusReactedData>()
    private val _statusUnreacted = buf<SocketStatusUnreactedData>()

    val postCreated: SharedFlow<SocketPostCreatedData> = _postCreated.asSharedFlow()

    /**
     * `post:updated` — the author edited a post; carries the COMPLETE new post. The feed
     * viewer folds it onto the cached card so the edit shows in place, preserving the
     * reader's own like/bookmark/view/reaction state (the broadcast is unpersonalized).
     * The content-edit sibling of [postCreated] / [postTranslationUpdated].
     */
    val postUpdated: SharedFlow<SocketPostUpdatedData> = _postUpdated.asSharedFlow()
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
    val storyCreated: SharedFlow<SocketStoryCreatedData> = _storyCreated.asSharedFlow()
    val storyViewed: SharedFlow<SocketStoryViewedData> = _storyViewed.asSharedFlow()
    val storyReacted: SharedFlow<SocketStoryReactedData> = _storyReacted.asSharedFlow()
    val storyUnreacted: SharedFlow<SocketStoryUnreactedData> = _storyUnreacted.asSharedFlow()
    val storyTranslationUpdated: SharedFlow<SocketStoryTranslationUpdatedData> =
        _storyTranslationUpdated.asSharedFlow()
    val statusCreated: SharedFlow<SocketStatusCreatedData> = _statusCreated.asSharedFlow()
    val statusUpdated: SharedFlow<SocketStatusUpdatedData> = _statusUpdated.asSharedFlow()
    val statusDeleted: SharedFlow<SocketStatusDeletedData> = _statusDeleted.asSharedFlow()
    val statusReacted: SharedFlow<SocketStatusReactedData> = _statusReacted.asSharedFlow()
    val statusUnreacted: SharedFlow<SocketStatusUnreactedData> = _statusUnreacted.asSharedFlow()

    fun attach() {
        listen("post:created", _postCreated)
        listen("post:updated", _postUpdated)
        listen("post:liked", _postLiked)
        listen("post:unliked", _postUnliked)
        listen("post:bookmarked", _postBookmarked)
        listen("post:deleted", _postDeleted)
        listen("post:translation-updated", _postTranslationUpdated)
        listen("comment:added", _commentAdded)
        listen("comment:updated", _commentUpdated)
        listen("comment:liked", _commentLiked)
        listen("comment:unliked", _commentUnliked)
        listen("comment:deleted", _commentDeleted)
        listen("comment:reaction-added", _commentReactionAdded)
        listen("comment:reaction-removed", _commentReactionRemoved)
        listen("comment:translation-updated", _commentTranslationUpdated)
        listen("story:created", _storyCreated)
        listen("story:viewed", _storyViewed)
        listen("story:reacted", _storyReacted)
        listen("story:unreacted", _storyUnreacted)
        listen("story:translation-updated", _storyTranslationUpdated)
        listen("status:created", _statusCreated)
        listen("status:updated", _statusUpdated)
        listen("status:deleted", _statusDeleted)
        listen("status:reacted", _statusReacted)
        listen("status:unreacted", _statusUnreacted)
    }

    /**
     * Joins the post-detail realtime room (port of iOS `SocialSocketManager.joinPostRoom`) —
     * required to receive `post:liked`/`post:unliked`/`comment:added`/`comment:deleted` for a
     * post the viewer isn't otherwise implicitly subscribed to via a friend's feed room.
     */
    fun joinPostRoom(postId: String) {
        socketManager.emit("post:join", JSONObject().put("postId", postId))
    }

    /** Leaves the post-detail realtime room — pairs with [joinPostRoom]. */
    fun leavePostRoom(postId: String) {
        socketManager.emit("post:leave", JSONObject().put("postId", postId))
    }

    private inline fun <reified T> listen(event: String, flow: MutableSharedFlow<T>) {
        socketManager.on(event) { args ->
            runCatching {
                val raw = (args.firstOrNull() as? JSONObject)?.toString() ?: return@on
                flow.tryEmit(json.decodeFromString<T>(raw))
            }.onFailure { Timber.e(it, "Socket decode error [$event]: ${T::class.simpleName}") }
        }
    }

    private fun <T> buf(): MutableSharedFlow<T> =
        MutableSharedFlow(replay = 0, extraBufferCapacity = 64)
}
