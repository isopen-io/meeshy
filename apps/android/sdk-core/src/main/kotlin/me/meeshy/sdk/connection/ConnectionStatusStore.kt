package me.meeshy.sdk.connection

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import me.meeshy.sdk.model.connection.ConnectionStatus
import java.util.concurrent.atomic.AtomicBoolean

/**
 * L'état de connexion UNIQUE (miroir d'iOS `ConnectionStatusViewModel`) : le réseau de l'appareil, la socket et la file
 * d'écritures de l'outbox agrégés en un [ConnectionStatus], pour que la bannière et la pastille n'observent pas trois
 * singletons. Singleton lié par Hilt (voir `ConnectionStatusModule`) : « la socket s'est déjà connectée une fois »
 * est retenu pour toute la vie du processus, quel que soit le nombre d'abonnés.
 *
 * Les sources sont des flux injectés : un test pilote chaque transition sans monter le réseau, la socket ni Room.
 */
public class ConnectionStatusStore(
    online: Flow<Boolean>,
    socketConnected: Flow<Boolean>,
    pendingCount: Flow<Int>,
) {
    private val hadConnected = AtomicBoolean(false)

    /** Le résumé courant ; émis seulement sur un vrai changement. */
    public val status: Flow<ConnectionStatus> = combine(online, socketConnected, pendingCount) { isOnline, connected, pending ->
        if (connected) hadConnected.set(true)
        ConnectionStatus.derive(isOnline, connected, pending, hadConnected.get())
    }.distinctUntilChanged()

    /** Vrai tant que l'appareil a un réseau. */
    public val isNetworkOnline: Flow<Boolean> = online.distinctUntilChanged()
}
