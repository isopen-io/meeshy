package me.meeshy.sdk.conversation

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.model.sync.LiveReceiptsContinuity
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.SocketManager

/**
 * #19049 — every (re)connection of the socket reaches [LiveReceiptsContinuity]: the receipt counters the socket brought
 * while away are lost, so each thread's next window read leaves without `If-None-Match`, once, and its 200 repairs them.
 */
@Singleton
class LiveReceiptsBinding internal constructor(
    private val connections: Flow<Unit>,
    private val continuity: LiveReceiptsContinuity,
    private val io: CoroutineDispatcher,
) : RealtimeBinding {

    @Inject
    constructor(
        socket: SocketManager,
        continuity: LiveReceiptsContinuity,
        @IoDispatcher io: CoroutineDispatcher,
    ) : this(socket.connected, continuity, io)

    private var scope: CoroutineScope? = null

    override fun attach() {
        detach()
        val live = CoroutineScope(SupervisorJob() + io).also { scope = it }
        live.launch { connections.collect { continuity.connected() } }
    }

    override fun detach() {
        scope?.coroutineContext?.get(Job)?.cancel()
        scope = null
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal object LiveReceiptsModule {

    @Provides
    @Singleton
    fun liveReceiptsContinuity(): LiveReceiptsContinuity = LiveReceiptsContinuity()

    @Provides
    @IntoSet
    fun liveReceiptsRealtime(binding: LiveReceiptsBinding): RealtimeBinding = binding
}
