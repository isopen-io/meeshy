package me.meeshy.sdk.outbox

import me.meeshy.core.database.entity.OutboxEntity
import timber.log.Timber
import javax.inject.Inject

/**
 * The outbox's per-kind registry (ARCHITECTURE.md §5; ADR-006): the Hilt multibinding
 * of [OutboxKindHandler]s keyed by [OutboxKindKey], plus what the flush worker derives
 * from it. The worker holds no `when` over [OutboxKind] — it asks this registry to
 * drain every lane.
 */
public class MutationSenderRegistry @Inject constructor(
    private val handlers: Map<OutboxKind, @JvmSuppressWildcards OutboxKindHandler>,
    private val ownerSource: OutboxOwnerSource? = null,
    private val plaintextAdmission: OutboxPlaintextAdmission? = null,
) {
    /** The kinds that have a registered handler. */
    public val registeredKinds: Set<OutboxKind> get() = handlers.keys

    /**
     * Every fixed shared lane some [OutboxKind] drains on ([OutboxLaneMap]), whether or
     * not that kind has a handler: a row of an unregistered kind must still be swept so
     * the drainer can exhaust it instead of leaving it queued forever.
     */
    public val sharedLanes: List<String> = OutboxLaneMap.sharedDrainLanes

    /** Rolls back the optimistic effect of an exhausted [row] through its kind's handler. */
    public suspend fun onExhausted(row: OutboxEntity) {
        row.kindEnum?.let { handlers[it] }?.onExhausted(row)
    }

    /**
     * A drainer over [outbox] wired with every registered sender, the exhaustion
     * rollbacks, and the upload write-backs the handlers declare.
     */
    public fun drainerFor(outbox: OutboxRepository): OutboxDrainer =
        OutboxDrainer(
            outbox = outbox,
            senders = handlers,
            currentOwner = ownerSource?.let { source -> { source.currentOwnerId() } },
            onExhausted = { row -> this.onExhausted(row) },
            graftProducedId = OutboxPayloadGrafts.firstOf(
                *handlers.values.mapNotNull { it.payloadGraft }.toTypedArray(),
            ),
            plaintextAdmission = plaintextAdmission ?: OutboxPlaintextAdmission.AdmitAll,
        )

    /**
     * One full flush pass over [outbox]: the dynamic per-conversation message lanes
     * (only known once rows are queued, so discovered via
     * [OutboxRepository.activeMessageLanes]) first, then every [sharedLanes] entry.
     * Lanes drain independently, so a transient failure on one never blocks another.
     */
    public suspend fun drainAll(outbox: OutboxRepository): List<DrainReport> {
        val drainer = drainerFor(outbox)
        val lanes = outbox.activeMessageLanes() + sharedLanes
        return lanes.map { lane ->
            drainer.drainLane(lane).also { report ->
                Timber.d("OutboxFlush lane=$lane delivered=${report.delivered} exhausted=${report.exhausted}")
            }
        }
    }
}
