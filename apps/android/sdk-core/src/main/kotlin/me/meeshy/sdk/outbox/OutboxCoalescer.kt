package me.meeshy.sdk.outbox

import me.meeshy.core.database.entity.OutboxEntity

/** Outcome of coalescing an incoming mutation against the pending queue (ARCHITECTURE.md §5). */
public sealed interface CoalesceDecision {

    /** Persist [row] as a new pending mutation. */
    public data class Enqueue(val row: OutboxEntity) : CoalesceDecision

    /** Persist [row] and remove the now-superseded [supersededCmids]. */
    public data class Replace(
        val supersededCmids: List<String>,
        val row: OutboxEntity,
    ) : CoalesceDecision

    /** The incoming mutation cancels [cancelledCmids]; nothing new is persisted. */
    public data class Annihilate(val cancelledCmids: List<String>) : CoalesceDecision
}

/**
 * In-queue coalescing (ARCHITECTURE.md §5):
 * - send + delete of the same unsent message cancels both;
 * - a repeated edit / read-receipt merges, keeping the latest;
 * - a delete supersedes pending edits of the same message;
 * - a reaction toggle (add then remove, or remove then add) cancels itself;
 * - a block/unblock toggle of the same user cancels itself, and a repeated
 *   block (or unblock) keeps only the latest (idempotent terminal state);
 * - a pin/unpin toggle of the same message cancels itself, and a repeated
 *   pin (or unpin) keeps only the latest (same idempotent-terminal rule);
 * - a repeated friend request to the same receiver keeps only the latest
 *   (only one request can exist — idempotent send, latest greeting wins);
 * - a repeated profile edit (same user id) keeps only the latest snapshot
 *   (each carries the full PATCH body — the newest edit subsumes the pending one);
 * - a repeated settings update (same user id) keeps only the latest snapshot
 *   (each carries the full preference block — an offline toggle burst collapses to one PATCH);
 *   notification and privacy settings coalesce independently (distinct kinds share the settings
 *   lane but never supersede one another).
 *
 * [pending] MUST contain only still-cancellable rows ([OutboxState.PENDING]);
 * an in-flight mutation cannot be undone.
 */
public object OutboxCoalescer {

    public fun decide(incoming: OutboxEntity, pending: List<OutboxEntity>): CoalesceDecision {
        val sameTarget = pending.filter { it.targetId == incoming.targetId }
        return when (incoming.kindEnum) {
            OutboxKind.DELETE_MESSAGE -> onDelete(incoming, sameTarget)
            OutboxKind.EDIT_MESSAGE -> replaceSameKind(incoming, sameTarget, OutboxKind.EDIT_MESSAGE)
            OutboxKind.READ_RECEIPT -> replaceSameKind(incoming, sameTarget, OutboxKind.READ_RECEIPT)
            OutboxKind.UPDATE_CONVERSATION_PREFS ->
                replaceSameKind(incoming, sameTarget, OutboxKind.UPDATE_CONVERSATION_PREFS)
            OutboxKind.UPDATE_PROFILE ->
                replaceSameKind(incoming, sameTarget, OutboxKind.UPDATE_PROFILE)
            OutboxKind.UPDATE_SETTINGS ->
                replaceSameKind(incoming, sameTarget, OutboxKind.UPDATE_SETTINGS)
            OutboxKind.UPDATE_PRIVACY_SETTINGS ->
                replaceSameKind(incoming, sameTarget, OutboxKind.UPDATE_PRIVACY_SETTINGS)
            OutboxKind.ADD_REACTION -> annihilateOpposite(incoming, sameTarget, OutboxKind.REMOVE_REACTION)
            OutboxKind.REMOVE_REACTION -> annihilateOpposite(incoming, sameTarget, OutboxKind.ADD_REACTION)
            OutboxKind.BLOCK_USER -> terminalToggle(incoming, sameTarget, OutboxKind.UNBLOCK_USER, OutboxKind.BLOCK_USER)
            OutboxKind.UNBLOCK_USER -> terminalToggle(incoming, sameTarget, OutboxKind.BLOCK_USER, OutboxKind.UNBLOCK_USER)
            OutboxKind.PIN_MESSAGE -> terminalToggle(incoming, sameTarget, OutboxKind.UNPIN_MESSAGE, OutboxKind.PIN_MESSAGE)
            OutboxKind.UNPIN_MESSAGE -> terminalToggle(incoming, sameTarget, OutboxKind.PIN_MESSAGE, OutboxKind.UNPIN_MESSAGE)
            OutboxKind.SEND_FRIEND_REQUEST ->
                replaceSameKind(incoming, sameTarget, OutboxKind.SEND_FRIEND_REQUEST)
            else -> CoalesceDecision.Enqueue(incoming)
        }
    }

    private fun onDelete(incoming: OutboxEntity, sameTarget: List<OutboxEntity>): CoalesceDecision {
        val sends = sameTarget.filter { it.kindEnum == OutboxKind.SEND_MESSAGE }.map { it.cmid }
        if (sends.isNotEmpty()) {
            val edits = sameTarget.filter { it.kindEnum == OutboxKind.EDIT_MESSAGE }.map { it.cmid }
            return CoalesceDecision.Annihilate(sends + edits)
        }
        val supersededEdits = sameTarget.filter { it.kindEnum == OutboxKind.EDIT_MESSAGE }.map { it.cmid }
        return if (supersededEdits.isEmpty()) {
            CoalesceDecision.Enqueue(incoming)
        } else {
            CoalesceDecision.Replace(supersededEdits, incoming)
        }
    }

    private fun replaceSameKind(
        incoming: OutboxEntity,
        sameTarget: List<OutboxEntity>,
        kind: OutboxKind,
    ): CoalesceDecision {
        val superseded = sameTarget.filter { it.kindEnum == kind }.map { it.cmid }
        return if (superseded.isEmpty()) {
            CoalesceDecision.Enqueue(incoming)
        } else {
            CoalesceDecision.Replace(superseded, incoming)
        }
    }

    private fun annihilateOpposite(
        incoming: OutboxEntity,
        sameTarget: List<OutboxEntity>,
        opposite: OutboxKind,
    ): CoalesceDecision {
        val cancelled = sameTarget.filter { it.kindEnum == opposite }.map { it.cmid }
        return if (cancelled.isEmpty()) {
            CoalesceDecision.Enqueue(incoming)
        } else {
            CoalesceDecision.Annihilate(cancelled)
        }
    }

    /**
     * Coalesces a terminal-state toggle (block/unblock of a user, pin/unpin of a
     * message). The two kinds are opposite terminal states (not deltas), so a
     * queued opposite for the same target annihilates — the pair returns the
     * target to the last-synced server state, exactly like a reaction toggle.
     * Failing that, a pending same-kind row is superseded (a repeated
     * block/unblock or pin/unpin is idempotent). Otherwise it enqueues.
     */
    private fun terminalToggle(
        incoming: OutboxEntity,
        sameTarget: List<OutboxEntity>,
        opposite: OutboxKind,
        same: OutboxKind,
    ): CoalesceDecision {
        val cancelled = sameTarget.filter { it.kindEnum == opposite }.map { it.cmid }
        if (cancelled.isNotEmpty()) return CoalesceDecision.Annihilate(cancelled)
        val superseded = sameTarget.filter { it.kindEnum == same }.map { it.cmid }
        return if (superseded.isEmpty()) {
            CoalesceDecision.Enqueue(incoming)
        } else {
            CoalesceDecision.Replace(superseded, incoming)
        }
    }
}
