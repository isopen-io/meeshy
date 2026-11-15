package me.meeshy.sdk.outbox

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import me.meeshy.sdk.lifecycle.AppLifecycleHook
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager
import timber.log.Timber
import javax.inject.Inject

/**
 * The events that wake the outbox (mirror of iOS `OutboxDrainTriggers` + `OutboxRetryScheduler`): the socket coming back,
 * the rising edge of the network, an enqueue (debounced 250 ms) and the foreground. Each asks the [drain] for a pass; it
 * owns no queue knowledge.
 */
public class OutboxDrainTriggers(
    private val socketConnected: Flow<Boolean>,
    private val online: Flow<Boolean>,
    private val enqueued: Flow<Unit>,
    private val drain: () -> Unit,
) {
    /** Starts the collectors in [scope]; they end with it. */
    @OptIn(FlowPreview::class)
    public fun start(scope: CoroutineScope): List<Job> = listOf(
        risingEdge(socketConnected).settled().launchIn(scope),
        risingEdge(online).settled().launchIn(scope),
        enqueued.debounce(ENQUEUE_DEBOUNCE_MS).onEach { drain() }.launchIn(scope),
    )

    /** The process came to the foreground. */
    public fun onForeground(): Unit = drain()

    private fun risingEdge(flow: Flow<Boolean>): Flow<Boolean> = flow.distinctUntilChanged().drop(1).filter { it }

    private fun Flow<Boolean>.settled(): Flow<Boolean> = onEach {
        delay(SETTLE_MS)
        drain()
    }

    public companion object {
        public const val ENQUEUE_DEBOUNCE_MS: Long = 250L

        /** Lets the handshake or the network stack settle before sending, as on iOS (`drainSettle`). */
        public const val SETTLE_MS: Long = 200L
    }
}

/** Wires [OutboxDrainTriggers] to the real socket, network monitor and queue, and to the process lifecycle. */
public class OutboxDrainTriggersHook @Inject constructor(
    private val socket: SocketManager,
    private val network: NetworkMonitor,
    private val outbox: OutboxRepository,
    private val scheduler: OutboxScheduler,
) : AppLifecycleHook {
    private var triggers: OutboxDrainTriggers? = null

    override suspend fun onAppCreate() {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        triggers = OutboxDrainTriggers(
            socketConnected = socket.connectionState.map { it == SocketConnectionState.CONNECTED },
            online = network.isOnline,
            enqueued = outbox.enqueued,
            drain = {
                runCatching { scheduler.flushNow() }.onFailure { Timber.w(it, "outbox flush not scheduled") }
            },
        ).also { it.start(scope) }
    }

    override suspend fun onForeground() {
        triggers?.onForeground()
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class OutboxSchedulingModule {
    @Binds
    abstract fun bindsOutboxScheduler(impl: WorkManagerOutboxScheduler): OutboxScheduler

    @Binds
    @IntoSet
    abstract fun bindsOutboxDrainTriggersHook(impl: OutboxDrainTriggersHook): AppLifecycleHook
}
