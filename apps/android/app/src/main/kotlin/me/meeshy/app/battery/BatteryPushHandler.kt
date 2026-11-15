package me.meeshy.app.battery

import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.app.push.IncomingPush
import me.meeshy.sdk.battery.BatteryForegroundNotice
import me.meeshy.sdk.battery.BatteryForegroundNotices
import me.meeshy.sdk.battery.BatteryReporting
import me.meeshy.sdk.model.battery.BatteryContract
import me.meeshy.sdk.model.battery.BatteryReportTrigger

/** L'app est-elle au premier plan ? (le processus, pas un écran) */
fun interface ForegroundProbe {
    fun isForeground(): Boolean
}

/** Le relevé demandé par un push silencieux, dans le temps que FCM accorde. */
fun interface BatteryPullRunner {
    fun runPull()
}

/**
 * Les deux pushes de la batterie (#14147), avant le chemin des messages qui en ferait une bannière ordinaire :
 * - `battery_pull` (silencieux) : relever maintenant ;
 * - `device_battery` app OUVERTE : la SyncPill défile l'annonce À LA PLACE de la bannière, jamais les deux. App fermée,
 *   ou aucune pastille montée, la bannière part comme tout push.
 */
@Singleton
class BatteryPushHandler @Inject constructor(
    private val notices: BatteryForegroundNotices,
    private val foreground: ForegroundProbe,
    private val pullRunner: BatteryPullRunner,
) {
    /** `true` quand le push est traité ici ; `false` laisse passer le chemin suivant. */
    fun handle(push: IncomingPush): Boolean = when (push.payload.type ?: push.data["type"]) {
        BatteryContract.PULL_PUSH_TYPE -> {
            pullRunner.runPull()
            true
        }
        BatteryContract.NOTIFICATION_TYPE -> foreground.isForeground() && announce(push)
        else -> false
    }

    private fun announce(push: IncomingPush): Boolean {
        val label = listOfNotNull(push.payload.title ?: push.notificationTitle, push.payload.body ?: push.notificationBody)
            .map(String::trim)
            .filter(String::isNotEmpty)
            .joinToString(" · ")
        if (label.isEmpty()) return false
        val id = "battery:push:${push.payload.notificationId ?: label}"
        return notices.offer(BatteryForegroundNotice(id, label))
    }
}

class ProcessForegroundProbe @Inject constructor() : ForegroundProbe {
    override fun isForeground(): Boolean =
        ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
}

class ReporterPullRunner @Inject constructor(private val reporter: BatteryReporting) : BatteryPullRunner {
    override fun runPull() {
        runCatching { runBlocking { withTimeoutOrNull(PULL_BUDGET_MS) { reporter.report(BatteryReportTrigger.PULL) } } }
    }

    private companion object {
        const val PULL_BUDGET_MS = 8_000L
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface BatteryPushModule {
    @Binds
    fun bindProbe(probe: ProcessForegroundProbe): ForegroundProbe

    @Binds
    fun bindRunner(runner: ReporterPullRunner): BatteryPullRunner
}
