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
 * - a reaction toggle (add then remove, or remove then add) cancels itself.
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
            OutboxKind.ADD_REACTION -> annihilateOpposite(incoming, sameTarget, OutboxKind.REMOVE_REACTION)
            OutboxKind.REMOVE_REACTION -> annihilateOpposite(incoming, sameTarget, OutboxKind.ADD_REACTION)
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
}
