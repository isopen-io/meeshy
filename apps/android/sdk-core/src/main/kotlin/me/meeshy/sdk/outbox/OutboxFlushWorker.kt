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
import me.meeshy.sdk.media.UploadLeaseRunner
import me.meeshy.sdk.network.NetworkMonitor
import java.util.concurrent.TimeUnit

/**
 * WorkManager worker that drains all outbox lanes (ARCHITECTURE.md §5; ADR-006).
 *
 * Runs on every network reconnect and after any [OutboxRepository.enqueue] call.
 * It is thin glue: delivery, exhaustion rollbacks and upload write-backs all live in
 * the per-kind handlers the [MutationSenderRegistry] gathers (see [OutboxKindKey]), so
 * adding a mutation kind never edits this class.
 * Each lane drains independently; a transient failure in one lane does not block others.
 * A row that failed backs off on its own (`nextAttemptAt`); the worker plans its next pass at the earliest due time
 * through the [OutboxScheduler] and always succeeds, so one stuck row never delays another lane.
 */
@HiltWorker
class OutboxFlushWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val outboxRepository: OutboxRepository,
    private val registry: MutationSenderRegistry,
    private val network: NetworkMonitor,
    private val scheduler: OutboxScheduler,
    private val uploadLeases: UploadLeaseRunner = UploadLeaseRunner.Passthrough,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        when (val gate = OutboxFlushGate.decide(network.isOnline.value, outboxRepository.hasWork())) {
            FlushGateDecision.Proceed -> Unit
            is FlushGateDecision.RetryLater -> {
                scheduler.flushAfter(gate.retryAfterMs)
                return Result.success()
            }
            FlushGateDecision.Idle -> return Result.success()
        }
        outboxRepository.reclaimStaleInflight()

        val leased = outboxRepository.hasDeliverable(OutboxLanes.MEDIA, OutboxKind.UPLOAD_MEDIA)
        val reports = uploadLeases.run(this, leased) { registry.drainAll(outboxRepository) }
            ?: return Result.retry().also { outboxRepository.recoverInflight() }

        val next = OutboxFlushNext.after(reports, outboxRepository.earliestScheduledAttempt(), System.currentTimeMillis())
        if (next is FlushNext.RunAfter) scheduler.flushAfter(next.delayMs)
        return Result.success()
    }

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
