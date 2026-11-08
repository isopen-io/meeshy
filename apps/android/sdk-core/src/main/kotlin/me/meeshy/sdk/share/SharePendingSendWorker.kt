package me.meeshy.sdk.share

import android.content.Context
import android.os.Build
import androidx.hilt.work.HiltWorker
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import dagger.Binds
import dagger.Module
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.session.SessionRepository

/** Planifie la reprise des fiches de partage ; sans effet sur une exécution déjà en file (elle rattrape ses voisines). */
public fun interface SharePendingSendScheduler {
    public fun schedule()
}

/**
 * **La reprise d'un partage** (#15791, miroir de `SharePendingSendConsumer`, iOS) : réseau requis, expedited, recul
 * exponentiel. Sert les cibles restantes de chaque fiche du compte courant ; une fiche de plus de sept jours a déjà été
 * balayée par le magasin avec ses copies. S'arrête au plafond de [ShareSendPacing.MAX_WORK_RUNS] : la fiche attend alors
 * le prochain lancement.
 */
@HiltWorker
public class SharePendingSendWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val sender: ShareDurableSender,
    private val session: SessionRepository,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val giveUp = ShareSendPacing.shouldGiveUp(runAttemptCount)
        val user = withTimeoutOrNull(USER_WAIT_MILLIS) { session.currentUser.filterNotNull().first() }
            ?: return if (giveUp) Result.success() else Result.retry()
        val pending = try {
            sender.resume(user)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (e: Exception) {
            true
        }
        return if (pending && !giveUp) Result.retry() else Result.success()
    }

    public companion object {
        public const val TAG: String = "SharePendingSendWorker"
        public const val UNIQUE_NAME: String = "share-pending-send"
        internal const val USER_WAIT_MILLIS: Long = 10_000L

        public fun buildRequest(): OneTimeWorkRequest =
            OneTimeWorkRequestBuilder<SharePendingSendWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, ShareSendPacing.BASE_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
                .addTag(TAG)
                .apply {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                    }
                }
                .build()
    }
}

@Singleton
public class WorkManagerSharePendingSendScheduler @Inject constructor(
    @ApplicationContext private val context: Context,
) : SharePendingSendScheduler {
    override fun schedule() {
        WorkManager.getInstance(context)
            .enqueueUniqueWork(SharePendingSendWorker.UNIQUE_NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, SharePendingSendWorker.buildRequest())
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class ShareDurableSendModule {
    @Binds
    @Singleton
    abstract fun bindsScheduler(impl: WorkManagerSharePendingSendScheduler): SharePendingSendScheduler

    @Binds
    @Singleton
    abstract fun bindsDurableSending(impl: ShareDurableSender): ShareDurableSending
}
