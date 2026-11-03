package me.meeshy.sdk.sync

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.conversation.AppForegroundSignal
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.sync.SyncEngineState
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.SocketManager
import timber.log.Timber

/** Ce que le coordinateur lance : UNE synchro des conversations ; `false` = elle a échoué (le cache reste). */
fun interface ConversationSyncRunner {
    suspend fun run(): Boolean
}

/**
 * Coordonne les déclencheurs de la synchro des conversations (miroir de `deltaSyncCore` et de
 * `relayCatchUp`, iOS) : retour au premier plan, reconnexion du socket (`didReconnect`), trou de
 * séquence (`gapDetected`).
 *
 * - Anti-rafale : deux déclenchements à moins de 3 s ne produisent qu'une synchro.
 * - Un rattrapage de reconnexion en attente n'est absorbé NI par l'anti-rafale NI par une synchro en
 *   vol : celle-ci le rejoue (3 passes au plus), ou une passe de plus part juste après.
 * - Un échec ne compte pas dans l'anti-rafale : le signal suivant retente.
 * - Aucun spinner : la synchro est silencieuse, le cache reste à l'écran.
 */
@Singleton
class ConversationSyncCoordinator internal constructor(
    private val runner: ConversationSyncRunner,
    private val clock: CacheClock,
    private val foregrounds: Flow<Unit>,
    private val reconnections: Flow<Unit>,
    private val gaps: Flow<Unit>,
    private val scope: CoroutineScope,
) : RealtimeBinding {

    @Inject
    constructor(
        runner: ConversationSyncRunner,
        foreground: AppForegroundSignal,
        socket: SocketManager,
        seq: SyncSeqTracker,
        @IoDispatcher io: CoroutineDispatcher,
    ) : this(
        runner, SystemCacheClock, foreground.entered, socket.didReconnect, seq.gapDetected.map { },
        CoroutineScope(SupervisorJob() + io),
    )

    private val lock = Any()
    private var state = SyncEngineState()
    private var running = false
    private var jobs: List<Job> = emptyList()

    override fun attach() {
        detach()
        jobs = listOf(
            scope.launch { foregrounds.collect { guarded { sync() } } },
            scope.launch { reconnections.collect { guarded { reconnected() } } },
            scope.launch { gaps.collect { guarded { sync() } } },
        )
    }

    override fun detach() {
        jobs.forEach { it.cancel() }
        jobs = emptyList()
    }

    /** La socket est revenue : des événements ont pu être manqués, le rattrapage est dû quoi qu'il arrive. */
    suspend fun reconnected(): Boolean {
        requestReconnectCatchUp()
        return sync()
    }

    fun requestReconnectCatchUp() {
        synchronized(lock) { state = state.requestingReconnectCatchUp() }
    }

    /** `true` si la synchro a abouti ou a été absorbée (rien à relire), `false` si elle a échoué. */
    suspend fun sync(): Boolean {
        var catchUp: Boolean
        synchronized(lock) {
            if (running) return true
            catchUp = takeCatchUp()
            if (state.absorbs(clock.nowMillis(), catchUp)) return true
            running = true
        }
        var ok = true
        try {
            var passes = 0
            do {
                synchronized(lock) { state = state.startedAt(clock.nowMillis()) }
                ok = runner.run()
                if (!ok) synchronized(lock) { state = state.failed() }
                passes++
                catchUp = synchronized(lock) { takeCatchUp() }
            } while (catchUp && passes < SyncEngineState.MAX_PASSES)
        } finally {
            synchronized(lock) { running = false }
        }
        val pending = synchronized(lock) { state.reconnectCatchUpPending }
        return if (pending) sync() else ok
    }

    private fun takeCatchUp(): Boolean {
        val (due, next) = state.takingReconnectCatchUp()
        state = next
        return due
    }

    private suspend fun guarded(block: suspend () -> Unit) {
        try {
            block()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
            Timber.w("Synchro des conversations : declencheur en echec (%s)", failure.javaClass.simpleName)
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class ConversationSyncCoordinatorModule {
    @Binds
    @IntoSet
    abstract fun bindRealtime(coordinator: ConversationSyncCoordinator): RealtimeBinding

    companion object {
        @Provides
        fun runner(repository: ConversationRepository): ConversationSyncRunner =
            ConversationSyncRunner { repository.syncSilently() }
    }
}
