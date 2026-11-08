package me.meeshy.sdk.notification

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.conversation.AppForegroundSignal
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.SocketManager
import me.meeshy.sdk.sync.SyncSeqTracker
import timber.log.Timber

/** Ce que le coordinateur lance : UNE relecture des dernières notifications. */
fun interface NotificationResyncRunner {
    suspend fun run()
}

/**
 * Relecture silencieuse des notifications, au niveau APPLICATION (miroir de `NotificationGapResyncCoordinator`, iOS) :
 * trou de séquence, VRAIE reconnexion du socket (pas le premier connect) et retour au premier plan. Les déclencheurs
 * rapprochés se coalescent en une relecture après [DEBOUNCE_MILLIS]. Branché comme [RealtimeBinding], il n'existe que
 * session ouverte : sans session, aucun déclencheur n'est écouté. Un échec est journalisé et laisse le cache intact.
 */
@Singleton
class NotificationGapResyncCoordinator internal constructor(
    private val runner: NotificationResyncRunner,
    private val gaps: Flow<Unit>,
    private val reconnections: Flow<Unit>,
    private val foregrounds: Flow<Unit>,
    private val scope: CoroutineScope,
    private val debounceMillis: Long = DEBOUNCE_MILLIS,
) : RealtimeBinding {

    @Inject
    constructor(
        runner: NotificationResyncRunner,
        seq: SyncSeqTracker,
        socket: SocketManager,
        foreground: AppForegroundSignal,
        @IoDispatcher io: CoroutineDispatcher,
    ) : this(
        runner, seq.gapDetected.map { }, socket.didReconnect, foreground.entered,
        CoroutineScope(SupervisorJob() + io),
    )

    private val lock = Any()
    private val running = Mutex()
    private var listening: Job? = null
    private var pending: Job? = null

    override fun attach() {
        detach()
        listening = scope.launch { merge(gaps, reconnections, foregrounds).collect { schedule() } }
    }

    override fun detach() {
        synchronized(lock) {
            listening?.cancel()
            pending?.cancel()
            listening = null
            pending = null
        }
    }

    private fun schedule() {
        synchronized(lock) {
            pending?.cancel()
            pending = scope.launch {
                delay(debounceMillis)
                running.withLock { runGuarded() }
            }
        }
    }

    private suspend fun runGuarded() {
        try {
            runner.run()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
            Timber.w("Resynchro des notifications en échec, cache laissé en l'état (%s)", failure.javaClass.simpleName)
        }
    }

    companion object {
        const val DEBOUNCE_MILLIS: Long = 300
    }
}
