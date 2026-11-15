package me.meeshy.sdk.outbox

import android.content.Context
import android.os.Build
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Plans the next outbox flush. The worker no longer asks WorkManager for a global `Result.retry()` (one stuck row
 * delayed every lane): it plans its own next pass at the earliest moment a row becomes due.
 */
public interface OutboxScheduler {
    /** A flush as soon as possible — a trigger fired (socket back, network back, enqueue, foreground). */
    public fun flushNow()

    /** The next flush, [delayMs] from now, replacing any earlier plan. */
    public fun flushAfter(delayMs: Long)
}

@Singleton
public class WorkManagerOutboxScheduler @Inject constructor(
    @ApplicationContext private val context: Context,
) : OutboxScheduler {

    override fun flushNow() {
        WorkManager.getInstance(context)
            .enqueueUniqueWork(NOW_WORK_NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, request(0L, expedited = true))
    }

    override fun flushAfter(delayMs: Long) {
        WorkManager.getInstance(context)
            .enqueueUniqueWork(NEXT_WORK_NAME, ExistingWorkPolicy.REPLACE, request(delayMs, expedited = false))
    }

    private fun request(delayMs: Long, expedited: Boolean): OneTimeWorkRequest =
        OneTimeWorkRequestBuilder<OutboxFlushWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .addTag(OutboxFlushWorker.TAG)
            .apply {
                if (delayMs > 0L) setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
                if (expedited && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                }
            }
            .build()

    private companion object {
        const val NOW_WORK_NAME = "outbox-flush-now"
        const val NEXT_WORK_NAME = "outbox-flush-next"
    }
}
