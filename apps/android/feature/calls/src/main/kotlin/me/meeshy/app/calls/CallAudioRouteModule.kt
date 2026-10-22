package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet

@Module
@InstallIn(SingletonComponent::class)
interface CallAudioRouteModule {
    @Binds
    fun bindRouteProvider(impl: CallAudioRouteService): CallAudioRouteProviding

    @Binds
    fun bindBluetoothPermission(impl: AndroidCallBluetoothPermission): CallBluetoothPermission

    @Binds
    @IntoSet
    fun bindRouteOverlay(impl: CallAudioRouteOverlay): CallOverlay
}
