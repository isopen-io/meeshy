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
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.conversation.ConversationReadLedgerStore
import me.meeshy.sdk.model.ConversationReadEvent
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.notification.ActiveConversationStore
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.RealtimeBinding
import timber.log.Timber

@Module
@InstallIn(SingletonComponent::class)
internal abstract class UnreadLedgerBindings {
    @Binds
    @IntoSet
    abstract fun ledgerPerAccount(ledger: UnreadLedger): PerAccountCache

    @Binds
    @IntoSet
    abstract fun ledgerRealtime(binding: UnreadLedgerBinding): RealtimeBinding
}

@Module
@InstallIn(SingletonComponent::class)
internal object ReceiptCoalescerModule {
    @Provides
    @Singleton
    fun receiptCoalescer(
        api: ConversationApi,
        network: NetworkMonitor,
        quota: ReceiptQuota,
        @IoDispatcher io: CoroutineDispatcher,
    ): ReceiptCoalescer = ReceiptCoalescer(
        scope = CoroutineScope(SupervisorJob() + io),
        quota = quota,
        isOnline = { network.isOnline.value },
        nowMillis = System::currentTimeMillis,
        send = { conversationId -> api.markReceived(conversationId) },
    )
}

/**
 * Branche le registre sur le temps réel : le compteur servi (`conversation:unread-updated`) passe par la précédence
 * et se persiste, la conversation à l'écran ouvre/ferme sa fenêtre (elle se lit à zéro), et chaque message d'un AUTRE
 * arme l'accusé de réception coalescé.
 */
@Singleton
internal class UnreadLedgerBinding @Inject constructor(
    private val socket: MessageSocketManager,
    private val store: ConversationReadLedgerStore,
    private val active: ActiveConversationStore,
    private val coalescer: ReceiptCoalescer,
    private val session: SessionRepository,
    @IoDispatcher private val io: CoroutineDispatcher,
) : RealtimeBinding {

    private var scope: CoroutineScope? = null

    override fun attach() {
        detach()
        val live = CoroutineScope(SupervisorJob() + io).also { scope = it }
        socket.unreadUpdated
            .onEach { store.apply(ConversationReadEvent.ServerUnread(it.conversationId, it.unreadCount)) }
            .safely().launchIn(live)
        socket.messageReceived
            .onEach { message ->
                val me = session.currentUserId
                val author = message.sender?.resolvedUserId ?: message.senderId
                if (me != null && author != me) coalescer.onIncomingMessage(message.conversationId)
            }
            .safely().launchIn(live)
        live.launch { followOpenConversation() }
    }

    override fun detach() {
        coalescer.cancelAll()
        scope?.coroutineContext?.get(Job)?.cancel()
        scope = null
    }

    private suspend fun followOpenConversation() {
        var previous: String? = null
        active.conversationId.collect { current ->
            try {
                previous?.takeIf { it != current }?.let { store.close(it) }
                current?.takeIf { it != previous }?.let { store.open(it) }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                Timber.w(failure, "fenêtre de conversation non suivie")
            }
            previous = current
        }
    }

    private fun <T> kotlinx.coroutines.flow.Flow<T>.safely() = catch { Timber.w(it, "registre de lecture en échec") }
}
