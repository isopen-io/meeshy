package me.meeshy.sdk.socket

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.MentionCreatedEvent
import me.meeshy.sdk.model.MessageLifecycleEventNames

/**
 * `mention:created` (miroir de `MessageSocketRoutes+Notifications`, iOS) : une famille de plus sur le MÊME routeur que
 * [MessageSocketManager], qui est gelé. Les autres événements du cycle de vie d'un message — retrait d'une story citée,
 * file hors ligne rejouée, accusé de pièce — sont routés par [ConversationSocketEventsManager] ; `conversation:unread-updated`
 * (et son `bridge` tri-état) par [MessageSocketManager].
 */
@Singleton
class MessageLifecycleSocketEvents @Inject constructor(
    private val router: SocketEventRouter,
    private val json: Json,
) : RealtimeBinding {
    private val installed = AtomicBoolean(false)
    private val _mentionCreated = SocketInboundRoute.subject<MentionCreatedEvent>()

    /** Chaque mention reçue, dans l'ordre d'arrivée, sans replay. */
    val mentionCreated: SharedFlow<MentionCreatedEvent> = _mentionCreated.exposed()

    override fun attach() {
        if (installed.compareAndSet(false, true)) {
            router.install(
                listOf(SocketInboundRoute.decoding<MentionCreatedEvent>(MessageLifecycleEventNames.MENTION_CREATED, json, _mentionCreated)),
            )
        }
    }

    override fun detach() {
        installed.set(false)
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface MessageLifecycleSocketEventsModule {
    @Binds
    @IntoSet
    fun bindRealtime(events: MessageLifecycleSocketEvents): RealtimeBinding
}
