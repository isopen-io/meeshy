package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.model.net.OnlyUnlinkedRefusal
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CreateCommentRequest
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.CommentPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.OutboxPayloadGraft
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.UnsentCommentNotice
import me.meeshy.sdk.outbox.withPayload
import me.meeshy.sdk.post.PostComposerDraftStore
import me.meeshy.sdk.post.PostPublishMediaWriteBack
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.post.UnsentCommentStore
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.commitOrWrite
import kotlinx.coroutines.CancellationException
import javax.inject.Inject

/**
 * `CREATE_POST` (#13417): publishes a post or a reel the device queued, under the row's own
 * `cmid` as `X-Client-Mutation-Id` — the gateway's MutationLog answers a replay with the post
 * it already wrote, so a response lost on the way back never publishes twice.
 *
 * Once created, every row that waited on the post's local id is re-addressed to the server id
 * and the post joins the feed cache at once; only then does the draft parked for it leave the
 * device ([PostComposerDraftStore.release]). A refusal the same payload would meet again
 * (4xx other than 401/408/429) exhausts the row immediately instead of replaying it five
 * times: the row is KEPT, with its media, for the author to retry or discard from
 * « Publications non envoyées ».
 */
public class CreatePostHandler @Inject constructor(
    private val postApi: PostApi,
    private val outboxRepository: OutboxRepository,
    private val json: Json,
    private val postRepository: PostRepository,
    private val draftStore: PostComposerDraftStore,
) : OutboxKindHandler {

    override val payloadGraft: OutboxPayloadGraft = PostPublishMediaWriteBack::graft

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<CreatePostRequest>(row) { request ->
            when (val result = apiCall { postApi.create(request, row.cmid) }) {
                is NetworkResult.Success -> {
                    runCatching { outboxRepository.resolveLocalId(row.targetId, result.data.id) }
                    runCatching { postRepository.adoptPublished(result.data) }
                    runCatching { draftStore.release(row.cmid) }
                    SendResult.Success
                }
                is NetworkResult.Failure -> result.error.onlyUnlinkedRefusal() ?: result.error.httpStatus.toPostFailure()
            }
        }

    private fun Int?.toPostFailure(): SendResult = when {
        this == null || this in HTTP_RETRYABLE || this >= HTTP_SERVER_ERROR -> SendResult.TransientFailure
        this in HTTP_CLIENT_ERRORS -> SendResult.PermanentFailure("Post refused: HTTP $this")
        else -> SendResult.TransientFailure
    }

    private companion object {
        const val HTTP_SERVER_ERROR = 500
        val HTTP_RETRYABLE = setOf(401, 408, 429)
        val HTTP_CLIENT_ERRORS = 400..499
    }
}

/**
 * Le plafond des personnes choisies sans lien (#14105, #14169) : la même publication le rencontrerait de nouveau aujourd'hui,
 * elle renonce donc tout de suite, sans réessai, et sa ligne garde le refus avec ses nombres
 * ([OnlyUnlinkedRefusal.reason]) pour que « Publications non envoyées » le dise à l'auteur.
 */
internal fun ApiError.onlyUnlinkedRefusal(): SendResult? =
    if (httpStatus == HTTP_TOO_MANY_REQUESTS && code == OnlyUnlinkedRefusal.CODE) {
        SendResult.PermanentFailure(OnlyUnlinkedRefusal(limit = limit, unlinked = unlinked).reason)
    } else {
        null
    }

private const val HTTP_TOO_MANY_REQUESTS = 429

/**
 * `CREATE_COMMENT` (#13679): posts the comment the device queued — typed in a notification banner, with no screen open —
 * under the row's own `cmid` as `X-Client-Mutation-Id`: the gateway's MutationLog answers a replay with the comment it
 * already wrote (`replayCost: 'diverges'`), so a response lost on the way back never comments twice. A 410
 * carrying `MUTATION_RESULT_GONE` (the first comment was deleted since) means the gesture WAS applied: success, never a second
 * insert. A refusal the same payload would meet again (a deleted or private post, a closed thread, a validation error
 * carried by the gateway envelope) exhausts the row at once and takes the optimistic count back; anything else (401 during
 * a session renewal, 408, 429, 5xx, network) is replayed. A row that gives up (#13693) keeps its text on the device
 * ([UnsentCommentStore]) and tells the author ([UnsentCommentNotice]) — the banner left at COMMENT_QUEUED, so nothing else would.
 * Only for its AUTHOR, under the account fence: a row with no author, or exhausted while another account is signed in or
 * while the author's account closes, leaves no text behind.
 */
public class CreateCommentHandler @Inject constructor(
    private val postApi: PostApi,
    private val json: Json,
    private val postRepository: PostRepository,
    private val unsent: UnsentCommentStore,
    private val notice: UnsentCommentNotice,
    private val fence: AccountFence? = null,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<CommentPayload>(row) { comment ->
            val request = CreateCommentRequest(
                content = comment.content,
                parentId = comment.parentId,
                originalLanguage = comment.originalLanguage,
            )
            val result = apiCall { postApi.addComment(row.targetId, request, row.cmid) }
            when (result) {
                is NetworkResult.Success -> SendResult.Success
                is NetworkResult.Failure -> result.error.toCommentFailure()
            }
        }

    override suspend fun onExhausted(row: OutboxEntity) {
        postRepository.rollbackQueuedComment(row.targetId)
        val author = row.ownerId?.takeIf { it.isNotBlank() } ?: return
        val text = runCatching { json.decodeFromString<CommentPayload>(row.payload).content }.getOrNull()
            ?.takeIf { it.isNotBlank() }
            ?: return
        runCatching {
            val ticket = fence?.ticket()
            if (ticket != null && ticket.ownerId != author) return@runCatching
            fence.commitOrWrite(ticket) { unsent.keep(row.targetId, text) } ?: return@runCatching
            notice.commentNotSent(author, row.targetId, text)
        }.onFailure { if (it is CancellationException) throw it }
    }

    private fun ApiError.toCommentFailure(): SendResult = when {
        httpStatus == HTTP_GONE && code == MUTATION_RESULT_GONE -> SendResult.Success
        httpStatus in DEFINITIVE_REFUSALS && code != "HTTP_$httpStatus" -> SendResult.PermanentFailure("Comment refused: HTTP $httpStatus $code")
        else -> SendResult.TransientFailure
    }

    private companion object {
        const val HTTP_GONE = 410
        const val MUTATION_RESULT_GONE = "MUTATION_RESULT_GONE"
        val DEFINITIVE_REFUSALS = setOf(400, 403, 404, 422)
    }
}

@Module
@InstallIn(SingletonComponent::class)
public interface PostSendersModule {

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.CREATE_POST)
    public fun createPost(handler: CreatePostHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.CREATE_COMMENT)
    public fun createComment(handler: CreateCommentHandler): OutboxKindHandler
}
