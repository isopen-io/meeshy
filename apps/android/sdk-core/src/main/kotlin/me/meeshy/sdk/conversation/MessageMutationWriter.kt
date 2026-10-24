package me.meeshy.sdk.conversation

import java.time.Instant
import kotlinx.serialization.encodeToString
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.EditMessageRequest
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.PinPayload
import me.meeshy.sdk.outbox.ReactionPayload

/**
 * The optimistic mutations of a server-acked message (ARCHITECTURE.md §5): the cached row moves
 * instantly, then the matching mutation joins its outbox lane. One domain — reactions, edit,
 * delete and pin. Only server-acked messages can be mutated: the gateway does not know an
 * optimistic `cmid` yet, so an unsent bubble is refused (`false`).
 */
internal class MessageMutationWriter(
    private val updater: CachedMessageUpdater,
    private val outboxRepository: OutboxRepository,
    private val clock: CacheClock,
) {

    /**
     * Optimistic reaction toggle: the cached `reactionSummary` moves instantly
     * and an `ADD_REACTION`/`REMOVE_REACTION` mutation is queued on the shared
     * reaction lane (a quick add+remove annihilates in the coalescer). Returns
     * whether the toggle was applied.
     */
    suspend fun toggleReactionOptimistic(messageId: String, emoji: String, isAdding: Boolean): Boolean {
        updater.update(messageId, requireSynced = true) { message ->
            message.copy(reactionSummary = message.reactionSummary.shifted(emoji, if (isAdding) 1 else -1))
        } ?: return false
        outboxRepository.enqueue(
            OutboxMutation(
                kind = if (isAdding) OutboxKind.ADD_REACTION else OutboxKind.REMOVE_REACTION,
                lane = OutboxLanes.REACTION,
                targetId = messageId,
                payload = MeeshyApi.json.encodeToString(ReactionPayload(emoji)),
            ),
        )
        return true
    }

    /** Applies a socket-driven reaction delta to the cache — no outbox involved. */
    suspend fun applyReactionDelta(messageId: String, emoji: String, delta: Int) {
        updater.update(messageId, requireSynced = false) { message ->
            message.copy(reactionSummary = message.reactionSummary.shifted(emoji, delta))
        }
    }

    /**
     * Applies a `message:edited` frame — the gateway's FULL message, edited in place
     * (a text edit, or a live call notice turned terminal) — over the cached row. The
     * forward-watermark refresh never re-reads a message whose `createdAt` did not move,
     * so without this the cached copy stays the old one. Returns `false` (nothing
     * written) when this device never cached the message or only holds its optimistic
     * local bubble.
     */
    suspend fun applyServerEdit(message: ApiMessage): Boolean =
        updater.update(message.id, requireSynced = true) { message } != null

    /**
     * Optimistic edit of a server-acked message: the cached content flips
     * instantly, stale translations are purged (the Prisme must never show a
     * translation of the old text — the retranslation arrives over the socket),
     * and an `EDIT_MESSAGE` mutation joins the conversation's FIFO lane.
     */
    suspend fun editOptimistic(messageId: String, content: String): Boolean {
        val updated = updater.update(messageId, requireSynced = true) { message ->
            message.copy(content = content, isEdited = true, translations = emptyList())
        } ?: return false
        outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.EDIT_MESSAGE,
                lane = OutboxLanes.forMessage(updated.conversationId),
                targetId = messageId,
                payload = MeeshyApi.json.encodeToString(EditMessageRequest(content)),
            ),
        )
        return true
    }

    /**
     * Optimistic delete: the cached message becomes a tombstone (content and
     * translations wiped — retention is a security invariant, ARCHITECTURE.md
     * §18) and a `DELETE_MESSAGE` mutation joins the conversation's FIFO lane.
     */
    suspend fun deleteOptimistic(messageId: String): Boolean {
        val updated = updater.update(messageId, requireSynced = true) { message ->
            message.copy(
                content = "",
                translations = emptyList(),
                deletedAt = Instant.ofEpochMilli(clock.nowMillis()).toString(),
            )
        } ?: return false
        outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.DELETE_MESSAGE,
                lane = OutboxLanes.forMessage(updated.conversationId),
                targetId = messageId,
                payload = "{}",
            ),
        )
        return true
    }

    /**
     * Optimistic pin/unpin of a server-acked message: the cached `pinnedAt` flips
     * instantly (set to now on pin, cleared on unpin — the pinned-banner reads it
     * live) and a `PIN_MESSAGE`/`UNPIN_MESSAGE` mutation is queued on the shared
     * pin lane (a quick pin+unpin of the same message annihilates in the
     * coalescer). `pinnedBy` is left untouched optimistically; the authoritative
     * `pinnedBy` arrives with the `message:pinned` socket refresh.
     */
    suspend fun setPinnedOptimistic(messageId: String, pin: Boolean): Boolean {
        val updated = updater.update(messageId, requireSynced = true) { message ->
            message.copy(pinnedAt = if (pin) Instant.ofEpochMilli(clock.nowMillis()).toString() else null)
        } ?: return false
        outboxRepository.enqueue(
            OutboxMutation(
                kind = if (pin) OutboxKind.PIN_MESSAGE else OutboxKind.UNPIN_MESSAGE,
                lane = OutboxLanes.PIN,
                targetId = messageId,
                payload = MeeshyApi.json.encodeToString(PinPayload(updated.conversationId)),
            ),
        )
        return true
    }

    private fun Map<String, Int>?.shifted(emoji: String, delta: Int): Map<String, Int>? {
        val next = (this ?: emptyMap()) + (emoji to ((this?.get(emoji) ?: 0) + delta))
        return next.filterValues { it > 0 }.ifEmpty { null }
    }
}
