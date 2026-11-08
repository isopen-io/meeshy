package me.meeshy.sdk.connection

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.map
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.outbox.OutboxPendingIndicator
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
public object ConnectionStatusModule {
    @Provides
    @Singleton
    public fun providesConnectionStatusStore(
        networkMonitor: NetworkMonitor,
        socketManager: SocketManager,
        indicator: OutboxPendingIndicator,
    ): ConnectionStatusStore = ConnectionStatusStore(
        online = networkMonitor.isOnline,
        socketConnected = socketManager.connectionState.map { it == SocketConnectionState.CONNECTED },
        pendingCount = indicator.pendingCount,
    )
}
