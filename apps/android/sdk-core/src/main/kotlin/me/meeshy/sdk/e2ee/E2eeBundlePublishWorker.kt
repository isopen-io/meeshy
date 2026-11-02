package me.meeshy.sdk.e2ee

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import me.meeshy.sdk.model.signal.BundlePublishRetryPolicy
import java.util.concurrent.TimeUnit
import javax.inject.Inject

/**
 * Reprise WorkManager de la publication : réseau requis, recul exponentiel d'au moins une minute
 * (les limiteurs serveur sont de 5 POST et 30 GET par minute). Seul [BundlePublishOutcome.RetryLater]
 * rejoue ; un 4xx, un refus ou un bundle d'un autre appareil termine sans boucle.
 */
@HiltWorker
class E2eeBundlePublishWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val publisher: E2eeBundlePublisher,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = when (publisher.publish(runAttemptCount)) {
        BundlePublishOutcome.RetryLater -> Result.retry()
        else -> Result.success()
    }

    companion object {
        const val UNIQUE_NAME = "e2ee-bundle-publish"

        fun buildRequest(): OneTimeWorkRequest =
            OneTimeWorkRequestBuilder<E2eeBundlePublishWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BundlePublishRetryPolicy.MIN_BACKOFF_SECONDS, TimeUnit.SECONDS)
                .build()
    }
}

class WorkManagerE2eeBundlePublishScheduler @Inject constructor(
    private val workManager: WorkManager,
) : E2eeBundlePublishScheduler {
    override fun schedule() {
        workManager.enqueueUniqueWork(
            E2eeBundlePublishWorker.UNIQUE_NAME,
            ExistingWorkPolicy.KEEP,
            E2eeBundlePublishWorker.buildRequest(),
        )
    }
}
