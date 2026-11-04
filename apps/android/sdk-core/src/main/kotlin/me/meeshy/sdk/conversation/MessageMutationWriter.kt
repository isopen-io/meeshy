package me.meeshy.sdk.conversation

import java.time.Instant
import kotlinx.serialization.encodeToString
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.mediahub.ConversationMediaHubIndex
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.MessageEditOrdering
import me.meeshy.sdk.model.MessageReactionRows
import me.meeshy.sdk.model.PendingEdit
import me.meeshy.sdk.model.PendingReaction
import me.meeshy.sdk.model.QuotePropagation
import me.meeshy.sdk.model.ReactionSummaryShift
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
    private val revisions: EditRevisionLedger? = null,
    /** Les événements arrivés avant leur message : gardés ici, rejoués par l'ingestion. */
    private val events: MessageEventBuffer? = null,
    /** L'utilisateur courant, clé de MA ligne de réaction ; par défaut le compte du geste. */
    private val selfId: (suspend () -> String?)? = null,
    /** L'index des médias de la conversation : un message supprimé quitte TOUS les genres. */
    private val mediaIndex: ConversationMediaHubIndex? = null,
) {
    private val tombstones = MessageTombstoneWriter(updater, revisions, events, mediaIndex)

    /**
     * Optimistic reaction toggle: the cached `reactionSummary` moves instantly
     * and an `ADD_REACTION`/`REMOVE_REACTION` mutation is queued on the shared
     * reaction lane (a quick add+remove annihilates in the coalescer). Returns
     * whether the toggle was applied.
     */
    suspend fun toggleReactionOptimistic(messageId: String, emoji: String, isAdding: Boolean): Boolean {
        val me = selfId?.invoke() ?: updater.ticket()?.ownerId
        val updated = updater.update(messageId, requireSynced = true) { message ->
            // Les lignes se dressent du résumé D'AVANT le décalage, sinon ma ligne compterait deux fois.
            MessageReactionRows.withOwn(message, emoji, isAdding, me)
                .let { it.copy(reactionSummary = ReactionSummaryShift.shifted(it.reactionSummary, emoji, if (isAdding) 1 else -1)) }
        } ?: return false
        outboxRepository.enqueue(
            OutboxMutation(
                kind = if (isAdding) OutboxKind.ADD_REACTION else OutboxKind.REMOVE_REACTION,
                lane = OutboxLanes.REACTION,
                targetId = messageId,
                payload = MeeshyApi.json.encodeToString(ReactionPayload(emoji, updated.conversationId)),
            ),
        )
        return true
    }

    /** Applies a socket-driven reaction delta to the cache — no outbox involved. */
    suspend fun applyReactionDelta(messageId: String, emoji: String, delta: Int) {
        val updated = updater.update(messageId, requireSynced = false) { message ->
            message.copy(reactionSummary = ReactionSummaryShift.shifted(message.reactionSummary, emoji, delta))
        }
        // Une réaction arrivée avant son message est gardée, puis rejouée à l'arrivée de la ligne.
        if (updated == null) events?.rememberReaction(messageId, PendingReaction(emoji, delta))
    }

    /**
     * Applies a `message:edited` frame — the gateway's FULL message, edited in place
     * (a text edit, or a live call notice turned terminal) — over the cached row. The
     * forward-watermark refresh never re-reads a message whose `createdAt` did not move,
     * so without this the cached copy stays the old one. Returns `false` (nothing
     * written) when this device never cached the message or only holds its optimistic
     * local bubble.
     */
    suspend fun applyServerEdit(message: ApiMessage): Boolean {
        val ticket = updater.ticket()
        var previous: ApiMessage? = null
        val updated = updater.update(ticket, message.id, requireSynced = true) { current ->
            previous = current
            // Garde d'ordre : une livraison retardée ou en double ne régresse pas une édition plus récente.
            if (MessageEditOrdering.acceptsIso(current.editedAt, message.editedAt)) message else current
        }
        if (updated == null) {
            // Un message encore inconnu : l'édition attend sa ligne. Une bulle locale non acquittée n'attend rien.
            if (updater.find(message.id) == null) {
                events?.rememberEdit(message.id, PendingEdit(message.content, message.editedAt, marksEdited = message.isEdited))
            }
            return false
        }
        val before = previous
        if (before != null && updated === message && before.content != message.content) {
            val parentIds = listOfNotNull(updated.id, updated.clientMessageId)
            updater.updateCiting(ticket, updated.conversationId, parentIds) { reply ->
                QuotePropagation.followEdit(reply, parentIds, updated.content, QuotePropagation.holdsProtectedContent(updated))
            }
        }
        return true
    }

    /** Une suppression annoncée par le SERVEUR ; voir [MessageTombstoneWriter.markDeleted]. */
    suspend fun markDeleted(
        messageId: String,
        deletedAtIso: String,
        sparingOpenedViewOnce: Boolean = false,
        expired: Boolean = false,
    ): Boolean = tombstones.markDeleted(messageId, deletedAtIso, sparingOpenedViewOnce, expired)

    /** Retour arrière d'une suppression refusée ; voir [MessageTombstoneWriter.markUndeleted]. */
    suspend fun markUndeleted(messageId: String, snapshot: ApiMessage? = null): Boolean =
        tombstones.markUndeleted(messageId, snapshot)

    /** Retire les lignes nommées — par l'une ou l'autre de leurs deux clés — et leurs versions antérieures. */
    suspend fun purgeMessages(messageIds: Collection<String>) = updater.purge(updater.ticket(), messageIds)

    /** Épingle posée ou retirée par un événement, sans toucher au reste de la ligne ni à l'outbox. */
    suspend fun setPinned(messageId: String, pinnedAtIso: String?, pinnedBy: String?): Boolean =
        updater.update(messageId, requireSynced = false) { message ->
            if (message.pinnedAt == pinnedAtIso && message.pinnedBy == pinnedBy) message
            else message.copy(pinnedAt = pinnedAtIso, pinnedBy = pinnedBy)
        } != null

    /** Le message est flouté (ou ne l'est plus), sans réécrire le reste. */
    suspend fun setBlurred(messageId: String, blurred: Boolean): Boolean =
        updater.update(messageId, requireSynced = false) { message ->
            if ((message.isBlurred == true) == blurred) message else message.copy(isBlurred = blurred)
        } != null

    /** Le compteur de vues d'une vue unique, sans réécrire le reste ; il ne descend jamais. */
    suspend fun setViewOnceCount(messageId: String, count: Int): Boolean =
        updater.update(messageId, requireSynced = false) { message ->
            if (count <= message.viewOnceCount) message else message.copy(viewOnceCount = count)
        } != null

    /**
     * Optimistic edit of a server-acked message: the cached content flips
     * instantly, stale translations are purged (the Prisme must never show a
     * translation of the old text — the retranslation arrives over the socket),
     * and an `EDIT_MESSAGE` mutation joins the conversation's FIFO lane.
     */
    suspend fun editOptimistic(messageId: String, content: String): Boolean {
        val ticket = updater.ticket()
        var previousContent: String? = null
        val updated = updater.update(messageId, requireSynced = true) { message ->
            previousContent = message.content
            message.copy(content = content, isEdited = true, translations = emptyList())
        } ?: return false
        revisions?.record(messageId, previousContent, content, ticket)
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
        revisions?.forget(listOf(messageId))
        mediaIndex?.forgetMessage(updated.conversationId, messageId, updater.ticket())
        val deletedAt = updated.deletedAt
        if (deletedAt != null) {
            val parentIds = listOfNotNull(updated.id, updated.clientMessageId)
            updater.updateCiting(updater.ticket(), updated.conversationId, parentIds) { reply ->
                QuotePropagation.sealDeleted(reply, parentIds, deletedAt)
            }
        }
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
}
