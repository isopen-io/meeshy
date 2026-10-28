package me.meeshy.sdk.location

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.socket.LiveLocationEmitter

@Module
@InstallIn(SingletonComponent::class)
internal abstract class LiveLocationSharingBindingsModule {
    @Binds abstract fun sink(impl: LiveLocationEmitter): LiveLocationSink
    @Binds abstract fun fixes(impl: LiveLocationDeviceSource): LiveLocationFixSource
    @Binds abstract fun permission(impl: LiveLocationDeviceSource): LocationPermissionGate
    @Binds abstract fun host(impl: ForegroundServiceLiveLocationHost): LiveLocationServiceHost
    @Binds @IntoSet abstract fun accountCache(impl: LiveLocationSharingController): PerAccountCache
}

@Module
@InstallIn(SingletonComponent::class)
internal object LiveLocationClockModule {
    @Provides fun clock(): LiveLocationClock = LiveLocationClock { System.currentTimeMillis() }
}
