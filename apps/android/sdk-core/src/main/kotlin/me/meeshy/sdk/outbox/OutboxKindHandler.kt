package me.meeshy.sdk.outbox

import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
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
 * statuses (persist-outbox-flusher-classifie): a failed call is retryable — except a
 * gesture the gateway refuses in clear for an end-to-end conversation ([SignalChannelRefusal]),
 * which would be refused identically forever. A handler that knows the row's
 * [conversationId] lets the [ledger] learn it, so no later row leaves in clear.
 */
internal fun NetworkResult<*>.toSendResult(
    conversationId: String? = null,
    ledger: EndToEndRegimeLedger = EndToEndRegimeLedger.None,
): SendResult = when (this) {
    is NetworkResult.Success -> SendResult.Success
    is NetworkResult.Failure -> SignalChannelRefusal.of(this, conversationId, ledger) ?: SendResult.TransientFailure
}

/**
 * #13790 — `409 E2EE_SIGNAL_CHANNEL_REQUIRED` (`services/gateway/src/services/e2ee/e2ee-signal-channel.ts`) : réagir,
 * épingler ou supprimer pour tous y voyage en signal chiffré, que cet appareil ne sait pas sceller. Le refus est DÉFINITIF —
 * le rejouer renverrait le geste en clair à chaque essai —, la ligne s'épuise et son effet optimiste se défait.
 */
internal object SignalChannelRefusal {
    const val CODE: String = "E2EE_SIGNAL_CHANNEL_REQUIRED"

    fun of(failure: NetworkResult.Failure, conversationId: String?, ledger: EndToEndRegimeLedger): SendResult? {
        if (failure.error.code != CODE) return null
        conversationId?.takeIf { it.isNotBlank() }?.let(ledger::learn)
        return SendResult.PermanentFailure(OutboxPlaintextAdmission.REASON_SIGNAL_CHANNEL_REQUIRED)
    }
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
