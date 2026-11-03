package me.meeshy.sdk.outbox

import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.chat.GestureRefusalCenter
import me.meeshy.sdk.model.feedback.DailyGestureLimit
import me.meeshy.sdk.session.AccountFence
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
    private val fence: AccountFence? = null,
    private val dailyLimits: DailyGestureLimitLedger? = null,
    private val refusals: GestureRefusalCenter? = null,
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
        DailyGestureLimit.fromReason(row.lastError)?.let { limit ->
            dailyLimits?.record(limit, row.cmid)
            refusals?.report(limit)
        }
    }

    /**
     * A drainer over [outbox] wired with every registered sender, the exhaustion
     * rollbacks, and the upload write-backs the handlers declare — each dependent rewritten by
     * the write-back of ITS kind, never by whichever payload shape happens to decode it.
     */
    public fun drainerFor(outbox: OutboxRepository): OutboxDrainer =
        OutboxDrainer(
            outbox = outbox,
            senders = handlers,
            currentOwner = ownerSource?.let { source -> { source.currentOwnerId() } },
            onExhausted = { row -> this.onExhausted(row) },
            graftProducedId = { dependent, placeholder, realId ->
                dependent.kindEnum?.let { handlers[it] }?.payloadGraft?.invoke(dependent.payload, placeholder, realId)
            },
            plaintextAdmission = plaintextAdmission ?: OutboxPlaintextAdmission.AdmitAll,
            fence = fence,
        )

    /**
     * One full flush pass over [outbox]: the dynamic per-conversation message lanes
     * (only known once rows are queued, so discovered via
     * [OutboxRepository.activeMessageLanes]) first, then every [sharedLanes] entry.
     * Lanes drain independently, so a transient failure on one never blocks another.
     *
     * #14378 — a lane that stopped on a still-queued prerequisite is drained again IN THE SAME PASS as long as the pass
     * settles rows: the message lanes drain before the media lane, so a message waiting on its upload would otherwise
     * wait for WorkManager's backoff (10 s) although its piece landed a few lines later. A lane is re-drained only for
     * a blocked dependency — never for a transient failure — and the loop ends on the first round that settles nothing,
     * bounded by [MAX_DEPENDENCY_ROUNDS]. The reports are one per lane: counts summed, stop signals from its last drain.
     */
    public suspend fun drainAll(outbox: OutboxRepository): List<DrainReport> {
        val drainer = drainerFor(outbox)
        val lanes = outbox.activeMessageLanes() + sharedLanes
        val reports = LinkedHashMap<String, DrainReport>()
        var round = lanes
        var rounds = 0
        while (round.isNotEmpty() && rounds < MAX_DEPENDENCY_ROUNDS) {
            val drained = round.associateWith { lane -> drainLogged(drainer, lane) }
            drained.forEach { (lane, report) -> reports[lane] = reports[lane]?.let { merged(it, report) } ?: report }
            rounds++
            val settled = drained.values.any { it.delivered + it.exhausted > 0 }
            round = if (settled) drained.filterValues { it.stoppedOnBlockedDependency }.keys.toList() else emptyList()
        }
        return reports.values.toList()
    }

    private suspend fun drainLogged(drainer: OutboxDrainer, lane: String): DrainReport =
        drainer.drainLane(lane).also { report ->
            Timber.d("OutboxFlush lane=$lane delivered=${report.delivered} exhausted=${report.exhausted}")
        }

    private fun merged(earlier: DrainReport, later: DrainReport): DrainReport =
        later.copy(delivered = earlier.delivered + later.delivered, exhausted = earlier.exhausted + later.exhausted)

    public companion object {
        /** Upload → message is one level deep; a few rounds cover any real chain without risking a spin. */
        public const val MAX_DEPENDENCY_ROUNDS: Int = 4
    }
}
