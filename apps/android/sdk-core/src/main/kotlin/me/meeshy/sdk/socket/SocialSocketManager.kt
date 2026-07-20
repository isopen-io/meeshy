package me.meeshy.sdk.socket

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.SocketPostCreatedData
import me.meeshy.sdk.model.SocketPostLikedData
import me.meeshy.sdk.model.SocketPostUnlikedData
import me.meeshy.sdk.model.SocketPostBookmarkedData
import me.meeshy.sdk.model.SocketPostDeletedData
import me.meeshy.sdk.model.SocketCommentAddedData
import me.meeshy.sdk.model.SocketCommentLikedData
import me.meeshy.sdk.model.SocketCommentDeletedData
import me.meeshy.sdk.model.SocketCommentReactionUpdateData
import me.meeshy.sdk.model.SocketStoryCreatedData
import me.meeshy.sdk.model.SocketStoryViewedData
import me.meeshy.sdk.model.SocketStoryReactedData
import me.meeshy.sdk.model.SocketStoryUnreactedData
import me.meeshy.sdk.model.SocketStatusCreatedData
import me.meeshy.sdk.model.SocketStatusUpdatedData
import me.meeshy.sdk.model.SocketStatusDeletedData
import me.meeshy.sdk.model.SocketStatusReactedData
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
    private val _postLiked = buf<SocketPostLikedData>()
    private val _postUnliked = buf<SocketPostUnlikedData>()
    private val _postBookmarked = buf<SocketPostBookmarkedData>()
    private val _postDeleted = buf<SocketPostDeletedData>()
    private val _commentAdded = buf<SocketCommentAddedData>()
    private val _commentLiked = buf<SocketCommentLikedData>()
    private val _commentDeleted = buf<SocketCommentDeletedData>()
    private val _commentReactionAdded = buf<SocketCommentReactionUpdateData>()
    private val _commentReactionRemoved = buf<SocketCommentReactionUpdateData>()
    private val _storyCreated = buf<SocketStoryCreatedData>()
    private val _storyViewed = buf<SocketStoryViewedData>()
    private val _storyReacted = buf<SocketStoryReactedData>()
    private val _storyUnreacted = buf<SocketStoryUnreactedData>()
    private val _statusCreated = buf<SocketStatusCreatedData>()
    private val _statusUpdated = buf<SocketStatusUpdatedData>()
    private val _statusDeleted = buf<SocketStatusDeletedData>()
    private val _statusReacted = buf<SocketStatusReactedData>()

    val postCreated: SharedFlow<SocketPostCreatedData> = _postCreated.asSharedFlow()
    val postLiked: SharedFlow<SocketPostLikedData> = _postLiked.asSharedFlow()
    val postUnliked: SharedFlow<SocketPostUnlikedData> = _postUnliked.asSharedFlow()
    val postBookmarked: SharedFlow<SocketPostBookmarkedData> = _postBookmarked.asSharedFlow()
    val postDeleted: SharedFlow<SocketPostDeletedData> = _postDeleted.asSharedFlow()
    val commentAdded: SharedFlow<SocketCommentAddedData> = _commentAdded.asSharedFlow()
    val commentLiked: SharedFlow<SocketCommentLikedData> = _commentLiked.asSharedFlow()
    val commentDeleted: SharedFlow<SocketCommentDeletedData> = _commentDeleted.asSharedFlow()
    val commentReactionAdded: SharedFlow<SocketCommentReactionUpdateData> = _commentReactionAdded.asSharedFlow()
    val commentReactionRemoved: SharedFlow<SocketCommentReactionUpdateData> = _commentReactionRemoved.asSharedFlow()
    val storyCreated: SharedFlow<SocketStoryCreatedData> = _storyCreated.asSharedFlow()
    val storyViewed: SharedFlow<SocketStoryViewedData> = _storyViewed.asSharedFlow()
    val storyReacted: SharedFlow<SocketStoryReactedData> = _storyReacted.asSharedFlow()
    val storyUnreacted: SharedFlow<SocketStoryUnreactedData> = _storyUnreacted.asSharedFlow()
    val statusCreated: SharedFlow<SocketStatusCreatedData> = _statusCreated.asSharedFlow()
    val statusUpdated: SharedFlow<SocketStatusUpdatedData> = _statusUpdated.asSharedFlow()
    val statusDeleted: SharedFlow<SocketStatusDeletedData> = _statusDeleted.asSharedFlow()
    val statusReacted: SharedFlow<SocketStatusReactedData> = _statusReacted.asSharedFlow()

    fun attach() {
        listen("post:created", _postCreated)
        listen("post:liked", _postLiked)
        listen("post:unliked", _postUnliked)
        listen("post:bookmarked", _postBookmarked)
        listen("post:deleted", _postDeleted)
        listen("comment:added", _commentAdded)
        listen("comment:liked", _commentLiked)
        listen("comment:deleted", _commentDeleted)
        listen("comment:reaction-added", _commentReactionAdded)
        listen("comment:reaction-removed", _commentReactionRemoved)
        listen("story:created", _storyCreated)
        listen("story:viewed", _storyViewed)
        listen("story:reacted", _storyReacted)
        listen("story:unreacted", _storyUnreacted)
        listen("status:created", _statusCreated)
        listen("status:updated", _statusUpdated)
        listen("status:deleted", _statusDeleted)
        listen("status:reacted", _statusReacted)
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
