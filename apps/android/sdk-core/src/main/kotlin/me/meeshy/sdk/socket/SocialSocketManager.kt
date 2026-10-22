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
    private val _postReposted = buf<SocketPostRepostedData>()
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
    private val _mediaCaptionTranslationUpdated = buf<SocketMediaCaptionTranslationUpdatedData>()
    private val _storyCreated = buf<SocketStoryCreatedData>()
    private val _storyUpdated = buf<SocketStoryUpdatedData>()
    private val _storyViewed = buf<SocketStoryViewedData>()
    private val _storyReacted = buf<SocketStoryReactedData>()
    private val _storyUnreacted = buf<SocketStoryUnreactedData>()
    private val _storyDeleted = buf<SocketStoryDeletedData>()
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
        listen(SocketEventNames.POST_CREATED, _postCreated)
        listen(SocketEventNames.POST_UPDATED, _postUpdated)
        listen(SocketEventNames.POST_REPOSTED, _postReposted)
        listen(SocketEventNames.POST_LIKED, _postLiked)
        listen(SocketEventNames.POST_UNLIKED, _postUnliked)
        listen(SocketEventNames.POST_BOOKMARKED, _postBookmarked)
        listen(SocketEventNames.POST_DELETED, _postDeleted)
        listen(SocketEventNames.POST_TRANSLATION_UPDATED, _postTranslationUpdated)
        listen(SocketEventNames.COMMENT_ADDED, _commentAdded)
        listen(SocketEventNames.COMMENT_UPDATED, _commentUpdated)
        listen(SocketEventNames.COMMENT_LIKED, _commentLiked)
        listen(SocketEventNames.COMMENT_UNLIKED, _commentUnliked)
        listen(SocketEventNames.COMMENT_DELETED, _commentDeleted)
        listen(SocketEventNames.COMMENT_REACTION_ADDED, _commentReactionAdded)
        listen(SocketEventNames.COMMENT_REACTION_REMOVED, _commentReactionRemoved)
        listen(SocketEventNames.COMMENT_TRANSLATION_UPDATED, _commentTranslationUpdated)
        listen(SocketEventNames.MEDIA_CAPTION_TRANSLATION_UPDATED, _mediaCaptionTranslationUpdated)
        listen(SocketEventNames.STORY_CREATED, _storyCreated)
        listen(SocketEventNames.STORY_UPDATED, _storyUpdated)
        listen(SocketEventNames.STORY_VIEWED, _storyViewed)
        listen(SocketEventNames.STORY_REACTED, _storyReacted)
        listen(SocketEventNames.STORY_UNREACTED, _storyUnreacted)
        listen(SocketEventNames.STORY_DELETED, _storyDeleted)
        listen(SocketEventNames.STORY_TRANSLATION_UPDATED, _storyTranslationUpdated)
        listen(SocketEventNames.STATUS_CREATED, _statusCreated)
        listen(SocketEventNames.STATUS_UPDATED, _statusUpdated)
        listen(SocketEventNames.STATUS_DELETED, _statusDeleted)
        listen(SocketEventNames.STATUS_REACTED, _statusReacted)
        listen(SocketEventNames.STATUS_UNREACTED, _statusUnreacted)
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
