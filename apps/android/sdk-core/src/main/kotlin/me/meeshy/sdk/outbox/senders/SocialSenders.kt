package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.OutboxPayloadGraft
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.toSendResult
import me.meeshy.sdk.outbox.withPayload
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.story.PublishMediaWriteBack
import me.meeshy.sdk.story.StoryRepository
import javax.inject.Inject

/**
 * `PUBLISH_STORY`: publishes the queued story. Once the story has its server id, every like
 * or bookmark that waited on the `pending_` handle is re-addressed to it and leaves the hold.
 * It owns the graft that swaps an upload's placeholder `cmid` for the real media id in the
 * story's `mediaIds`.
 */
public class PublishStoryHandler @Inject constructor(
    private val postApi: PostApi,
    private val outboxRepository: OutboxRepository,
    private val json: Json,
    private val storyRepository: StoryRepository,
) : OutboxKindHandler {

    override val payloadGraft: OutboxPayloadGraft = PublishMediaWriteBack::graft

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<CreateStoryRequest>(row) { request ->
            when (val result = apiCall { postApi.createStory(request) }) {
                is NetworkResult.Success -> {
                    runCatching { outboxRepository.resolveLocalId(row.targetId, result.data.id) }
                    runCatching { storyRepository.adoptPublished(result.data) }
                    SendResult.Success
                }
                is NetworkResult.Failure -> SendResult.TransientFailure
            }
        }
}

/** `LIKE_POST`: likes the post; an exhausted like rolls the optimistic flip back to unliked. */
public class LikePostHandler @Inject constructor(
    private val postApi: PostApi,
    private val postRepository: PostRepository,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        apiCall { postApi.like(row.targetId) }.toSendResult()

    override suspend fun onExhausted(row: OutboxEntity) {
        postRepository.rollbackLike(row.targetId, liked = false)
    }
}

/** `UNLIKE_POST`: removes the like; an exhausted unlike rolls the flip back to liked. */
public class UnlikePostHandler @Inject constructor(
    private val postApi: PostApi,
    private val postRepository: PostRepository,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        apiCall { postApi.unlike(row.targetId) }.toSendResult()

    override suspend fun onExhausted(row: OutboxEntity) {
        postRepository.rollbackLike(row.targetId, liked = true)
    }
}

/** `BOOKMARK_POST`: bookmarks the post; an exhausted bookmark rolls back to not bookmarked. */
public class BookmarkPostHandler @Inject constructor(
    private val postApi: PostApi,
    private val postRepository: PostRepository,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        apiCall { postApi.bookmark(row.targetId) }.toSendResult()

    override suspend fun onExhausted(row: OutboxEntity) {
        postRepository.rollbackBookmark(row.targetId, bookmarked = false)
    }
}

/** `UNBOOKMARK_POST`: removes the bookmark; an exhausted removal rolls back to bookmarked. */
public class UnbookmarkPostHandler @Inject constructor(
    private val postApi: PostApi,
    private val postRepository: PostRepository,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        apiCall { postApi.removeBookmark(row.targetId) }.toSendResult()

    override suspend fun onExhausted(row: OutboxEntity) {
        postRepository.rollbackBookmark(row.targetId, bookmarked = true)
    }
}

@Module
@InstallIn(SingletonComponent::class)
public interface SocialSendersModule {

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.PUBLISH_STORY)
    public fun publishStory(handler: PublishStoryHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.LIKE_POST)
    public fun likePost(handler: LikePostHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.UNLIKE_POST)
    public fun unlikePost(handler: UnlikePostHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.BOOKMARK_POST)
    public fun bookmarkPost(handler: BookmarkPostHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.UNBOOKMARK_POST)
    public fun unbookmarkPost(handler: UnbookmarkPostHandler): OutboxKindHandler
}
