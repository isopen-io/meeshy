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
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AddReactionRequest
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.ConversationPreferencesUpdate
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.net.api.EditMessageRequest
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.ReactionApi
import me.meeshy.sdk.net.apiCall
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
    private val json: Json,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        outboxRepository.recoverInflight()

        val senders = buildSenders()
        val drainer = OutboxDrainer(outboxRepository, senders) { row ->
            if (row.kindEnum == OutboxKind.SEND_MESSAGE) {
                messageRepository.markSendFailed(row.cmid)
            }
        }

        val lanes = listOf(
            OutboxLanes.REACTION,
            OutboxLanes.READ_RECEIPT,
            OutboxLanes.CONVERSATION_PREFS,
            OutboxLanes.PRESENCE,
            OutboxLanes.SOCIAL,
            OutboxLanes.STORY,
            OutboxLanes.PROFILE,
            OutboxLanes.SETTINGS,
        )

        var anyTransient = false

        // Drain per-conversation message lanes
        val messageLanes = outboxRepository
            .deliverable(OutboxLanes.forMessage(""))
            .map { it.lane }
            .distinct()
        for (lane in messageLanes) {
            val report = drainer.drainLane(lane)
            Timber.d("OutboxFlush lane=$lane delivered=${report.delivered} exhausted=${report.exhausted}")
            if (report.stoppedOnTransientFailure) anyTransient = true
        }

        // Drain shared lanes
        for (lane in lanes) {
            val report = drainer.drainLane(lane)
            Timber.d("OutboxFlush lane=$lane delivered=${report.delivered} exhausted=${report.exhausted}")
            if (report.stoppedOnTransientFailure) anyTransient = true
        }

        return if (anyTransient) Result.retry() else Result.success()
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
