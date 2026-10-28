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
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import javax.inject.Inject

/**
 * `PUBLISH_STORY`: publishes the queued story. Once the story has its server id, every like
 * or bookmark that waited on the `pending_` handle is re-addressed to it and leaves the hold.
 * It owns the graft that swaps an upload's placeholder `cmid` for the real media id in the
 * story's `mediaIds`. The composer draft that queued it leaves the device only now
 * ([StoryDraftConfirmation], #13417).
 */
public class PublishStoryHandler @Inject constructor(
    private val postApi: PostApi,
    private val outboxRepository: OutboxRepository,
    private val json: Json,
    private val storyRepository: StoryRepository,
    private val draftConfirmation: StoryDraftConfirmation,
) : OutboxKindHandler {

    override val payloadGraft: OutboxPayloadGraft = PublishMediaWriteBack::graft

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<CreateStoryRequest>(row) { request ->
            when (val result = apiCall { postApi.createStory(request) }) {
                is NetworkResult.Success -> {
                    runCatching { outboxRepository.resolveLocalId(row.targetId, result.data.id) }
                    runCatching { storyRepository.adoptPublished(result.data) }
                    runCatching { draftConfirmation.settle(delivered = row.cmid) }
                    SendResult.Success
                }
                is NetworkResult.Failure -> SendResult.TransientFailure
            }
        }
}

/**
 * Ce que la file d'envoi d'un j'aime, d'un favori ou de leur retrait fait de la réponse de la passerelle (#13588, #13594).
 * - 409 / 410 : le serveur dit DÉJÀ acquis le geste, succès idempotent. Seul `POST /posts/:id/like` rend 409
 *   (`REACTION_LIMIT_REACHED` : cinq réactions déjà posées, donc le post est déjà aimé côté serveur). 410
 *   `MUTATION_RESULT_GONE` n'est servi par aucune des quatre routes (`replayCost: 'converges'`), il est accepté par
 *   prudence.
 * - 400 / 403 / 404 / 422 : refus DÉFINITIF (post supprimé, privé ou bloqué : `POST_NOT_FOUND` ; emoji invalide ; accès
 *   refusé). Le réessayer ne changera rien : échec immédiat, le geste est défait tout de suite.
 * - tout le reste (401 le temps d'un renouvellement de session, 408, 429, 5xx, réseau) : transitoire, réessayé.
 */
internal fun NetworkResult<*>.toToggleSendResult(): SendResult {
    val status = (this as? NetworkResult.Failure)?.error?.httpStatus
    return when (status) {
        in ALREADY_APPLIED_STATUSES -> SendResult.Success
        in DEFINITIVE_REFUSALS -> SendResult.PermanentFailure("Refused: HTTP $status")
        else -> toSendResult()
    }
}

private val ALREADY_APPLIED_STATUSES = setOf(409, 410)
private val DEFINITIVE_REFUSALS = setOf(400, 403, 404, 422)

/** `LIKE_POST`: likes the post; an exhausted like rolls the optimistic flip back to unliked. */
public class LikePostHandler @Inject constructor(
    private val postApi: PostApi,
    private val postRepository: PostRepository,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        apiCall { postApi.like(row.targetId) }.toToggleSendResult().also { if (it == SendResult.Success) postRepository.settleGesture(row.cmid) }

    override suspend fun onExhausted(row: OutboxEntity) {
        postRepository.rollbackLike(row.targetId, liked = false, cmid = row.cmid)
    }
}

/** `UNLIKE_POST`: removes the like; an exhausted unlike rolls the flip back to liked. */
public class UnlikePostHandler @Inject constructor(
    private val postApi: PostApi,
    private val postRepository: PostRepository,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        apiCall { postApi.unlike(row.targetId) }.toToggleSendResult().also { if (it == SendResult.Success) postRepository.settleGesture(row.cmid) }

    override suspend fun onExhausted(row: OutboxEntity) {
        postRepository.rollbackLike(row.targetId, liked = true, cmid = row.cmid)
    }
}

/** `BOOKMARK_POST`: bookmarks the post; an exhausted bookmark rolls back to not bookmarked. */
public class BookmarkPostHandler @Inject constructor(
    private val postApi: PostApi,
    private val postRepository: PostRepository,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        apiCall { postApi.bookmark(row.targetId) }.toToggleSendResult().also { if (it == SendResult.Success) postRepository.settleGesture(row.cmid) }

    override suspend fun onExhausted(row: OutboxEntity) {
        postRepository.rollbackBookmark(row.targetId, bookmarked = false, cmid = row.cmid)
    }
}

/** `UNBOOKMARK_POST`: removes the bookmark; an exhausted removal rolls back to bookmarked. */
public class UnbookmarkPostHandler @Inject constructor(
    private val postApi: PostApi,
    private val postRepository: PostRepository,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        apiCall { postApi.removeBookmark(row.targetId) }.toToggleSendResult().also { if (it == SendResult.Success) postRepository.settleGesture(row.cmid) }

    override suspend fun onExhausted(row: OutboxEntity) {
        postRepository.rollbackBookmark(row.targetId, bookmarked = true, cmid = row.cmid)
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
