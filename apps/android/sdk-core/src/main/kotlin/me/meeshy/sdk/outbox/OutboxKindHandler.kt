package me.meeshy.sdk.outbox

import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.net.NetworkResult

/**
 * Everything the outbox knows how to do for ONE [OutboxKind]: deliver the row
 * ([send], inherited from [MutationSender]) and undo its optimistic effect once the
 * row gives up ([onExhausted]). The two halves live in the same class so a kind's
 * delivery and its rollback can never drift apart across files.
 *
 * Handlers are bound into a Hilt map by [OutboxKindKey]; [MutationSenderRegistry]
 * hands the map to the [OutboxDrainer]. A handler is stateless: it is built per
 * flush pass from its injected collaborators.
 */
public interface OutboxKindHandler : MutationSender {

    /**
     * Called once when a row of this kind is exhausted (retries spent, permanent
     * failure, or a failed prerequisite). Rolls back the optimistic local effect so
     * the UI re-hydrates truthfully. No-op by default: most kinds have nothing to undo.
     */
    public suspend fun onExhausted(row: OutboxEntity) {}

    /**
     * The write-back this kind applies when an upload it depends on delivers its real
     * id: swaps the prerequisite's placeholder `cmid` in this kind's own queued
     * payload (see [OutboxPayloadGrafts]). `null` for kinds that never wait on an upload.
     */
    public val payloadGraft: OutboxPayloadGraft? get() = null
}

/**
 * The delivery contract shared by every handler until the flusher classifies
 * statuses (persist-outbox-flusher-classifie): any failed call is retryable.
 */
internal fun NetworkResult<*>.toSendResult(): SendResult = when (this) {
    is NetworkResult.Success -> SendResult.Success
    is NetworkResult.Failure -> SendResult.TransientFailure
}

/**
 * Decodes [OutboxEntity.payload] as [P] and hands it to [deliver]. A payload that does
 * not decode can never succeed on retry, so it is a [SendResult.PermanentFailure]
 * rather than a transient one that would spin the lane forever.
 */
internal suspend inline fun <reified P> Json.withPayload(
    row: OutboxEntity,
    deliver: (P) -> SendResult,
): SendResult {
    val payload = runCatching { decodeFromString<P>(row.payload) }
        .getOrElse { return SendResult.PermanentFailure("Bad payload: ${it.message}", unreadable = true) }
    return deliver(payload)
}
