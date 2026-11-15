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
import me.meeshy.sdk.model.FriendRequestCancelledEvent
import me.meeshy.sdk.model.FriendRequestRejectedEvent
import me.meeshy.sdk.model.socket.SocketEventNames

/**
 * Le cycle de vie d'une demande d'ami (`friend-request:cancelled` / `:rejected`), miroir des routes
 * `MessageSocketRoutes+Notifications.swift`. Patron de [RelationSocketEventsManager] : ses routes sur le MÊME
 * [SocketEventRouter], donc la même voie série.
 */
@Singleton
class FriendRequestSocketEventsManager @Inject constructor(
    private val router: SocketEventRouter,
    private val json: Json,
) : RealtimeBinding {

    private val installed = AtomicBoolean(false)
    private val _cancelled = SocketInboundRoute.subject<FriendRequestCancelledEvent>()
    private val _rejected = SocketInboundRoute.subject<FriendRequestRejectedEvent>()

    /** L'autre partie a retiré sa demande (ou la mienne vers elle). */
    val cancelled: SharedFlow<FriendRequestCancelledEvent> = _cancelled.exposed()

    /** Le destinataire a refusé la demande que j'avais envoyée. */
    val rejected: SharedFlow<FriendRequestRejectedEvent> = _rejected.exposed()

    override fun attach() {
        if (installed.compareAndSet(false, true)) router.install(routes())
    }

    override fun detach() {
        installed.set(false)
    }

    internal fun routes(): List<SocketInboundRoute> = listOf(
        SocketInboundRoute.decoding(SocketEventNames.FRIEND_REQUEST_CANCELLED, json, _cancelled),
        SocketInboundRoute.decoding(SocketEventNames.FRIEND_REQUEST_REJECTED, json, _rejected),
    )
}

@Module
@InstallIn(SingletonComponent::class)
internal interface FriendRequestSocketEventsModule {
    @Binds
    @IntoSet
    fun bindRealtime(manager: FriendRequestSocketEventsManager): RealtimeBinding
}
