package me.meeshy.app.ongoing

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.app.startup.AppInitializer
import me.meeshy.sdk.model.ongoing.LiveActivityCommand
import me.meeshy.sdk.outbox.OutboxRepository
import kotlinx.coroutines.flow.first
import me.meeshy.sdk.model.ongoing.OutboxActivityLaw
import javax.inject.Inject

/**
 * Au lancement : retire les notifications en cours d'une session précédente et, quand l'app revient au
 * premier plan, retente le service que le système avait refusé en arrière-plan.
 */
internal class OngoingActivityHostInitializer @Inject constructor(
    private val host: OngoingActivityHost,
    private val foreground: OngoingForeground,
    private val processForeground: ProcessForegroundState,
) : AppInitializer {

    override fun initialize() {
        host.endOrphans()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
        scope.launch {
            processForeground.isForeground.collect { visible ->
                if (visible) foreground.retryPending()
            }
        }
    }
}

/** « Annuler » sur la notification d'envoi : retire de la file les envois longs encore en attente. */
internal class OutboxCancelHandler @Inject constructor(
    private val outbox: OutboxRepository,
) : OngoingCommandHandler {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun handle(command: LiveActivityCommand): Boolean {
        if (command != LiveActivityCommand.OutboxCancel) return false
        scope.launch {
            outbox.observeActivityItems().first()
                .filter { OutboxActivityLaw.isLong(it) && !it.isTerminal }
                .forEach { outbox.discard(it.id) }
        }
        return true
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface OngoingActivityHostModule {
    @Binds
    fun surface(surface: AndroidOngoingSurface): OngoingSurface

    @Binds
    fun serviceLauncher(launcher: AndroidOngoingServiceLauncher): OngoingServiceLauncher

    @Binds
    fun permissionSource(source: AndroidForegroundPermissionSource): ForegroundPermissionSource

    @Binds
    @IntoSet
    fun hostInitializer(initializer: OngoingActivityHostInitializer): AppInitializer

    @Binds
    @IntoSet
    fun outboxCancel(handler: OutboxCancelHandler): OngoingCommandHandler
}
