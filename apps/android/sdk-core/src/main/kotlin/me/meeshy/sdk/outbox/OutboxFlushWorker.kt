package me.meeshy.sdk.outbox

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.serialization.json.Json
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendRequestDelivery
import me.meeshy.sdk.friend.FriendRequestSend
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaRepository
import me.meeshy.sdk.media.MediaUploadSender
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AddReactionRequest
import me.meeshy.sdk.net.api.BlockApi
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.ConversationPreferencesUpdate
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.net.api.EditMessageRequest
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.ReactionApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.story.PublishMediaWriteBack
import timber.log.Timber
import java.util.concurrent.TimeUnit

/**
 * WorkManager worker that drains all outbox lanes (ARCHITECTURE.md §5; ADR-006).
 *
 * Runs on every network reconnect and after any [OutboxRepository.enqueue] call.
 * Each lane drains independently; a transient failure in one lane does not block others.
 * Exponential backoff is handled by WorkManager if [Result.retry] is returned.
 */
@HiltWorker
class OutboxFlushWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val outboxRepository: OutboxRepository,
    private val messageRepository: MessageRepository,
    private val messageApi: MessageApi,
    private val reactionApi: ReactionApi,
    private val conversationApi: ConversationApi,
    private val postApi: PostApi,
    private val mediaRepository: MediaRepository,
    private val mediaBlobStore: MediaBlobStore,
    private val blockApi: BlockApi,
    private val blockCache: BlockCache,
    private val friendRepository: FriendRepository,
    private val friendshipCache: FriendshipCache,
    private val json: Json,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        outboxRepository.recoverInflight()

        val senders = buildSenders()
        val drainer = OutboxDrainer(
            outboxRepository,
            senders,
            onExhausted = { row ->
                when (row.kindEnum) {
                    OutboxKind.SEND_MESSAGE -> messageRepository.markSendFailed(row.cmid)
                    OutboxKind.UPLOAD_MEDIA -> mediaBlobStore.remove(row.cmid)
                    // A hard-exhausted block/unblock rolls the optimistic SSOT flip
                    // back so the blocklist re-hydrates truthfully on next load.
                    OutboxKind.BLOCK_USER -> blockCache.setBlocked(row.targetId, blocked = false)
                    OutboxKind.UNBLOCK_USER -> blockCache.setBlocked(row.targetId, blocked = true)
                    // A hard-exhausted friend request rolls the optimistic pending
                    // entry back so the connect button re-offers on next resolve.
                    OutboxKind.SEND_FRIEND_REQUEST -> friendshipCache.rollbackSendRequest(row.targetId)
                    else -> Unit
                }
            },
            graftProducedId = PublishMediaWriteBack::graft,
        )

        // Derived from the kind→lane SSOT so a registered sender can never be
        // stranded on an undrained lane (see OutboxLaneMap).
        val lanes = OutboxLaneMap.sharedDrainLanes

        val reports = mutableListOf<DrainReport>()

        // Drain per-conversation message lanes
        val messageLanes = outboxRepository
            .deliverable(OutboxLanes.forMessage(""))
            .map { it.lane }
            .distinct()
        for (lane in messageLanes) {
            val report = drainer.drainLane(lane)
            Timber.d("OutboxFlush lane=$lane delivered=${report.delivered} exhausted=${report.exhausted}")
            reports += report
        }

        // Drain shared lanes
        for (lane in lanes) {
            val report = drainer.drainLane(lane)
            Timber.d("OutboxFlush lane=$lane delivered=${report.delivered} exhausted=${report.exhausted}")
            reports += report
        }

        return when (OutboxFlushPlan.outcome(reports)) {
            FlushOutcome.RETRY -> Result.retry()
            FlushOutcome.SUCCESS -> Result.success()
        }
    }

    private fun buildSenders(): Map<OutboxKind, MutationSender> = mapOf(
        OutboxKind.SEND_MESSAGE to MutationSender { row ->
            val req = runCatching { json.decodeFromString<SendMessageRequest>(row.payload) }
                .getOrElse { return@MutationSender SendResult.PermanentFailure("Bad payload: ${it.message}") }
            when (val result = apiCall { messageApi.send(row.targetId, req) }) {
                is NetworkResult.Success -> {
                    messageRepository.reconcileSent(row.cmid, result.data)
                    SendResult.Success
                }
                is NetworkResult.Failure -> SendResult.TransientFailure
            }
        },
        OutboxKind.EDIT_MESSAGE to MutationSender { row ->
            val body = runCatching { json.decodeFromString<EditMessageRequest>(row.payload) }
                .getOrElse { return@MutationSender SendResult.PermanentFailure("Bad payload: ${it.message}") }
            when (apiCall { messageApi.edit(row.targetId, body) }) {
                is NetworkResult.Success -> SendResult.Success
                is NetworkResult.Failure -> SendResult.TransientFailure
            }
        },
        OutboxKind.DELETE_MESSAGE to MutationSender { row ->
            when (apiCall { messageApi.delete(row.targetId) }) {
                is NetworkResult.Success -> SendResult.Success
                is NetworkResult.Failure -> SendResult.TransientFailure
            }
        },
        OutboxKind.ADD_REACTION to MutationSender { row ->
            val body = runCatching { json.decodeFromString<ReactionPayload>(row.payload) }
                .getOrElse { return@MutationSender SendResult.PermanentFailure("Bad payload: ${it.message}") }
            when (apiCall { reactionApi.add(AddReactionRequest(messageId = row.targetId, emoji = body.emoji)) }) {
                is NetworkResult.Success -> SendResult.Success
                is NetworkResult.Failure -> SendResult.TransientFailure
            }
        },
        OutboxKind.REMOVE_REACTION to MutationSender { row ->
            val body = runCatching { json.decodeFromString<ReactionPayload>(row.payload) }
                .getOrElse { return@MutationSender SendResult.PermanentFailure("Bad payload: ${it.message}") }
            when (apiCall { reactionApi.remove(row.targetId, body.emoji) }) {
                is NetworkResult.Success -> SendResult.Success
                is NetworkResult.Failure -> SendResult.TransientFailure
            }
        },
        OutboxKind.READ_RECEIPT to MutationSender { row ->
            when (apiCall { conversationApi.markRead(row.targetId) }) {
                is NetworkResult.Success -> SendResult.Success
                is NetworkResult.Failure -> SendResult.TransientFailure
            }
        },
        OutboxKind.UPDATE_CONVERSATION_PREFS to MutationSender { row ->
            val prefs = runCatching { json.decodeFromString<ConversationPrefsPayload>(row.payload) }
                .getOrElse { return@MutationSender SendResult.PermanentFailure("Bad payload: ${it.message}") }
            val body = ConversationPreferencesUpdate(
                isPinned = prefs.isPinned,
                isMuted = prefs.isMuted,
                isArchived = prefs.isArchived,
                mentionsOnly = prefs.mentionsOnly,
            )
            when (apiCall { conversationApi.updatePreferences(row.targetId, body) }) {
                is NetworkResult.Success -> SendResult.Success
                is NetworkResult.Failure -> SendResult.TransientFailure
            }
        },
        OutboxKind.PUBLISH_STORY to MutationSender { row ->
            val req = runCatching { json.decodeFromString<CreateStoryRequest>(row.payload) }
                .getOrElse { return@MutationSender SendResult.PermanentFailure("Bad payload: ${it.message}") }
            when (apiCall { postApi.createStory(req) }) {
                is NetworkResult.Success -> SendResult.Success
                is NetworkResult.Failure -> SendResult.TransientFailure
            }
        },
        OutboxKind.UPLOAD_MEDIA to MutationSender { row ->
            val item = mediaBlobStore.get(row.cmid)
            val result = MediaUploadSender.send(item) { mediaRepository.upload(listOf(it)) }
            if (result !is SendResult.TransientFailure) {
                mediaBlobStore.remove(row.cmid)
            }
            result
        },
        OutboxKind.BLOCK_USER to MutationSender { row ->
            when (apiCall { blockApi.block(row.targetId) }) {
                is NetworkResult.Success -> SendResult.Success
                is NetworkResult.Failure -> SendResult.TransientFailure
            }
        },
        OutboxKind.UNBLOCK_USER to MutationSender { row ->
            when (apiCall { blockApi.unblock(row.targetId) }) {
                is NetworkResult.Success -> SendResult.Success
                is NetworkResult.Failure -> SendResult.TransientFailure
            }
        },
        OutboxKind.SEND_FRIEND_REQUEST to MutationSender { row ->
            val payload = runCatching { json.decodeFromString<FriendRequestPayload>(row.payload) }
                .getOrElse { return@MutationSender SendResult.PermanentFailure("Bad payload: ${it.message}") }
            val result = friendRepository.sendFriendRequest(row.targetId, payload.message)
            when (val delivery = FriendRequestSend.classify(result)) {
                is FriendRequestDelivery.Delivered -> {
                    // Graft the real request id over the optimistic placeholder so
                    // a later cancel/accept targets the true request.
                    friendshipCache.didSendRequest(row.targetId, delivery.requestId)
                    SendResult.Success
                }
                FriendRequestDelivery.AlreadyExists -> SendResult.Success
                FriendRequestDelivery.Retry -> SendResult.TransientFailure
                is FriendRequestDelivery.Rejected -> SendResult.PermanentFailure(delivery.reason)
            }
        },
    )

    companion object {
        const val TAG = "OutboxFlushWorker"

        fun buildRequest(): OneTimeWorkRequest =
            OneTimeWorkRequestBuilder<OutboxFlushWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
                .addTag(TAG)
                .build()
    }
}
