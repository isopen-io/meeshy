package me.meeshy.app.sync

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import me.meeshy.sdk.model.TypingEvent
import me.meeshy.sdk.notification.ActiveConversationStore
import me.meeshy.sdk.outbox.OfflineQueuePillProviding
import me.meeshy.sdk.outbox.OutboxPendingIndicator
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.ui.component.chrome.SyncPillDockRegistry

/** L'horloge murale de la pastille : les horloges des lignes de l'outbox sont des instants UNIX. */
fun interface SyncPillClock {
    fun nowMs(): Long
}

/** Ce que la pastille lit des frappes d'amis : une couture, pour que le ViewModel se teste sans socket. */
interface SyncPillTypingSource {
    val started: Flow<TypingEvent>
    val stopped: Flow<TypingEvent>

    /** Un message de X prouve qu'il a fini d'écrire : (conversation, expéditeur). */
    val sent: Flow<Pair<String, String>>
    val selfId: String?

    /** La conversation à l'écran : sa frappe se voit déjà dans le fil, la pastille la tait. */
    val openConversationId: Flow<String?>
}

@Singleton
class SocketSyncPillTypingSource @Inject constructor(
    private val sockets: MessageSocketManager,
    private val session: SessionRepository,
    private val active: ActiveConversationStore,
) : SyncPillTypingSource {
    override val started: Flow<TypingEvent> = sockets.typingStarted
    override val stopped: Flow<TypingEvent> = sockets.typingStopped
    override val sent: Flow<Pair<String, String>> = sockets.messageReceived.map { message ->
        message.conversationId to (message.senderId ?: message.sender?.resolvedUserId.orEmpty())
    }
    override val selfId: String? get() = session.currentUserId
    override val openConversationId: Flow<String?> = active.conversationId
}

@Singleton
class SyncPillDockHolder @Inject constructor() {
    val registry: SyncPillDockRegistry = SyncPillDockRegistry()
}

@Module
@InstallIn(SingletonComponent::class)
internal interface SyncPillSourcesModule {
    @Binds
    fun bindQueue(impl: OutboxPendingIndicator): OfflineQueuePillProviding

    @Binds
    fun bindTypingSource(impl: SocketSyncPillTypingSource): SyncPillTypingSource

    companion object {
        @dagger.Provides
        @Singleton
        fun provideClock(): SyncPillClock = SyncPillClock { System.currentTimeMillis() }
    }
}
