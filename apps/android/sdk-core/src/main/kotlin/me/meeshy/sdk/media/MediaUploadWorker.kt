package me.meeshy.sdk.media

import android.content.Context
import android.os.Build
import androidx.hilt.work.HiltWorker
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.sdk.outbox.DrainReport
import me.meeshy.sdk.outbox.MutationSenderRegistry
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.OutboxScheduler
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.cancellation.CancellationException

/**
 * Draine la voie des envois de média sous un bail de premier plan (type `dataSync`) : une notification discrète
 * « Envoi en cours… » tient le processus tant que les octets partent, que l'app passe en arrière-plan ou non. Expedited ;
 * hors ligne la contrainte réseau attend SANS notification (le bail n'est pris qu'à l'exécution).
 *
 * Arrêt par le système : le PATCH en cours est annulé, le point de reprise TUS (écrit après chaque tronçon accepté) est
 * conservé, la ligne est remise à reprendre et le worker se replanifie — l'outbox reprend à l'offset accepté.
 */
@HiltWorker
class MediaUploadWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val outbox: OutboxRepository,
    private val registry: MutationSenderRegistry,
    private val leases: UploadLeaseRunner,
    private val notifier: UploadLeaseNotifier,
    private val scheduler: OutboxScheduler,
) : CoroutineWorker(context, params), LeaseExpiringWorker {

    @Volatile
    private var provider: UploadLeaseProvider? = null

    override suspend fun getForegroundInfo(): ForegroundInfo = notifier.foregroundInfo(null)

    override suspend fun doWork(): Result = try {
        drain()
    } catch (stopped: CancellationException) {
        provider?.expire()
        throw stopped
    }

    private suspend fun drain(): Result {
        if (!outbox.hasDeliverable(OutboxLanes.MEDIA, OutboxKind.UPLOAD_MEDIA)) return Result.success()
        outbox.reclaimStaleInflight()
        val report: DrainReport = leases.run(this, leased = true, isFailure = { it.stoppedOnTransientFailure }) {
            registry.drainerFor(outbox).drainLane(OutboxLanes.MEDIA)
        } ?: run {
            outbox.recoverInflight()
            return Result.retry()
        }
        if (report.delivered + report.exhausted > 0) scheduler.flushNow()
        return if (report.stoppedOnTransientFailure) Result.retry() else Result.success()
    }

    override fun attachLease(provider: UploadLeaseProvider) {
        this.provider = provider
    }

    companion object {
        const val TAG = "MediaUploadWorker"
        const val UNIQUE_NAME = "media-upload"

        fun buildRequest(): OneTimeWorkRequest =
            OneTimeWorkRequestBuilder<MediaUploadWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
                .addTag(TAG)
                .apply {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                    }
                }
                .build()
    }
}

/** Planifie l'envoi des médias en file ; sans effet sur une exécution déjà en cours (elle rattrape ses voisines). */
interface MediaUploadScheduler {
    fun schedule()
}

@Singleton
class WorkManagerMediaUploadScheduler @Inject constructor(
    @ApplicationContext private val context: Context,
) : MediaUploadScheduler {
    override fun schedule() {
        WorkManager.getInstance(context)
            .enqueueUniqueWork(MediaUploadWorker.UNIQUE_NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, MediaUploadWorker.buildRequest())
    }
}
