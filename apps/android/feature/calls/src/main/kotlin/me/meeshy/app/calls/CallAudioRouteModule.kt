package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
interface CallAudioRouteModule {
    @Binds
    fun bindRouteProvider(impl: CallAudioRouteService): CallAudioRouteProviding

    @Binds
    fun bindBluetoothPermission(impl: AndroidCallBluetoothPermission): CallBluetoothPermission
}
