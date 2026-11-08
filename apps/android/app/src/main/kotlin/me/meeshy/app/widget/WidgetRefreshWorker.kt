package me.meeshy.app.widget

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequest
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import dagger.Binds
import dagger.Module
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.lifecycle.AppLifecycleHook
import me.meeshy.sdk.net.TokenStore

/** Le filet périodique : repeint les widgets depuis le cache même si le process a été tué. */
@HiltWorker
class WidgetRefreshWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val refresher: WidgetRefresher,
    private val tokenStore: TokenStore,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = try {
        WidgetRefreshTask(currentUserId = { tokenStore.userId }, repaintAll = refresher::repaintAll).run()
        Result.success()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        Result.retry()
    }

    companion object {
        const val UNIQUE_NAME: String = "widget-refresh"

        fun buildRequest(intervalMinutes: Long): PeriodicWorkRequest =
            PeriodicWorkRequestBuilder<WidgetRefreshWorker>(intervalMinutes, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiresBatteryNotLow(true).build())
                .build()
    }
}

/** Inscrit le filet au lancement du process (KEEP : une seule planification, jamais réarmée). */
class WidgetRefreshHook @Inject constructor(
    private val workManager: WorkManager,
    private val tokenStore: TokenStore,
) : AppLifecycleHook {
    override val name: String get() = "widget-refresh"

    override suspend fun onAppCreate() {
        val minutes = WidgetRefreshSchedule.intervalMinutes(
            signedIn = !tokenStore.userId.isNullOrBlank(),
            hasUnread = false,
        )
        workManager.enqueueUniquePeriodicWork(
            WidgetRefreshWorker.UNIQUE_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            WidgetRefreshWorker.buildRequest(minutes),
        )
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface WidgetRefreshModule {
    @Binds @IntoSet
    fun hook(impl: WidgetRefreshHook): AppLifecycleHook
}
