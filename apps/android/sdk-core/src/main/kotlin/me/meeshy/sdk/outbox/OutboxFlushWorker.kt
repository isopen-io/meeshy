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
import java.util.concurrent.TimeUnit

/**
 * WorkManager worker that drains all outbox lanes (ARCHITECTURE.md §5; ADR-006).
 *
 * Runs on every network reconnect and after any [OutboxRepository.enqueue] call.
 * It is thin glue: delivery, exhaustion rollbacks and upload write-backs all live in
 * the per-kind handlers the [MutationSenderRegistry] gathers (see [OutboxKindKey]), so
 * adding a mutation kind never edits this class.
 * Each lane drains independently; a transient failure in one lane does not block others.
 * Exponential backoff is handled by WorkManager if [Result.retry] is returned.
 */
@HiltWorker
class OutboxFlushWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val outboxRepository: OutboxRepository,
    private val registry: MutationSenderRegistry,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        outboxRepository.recoverInflight()

        val reports = registry.drainAll(outboxRepository)

        return when (OutboxFlushPlan.outcome(reports)) {
            FlushOutcome.RETRY -> Result.retry()
            FlushOutcome.SUCCESS -> Result.success()
        }
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
