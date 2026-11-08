package me.meeshy.app.startup

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.socket.SocketLifecycleBinder
import javax.inject.Inject

/** Branche le retour du réseau sur la socket : une socket coupée repart aussitôt, sans attendre l'échelle. */
class SocketNetworkRecoveryInitializer @Inject constructor(
    private val binder: SocketLifecycleBinder,
    private val network: NetworkMonitor,
) : AppInitializer {
    override fun initialize() {
        binder.bindNetwork(network.isOnline)
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface SocketNetworkRecoveryInitializerModule {
    @Binds
    @IntoSet
    fun socketNetworkRecoveryInitializer(impl: SocketNetworkRecoveryInitializer): AppInitializer
}
