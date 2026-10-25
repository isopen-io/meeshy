package me.meeshy.sdk.conversation

import dagger.Binds
import dagger.Module
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
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.RealtimeBinding
import timber.log.Timber

/**
 * L'ingestion socket portée par la SESSION, pas par l'écran : branchée par
 * `RealtimeSessionCoordinator` (point d'extension [RealtimeBinding]) dès la connexion, elle écrit
 * chaque `message:new` en Room, conversation ouverte ou non. Un message arrivé fil fermé est donc
 * déjà en base quand le fil s'ouvre (miroir de `MessagePersistenceActor.bufferIncomingAPIMessages`).
 *
 * Les rafales passent par [IncomingMessageBuffer] (une transaction par fenêtre) et la fusion par
 * [MessageIngestPipeline] (aucune écriture quand rien ne change) ; les conversations réellement
 * écrites sont signalées une fois par fenêtre sur [ConversationRefreshSignal].
 */
@Singleton
class IncomingMessageIngestBinding internal constructor(
    private val socket: MessageSocketManager,
    private val pipeline: MessageIngestPipeline,
    private val clock: CacheClock,
    private val signal: ConversationRefreshSignal,
    private val scope: CoroutineScope,
    windowMillis: Long,
) : RealtimeBinding {

    @Inject
    constructor(
        socket: MessageSocketManager,
        database: MeeshyDatabase,
        clock: CacheClock,
        signal: ConversationRefreshSignal,
        @IoDispatcher io: CoroutineDispatcher,
    ) : this(
        socket = socket,
        pipeline = MessageIngestPipeline(database),
        clock = clock,
        signal = signal,
        scope = CoroutineScope(SupervisorJob() + io),
        windowMillis = IncomingMessageBuffer.DEFAULT_WINDOW_MILLIS,
    )

    private val buffer = IncomingMessageBuffer(scope, windowMillis, ::persist)
    private var job: Job? = null

    override fun attach() {
        job?.cancel()
        job = scope.launch {
            socket.messageReceived.collect { message ->
                try {
                    buffer.offer(message)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    Timber.w(failure, "message:new : mise en file d'ingestion en échec")
                }
            }
        }
    }

    override fun detach() {
        job?.cancel()
        job = null
        buffer.clear()
    }

    private suspend fun persist(batch: List<ApiMessage>) {
        signal.notify(pipeline.ingest(batch, clock.nowMillis()))
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface IncomingMessageIngestModule {
    @Binds
    @IntoSet
    fun bindRealtime(binding: IncomingMessageIngestBinding): RealtimeBinding
}
