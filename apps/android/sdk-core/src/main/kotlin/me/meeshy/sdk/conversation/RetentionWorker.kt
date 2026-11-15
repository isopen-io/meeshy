package me.meeshy.sdk.conversation

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequest
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import kotlinx.coroutines.CancellationException

/** Planifie la rétention : appareil au repos, batterie non faible, une fois par jour, sans retarder le démarrage. */
public interface RetentionScheduler {
    public fun schedule()
}

@HiltWorker
public class RetentionWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val purger: MessageRetentionPurger,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = try {
        purger.run()
        Result.success()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        Result.retry()
    }

    public companion object {
        public const val UNIQUE_NAME: String = "message-retention"

        public fun buildRequest(): PeriodicWorkRequest =
            PeriodicWorkRequestBuilder<RetentionWorker>(1, TimeUnit.DAYS)
                .setConstraints(
                    Constraints.Builder().setRequiresDeviceIdle(true).setRequiresBatteryNotLow(true).build(),
                )
                .build()
    }
}

public class WorkManagerRetentionScheduler @Inject constructor(
    private val workManager: WorkManager,
) : RetentionScheduler {
    override fun schedule() {
        workManager.enqueueUniquePeriodicWork(
            RetentionWorker.UNIQUE_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            RetentionWorker.buildRequest(),
        )
    }
}
