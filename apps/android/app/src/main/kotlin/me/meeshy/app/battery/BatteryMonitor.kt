package me.meeshy.app.battery

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.PowerManager
import androidx.core.content.ContextCompat
import androidx.hilt.work.HiltWorker
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
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.core.common.DefaultDispatcher
import me.meeshy.sdk.battery.BatteryReporting
import me.meeshy.sdk.lifecycle.AppLifecycleHook
import me.meeshy.sdk.model.battery.BatteryReportTrigger
import me.meeshy.sdk.socket.BatterySocketEventsManager
import timber.log.Timber

/**
 * Le moteur des relevés (#14147), tant que l'app a du temps d'exécution : chaque changement de batterie, de charge ou de
 * mode économie propose un relevé à la cadence ; en critique débranché, un battement de 60 s ; une demande
 * (`battery:pull-requested`) force un relevé. Hors de ce temps-là, seule la tâche périodique de 15 min et le push
 * `battery_pull` réveillent l'appareil — Android n'en donne pas davantage, et l'interface le dit.
 */
@Singleton
class BatteryMonitor @Inject constructor(
    @ApplicationContext private val context: Context,
    private val reporter: BatteryReporting,
    private val sockets: BatterySocketEventsManager,
    private val workManager: WorkManager,
    @DefaultDispatcher dispatcher: CoroutineDispatcher,
) : AppLifecycleHook {

    override val name: String get() = "battery-monitor"

    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private var heartbeat: Job? = null

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            report(BatteryReportTrigger.CHANGE)
        }
    }

    override suspend fun onAppCreate() {
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_BATTERY_CHANGED)
            addAction(Intent.ACTION_POWER_CONNECTED)
            addAction(Intent.ACTION_POWER_DISCONNECTED)
            addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
        }
        ContextCompat.registerReceiver(context, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        scope.launch { sockets.pullRequested.collect { report(BatteryReportTrigger.PULL) } }
        workManager.enqueueUniquePeriodicWork(
            BatteryReportWorker.UNIQUE_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            BatteryReportWorker.buildRequest(),
        )
    }

    override suspend fun onForeground() {
        report(BatteryReportTrigger.CHANGE)
    }

    private fun report(trigger: BatteryReportTrigger) {
        scope.launch {
            runCatching { reporter.report(trigger) }.onFailure { Timber.w(it, "Battery report failed") }
            armHeartbeat()
        }
    }

    @Synchronized
    private fun armHeartbeat() {
        if (heartbeat?.isActive == true) return
        heartbeat = scope.launch {
            while (true) {
                val wait = reporter.heartbeatDelayMs() ?: break
                delay(wait.coerceAtLeast(MIN_TICK_MS))
                runCatching { reporter.report(BatteryReportTrigger.HEARTBEAT) }
            }
        }
    }

    private companion object {
        const val MIN_TICK_MS = 1_000L
    }
}

/** La tâche périodique : un relevé toutes les 15 min (le plancher de WorkManager), même app fermée. */
@HiltWorker
class BatteryReportWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val reporter: BatteryReporting,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = try {
        reporter.report(BatteryReportTrigger.PERIODIC)
        Result.success()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        Result.retry()
    }

    companion object {
        const val UNIQUE_NAME: String = "battery-report"
        private const val INTERVAL_MINUTES = 15L

        fun buildRequest(): PeriodicWorkRequest =
            PeriodicWorkRequestBuilder<BatteryReportWorker>(INTERVAL_MINUTES, TimeUnit.MINUTES).build()
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface BatteryMonitorModule {
    @Binds
    @IntoSet
    fun hook(impl: BatteryMonitor): AppLifecycleHook
}
