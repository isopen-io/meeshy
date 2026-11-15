package me.meeshy.sdk.e2ee

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache

@Module
@InstallIn(SingletonComponent::class)
internal abstract class OwnEncryptedDevicesModule {
    @Binds
    abstract fun bindDevices(repository: OwnEncryptedDevicesRepository): OwnEncryptedDevicesProviding

    @Binds
    @IntoSet
    abstract fun bindAccountCache(repository: OwnEncryptedDevicesRepository): PerAccountCache
}
